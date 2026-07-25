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
import { db } from '../db.js';

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
  // v3.1 T01：显式锁定 HS256 算法白名单，防算法混淆攻击（alg=none / RS256→HS256 降级）
  const payload = jwt.verify(ticket, config.jwtSecret, { algorithms: ['HS256'] }) as {
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
    // v3.1 T01：显式锁定 HS256 算法白名单，防算法混淆攻击
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }) as {
      uid: number;
      role?: string;
      scope?: TokenScope;
    };
    // v3.2 D2：封禁点查——验签通过后按主键查 users.status（<0.1ms，WAL 读不阻塞），
    // blocked 即 403+2004。已签发 token 不主动吊销，下次请求即被拦（准实时）；
    // user 与 admin scope 同查同拦（防封 admin 后还能操作后台）。
    const row = db.prepare(`SELECT status FROM users WHERE id = ?`).get(payload.uid) as
      | { status: string }
      | undefined;
    if (!row) {
      res.status(401).json({ code: 2001, data: null, message: '账号不存在，请重新登录' });
      return;
    }
    if (row.status === 'blocked') {
      res
        .status(403)
        .json({ code: 2004, data: null, message: '账号已被封禁，如有疑问请联系客服' });
      return;
    }
    req.userId = payload.uid;
    req.userRole = payload.role ?? 'user';
    req.userScope = payload.scope ?? 'user';
    next();
  } catch {
    res.status(401).json({ code: 2001, data: null, message: '登录已过期，请重新登录' });
  }
}
