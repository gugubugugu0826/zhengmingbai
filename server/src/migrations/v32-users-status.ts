/**
 * v3.2 迁移：users 表加 status 列（架构设计 v3.2 D1，任务书 §5.2 用户封锁/解封）。
 *
 * 列定义：status VARCHAR NOT NULL DEFAULT 'active'，取值仅 'active' | 'blocked'
 * （CHECK 约束 SQLite 加了难维护，由 zod/服务层收口，见 §五共享知识）。
 * ADD COLUMN 带默认值时 SQLite 全表自动回填，不需要单独 UPDATE。
 *
 * 幂等：PRAGMA table_info 判存，存在则跳过，可反复执行；失败整体回滚。
 * 由 db.ts 的 migrate() 在 migrateV31T2iRefPhoto() 之后调用。
 */
import { db, withTransaction } from '../db.js';

export function migrateV32UsersStatus(): void {
  withTransaction(() => {
    const cols = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === 'status')) {
      db.exec(`ALTER TABLE users ADD COLUMN status VARCHAR NOT NULL DEFAULT 'active'`);
    }
  });
}
