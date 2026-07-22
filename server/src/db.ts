/**
 * 数据库层：Node 22 内置 node:sqlite（原生驱动，零依赖，Windows 无需下载 Prisma 引擎）。
 * 建表语句与架构文档 2.4 严格一致；Prisma 预留升级路径见 README。
 *
 * 约定：
 * - 所有表含 id 主键、created_at、updated_at（points_account 等例外见 2.4 说明）
 * - 金额一律"分"(int)；时间一律 ISO 8601 UTC
 * - 幂等核心：points_transaction 对 (biz_type, biz_id) 建唯一索引
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { migrateV22 } from './migrations/v22-users-captcha.js';
import { migrateV3 } from './migrations/v3-ops-photos.js';

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

export const db = new DatabaseSync(config.dbFile);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** 建表（幂等，启动时执行） */
export function migrate(): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone VARCHAR UNIQUE,
  wechat_openid VARCHAR UNIQUE,
  nickname VARCHAR NOT NULL DEFAULT '',
  avatar_url VARCHAR,
  is_new_gift_used INTEGER NOT NULL DEFAULT 0,
  reminder_enabled INTEGER NOT NULL DEFAULT 1,
  delete_after_analysis INTEGER NOT NULL DEFAULT 0,
  privacy_agreed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS spaces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name VARCHAR NOT NULL,
  space_type VARCHAR NOT NULL,
  cover_photo_id INTEGER,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_spaces_user ON spaces(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  space_id INTEGER NOT NULL REFERENCES spaces(id),
  status VARCHAR NOT NULL DEFAULT 'uploading',
  granularity VARCHAR,
  discard_mode VARCHAR,
  output_forms VARCHAR NOT NULL DEFAULT '[]',
  points_charged INTEGER NOT NULL DEFAULT 0,
  regen_count INTEGER NOT NULL DEFAULT 0,
  confirm_state TEXT,
  completed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_space ON sessions(space_id);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  cos_key VARCHAR NOT NULL,
  group_tag VARCHAR,
  status VARCHAR NOT NULL DEFAULT 'active',
  taken_order INTEGER NOT NULL DEFAULT 0,
  mime VARCHAR,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_session ON photos(session_id);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  version INTEGER NOT NULL DEFAULT 1,
  content_json TEXT NOT NULL,
  illustration_url VARCHAR,
  effect_image_url VARCHAR,
  effect_image_status VARCHAR NOT NULL DEFAULT 'none',
  is_final INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_plans_session ON plans(session_id);

CREATE TABLE IF NOT EXISTS plan_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  item_type VARCHAR NOT NULL,
  content_json TEXT NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  user_note TEXT,
  product_link VARCHAR,
  commission_rate REAL,
  checked INTEGER NOT NULL DEFAULT 0,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_plan_items_plan ON plan_items(plan_id);

CREATE TABLE IF NOT EXISTS points_account (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  balance INTEGER NOT NULL DEFAULT 0,
  total_earned INTEGER NOT NULL DEFAULT 0,
  total_spent INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS points_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  change INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  biz_type VARCHAR NOT NULL,
  biz_id VARCHAR NOT NULL,
  remark TEXT,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_points_tx_biz ON points_transaction(biz_type, biz_id);
CREATE INDEX IF NOT EXISTS idx_points_tx_user ON points_transaction(user_id);

CREATE TABLE IF NOT EXISTS packages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name VARCHAR NOT NULL,
  price_fen INTEGER NOT NULL,
  points INTEGER NOT NULL,
  tag VARCHAR,
  sort INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no VARCHAR UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  package_id INTEGER NOT NULL REFERENCES packages(id),
  amount_fen INTEGER NOT NULL,
  points INTEGER NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'PENDING',
  channel VARCHAR NOT NULL,
  paid_at DATETIME,
  refund_status VARCHAR,
  refund_amount_fen INTEGER,
  refund_reason TEXT,
  refunded_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);

CREATE TABLE IF NOT EXISTS configs (
  key VARCHAR PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by VARCHAR,
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS config_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key VARCHAR NOT NULL,
  old_value TEXT,
  new_value TEXT,
  operator VARCHAR,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS knowledge_base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  space_type VARCHAR NOT NULL,
  category VARCHAR NOT NULL,
  items_json TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_kb_space ON knowledge_base(space_type);

CREATE TABLE IF NOT EXISTS reminders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  remind_at DATETIME NOT NULL,
  status VARCHAR NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS service_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  session_id INTEGER REFERENCES sessions(id),
  status VARCHAR NOT NULL DEFAULT 'pending',
  contact_phone VARCHAR,
  note TEXT,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- ===== 阶段 2 新增表（架构文档 2.2） =====

CREATE TABLE IF NOT EXISTS admin_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL REFERENCES users(id),
  action VARCHAR NOT NULL,
  target VARCHAR NOT NULL,
  detail_json TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin ON admin_logs(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_action ON admin_logs(action);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type VARCHAR NOT NULL,
  title VARCHAR NOT NULL,
  content TEXT NOT NULL,
  link VARCHAR,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id, is_read);

CREATE TABLE IF NOT EXISTS regen_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  status VARCHAR NOT NULL DEFAULT 'pending',
  payload_json TEXT NOT NULL,
  result_json TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_regen_status ON regen_tasks(status);
CREATE INDEX IF NOT EXISTS idx_regen_session ON regen_tasks(session_id);

CREATE TABLE IF NOT EXISTS ai_cost_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER,
  stage VARCHAR NOT NULL,
  model VARCHAR NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  est_cost_yuan REAL NOT NULL DEFAULT 0,
  mock INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_cost_created ON ai_cost_logs(created_at);
`);

  // ===== 阶段 2 列变更（PRAGMA 判存，幂等） =====
  const userCols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
  if (!userCols.some((c) => c.name === 'role')) {
    db.exec(`ALTER TABLE users ADD COLUMN role VARCHAR NOT NULL DEFAULT 'user'`);
  }
  // 阶段2 曾在此创建全列唯一索引 uq_users_email（NULL 也唯一），与 v2.2
  // "多个老用户 email 为空"冲突，已废弃；v2.2 统一由 migrations/v22 建部分唯一索引
  if (!userCols.some((c) => c.name === 'email')) {
    db.exec(`ALTER TABLE users ADD COLUMN email VARCHAR`);
  }
  const sessionCols = db.prepare(`PRAGMA table_info(sessions)`).all() as Array<{ name: string }>;
  if (!sessionCols.some((c) => c.name === 'keep_photos')) {
    db.exec(`ALTER TABLE sessions ADD COLUMN keep_photos INTEGER NOT NULL DEFAULT 1`);
  }

  // ===== 阶段 2 增量补充（架构文档-阶段2补充 2.1，幂等） =====
  // 2.1.1 users 表：管理员密码体系
  if (!userCols.some((c) => c.name === 'password_hash')) {
    db.exec(`ALTER TABLE users ADD COLUMN password_hash VARCHAR`);
  }
  if (!userCols.some((c) => c.name === 'is_super')) {
    db.exec(`ALTER TABLE users ADD COLUMN is_super INTEGER NOT NULL DEFAULT 0`);
  }
  // 2.1.2 新表 t2i_tasks（高阶文生图异步任务）
  db.exec(`
CREATE TABLE IF NOT EXISTS t2i_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status VARCHAR NOT NULL DEFAULT 'pending',
  prompt TEXT NOT NULL,
  image_key VARCHAR,
  error_message VARCHAR,
  retry_count INTEGER NOT NULL DEFAULT 0,
  free_retry_used INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_t2i_status ON t2i_tasks(status);
CREATE INDEX IF NOT EXISTS idx_t2i_plan ON t2i_tasks(plan_id);
`);
  // 2.1.3 plans 表：个性化插画回显
  const planCols = db.prepare(`PRAGMA table_info(plans)`).all() as Array<{ name: string }>;
  if (!planCols.some((c) => c.name === 't2i_image_key')) {
    db.exec(`ALTER TABLE plans ADD COLUMN t2i_image_key VARCHAR`);
  }

  // ===== v2.2 增量迁移（A-1/A-2/A-6：users 邮箱化加列 + captchas/email_verifications 新表） =====
  migrateV22();

  // ===== v3 增量迁移（photos.kind 前后对比 + ops 开关种子 + 新三档套餐订正） =====
  migrateV3();
}

/** 受影响行数兜底（node:sqlite 各小版本 changes 返回 number | bigint 不一） */
export function changesOf(result: { changes: number | bigint }): number {
  return Number(result.changes);
}

/** 当前连接是否处于事务中（node:sqlite 不支持嵌套 BEGIN） */
let inTransaction = false;

/** 事务包装：node:sqlite 自动 BEGIN/COMMIT/ROLLBACK；已处事务中时直接复用外层事务 */
export function withTransaction<T>(fn: () => T): T {
  if (inTransaction) return fn();
  inTransaction = true;
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    inTransaction = false;
  }
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 更新行的 updated_at（SQLite 无 ON UPDATE 触发器，统一手动维护） */
export function touch(table: string, id: number): void {
  db.prepare(`UPDATE ${table} SET updated_at = ? WHERE id = ?`).run(nowIso(), id);
}
