/**
 * 账号页路由（v2.2 A-10）：/api/v1/account/* 全部需 JWT（index.ts 统一挂载 authMiddleware）。
 * 七接口：profile / username / phone / email-code / email / password / preferences / points。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import { BizError } from '../../common/errors.js';
import { validateEmail } from '../../common/validators.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { assertValidEmail, assertValidPhone } from '../auth/sms.js';
import { assertCaptcha } from '../auth/captcha/service.js';
import { sendEmailCode } from '../auth/verification/email-verification.service.js';
import { getUserById, updateSettings } from '../auth/service.js';
import { publicUser } from '../auth/routes.js';
import { getBalance, listTransactions } from '../points/service.js';
import { bindPhone, changeEmail, changeUsername, changeUserPassword } from './service.js';

export const accountRouter = Router();

/** GET /account/profile — 汇总：脱敏用户信息 + 余额 + 强制改密标记 */
accountRouter.get('/profile', (req: AuthRequest, res) => {
  const user = getUserById(req.userId!);
  ok(res, {
    user: publicUser(user),
    points: getBalance(user.id),
    need_reset: user.force_password_reset === 1,
  });
});

const usernameSchema = z.object({ username: z.string().min(1).max(20) });

/** PUT /account/username — 改用户名（即时查重 2106） */
accountRouter.put('/username', (req: AuthRequest, res) => {
  const { username } = usernameSchema.parse(req.body);
  changeUsername(req.userId!, username);
  ok(res, publicUser(getUserById(req.userId!)), '用户名已更新');
});

const phoneSchema = z.object({
  phone: z.string().min(11).max(11),
  captcha_id: z.string().min(1, '请先完成图形验证'),
  captcha_code: z.string().min(1, '请输入图形验证码'),
});

/** PUT /account/phone — 绑定/改绑手机号（图形码前置；TODO(sms): 免手机验证码） */
accountRouter.put('/phone', sensitiveLimiter, (req: AuthRequest, res) => {
  const { phone, captcha_id, captcha_code } = phoneSchema.parse(req.body);
  assertValidPhone(phone);
  assertCaptcha(captcha_id, captcha_code);
  bindPhone(req.userId!, phone);
  ok(res, publicUser(getUserById(req.userId!)), '手机号已绑定');
});

const emailCodeSchema = z.object({
  new_email: z.string().min(3).max(254),
  captcha_id: z.string().min(1, '请先完成图形验证'),
  captcha_code: z.string().min(1, '请输入图形验证码'),
});

/** POST /account/email-code — 换绑邮箱第一步：发码到新邮箱（scene=change_email） */
accountRouter.post('/email-code', sensitiveLimiter, async (req, res, next) => {
  try {
    const { new_email, captcha_id, captcha_code } = emailCodeSchema.parse(req.body);
    assertValidEmail(new_email);
    assertCaptcha(captcha_id, captcha_code);
    await sendEmailCode(new_email, 'change_email');
    ok(res, { sent: true }, '验证码已发送至新邮箱，5 分钟内有效');
  } catch (err) {
    next(err);
  }
});

const changeEmailSchema = z.object({
  new_email: z.string().min(3).max(254),
  code: z.string().regex(/^\d{6}$/, '邮箱验证码为 6 位数字'),
});

/** PUT /account/email — 换绑邮箱第二步：验码 + 查重（2105） */
accountRouter.put('/email', sensitiveLimiter, (req: AuthRequest, res) => {
  const { new_email, code } = changeEmailSchema.parse(req.body);
  const emailErr = validateEmail(new_email);
  if (emailErr) throw BizError.param(emailErr);
  changeEmail(req.userId!, new_email, code);
  ok(res, publicUser(getUserById(req.userId!)), '邮箱已换绑');
});

const passwordSchema = z.object({
  old_password: z.string().min(1).max(64).optional(),
  new_password: z.string().min(1).max(64),
});

/** PUT /account/password — 改密码（force_password_reset 用户免旧密码） */
accountRouter.put('/password', sensitiveLimiter, (req: AuthRequest, res) => {
  const { old_password, new_password } = passwordSchema.parse(req.body);
  changeUserPassword(req.userId!, new_password, old_password);
  ok(res, publicUser(getUserById(req.userId!)), '密码已更新');
});

const preferencesSchema = z.object({
  delete_after_analysis: z.union([z.literal(0), z.literal(1)]).optional(),
  reminder_enabled: z.union([z.literal(0), z.literal(1)]).optional(),
});

/** PUT /account/preferences — 两开关（分析完即删 / 30 天复查提醒） */
accountRouter.put('/preferences', (req: AuthRequest, res) => {
  const prefs = preferencesSchema.parse(req.body);
  updateSettings(req.userId!, prefs);
  ok(res, publicUser(getUserById(req.userId!)), '设置已保存');
});

const pointsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /account/points — 我的点数（余额 + 分页流水，复用 points 服务） */
accountRouter.get('/points', (req: AuthRequest, res) => {
  const { page, pageSize } = pointsQuerySchema.parse(req.query);
  ok(res, {
    ...getBalance(req.userId!),
    transactions: listTransactions(req.userId!, page, pageSize),
  });
});
