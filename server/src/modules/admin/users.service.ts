/**
 * 管理员-用户管理（R34）：列表搜索排序、详情（余额+流水）、发放/扣减点数。
 * 点数变更走统一入口 changeBalance（事务 + 幂等唯一索引），成功后写 admin_logs。
 */
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { maskEmail, maskPhone } from '../../common/mask.js';
import { changeBalance, listTransactions, type PointsBizType } from '../points/service.js';
import { writeAdminLog } from './logs.service.js';
import { getUserById } from '../auth/service.js';

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
      `SELECT u.id, u.phone, u.email, u.username, u.nickname, u.role, u.status, u.created_at,
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
      `SELECT u.id, u.phone, u.email, u.username, u.nickname, u.role, u.status, u.reminder_enabled, u.delete_after_analysis,
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

// ===================== v3.2 §5.2：用户封锁/解封（D2：仅超管可操作，与 5.1 同一闸） =====================

/** 超管闸：不信任 JWT 之外的身份信息，每次操作现查 is_super（复用 reset-password 同款模式） */
export function assertSuperAdmin(operatorId: number): void {
  const me = getUserById(operatorId);
  if (me.is_super !== 1) throw BizError.forbidden('仅超级管理员可操作');
}

/** 封锁用户：status='blocked'；已签发 token 不吊销，下次请求由 authMiddleware 点查拦截（D2） */
export function blockUser(
  adminId: number,
  targetUserId: number,
  reason: string,
): { id: number; status: string } {
  assertSuperAdmin(adminId);
  const trimmed = reason?.trim();
  if (!trimmed || trimmed.length > 200) throw BizError.param('封禁原因 1-200 个字哦');
  const target = db
    .prepare(`SELECT id, email, role, status FROM users WHERE id = ?`)
    .get(targetUserId) as
    | { id: number; email: string | null; role: string; status: string }
    | undefined;
  if (!target) throw BizError.notFound('用户不存在');
  if (target.status === 'blocked') throw BizError.param('该用户已处于封禁状态');
  db.prepare(`UPDATE users SET status = 'blocked', updated_at = ? WHERE id = ?`).run(
    nowIso(),
    targetUserId,
  );
  writeAdminLog(adminId, 'user_block', `user:${targetUserId}`, {
    target_email: maskEmail(target.email),
    reason: trimmed,
  });
  return { id: targetUserId, status: 'blocked' };
}

/** 解封用户：status='active'，下次登录/请求即恢复 */
export function unblockUser(adminId: number, targetUserId: number): { id: number; status: string } {
  assertSuperAdmin(adminId);
  const target = db
    .prepare(`SELECT id, email, status FROM users WHERE id = ?`)
    .get(targetUserId) as { id: number; email: string | null; status: string } | undefined;
  if (!target) throw BizError.notFound('用户不存在');
  if (target.status !== 'blocked') throw BizError.param('该用户未被封禁');
  db.prepare(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ?`).run(
    nowIso(),
    targetUserId,
  );
  writeAdminLog(adminId, 'user_unblock', `user:${targetUserId}`, {
    target_email: maskEmail(target.email),
  });
  return { id: targetUserId, status: 'active' };
}
