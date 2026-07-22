/**
 * 用户/鉴权服务（v2.2 A-2/A-3/A-12）。
 *
 * 核心变更：
 * - 注册成为显式动作（register）：邮箱码 → 查重 → 密码强度 → scrypt → 建号 → 赠 20 点 → JWT
 * - 登录统一入口 login(dto) 按 login_type 分派三方式；登录不自动注册，
 *   查不到账号一律走统一失败路径（2001 + LOGIN_FAIL_MSG），并跑 scrypt.verify(dummy)
 *   抹平"账号不存在"与"密码错误"的时间侧信道（架构 §2.4）
 * - 旧 findOrCreate 式自动注册函数已删除（架构 §4.6 明文禁止残留）
 * - 手机号验证码登录分支（phone_code）代码路径下线：VERIFICATION_CHANNEL=ses 后
 *   mock 通道不再加载，且本文件不再暴露 phone+code 登录入口（A-4）
 */
import { db, nowIso, withTransaction } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { LOGIN_FAIL_MSG, EMAIL_NOT_REGISTERED_MSG } from '../../common/messages.js';
import { signToken } from '../../middleware/auth.js';
import { changeBalance, ensureAccount } from '../points/service.js';
import { getPointsRules } from '../configs/service.js';
import { hashPassword, verifyPassword } from './password.js';
import { verifyEmailCode } from './verification/email-verification.service.js';

export interface UserRow {
  id: number;
  phone: string | null;
  wechat_openid: string | null;
  nickname: string;
  avatar_url: string | null;
  is_new_gift_used: number;
  reminder_enabled: number;
  delete_after_analysis: number;
  privacy_agreed_at: string | null;
  role: string;
  email: string | null;
  username: string | null;
  email_verified: number;
  force_password_reset: number;
  password_hash: string | null;
  is_super: number;
  created_at: string;
}

export interface AuthResult {
  user: UserRow;
  token: string;
  /** force_password_reset=1 时 true：前端全屏拦截改密（未完成不可访问其他页） */
  need_reset: boolean;
}

/** 防枚举时间抹平用的 dummy scrypt 哈希（与生成的真哈希同构，verify 恒 false） */
const DUMMY_HASH = hashPassword('dummy-password-for-timing');

/** 登录统一失败：先抹平时间侧信道，再抛统一文案 */
function failLogin(input: string): never {
  try {
    verifyPassword(input || 'x', DUMMY_HASH);
  } catch {
    /* 忽略，只为耗时 */
  }
  throw BizError.unauthorized(LOGIN_FAIL_MSG);
}

function toAuthResult(user: UserRow): AuthResult {
  return {
    user,
    token: signToken(user.id, user.role ?? 'user', 'user'),
    need_reset: user.force_password_reset === 1,
  };
}

