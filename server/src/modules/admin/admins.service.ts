/**
 * 管理员增删（v3.2 §5.1，架构 D4）：仅超管可操作。
 *
 * 实现语义：
 * - 新增管理员 = 把「已注册且有邮箱」的用户提升为 role='admin'（不新建账号，
 *   用户原有点数/数据保留；后台登录仍走 /admin/auth 三段式双因子）
 * - 删除管理员 = 降级回 role='user' + is_super=0（降级不删号）
 *
 * 保护规则（D4）：
 * - 仅 is_super=1 现查可操作（复用 reset-password 同款闸，不加新中间件）
 * - 不能删自己
 * - 事务内守卫：删除后 is_super=1 的管理员至少剩 1 个
 * - 全程 writeAdminLog 留痕（admin_add / admin_remove，detail 记脱敏邮箱）
 */
import { db, nowIso, withTransaction } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { maskEmail } from '../../common/mask.js';
import { writeAdminLog } from './logs.service.js';
import { assertSuperAdmin } from './users.service.js';

interface AdminTargetRow {
  id: number;
  email: string | null;
  nickname: string;
  role: string;
  is_super: number;
}

/** 按 identifier（邮箱或手机号）定位待提升的用户 */
function findTargetByIdentifier(identifier: string): AdminTargetRow | undefined {
  const idf = identifier.trim();
  if (idf.includes('@')) {
    return db
      .prepare(`SELECT id, email, nickname, role, is_super FROM users WHERE email = ?`)
      .get(idf) as AdminTargetRow | undefined;
  }
  return db
    .prepare(`SELECT id, email, nickname, role, is_super FROM users WHERE phone = ?`)
    .get(idf) as AdminTargetRow | undefined;
}

/**
 * 新增管理员：指定邮箱/手机号把已有用户提升为 admin。
 * 目标必须已注册且有邮箱（三段式登录需要邮箱验证码）；不能重复提升。
 */
export function addAdmin(
  operatorId: number,
  identifier: string,
  nickname?: string,
): { id: number; email: string | null } {
  assertSuperAdmin(operatorId);
  if (!identifier?.trim()) throw BizError.param('请填写邮箱或手机号');
  const target = findTargetByIdentifier(identifier);
  if (!target) throw BizError.notFound('未找到该用户，请先让对方注册账号');
  if (target.role === 'admin') throw BizError.param('该用户已是管理员，无需重复添加');
  if (!target.email) {
    throw BizError.param('该用户未绑定邮箱，请先在「老用户迁移」完成邮箱绑定');
  }
  const newNickname = nickname?.trim();
  db.prepare(
    `UPDATE users SET role = 'admin', nickname = COALESCE(?, nickname), updated_at = ? WHERE id = ?`,
  ).run(newNickname || null, nowIso(), target.id);
  writeAdminLog(operatorId, 'admin_add', `user:${target.id}`, {
    target_email: maskEmail(target.email),
    ...(newNickname ? { nickname: newNickname } : {}),
  });
  return { id: target.id, email: target.email };
}

/**
 * 删除管理员：降级回普通用户（role='user', is_super=0，不删号）。
 * 不能删自己；删除后系统至少保留 1 个超管（事务内检查，失败整体回滚）。
 */
export function removeAdmin(operatorId: number, targetId: number): { id: number } {
  assertSuperAdmin(operatorId);
  if (targetId === operatorId) throw BizError.param('不能删除自己的管理员身份');
  return withTransaction(() => {
    const target = db
      .prepare(`SELECT id, email, nickname, role, is_super FROM users WHERE id = ?`)
      .get(targetId) as AdminTargetRow | undefined;
    if (!target || target.role !== 'admin') throw BizError.notFound('管理员不存在');
    db.prepare(
      `UPDATE users SET role = 'user', is_super = 0, updated_at = ? WHERE id = ?`,
    ).run(nowIso(), target.id);
    // 超管计数守卫（事务内）：降级后 is_super=1 至少剩 1 个，否则回滚
    const { c } = db
      .prepare(`SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_super = 1`)
      .get() as { c: number };
    if (c < 1) throw BizError.param('至少要保留 1 个超级管理员');
    writeAdminLog(operatorId, 'admin_remove', `user:${target.id}`, {
      target_email: maskEmail(target.email),
    });
    return { id: target.id };
  });
}
