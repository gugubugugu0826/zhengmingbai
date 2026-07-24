/**
 * 种子脚本（npm run seed）：
 * migrate() → 默认 configs → 4 档套餐（全下架）→ 知识库种子。全部幂等，可重复执行。
 *
 * 阶段 2 变更（R32/R56）：
 * - 套餐种子唯一入口在本文件（orders/service.ts 不再 seed），数值 ¥9.9=20点/¥29=60点/
 *   ¥99=220点/¥39包月=120点，is_active=0 全下架（支付暂缓，全站无购买入口）。
 * - 新增 npm run reset-data：清空业务表数据，保留 configs/knowledge_base/packages，
 *   并写一条 admin_logs（operator=system 留痕）。
 */
import { db, migrate, nowIso } from './db.js';
import { DEFAULT_POINTS_RULES, seedConfigs } from './modules/configs/service.js';
import { seedIfEmpty } from './modules/knowledge/service.js';
import { initAdminAccounts } from './modules/auth/admin-init.js';

/** 仅当 configs key 不存在时写入（幂等，不覆盖线上热改的配置） */
function putConfigIfAbsent(key: string, value: unknown): void {
  db.prepare(
    'INSERT OR IGNORE INTO configs (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)',
  ).run(key, JSON.stringify(value), 'seed-cli', nowIso());
}

/** 套餐种子（唯一入口，幂等）：按阶段 2 数值写齐 4 档并全部下架（packages.name 无唯一约束，先 UPDATE 再补 INSERT） */
function upsertPackage(
  name: string,
  priceFen: number,
  points: number,
  tag: string,
  sort: number,
): void {
  const updated = db.prepare(
    `UPDATE packages SET price_fen = ?, points = ?, tag = ?, sort = ?, is_active = 0, updated_at = ?
     WHERE name = ?`,
  ).run(priceFen, points, tag, sort, nowIso(), name);
  if (Number(updated.changes) === 0) {
    db.prepare(
      `INSERT INTO packages (name, price_fen, points, tag, sort, is_active) VALUES (?, ?, ?, ?, ?, 0)`,
    ).run(name, priceFen, points, tag, sort);
  }
}

