/**
 * 鉴权路由（v2.2 A-2/A-3/A-12）：/auth/* 不需要 JWT。
 *
 * v2.2 变更：
 * - POST /auth/register 显式注册（邮箱码 + 查重 + 密码强度 + 赠点 + JWT）
 * - POST /auth/login 统一入口按 login_type 分派三方式，登录不自动注册，
 *   失败统一 401 + 2001 + LOGIN_FAIL_MSG（时间侧信道已抹平）
 * - POST /auth/email-code 发邮箱验证码（前置图形码，防刷）
 * - GET /auth/check-{username,email} 注册/改绑失焦查重（登录链路禁止调用）
 * - 手机号+验证码登录下线（A-4）：/auth/sms/send 删除，login 无 phone_code 分支；
 *   verification 通道代码保留（TODO(sms): 短信通道恢复时重挂路由）
 * - 旧管理员密码第二因子路由（/auth/admin/password）删除，改 /admin/auth 三段式（A-11）
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import { BizError } from '../../common/errors.js';
import { ERR_EMAIL_TAKEN, ERR_PHONE_TAKEN, ERR_USERNAME_TAKEN } from '../../common/messages.js';
import { validateEmail, validatePassword, validateUsername } from '../../common/validators.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { assertValidEmail, assertValidPhone } from './sms.js';
import { assertCaptcha } from './captcha/service.js';
import {
  isEmailScene,
  sendEmailCode,
  type EmailScene,
} from './verification/email-verification.service.js';
import { codeToOpenId } from './wechat.js';
import {
  agreePrivacy,
  checkAvailability,
  getUserById,
  login,
  register,
  updateSettings,
  type UserRow,
} from './service.js';
import { changeBalance, ensureAccount, getBalance } from '../points/service.js';
import { getPointsRules } from '../configs/service.js';
import { authMiddleware, signToken } from '../../middleware/auth.js';
import { maskEmail, maskPhone } from '../../common/mask.js';
import { db, nowIso, withTransaction } from '../../db.js';

export const authRouter = Router();

const captchaFields = {
  captcha_id: z.string().min(1, '请先完成图形验证'),
  captcha_code: z.string().min(1, '请输入图形验证码'),
};

// ===================== 邮箱验证码下发（A-8） =====================

const emailCodeSchema = z.object({
  email: z.string().min(3).max(254),
  scene: z.string().min(1).max(30),
  ...captchaFields,
});

/** POST /auth/email-code — 发邮箱验证码（先过图形码；统一 {sent:true} 防枚举） */
authRouter.post('/email-code', sensitiveLimiter, async (req, res, next) => {
  try {
    const { email, scene, captcha_id, captcha_code } = emailCodeSchema.parse(req.body);
    assertValidEmail(email);
    if (!isEmailScene(scene) || scene === 'admin_login' || scene === 'change_email') {
      // admin_login 由 /admin/auth/step1 专用入口处理；change_email 由 /account/email-code（需登录）处理
      throw BizError.param('不支持的发送场景');
    }
    assertCaptcha(captcha_id, captcha_code);
    await sendEmailCode(email, scene as EmailScene);
    ok(res, { sent: true }, '验证码已发送，5 分钟内有效');
  } catch (err) {
    next(err);
  }
});

// ===================== 注册（A-2） =====================

const registerSchema = z.object({
  email: z.string().min(3).max(254),
  email_code: z.string().regex(/^\d{6}$/, '邮箱验证码为 6 位数字'),
  password: z.string().min(1).max(64),
  username: z.string().min(1).max(20),
  phone: z.string().min(11).max(11).nullish(),
  ...captchaFields,
});

