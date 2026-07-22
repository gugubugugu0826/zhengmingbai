/**
 * /admin 双因子登录路由（v2.2 A-11）：/api/v1/admin/auth/* 无需 JWT。
 * 三段式：step1 发码（防枚举静默）→ step2 换 admin_ticket → step3 密码换正式 token。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import { assertValidEmail } from '../auth/sms.js';
import { assertCaptcha } from '../auth/captcha/service.js';
import { publicUser } from '../auth/routes.js';
import { step1SendCode, step2VerifyCode, step3VerifyPassword } from './auth-service.js';

export const adminAuthRouter = Router();

const step1Schema = z.object({
  email: z.string().min(3).max(254),
  captcha_id: z.string().min(1, '请先完成图形验证'),
  captcha_code: z.string().min(1, '请输入图形验证码'),
});

/** POST /admin/auth/step1 — 图形码前置；非管理员邮箱也返回 sent（防枚举） */
adminAuthRouter.post('/step1', sensitiveLimiter, async (req, res, next) => {
  try {
    const { email, captcha_id, captcha_code } = step1Schema.parse(req.body);
    assertValidEmail(email);
    assertCaptcha(captcha_id, captcha_code);
    await step1SendCode(email);
    ok(res, { sent: true }, '验证码已发送，5 分钟内有效');
  } catch (err) {
    next(err);
  }
});

const step2Schema = z.object({
  email: z.string().min(3).max(254),
  code: z.string().regex(/^\d{6}$/, '邮箱验证码为 6 位数字'),
});

/** POST /admin/auth/step2 — 验码换 5 分钟一次性 admin_ticket */
adminAuthRouter.post('/step2', sensitiveLimiter, (req, res, next) => {
  try {
    const { email, code } = step2Schema.parse(req.body);
    assertValidEmail(email);
    const { admin_ticket } = step2VerifyCode(email, code);
    ok(res, { admin_ticket }, '邮箱验证通过，请输入管理员密码');
  } catch (err) {
    next(err);
  }
});

const step3Schema = z.object({
  admin_ticket: z.string().min(1),
  password: z.string().min(1).max(64),
});

/** POST /admin/auth/step3 — 验 ticket + 密码 → scope=admin 正式 JWT */
adminAuthRouter.post('/step3', sensitiveLimiter, (req, res, next) => {
  try {
    const { admin_ticket, password } = step3Schema.parse(req.body);
    const { user, token } = step3VerifyPassword(admin_ticket, password);
    ok(res, { token, user: publicUser(user) }, '登录成功');
  } catch (err) {
    next(err);
  }
});
