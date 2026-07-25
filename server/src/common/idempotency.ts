/**
 * 幂等工具：基于 points_transaction 的 (biz_type, biz_id) 唯一索引。
 * 数据库层面天然防重放：同一笔业务重放 N 次也只入账一次。
 */
import { db } from '../db.js';

/** 判断一笔业务流水是否已处理 */
export function alreadyProcessed(bizType: string, bizId: string): boolean {
  const row = db
    .prepare('SELECT id FROM points_transaction WHERE biz_type = ? AND biz_id = ?')
    .get(bizType, bizId);
  return row !== undefined;
}

/** 生成业务单号 */
export function bizNo(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now()}${rand}`.toUpperCase();
}
