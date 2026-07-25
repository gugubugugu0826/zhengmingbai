/**
 * 图形验证码路由（架构文档 v2.2 §2.3.1）。
 * GET /api/v1/captcha — 无鉴权；每 IP 30 次/分钟；Cache-Control: no-store。
 * 校验不作为独立接口：业务接口入参携带 {captcha_id, captcha_input}，
 * 服务端在业务前置统一调 service.verifyCaptcha() 一次性作废。
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { ok } from '../../../common/response.js';
import { createCaptcha } from './service.js';

export const captchaRouter = Router();

/** 每 IP 30 次/分钟（测试环境 RATE_LIMIT_DISABLED=1 时豁免，与全局限流同约定） */
const captchaLimiter =
  process.env.RATE_LIMIT_DISABLED === '1'
    ? (_req: unknown, _res: unknown, next: () => void): void => next()
    : rateLimit({
        windowMs: 60 * 1000,
        limit: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { code: 1005, data: null, message: '操作太频繁了，稍后再试试' },
      });

captchaRouter.get('/', captchaLimiter as never, (_req, res) => {
  const { id, svgDataURL } = createCaptcha();
  res.setHeader('Cache-Control', 'no-store');
  ok(res, { captcha_id: id, svg: svgDataURL });
});
