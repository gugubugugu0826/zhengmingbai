/**
 * 配置中心：configs 表热加载，改了即时生效（R20）。
 * 约定 key：points.rules / payment.channel / ai.mock / ai.vision_model /
 *           ai.text_model / ai.t2i_enabled / ai.prompt.* / packages.seed / reminder.template
 */
import { db, nowIso, withTransaction } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { config as envConfig } from '../../config.js';

export interface PointsRules {
  analysis: { region: number; item: number };
  regen_after_first: { region: number; item: number };
  effect_image_p2: number;
  /** 新用户免费额度点数（注册即送，够一次区域级分析 + 首次免费重生成） */
  new_user_gift_points: number;
}

export const DEFAULT_POINTS_RULES: PointsRules = {
  analysis: { region: 10, item: 25 },
  regen_after_first: { region: 3, item: 8 },
  effect_image_p2: 50,
  new_user_gift_points: 20,
};

/** 默认配置种子（首次启动写入，之后以数据库为准） */
export function seedConfigs(): void {
  const defaults: Record<string, unknown> = {
    'points.rules': DEFAULT_POINTS_RULES,
    'payment.channel': envConfig.paymentChannel,
    'ai.mock': envConfig.aiMock,
    'ai.vision_model': 'qwen-vl-plus',
    'ai.text_model': 'qwen-plus',
    'ai.t2i_enabled': false,
    'ai.base_url': envConfig.dashscopeBaseUrl,
    'ai.prompt.confirm':
      '你是「整明白」整理助手。请观察用户上传的空间照片，判断：1）照片是否属于同一空间，如需分组请给出分组建议；2）列出你无法确认的物品，用大白话向用户提问。输出 JSON。',
    'ai.prompt.analyze':
      '你是「整明白」整理助手。结合中式生活物品分类知识库，对照片中的物品逐项识别归类，指出杂乱点。输出结构化 JSON。',
    'ai.prompt.plan':
      '你是「整明白」整理助手。根据确认结果与分析结果，生成五部分整理方案：①温和的丢弃建议（明示"你说了算"）②分类归组清单 ③收纳位置+添置建议（只荐品类不带链接）④编号执行步骤 ⑤整理后场景描述。语气温暖，说人话。严格输出给定 JSON Schema。',
    'ai.prompt.t2i': '温馨手绘风格家居场景插画，暖色调，柔和光线：',
    // v3：对齐设计稿 30 天提醒口径（scanner 按 {{space_name}} 替换空间名）
    'reminder.template': '整理完 30 天了，回去看看{{space_name}}保持得怎么样',
    // ===== v3 增量种子（任务书 §5-H / §6 / 架构 §3.1，INSERT OR IGNORE 幂等） =====
    'ops.registration_enabled': true, // 新用户注册开关（关闭后注册接口拒绝新注册）
    'ops.maintenance': { enabled: false, notice: '系统维护中，请稍后再来' }, // 维护模式
    'subscribe.template_id': '', // 小程序订阅消息模板 ID（老板后配，空=不展示授权引导）
  };
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO configs (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)',
  );
  for (const [key, value] of Object.entries(defaults)) {
    stmt.run(key, JSON.stringify(value), 'system', nowIso());
  }
  // 阶段 2 幂等订正：存量库新用户赠点 15 → 20（架构文档 2.3.2③）
  db.prepare(
    `UPDATE configs SET value_json = json_set(value_json, '$.new_user_gift_points', 20), updated_at = ?
     WHERE key = 'points.rules' AND json_extract(value_json, '$.new_user_gift_points') = 15`,
  ).run(nowIso());
  // 阶段 2 幂等订正：存量套餐统一为阶段 2 数值并全下架（is_active=0），种子唯一入口 seed-cli
  const pkgFix = db.prepare(
    `UPDATE packages SET price_fen = ?, points = ?, tag = ?, sort = ?, is_active = 0, updated_at = ?
     WHERE name = ? AND (price_fen != ? OR points != ? OR is_active != 0)`,
  );
  const pkgDefaults: Array<[string, number, number, string, number]> = [
    ['¥9.9 尝鲜包', 990, 20, '新手推荐', 1],
    ['单空间套餐', 2900, 60, '把一个空间整明白', 2],
    ['全屋大扫除套餐', 9900, 220, '年前主打', 3],
    ['专业版包月', 3900, 120, '不限空间随便整', 4],
  ];
  for (const [name, price, points, tag, sort] of pkgDefaults) {
    pkgFix.run(price, points, tag, sort, nowIso(), name, price, points);
  }
}

/** 读取配置（每次读数据库，改配置即时生效） */
export function getConfig<T>(key: string, fallback: T): T {
  const row = db.prepare('SELECT value_json FROM configs WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

/** 更新配置 + 操作日志（R20：关键配置有操作日志） */
export function setConfig(key: string, value: unknown, operator: string): void {
  const old = db.prepare('SELECT value_json FROM configs WHERE key = ?').get(key) as
    | { value_json: string }
    | undefined;
  withTransaction(() => {
    db.prepare(
      `INSERT INTO configs (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,
         updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).run(key, JSON.stringify(value), operator, nowIso());
    db.prepare(
      'INSERT INTO config_logs (key, old_value, new_value, operator) VALUES (?, ?, ?, ?)',
    ).run(key, old?.value_json ?? null, JSON.stringify(value), operator);
  });
}

export function listConfigs(): Record<string, unknown> {
  const rows = db.prepare('SELECT key, value_json FROM configs ORDER BY key').all() as Array<{
    key: string;
    value_json: string;
  }>;
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value_json);
    } catch {
      result[row.key] = row.value_json;
    }
  }
  return result;
}

export function getPointsRules(): PointsRules {
  return getConfig<PointsRules>('points.rules', DEFAULT_POINTS_RULES);
}

// ===================== v3 运营开关（任务书 §5-H，架构 §3.1） =====================

/** 维护模式配置结构 */
export interface MaintenanceConfig {
  enabled: boolean;
  notice: string;
}

/** 新用户注册开关（默认开；关闭时 /auth/register 与 /auth/wechat 新建分支拒绝，2107） */
export function isRegistrationEnabled(): boolean {
  return getConfig<boolean>('ops.registration_enabled', true) !== false;
}

/** 维护模式（默认关；开启后 maintenanceMiddleware 拦截全站，豁免 admin/configs/health） */
export function getMaintenance(): MaintenanceConfig {
  const value = getConfig<Partial<MaintenanceConfig>>('ops.maintenance', {});
  return {
    enabled: value?.enabled === true,
    notice: typeof value?.notice === 'string' && value.notice ? value.notice : '系统维护中，请稍后再来',
  };
}

/** 小程序订阅消息模板 ID（老板后配；空串 = 前端不展示授权引导） */
export function getSubscribeTemplateId(): string {
  return getConfig<string>('subscribe.template_id', '') || '';
}

export function isAiMock(): boolean {
  return getConfig<boolean>('ai.mock', true);
}

export function getPaymentChannel(): 'mock' | 'wechat' {
  return getConfig<string>('payment.channel', 'mock') === 'wechat' ? 'wechat' : 'mock';
}

export function requireConfigKey(key: string): void {
  if (!/^[a-z0-9_.-]+$/i.test(key)) throw BizError.param('配置 key 不合法');
}