/** POST /auth/register — 图形码 → 查重（明示占用）→ 格式/强度 → 邮箱码 → 建号 → 赠点 → JWT */
authRouter.post('/register', sensitiveLimiter, (req, res, next) => {
  try {
    const input = registerSchema.parse(req.body);
    assertValidEmail(input.email);
    const usernameErr = validateUsername(input.username);
    if (usernameErr) throw BizError.param(usernameErr);
    const passwordErr = validatePassword(input.password);
    if (passwordErr) throw BizError.param(passwordErr);
    if (input.phone) assertValidPhone(input.phone);

    assertCaptcha(input.captcha_id, input.captcha_code);

    // 注册侧允许明示占用（A-12）：409 + 明确字段错误码
    if (!checkAvailability('email', input.email)) {
      throw new BizError(ERR_EMAIL_TAKEN, '该邮箱已被注册', 409);
    }
    if (!checkAvailability('username', input.username)) {
      throw new BizError(ERR_USERNAME_TAKEN, '该用户名已被占用', 409);
    }
    if (input.phone && !checkAvailability('phone', input.phone)) {
      throw new BizError(ERR_PHONE_TAKEN, '该手机号已被绑定', 409);
    }

    const { user, token, need_reset } = register({
      email: input.email,
      email_code: input.email_code,
      password: input.password,
      username: input.username,
      phone: input.phone ?? null,
    });
    ok(
      res,
      { token, user: publicUser(user), need_reset, points: getBalance(user.id) },
      '注册成功，欢迎来整明白',
    );
  } catch (err) {
    next(err);
  }
});

// ===================== 登录（A-3/A-12，统一入口） =====================

const loginSchema = z.object({
  login_type: z.enum(['email_code', 'email_password', 'phone_password']),
  email: z.string().min(3).max(254).optional(),
  phone: z.string().min(11).max(11).optional(),
  email_code: z.string().regex(/^\d{6}$/).optional(),
  password: z.string().min(1).max(64).optional(),
  ...captchaFields,
});

/** POST /auth/login — 三方式统一入口；任何失败一律 401 + 2001 统一文案 */
authRouter.post('/login', sensitiveLimiter, (req, res, next) => {
  try {
    const input = loginSchema.parse(req.body);
    assertCaptcha(input.captcha_id, input.captcha_code);

    if (input.login_type.startsWith('email')) {
      if (!input.email) throw BizError.param('请输入邮箱');
      assertValidEmail(input.email);
      if (input.login_type === 'email_code' && !input.email_code) {
        throw BizError.param('请输入邮箱验证码');
      }
      if (input.login_type === 'email_password' && !input.password) {
        throw BizError.param('请输入密码');
      }
    } else {
      if (!input.phone) throw BizError.param('请输入手机号');
      assertValidPhone(input.phone);
      if (!input.password) throw BizError.param('请输入密码');
    }

    const { user, token, need_reset } = login(input);
    ok(
      res,
      { token, user: publicUser(user), need_reset, points: getBalance(user.id) },
      '登录成功',
    );
  } catch (err) {
    next(err);
  }
});

// ===================== 查重接口（A-2，注册/改绑失焦用；登录链路禁止调用） =====================

const checkSchema = z.object({ value: z.string().min(1).max(254) });

/** GET /auth/check-username?value= */
authRouter.get('/check-username', (req, res) => {
  const { value } = checkSchema.parse(req.query);
  ok(res, { available: checkAvailability('username', value) });
});

/** GET /auth/check-email?value= */
authRouter.get('/check-email', (req, res) => {
  const { value } = checkSchema.parse(req.query);
  ok(res, { available: checkAvailability('email', value) });
});

/** GET /auth/check-phone?value= — 手机号失焦即时查重（BUG-6 配套） */
authRouter.get('/check-phone', (req, res) => {
  const { value } = checkSchema.parse(req.query);
  if (!/^1[3-9]\d{9}$/.test(value)) throw BizError.param('手机号格式不对哦');
  ok(res, { available: checkAvailability('phone', value) });
});

// ===================== 微信登录（既有，保留） =====================

const wechatSchema = z.object({ code: z.string().min(1).max(128) });

