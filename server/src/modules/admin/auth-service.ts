/**
 * /admin 双因子登录服务（v2.2 A-11，架构 §3.5）。
 * 三段式：邮箱验证码（仅管理员真实发码）→ 5 分钟一次性 admin_ticket → 管理员密码 → scope=admin 正式 JWT。
 * 防枚举：step1 对非管理员邮箱也返回 {sent:true}（不发码）；step3 失败统一文案。
 */
import { db } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { LOGIN_FAIL_MSG } from '../../common/messages.js';
import { signToken, verifyAdminTicket } from '../../middleware/auth.js';
import { sendEmailCode, verifyEmailCode } from '../auth/verification/email-verification.service.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { UserRow } from '../auth/service.js';

/** 时间抹平 dummy（与 auth/service 同策略） */
const DUMMY_HASH = hashPassword('dummy-admin-timing');

function adminByEmail(email: string): UserRow | undefined {
  return db
    .prepare(`SELECT * FROM users WHERE email = ? AND role = 'admin'`)
    .get(email) as UserRow | undefined;
}

/** step1：仅当邮箱属于 role=admin 用户才真实发码；其余静默成功（防枚举） */
export async function step1SendCode(email: string): Promise<void> {
  const admin = adminByEmail(email);
  if (!admin) return; // 不发码但路由照常返回 sent
  await sendEmailCode(email, 'admin_login');
}

/** step2：验码 → 签发 5 分钟一次性 admin_ticket（scope=admin_step2） */
export function step2VerifyCode(email: string, code: string): { admin_ticket: string; user_id: number } {
  const admin = adminByEmail(email);
  if (!admin) {
    try {
      verifyPassword(code || 'x', DUMMY_HASH);
    } catch {
      /* 抹平时间 */
    }
    throw BizError.unauthorized(LOGIN_FAIL_MSG);
  }
  verifyEmailCode(email, code, 'admin_login');
  return { admin_ticket: signToken(admin.id, 'admin', 'admin_step2'), user_id: admin.id };
}

/** step3：验 ticket + 管理员密码 → 签发 scope=admin 正式 JWT（30 天） */
export function step3VerifyPassword(ticket: string, password: string): { user: UserRow; token: string } {
  let userId: number;
  try {
    userId = verifyAdminTicket(ticket);
  } catch {
    throw BizError.unauthorized('登录票据已过期，请重新验证邮箱');
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as UserRow | undefined;
  if (!user || user.role !== 'admin' || !user.password_hash) {
    return failStep3(password);
  }
  if (!verifyPassword(password, user.password_hash)) {
    return failStep3(password);
  }
  return { user, token: signToken(user.id, 'admin', 'admin') };
}

function failStep3(input: string): never {
  try {
    verifyPassword(input || 'x', DUMMY_HASH);
  } catch {
    /* 抹平时间 */
  }
  throw BizError.unauthorized(LOGIN_FAIL_MSG);
}