/** 强制覆盖 configs key（upsert + config_logs 留痕），仅 --fix-prompts 订正使用 */
function putConfigForce(key: string, value: unknown): void {
  const old = db.prepare('SELECT value_json FROM configs WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined;
  db.prepare(
    `INSERT INTO configs (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
       updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
  ).run(key, JSON.stringify(value), 'seed-cli-fix', nowIso());
  db.prepare(
    'INSERT INTO config_logs (key, old_value, new_value, operator) VALUES (?, ?, ?, ?)',
  ).run(key, old?.value_json ?? null, JSON.stringify(value), 'seed-cli-fix');
}

/**
 * --fix-prompts（v3.1 D-7）：用正确 UTF-8 中文强制覆盖全部 ai.prompt.* key
 * （生产库疑似 UTF-8/GBK 双重编码乱码，putConfigIfAbsent 不会覆盖存量，必须 upsert）。
 * 同时幂等订正新用户赠点 15→20，并补齐 v3.1 AI 底座 seed（provider/模型名）。
 */
function fixPrompts(): void {
  const CORRECT_PROMPTS: Record<string, string> = {
    'ai.prompt.confirm':
      '你是「整明白」整理助手。请观察用户上传的空间照片，判断：1）照片是否属于同一空间，如需分组请给出分组建议；2）列出你无法确认的物品，用大白话向用户提问。输出 JSON。',
    'ai.prompt.analyze':
      '你是「整明白」整理助手。结合中式生活物品分类知识库，对照片中的物品逐项识别归类，指出杂乱点。输出结构化 JSON。',
    'ai.prompt.plan':
      '你是「整明白」整理助手。根据确认结果与分析结果，生成五部分整理方案：①温和的丢弃建议（明示"你说了算"）②分类归组清单 ③收纳位置+添置建议（只荐品类不带链接）④编号执行步骤 ⑤整理后场景描述。语气温暖，说人话。严格输出给定 JSON Schema。',
    'ai.prompt.t2i': '温馨手绘风格家居场景插画，暖色调，柔和光线：',
  };
  console.log('--fix-prompts 生产库核实：当前 ai.prompt.* 内容如下（乱码则覆盖）');
  const rows = db
    .prepare(`SELECT key, value_json FROM configs WHERE key LIKE 'ai.prompt.%' ORDER BY key`)
    .all() as Array<{ key: string; value_json: string }>;
  for (const row of rows) console.log(`  ${row.key} = ${row.value_json.slice(0, 60)}…`);
  for (const [key, value] of Object.entries(CORRECT_PROMPTS)) {
    putConfigForce(key, value);
  }
  // 赠点统一 20（幂等：非 20 才订正，补 config_logs 留痕；configs/service.ts 内的 15→20 SQL 保留不动）
  const current = db.prepare(`SELECT value_json FROM configs WHERE key = 'points.rules'`).get() as
    | { value_json: string }
    | undefined;
  if (!current) {
    putConfigForce('points.rules', DEFAULT_POINTS_RULES);
    console.log('  points.rules 不存在，已按默认值写入（赠点 20）');
  } else {
    let rules: Record<string, unknown> = {};
    try {
      rules = JSON.parse(current.value_json) as Record<string, unknown>;
    } catch {
      rules = {};
    }
    if (rules.new_user_gift_points !== 20) {
      rules.new_user_gift_points = 20;
      putConfigForce('points.rules', rules);
      console.log('  points.rules.new_user_gift_points 已订正为 20');
    } else {
      console.log('  points.rules.new_user_gift_points 已是 20，跳过');
    }
  }
  // v3.1 AI 底座 seed（缺则补，不覆盖线上热改）
  seedV31AiConfigs();
  console.log('--fix-prompts done：ai.prompt.* 已强制覆盖为 UTF-8 正确中文，赠点已核实为 20');
}

/** v3.1 D 板块 AI 配置 seed（INSERT OR IGNORE 幂等，seed 与 --fix-prompts 共用） */
function seedV31AiConfigs(): void {
  putConfigIfAbsent('ai.provider', 'volcengine'); // volcengine | dashscope（百炼 fallback）
  putConfigIfAbsent('ai.image_model', 'doubao-seedream-5-0-pro-260628');
  putConfigIfAbsent('ai.vision_model', 'doubao-seed-1-6-vision'); // v3.2：火山控制台已确认（对齐 llm/vision 客户端默认值）
  putConfigIfAbsent('ai.text_model', 'Doubao-Seed-2.1-turbo'); // v3.2：火山控制台已确认（对齐 llm/vision 客户端默认值）
  putConfigIfAbsent('wechat.subscribe_template_id', ''); // 空 = 静默跳过（T05 留口子）
}


function resetData(): void {
  const businessTables = [
    'points_transaction',
    'points_account',
    'plan_items',
    'plans',
    'photos',
    'reminders',
    'regen_tasks',
    'messages',
    'ai_cost_logs',
    'admin_logs',
    'service_bookings',
    'orders',
    'sessions',
    'spaces',
    'users',
  ];
  for (const table of businessTables) {
    db.exec(`DELETE FROM ${table}`);
  }
  // 留痕：本次清库操作（先删后写，保证这条记录存活；PRAGMA foreign_keys 临时关闭以写 system 记录）
  db.exec('PRAGMA foreign_keys = OFF;');
  db.prepare(
    `INSERT INTO admin_logs (admin_user_id, action, target, detail_json) VALUES (0, 'reset_data', 'system', ?)`,
  ).run(JSON.stringify({ operator: 'system', cleared: businessTables }));
  db.exec('PRAGMA foreign_keys = ON;');
  console.log('reset-data done：业务表已清空，configs/knowledge_base/packages 保留');
}

function main(): void {
  migrate();

  // ① owner 指定版默认配置（仅首次写入）
  putConfigIfAbsent('points.rules', {
    analysis: { region: 10, item: 25 },
    regen_after_first: { region: 3, item: 8 },
    effect_image_p2: 50,
    new_user_gift: 'one_full_session_region',
    new_user_gift_points: 20,
  });
  putConfigIfAbsent('payment.channel', 'mock');
  putConfigIfAbsent('ai.mock', true);
  putConfigIfAbsent('ai.t2i_enabled', false);
  // v3.1 D 板块：AI 底座 seed（含 vision/text/image 模型名与 provider 切换开关）
  seedV31AiConfigs();

  // ② 4 档套餐（金额一律"分"；全下架，支付暂缓 R30）
  upsertPackage('¥9.9 尝鲜包', 990, 20, '新手推荐', 1);
  upsertPackage('单空间套餐', 2900, 60, '把一个空间整明白', 2);
  upsertPackage('全屋大扫除套餐', 9900, 220, '年前主打', 3);
  upsertPackage('专业版包月', 3900, 120, '不限空间随便整', 4);

  // ③ 模块自带种子（幂等补齐：提示词 / 提醒模板等默认配置 + 存量订正）
  seedConfigs();

  // ④ 知识库种子（R16）
  seedIfEmpty();

  console.log('seed done');
}

if (process.argv.includes('--reset-data')) {
  migrate();
  resetData();
} else if (process.argv.includes('--init-admins')) {
  // 管理员账号初始化（阶段 2 增量 A）：幂等，随机初始密码仅此一次打印到控制台
  migrate();
  initAdminAccounts();
  console.log('init-admins done');
} else if (process.argv.includes('--fix-prompts')) {
  // v3.1 D-7：ai.prompt.* 乱码强制订正 + 赠点 20 核实（幂等，一次性执行入口）
  migrate();
  fixPrompts();
} else {
  main();
}
