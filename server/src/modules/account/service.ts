/**
 * 账号页服务（v2.2 A-10）：改用户名 / 绑改手机 / 改邮箱 / 改密码。
 * 查重走 auth/service.checkAvailability（排除自身）；占用错误码 2105/2106/2107（架构 §4.6）。
 */
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { ERR_EMAIL_TAKEN, ERR_PHONE_TAKEN, ERR_USERNAME_TAKEN } from '../../common/messages.js';
import { validateUsername } from '../../common/validators.js';
import { passwordPolicyError } from '../../common/password-policy.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { verifyEmailCode } from '../auth/verification/email-verification.service.js';
import { changePassword, getUserById } from '../auth/service.js';

function assertFieldFree(
  field: 'email' | 'username' | 'phone',
  value: string,
  excludeUserId: number,
  errCode: number,
  errMsg: string,
): void {
  const row = db
    .prepare(`SELECT id FROM users WHERE ${field} = ? AND id != ?`)
    .get(value, excludeUserId);
  if (row) throw new BizError(errCode, errMsg, 409);
}

/** 改用户名（格式校验 + 即时查重 2106） */
export function changeUsername(userId: number, username: string): void {
  const err = validateUsername(username);
  if (err) throw BizError.param(err);
  assertFieldFree('username', username, userId, ERR_USERNAME_TAKEN, '该用户名已被占用');
  db.prepare('UPDATE users SET username = ?, updated_at = ? WHERE id = ?').run(
    username,
    nowIso(),
    userId,
  );
}

/**
 * 绑定/改绑手机号（查重 2107）。
 * TODO(sms): 当前免手机验证码（短信通道未开通）；通道恢复后此处应前置
 * verifyCode(phone, sms_code) 校验（图形码已在路由层过）。
 */
export function bindPhone(userId: number, phone: string): void {
  assertFieldFree('phone', phone, userId, ERR_PHONE_TAKEN, '该手机号已被绑定');
  db.prepare('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?').run(
    phone,
    nowIso(),
    userId,
  );
}

/** 换绑邮箱：新邮箱码校验（scene=change_email）+ 查重 2105；旧邮箱不变更（无通知通道，v2.2 接受） */
export function changeEmail(userId: number, newEmail: string, code: string): void {
  verifyEmailCode(newEmail, code, 'change_email');
  assertFieldFree('email', newEmail, userId, ERR_EMAIL_TAKEN, '该邮箱已被注册');
  db.prepare('UPDATE users SET email = ?, email_verified = 1, updated_at = ? WHERE id = ?').run(
    newEmail,
    nowIso(),
    userId,
  );
}

/**
 * 改密码：force_password_reset 用户免旧密码；其余必须校验旧密码。
 * 新密码统一过强度规则（password-policy，注册/改密/迁移三处共用）。
 */
export function changeUserPassword(
  userId: number,
  newPassword: string,
  oldPassword?: string,
): void {
  const user = getUserById(userId);
  const err = passwordPolicyError(newPassword);
  if (err) throw BizError.param(err);

  const mustCheckOld = user.force_password_reset !== 1;
  if (mustCheckOld) {
    if (!oldPassword) throw BizError.param('请输入原密码');
    if (!user.password_hash || !verifyPassword(oldPassword, user.password_hash)) {
      throw BizError.param('原密码不正确');
    }
  }
  changePassword(userId, newPassword);
}
