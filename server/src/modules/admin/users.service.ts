/**
 * 管理员-用户管理（R34）：列表搜索排序、详情（余额+流水）、发放/扣减点数。
 * 点数变更走统一入口 changeBalance（事务 + 幂等唯一索引），成功后写 admin_logs。
 */
import { db } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { maskEmail, maskPhone } from '../../common/mask.js';
import { changeBalance, listTransactions, type PointsBizType } from '../points/service.js';
import { writeAdminLog } from './logs.service.js';

/** BUG-3：管理端用户出参统一脱敏（phone/email 必过 mask，code review 卡点） */
function maskUserRow<T extends { phone?: string | null; email?: string | null }>(row: T): T {
  return { ...row, phone: maskPhone(row.phone ?? null), email: maskEmail(row.email ?? null) };
}

export interface AdminUserListQuery {
  phone?: string;
  sort?: 'created_at' | 'spent';
  order?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export function listUsers(q: AdminUserListQuery): { list: unknown[]; total: number } {
  // T04 遗留修复：搜索框同时匹配手机号与邮箱（运营按邮箱找用户是高频场景）
  const where = q.phone ? `WHERE (u.phone LIKE ? OR u.email LIKE ?)` : '';
  const params: unknown[] = q.phone ? [`%${q.phone}%`, `%${q.phone}%`] : [];
  const sortCol =
    q.sort === 'spent'
      ? 'COALESCE(pa.total_spent, 0)'
      : 'u.created_at';
  const orderDir = q.order === 'asc' ? 'ASC' : 'DESC';
  const offset = (q.page - 1) * q.pageSize;
  const list = db
    .prepare(
      `SELECT u.id, u.phone, u.email, u.username, u.nickname, u.role, u.created_at,
              COALESCE(pa.balance, 0) AS balance, COALESCE(pa.total_spent, 0) AS total_spent
       FROM users u LEFT JOIN points_account pa ON pa.user_id = u.id
       ${where} ORDER BY ${sortCol} ${orderDir} LIMIT ? OFFSET ?`,
    )
    .all(...(params as never[]), q.pageSize, offset) as Array<Record<string, unknown>>;
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM users u ${where}`)
    .get(...(params as never[])) as { total: number };
  return { list: list.map((u) => maskUserRow(u)), total };
}

export function userDetail(
  targetUserId: number,
  page: number,
  pageSize: number,
): { user: unknown; transactions: { list: unknown[]; total: number } } {
  const user = db
    .prepare(
      `SELECT u.id, u.phone, u.email, u.username, u.nickname, u.role, u.reminder_enabled, u.delete_after_analysis,
              u.created_at, COALESCE(pa.balance, 0) AS balance,
              COALESCE(pa.total_earned, 0) AS total_earned, COALESCE(pa.total_spent, 0) AS total_spent
       FROM users u LEFT JOIN points_account pa ON pa.user_id = u.id WHERE u.id = ?`,
    )
    .get(targetUserId) as Record<string, unknown> | undefined;
  if (!user) throw BizError.notFound('用户不存在');
  return { user: maskUserRow(user), transactions: listTransactions(targetUserId, page, pageSize) };
}

/** 发放/扣减点数（备注必填；正=发放 gift，负=扣减 admin_deduct） */
export function grantPoints(
  adminId: number,
  targetUserId: number,
  change: number,
  reason: string,
): { balance: number } {
  if (!reason?.trim()) throw BizError.param('请填写备注原因');
  if (!Number.isInteger(change) || change === 0) throw BizError.param('点数变更必须为非零整数');
  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!target) throw BizError.notFound('用户不存在');
  const bizType: PointsBizType = change > 0 ? 'gift' : 'admin_deduct';
  const bizId = `admin:${adminId}:${targetUserId}:${Date.now()}`;
  const result = changeBalance(
    targetUserId,
    change,
    bizType,
    bizId,
    `管理员${change > 0 ? '发放' : '扣减'}：${reason}`,
  );
  writeAdminLog(adminId, change > 0 ? 'points_grant' : 'points_deduct', `user:${targetUserId}`, {
    change,
    balance_after: result.balance,
    reason,
  });
  return { balance: result.balance };
}
