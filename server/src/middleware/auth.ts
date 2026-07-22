/**
 * JWT 鉴权中间件：除 /auth/* 与 /health 等公开路径外全部要求 Bearer Token（R18）。
 * 校验通过后注入 req.userId + req.userRole + req.userScope，业务层禁止信任前端传来的 userId。
 *
 * v2.2 scope 约定（架构 §4.6）：
 *   - 'user'（默认）：C 端用户态，role=admin 的用户端登录也只有 user scope
 *   - 'admin_step2'：/admin 双因子第 2 步签发的 5 分钟一次性票据，仅可换正式 token
 *   - 'admin'：/admin 后台正式票据，/api/v1/admin/* 中间件只认它
 * 老 token 无 scope 字段兜底 'user'（平滑兼容，已有登录态不掉线）。
 */
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type TokenScope = 'user' | 'admin_step2' | 'admin';

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
  userScope?: TokenScope;
}

/** 签发正式登录 token（默认 user scope，30 天） */
export function signToken(userId: number, role: string = 'user', scope: TokenScope = 'user'): string {
  return jwt.sign({ uid: userId, role, scope }, config.jwtSecret, { expiresIn: '30d' });
}

/** 签发 /admin 双因子第 2 步一次性票据（5 分钟，仅用于 step3 换正式 token） */
export function signAdminTicket(userId: number): string {
  return jwt.sign({ uid: userId, role: 'admin', scope: 'admin_step2' }, config.jwtSecret, {
    expiresIn: '5m',
  });
}

/** 校验 admin_ticket（step3 用）：返回 userId，非法/过期抛异常由路由统一转 401 */
export function verifyAdminTicket(ticket: string): number {
  const payload = jwt.verify(ticket, config.jwtSecret) as {
    uid: number;
    scope?: TokenScope;
  };
  if (payload.scope !== 'admin_step2') throw new Error('invalid ticket scope');
  return payload.uid;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    res.status(401).json({ code: 2001, data: null, message: '请先登录' });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      uid: number;
      role?: string;
      scope?: TokenScope;
    };
    req.userId = payload.uid;
    req.userRole = payload.role ?? 'user';
    req.userScope = payload.scope ?? 'user';
    next();
  } catch {
    res.status(401).json({ code: 2001, data: null, message: '登录已过期，请重新登录' });
  }
}