/** POST /auth/wechat — 微信一键登录（Mock code 换 openid；小程序通道保留自动注册语义） */
authRouter.post('/wechat', sensitiveLimiter, (req, res, next) => {
  try {
    const { code } = wechatSchema.parse(req.body);
    const openid = codeToOpenId(code);
    const { user, isNew } = withTransaction(() => {
      let u = db.prepare('SELECT * FROM users WHERE wechat_openid = ?').get(openid) as
        | UserRow
        | undefined;
      let created = false;
      if (!u) {
        created = true;
        const nickname = `微信用户${openid.slice(-4)}`;
        const r = db
          .prepare(`INSERT INTO users (wechat_openid, nickname) VALUES (?, ?)`)
          .run(openid, nickname);
        const userId = Number(r.lastInsertRowid);
        // 新用户赠点（与注册同规则）
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
        u = db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRow;
      }
      return { user: u, isNew: created };
    });
    const token = signToken(user.id, user.role ?? 'user', 'user');
    ok(
      res,
      { token, user: publicUser(user), is_new: isNew, points: getBalance(user.id) },
      '登录成功',
    );
  } catch (err) {
    next(err);
  }
});

// ===================== 隐私政策 / 设置 / me / logout =====================

/** POST /auth/privacy/agree — 同意隐私政策（R19，需登录） */
authRouter.post('/privacy/agree', authMiddleware, (req: AuthRequest, res) => {
  agreePrivacy(req.userId!);
  ok(res, { agreed: true }, '感谢信任，我们会好好保护你的照片');
});

const settingsSchema = z.object({
  reminder_enabled: z.union([z.literal(0), z.literal(1)]).optional(),
  delete_after_analysis: z.union([z.literal(0), z.literal(1)]).optional(),
  nickname: z.string().min(1).max(30).optional(),
});

/** PATCH /auth/settings — 用户设置（复查提醒开关/分析完即删） */
authRouter.patch('/settings', authMiddleware, (req: AuthRequest, res) => {
  const settings = settingsSchema.parse(req.body);
  updateSettings(req.userId!, settings);
  ok(res, publicUser(getUserById(req.userId!)), '设置已保存');
});

/** GET /auth/me — 当前用户信息 + 点数余额（v2.2：补 username/email/force_password_reset，phone/email 统一走 mask） */
authRouter.get('/me', authMiddleware, (req: AuthRequest, res) => {
  const user = getUserById(req.userId!);
  ok(res, { user: publicUser(user), points: getBalance(user.id) });
});

/** POST /auth/logout — 无状态 JWT 无法服务端吊销：客户端清 token + 服务端审计 */
authRouter.post('/logout', authMiddleware, (req: AuthRequest, res) => {
  db.prepare(
    `INSERT INTO admin_logs (admin_user_id, action, target, detail_json, created_at, updated_at)
     VALUES (?, 'user_logout', ?, '{}', ?, ?)`,
  ).run(req.userId!, `user:${req.userId}`, nowIso(), nowIso());
  ok(res, { logged_out: true }, '已退出登录');
});

/** 对外用户对象（v2.2：脱敏统一走 common/mask；不暴露 openid/password_hash 等内部字段） */
export function publicUser(user: UserRow): Record<string, unknown> {
  return {
    id: user.id,
    phone: maskPhone(user.phone),
    email: maskEmail(user.email),
    email_verified: user.email_verified ?? 0,
    username: user.username ?? null,
    nickname: user.nickname,
    avatar_url: user.avatar_url,
    is_new_gift_used: user.is_new_gift_used,
    reminder_enabled: user.reminder_enabled,
    delete_after_analysis: user.delete_after_analysis,
    privacy_agreed: user.privacy_agreed_at !== null,
    role: user.role ?? 'user',
    force_password_reset: user.force_password_reset ?? 0,
  };
}

// TODO(sms): 手机号+验证码登录已随 A-4 下线（/auth/sms/send 路由删除、login 无 phone_code 分支）。
// 短信通道代码保留在 verification/sms.ts，VERIFICATION_CHANNEL 机制不变；
// 三期企业认证后恢复时：重挂 /auth/sms/send + login 增加 phone_code 分派即可。
// 参考旧实现见 git 历史（v2.1 auth/routes.ts）。
