/**
 * v3 数据层迁移（任务书 §5-F/§5-G/§5-H，架构 §3.1），由 db.ts 的 migrate() 在 v22 之后调用，全量幂等：
 *
 * 1) photos 加 kind 列：'before'（默认，存量数据语义不变）/ 'after'（整理后拍照存档）；
 *    并建 (session_id, kind) 复合索引供前后对比查询。
 * 2) ops 配置兜底种子：ops.registration_enabled / ops.maintenance / subscribe.template_id
 *    与旧库 reminder.template 文案订正（INSERT OR IGNORE / UPDATE 均幂等；
 *    主种子入口仍是 modules/configs/service.ts seedConfigs，本处兜底"只 migrate 不 seed"的库）。
 * 3) packages 新三档套餐种子订正（任务书 §5-G 定价表，按 name 幂等先查后改/插）：
 *    - 体验包 20 点 ¥6（600 分，sort=1，上架）
 *    - 家庭包 100 点 ¥25（2500 分，推荐，sort=2，上架）
 *    - 囤货包 300 点 ¥60（6000 分，sort=3，上架）
 *    - 装修包 500 点 ¥98（9800 分，is_active=0 建而不上架）
 * 4) uq_users_email 唯一性复核：v22 部分唯一索引 idx_users_email 不在则补建（正常库已就位，跳过）。
 *
 * 失败自动整体回滚（外层 withTransaction），可反复执行。
 */
import { db, nowIso, withTransaction } from '../db.js';

/** 新三档套餐（任务书 §5-G）：[name, price_fen, points, tag, sort, is_active] */
const PKG_SEEDS: Array<[string, number, number, string | null, number, number]> = [
  ['体验包', 600, 20, '新客尝鲜', 1, 1],
  ['家庭包', 2500, 100, '推荐', 2, 1],
  ['囤货包', 6000, 300, '深度用户', 3, 1],
  ['装修包', 9800, 500, null, 4, 0], // 建而不上架
];

/** 30 天提醒新文案（设计稿口径；reminder.template 的 {{space_name}} 为可变部分） */
const REMINDER_TEMPLATE_V3 = '整理完 30 天了，回去看看{{space_name}}保持得怎么样';

export function migrateV3(): void {
  withTransaction(() => {
    // ---- 1) photos.kind 列（PRAGMA 判存，幂等；存量默认 'before' 语义不变） ----
    const photoCols = db.prepare(`PRAGMA table_info(photos)`).all() as Array<{ name: string }>;
    if (!photoCols.some((c) => c.name === 'kind')) {
      db.exec(`ALTER TABLE photos ADD COLUMN kind VARCHAR NOT NULL DEFAULT 'before'`);
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_photos_session_kind ON photos(session_id, kind)`);

    // ---- 2) ops 配置兜底种子（INSERT OR IGNORE，与 seedConfigs 同值） ----
    const seedStmt = db.prepare(
      'INSERT OR IGNORE INTO configs (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)',
    );
    seedStmt.run('ops.registration_enabled', 'true', 'system', nowIso());
    seedStmt.run(
      'ops.maintenance',
      JSON.stringify({ enabled: false, notice: '系统维护中，请稍后再来' }),
      'system',
      nowIso(),
    );
    seedStmt.run('subscribe.template_id', '""', 'system', nowIso());
    // 旧库 reminder.template 文案订正（对齐设计稿 30 天提醒口径，幂等）
    db.prepare(
      `UPDATE configs SET value_json = ?, updated_at = ?
       WHERE key = 'reminder.template' AND value_json != ?`,
    ).run(JSON.stringify(REMINDER_TEMPLATE_V3), nowIso(), JSON.stringify(REMINDER_TEMPLATE_V3));

    // ---- 3) packages 新三档种子订正（按 name 幂等：存在则订正数值，不存在则插入） ----
    const findByName = db.prepare(`SELECT id FROM packages WHERE name = ? LIMIT 1`);
    const updateById = db.prepare(
      `UPDATE packages SET price_fen = ?, points = ?, tag = ?, sort = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
    );
    const insert = db.prepare(
      `INSERT INTO packages (name, price_fen, points, tag, sort, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const [name, priceFen, points, tag, sort, isActive] of PKG_SEEDS) {
      const existed = findByName.get(name) as { id: number } | undefined;
      if (existed) {
        updateById.run(priceFen, points, tag, sort, isActive, nowIso(), existed.id);
      } else {
        insert.run(name, priceFen, points, tag, sort, isActive, nowIso(), nowIso());
      }
    }

    // ---- 4) uq_users_email 唯一性复核：v22 部分唯一索引兜底 ----
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`,
    );
  });
}
