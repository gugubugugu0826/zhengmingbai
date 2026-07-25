/**
 * 点数服务（R12/R15）。
 * 全系统唯一扣点入口：PointsService.changeBalance() —— 事务 + 幂等唯一索引。
 * 约定：事务外任何人不允许直接改 points_account.balance。
 */
import { db, nowIso, withTransaction } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { alreadyProcessed } from '../../common/idempotency.js';

export type PointsBizType =
  | 'order_recharge'
  | 'analysis'
  | 'regen'
  | 'gift'
  | 'refund'
  | 'admin_deduct'
  | 't2i';

/**
 * total_spent 口径（v2.2 BUG-2，架构 §2.3.6）：仅消费类 biz_type 累加。
 * gift / admin_deduct / order_recharge / refund 一律不影响 total_spent。
 * 历史数据不订正（v2.2 说明口径，避免二次风险）。
 */
const SPENT_BIZ_TYPES: ReadonlySet<PointsBizType> = new Set(['analysis', 't2i', 'regen']);

export interface ChangeResult {
  balance: number;
  /** true 表示本次为重放请求，未重复入账 */
  replayed: boolean;
}

export function ensureAccount(userId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO points_account (user_id, balance, total_earned, total_spent)
     VALUES (?, 0, 0, 0)`,
  ).run(userId);
}

export function getBalance(userId: number): {
  balance: number;
  total_earned: number;
  total_spent: number;
} {
  ensureAccount(userId);
  const row = db
    .prepare('SELECT balance, total_earned, total_spent FROM points_account WHERE user_id = ?')
    .get(userId) as { balance: number; total_earned: number; total_spent: number };
  return row;
}

/**
 * 点数变更统一入口（必须在事务中调用 or 自身开启事务）。
 * @param change 正=入账 负=扣减
 * @param bizType + bizId 构成幂等键，重放不重复入账
 * @throws BizError 3001 余额不足
 */
export function changeBalance(
  userId: number,
  change: number,
  bizType: PointsBizType,
  bizId: string,
  remark = '',
): ChangeResult {
  if (!Number.isInteger(change) || change === 0) {
    throw BizError.param('点数变更必须为非零整数');
  }
  // 幂等短路：同一笔业务已入账则直接返回当前余额（重放安全）
  if (alreadyProcessed(bizType, bizId)) {
    return { balance: getBalance(userId).balance, replayed: true };
  }
  return withTransaction(() => {
    ensureAccount(userId);
    const account = db
      .prepare('SELECT balance FROM points_account WHERE user_id = ?')
      .get(userId) as { balance: number };
    const balanceAfter = account.balance + change;
    if (balanceAfter < 0) {
      throw BizError.insufficientPoints(-change, account.balance);
    }
    // 唯一索引兜底：并发/重放下第二次插入冲突 → 整单回滚
    try {
      db.prepare(
        `INSERT INTO points_transaction (user_id, change, balance_after, biz_type, biz_id, remark)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(userId, change, balanceAfter, bizType, bizId, remark);
    } catch (err) {
      if (String(err).includes('UNIQUE')) {
        return { balance: account.balance, replayed: true };
      }
      throw err;
    }
    // BUG-2：total_spent 仅统计消费类（analysis/t2i/regen）；
    // admin_deduct 虽为负数变更但属管理操作，不计入用户"累计消耗"
    const spentDelta = change < 0 && SPENT_BIZ_TYPES.has(bizType) ? -change : 0;
    db.prepare(
      `UPDATE points_account SET balance = ?,
         total_earned = total_earned + ?, total_spent = total_spent + ?, updated_at = ?
       WHERE user_id = ?`,
    ).run(balanceAfter, change > 0 ? change : 0, spentDelta, nowIso(), userId);
    return { balance: balanceAfter, replayed: false };
  });
}

export function listTransactions(
  userId: number,
  page: number,
  pageSize: number,
): { list: unknown[]; total: number } {
  const offset = (page - 1) * pageSize;
  const list = db
    .prepare(
      `SELECT id, change, balance_after, biz_type, biz_id, remark, created_at
       FROM points_transaction WHERE user_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(userId, pageSize, offset);
  const { total } = db
    .prepare('SELECT COUNT(*) AS total FROM points_transaction WHERE user_id = ?')
    .get(userId) as { total: number };
  return { list, total };
}
