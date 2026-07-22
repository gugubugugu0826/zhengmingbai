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
import { seedConfigs } from './modules/configs/service.js';
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

/** reset-data：删业务表全部行，保留 configs/knowledge_base/packages（R56） */
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
  putConfigIfAbsent('ai.vision_model', 'qwen-vl-plus');
  putConfigIfAbsent('ai.text_model', 'qwen-plus');
  putConfigIfAbsent('ai.t2i_enabled', false);

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
} else {
  main();
}
