/**
 * 管理员闸机（R33 + v2.2 A-11）：authMiddleware 已验 JWT 并注入 req.userScope/userRole。
 * v2.2 起只认 scope==='admin'（/admin 三段式双因子签发的正式票据）：
 * role=admin 的用户端登录也只有 user scope，天然无后台入口（验收点）。
 * 老 token（无 scope 字段）按 'user' 兜底，需重新走 /admin/auth 三段式登录。
 */
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../middleware/auth.js';

export function adminAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  if (req.userScope !== 'admin') {
    res.status(403).json({ code: 2003, data: null, message: '没有权限访问' });
    return;
  }
  next();
}
