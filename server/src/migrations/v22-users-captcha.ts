/**
 * v2.2 数据层迁移（A-1/A-2/A-6/A-8），由 db.ts 的 migrate() 在基础建表后调用，全量幂等：
 *
 * 1) users 加列：username / email_verified / force_password_reset（email 列阶段 2 已加，此处兜底判存）
 * 2) users 索引治理：
 *    - 新增 idx_users_email / idx_users_username 部分唯一索引（WHERE ... IS NOT NULL，
 *      老用户 email/username 为空时互不冲突，PRD 与架构 2.1.1 指定方案）
 *    - 阶段 2 遗留的全列唯一索引 uq_users_email（无 WHERE 子句，NULL 也参与唯一）与
 *      v2.2 "多个老用户 email 为空" 直接冲突，必须废弃：只要 v22 目标索引未就位就 DROP
 * 3) phone 可空保障：SQLite 无法 ALTER 去掉 NOT NULL——重建表流程
 *    （新表 → 搬数据 → DROP 旧表 → RENAME → 重建列级唯一索引），事务内执行；
 *    PRAGMA table_info 检测 phone 已可空则跳过（当前开发库/生产库 phone 已可空，正常跳过）
 * 4) 新表 captchas（图形验证码，一次性 + 5 分钟有效）
 * 5) 新表 email_verifications（邮箱验证码落库，替代阶段2 内存 Map，支持限频审计）
 *
 * 失败自动整体回滚（外层 withTransaction），可反复执行。
 */
import { db, withTransaction } from '../db.js';

interface TableInfoRow {
  name: string;
  notnull: number;
}

function userColumns(): TableInfoRow[] {
  return db.prepare(`PRAGMA table_info(users)`).all() as unknown as TableInfoRow[];
}

/** users 重建（仅当 phone 列仍带 NOT NULL 约束时执行一次） */
function rebuildUsersIfPhoneNotNull(cols: TableInfoRow[]): void {
  const phoneCol = cols.find((c) => c.name === 'phone');
  if (!phoneCol || phoneCol.notnull === 0) return; // 已可空，无需重建

  // 注意：本函数在外层事务内执行，SQLite DDL 支持事务回滚
  db.exec(`
CREATE TABLE users_v22 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone VARCHAR,
  wechat_openid VARCHAR,
  nickname VARCHAR NOT NULL DEFAULT '',
  avatar_url VARCHAR,
  is_new_gift_used INTEGER NOT NULL DEFAULT 0,
  reminder_enabled INTEGER NOT NULL DEFAULT 1,
  delete_after_analysis INTEGER NOT NULL DEFAULT 0,
  privacy_agreed_at DATETIME,
  role VARCHAR NOT NULL DEFAULT 'user',
  email VARCHAR,
  password_hash VARCHAR,
  is_super INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO users_v22 (id, phone, wechat_openid, nickname, avatar_url, is_new_gift_used,
  reminder_enabled, delete_after_analysis, privacy_agreed_at, role, email, password_hash,
  is_super, created_at, updated_at)
SELECT id, phone, wechat_openid, nickname, avatar_url, is_new_gift_used,
  reminder_enabled, delete_after_analysis, privacy_agreed_at, role, email, password_hash,
  is_super, created_at, updated_at FROM users;
DROP TABLE users;
ALTER TABLE users_v22 RENAME TO users;
-- 列级 UNIQUE 随旧表 DROP 丢失，重建为表内列级唯一（行为与一期一致）
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users(phone);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_wechat_openid ON users(wechat_openid);
`);
}

/** v22 部分唯一索引是否已就位（判定是否需要清理阶段2 遗留的全列唯一索引） */
function hasV22EmailIndex(): boolean {
  const idx = db
    .prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'idx_users_email'`,
    )
    .get() as { sql: string | null } | undefined;
  return !!idx?.sql && /WHERE\s+email\s+IS\s+NOT\s+NULL/i.test(idx.sql);
}

export function migrateV22(): void {
  withTransaction(() => {
    // ---- 1) users 加列（PRAGMA 判存，幂等） ----
    let cols = userColumns();
    if (!cols.some((c) => c.name === 'email')) {
      // 老到连阶段2 email 列都没有的库兜底（正常库不会走到）
      db.exec(`ALTER TABLE users ADD COLUMN email VARCHAR`);
    }
    if (!cols.some((c) => c.name === 'username')) {
      db.exec(`ALTER TABLE users ADD COLUMN username VARCHAR`);
    }
    if (!cols.some((c) => c.name === 'email_verified')) {
      db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0`);
    }
    if (!cols.some((c) => c.name === 'force_password_reset')) {
      db.exec(`ALTER TABLE users ADD COLUMN force_password_reset INTEGER NOT NULL DEFAULT 0`);
    }

    // ---- 2) phone 可空保障（必要时重建表，事务内） ----
    cols = userColumns();
    rebuildUsersIfPhoneNotNull(cols);

    // ---- 3) 索引治理 ----
    // 阶段2 的 uq_users_email 是全列唯一（NULL 也唯一），与"多个老用户 email 为空"冲突，废弃
    if (!hasV22EmailIndex()) {
      db.exec(`DROP INDEX IF EXISTS uq_users_email`);
    }
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`,
    );
    db.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`,
    );

    // ---- 4) 新表 captchas（图形验证码） ----
    db.exec(`
CREATE TABLE IF NOT EXISTS captchas (
  id VARCHAR PRIMARY KEY,
  text VARCHAR NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
`);

    // ---- 5) 新表 email_verifications（邮箱验证码落库） ----
    db.exec(`
CREATE TABLE IF NOT EXISTS email_verifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email VARCHAR NOT NULL,
  code VARCHAR NOT NULL,
  scene VARCHAR NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_email_verif ON email_verifications(email, scene, created_at);
`);
  });
}