/** 手机号在 ADMIN_PHONES 名单内自动提升 role（保留既有逻辑，但不再影响 scope） */
function maybePromoteAdmin(user: UserRow): void {
  const adminPhones = (process.env.ADMIN_PHONES || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (user.phone && adminPhones.includes(user.phone) && user.role !== 'admin') {
    db.prepare(`UPDATE users SET role = 'admin', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      user.id,
    );
    user.role = 'admin';
  }
}

// ===================== 注册（A-2） =====================

export interface RegisterInput {
  email: string;
  email_code: string;
  password: string;
  username: string;
  phone?: string | null;
}

/** 注册：查重由路由层前置完成（明示占用错误码）；此处建号 + 赠点 + 签发 JWT（事务） */
export function register(input: RegisterInput): AuthResult {
  return withTransaction(() => {
    // 邮箱码一次性校验（scene=register，verified=1 作废）；失败抛 2102
    verifyEmailCode(input.email, input.email_code, 'register');

    const r = db
      .prepare(
        `INSERT INTO users (email, username, nickname, phone, password_hash, email_verified)
         VALUES (?, ?, ?, ?, ?, 1)`,
      )
      .run(
        input.email,
        input.username,
        input.username, // 昵称默认同用户名，账号页可改
        input.phone ?? null,
        hashPassword(input.password),
      );
    const userId = Number(r.lastInsertRowid);

    // 新用户免费额度（R12）：赠点沿用 configs 表 points.rules.new_user_gift_points（默认 20）
    ensureAccount(userId);
    const rules = getPointsRules();
    if (rules.new_user_gift_points > 0) {
      changeBalance(
        userId,
        rules.new_user_gift_points,
        'gift',
        `gift:new_user:${userId}`,
        '新用户免费体验礼包',
      );
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
    maybePromoteAdmin(user);
    return toAuthResult(user);
  });
}

// ===================== 登录（A-3/A-12，三方式统一分派） =====================

export type LoginType = 'email_code' | 'email_password' | 'phone_password';

export interface LoginInput {
  login_type: LoginType;
  email?: string;
  phone?: string;
  email_code?: string;
  password?: string;
}

export function login(input: LoginInput): AuthResult {
  switch (input.login_type) {
    case 'email_code':
      return loginByEmailCode(input.email ?? '', input.email_code ?? '');
    case 'email_password':
      return loginByEmailPassword(input.email ?? '', input.password ?? '');
    case 'phone_password':
      return loginByPhonePassword(input.phone ?? '', input.password ?? '');
    default:
      throw BizError.param('不支持的登录方式');
  }
}

/** 邮箱 + 验证码：未注册给专属提示（A-12 允许）；登录不自动注册 */
function loginByEmailCode(email: string, code: string): AuthResult {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!user) {
    // 时间抹平（与查库+验码耗时对齐）后给"先去注册"提示
    try {
      verifyPassword(code || 'x', DUMMY_HASH);
    } catch {
      /* 忽略 */
    }
    throw BizError.unauthorized(EMAIL_NOT_REGISTERED_MSG);
  }
  // 先查账号再验码：验证码错误 2102 只会发给"确实注册了但输错码"的真实主人
  verifyEmailCode(email, code, 'login');
  maybePromoteAdmin(user);
  return toAuthResult(user);
}

/** 邮箱 + 密码：账号不存在与密码错误同文案同耗时 */
function loginByEmailPassword(email: string, password: string): AuthResult {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  if (!user || !user.password_hash) return failLogin(password);
  if (!verifyPassword(password, user.password_hash)) return failLogin(password);
  maybePromoteAdmin(user);
  return toAuthResult(user);
}

/** 手机号 + 密码（老用户迁移后主路径之一） */
function loginByPhonePassword(phone: string, password: string): AuthResult {
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined;
  if (!user || !user.password_hash) return failLogin(password);
  if (!verifyPassword(password, user.password_hash)) return failLogin(password);
  maybePromoteAdmin(user);
  return toAuthResult(user);
}

// ===================== 查重（注册/改绑失焦校验，登录链路禁止调用） =====================

export function checkAvailability(field: 'email' | 'username' | 'phone', value: string): boolean {
  const row = db.prepare(`SELECT id FROM users WHERE ${field} = ?`).get(value);
  return !row;
}

// ===================== 通用查询 =====================

export function getUserById(userId: number): UserRow {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as
    | UserRow
    | undefined;
  if (!user) throw BizError.unauthorized('账号不存在，请重新登录');
  return user;
}

/** 改密码（账号页 + force_password_reset 拦截页共用；免旧密码由调用方判断） */
export function changePassword(userId: number, newPassword: string): void {
  db.prepare(
    `UPDATE users SET password_hash = ?, force_password_reset = 0, updated_at = ? WHERE id = ?`,
  ).run(hashPassword(newPassword), nowIso(), userId);
}

/** 同意隐私政策（R19） */
export function agreePrivacy(userId: number): void {
  db.prepare('UPDATE users SET privacy_agreed_at = ?, updated_at = ? WHERE id = ?').run(
    nowIso(),
    nowIso(),
    userId,
  );
}

export interface UserSettings {
  reminder_enabled?: number;
  delete_after_analysis?: number;
  nickname?: string;
}

export function updateSettings(userId: number, settings: UserSettings): void {
  const allowed: Array<keyof UserSettings> = [
    'reminder_enabled',
    'delete_after_analysis',
    'nickname',
  ];
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const key of allowed) {
    if (settings[key] !== undefined) {
      sets.push(`${key} = ?`);
      values.push(settings[key]);
    }
  }
  if (sets.length === 0) return;
  sets.push('updated_at = ?');
  values.push(nowIso(), userId);
  db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]));
}
