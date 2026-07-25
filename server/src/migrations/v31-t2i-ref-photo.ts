/**
 * v3.1 D 板块迁移：t2i_tasks 加 ref_photo_key 列（架构设计 v3.1 §1.4 t2i 链路改造点 1）。
 *
 * 背景：效果图（文生图）链路升级为火山引擎图+文生图——发起 t2i 任务时把该 session
 * 首张 before 照片的 cos_key 存入任务的 ref_photo_key，worker 取出后签 3600s COS
 * 签名 URL 作为参考图传给火山 doubao-seedream 模型。
 *
 * 幂等：PRAGMA table_info 判存，存在则跳过，可反复执行；失败整体回滚。
 * 由 db.ts 的 migrate() 在 migrateV3() 之后调用。
 */
import { db, withTransaction } from '../db.js';

export function migrateV31T2iRefPhoto(): void {
  withTransaction(() => {
    const cols = db.prepare(`PRAGMA table_info(t2i_tasks)`).all() as Array<{ name: string }>;
    if (cols.length === 0) return; // 极端早期（t2i_tasks 尚未建表）跳过，下轮 migrate 再补
    if (!cols.some((c) => c.name === 'ref_photo_key')) {
      db.exec(`ALTER TABLE t2i_tasks ADD COLUMN ref_photo_key VARCHAR`);
    }
  });
}
