/**
 * 管理员闸机（R33 + v2.2 A-11）：authMiddleware 已验 JWT 并注入 req.userScope/userRole。
 * v2.2 起只认 scope==='admin'（/admin 三段式双因子签发的正式票据）：
 * role=admin 的用户端登录也只有 user scope，天然无后台入口（验收点）。
 * 老 token（无 scope 字段）按 'user' 兜底，需重新走 /admin/auth 三段式登录。
 */
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../middleware/auth.js';
import { getUserById } from '../auth/service.js';

export function adminAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userScope !== 'admin') {
    res.status(403).json({ code: 2003, data: null, message: '没有权限访问' });
    return;
  }
  next();
}

/**
 * 超管闸机：要求 is_super === 1。
 * 叠加在 adminAuth 之后使用（adminAuth 已校验 scope==='admin'）。
 * v3.2.1 REQ-05：敏感操作（改配置/知识库/套餐/发点）仅超管可执行。
 */
export function superAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  const me = getUserById(req.userId!);
  if (me.is_super !== 1) {
    res.status(403).json({ code: 2003, data: null, message: '仅超级管理员可操作' });
    return;
  }
  next();
}
