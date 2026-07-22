/**
 * 应用层限流（R15/R18）。
 * 一般接口每 IP 100 次/分；敏感接口（支付/扣点/上传/登录）更严。
 */
import rateLimit from 'express-rate-limit';
import type { NextFunction, Request, Response } from 'express';

const tooMany = { code: 1005, data: null, message: '操作太频繁了，稍后再试试' };

/** 测试豁免：RATE_LIMIT_DISABLED=1 时跳过限流（QA 自动化回归用，默认仍开启） */
const disabled = process.env.RATE_LIMIT_DISABLED === '1';
const passthrough = (_req: Request, _res: Response, next: NextFunction): void => next();

/** 全局限流：每 IP 100 次/分 */
export const globalLimiter = disabled
  ? passthrough
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 100,
      standardHeaders: true,
      legacyHeaders: false,
      message: tooMany,
    });

/** 敏感接口：每 IP 10 次/分（登录/支付回调/上传/分析扣点） */
export const sensitiveLimiter = disabled
  ? passthrough
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 10,
      standardHeaders: true,
      legacyHeaders: false,
      message: tooMany,
    });
