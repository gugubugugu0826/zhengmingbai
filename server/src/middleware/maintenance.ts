/**
 * 维护模式中间件（v3，任务书 §5-H / 架构 §3.2-3.3）。
 *
 * - 每次请求热读 configs 表 `ops.maintenance`（{enabled, notice}），改配置即时生效。
 * - 开启时全站拦截：HTTP 503 + { code: 3001, message, data: { notice } }，
 *   Web api.ts / 小程序 request.js 拦截 3001 渲染全屏维护页。
 * - 豁免路径（管理员自救 + 探活 + 客户端读公告）：
 *   /health、/api/v1/admin/*、/api/v1/configs*。
 * - 挂载位置：globalLimiter 之后、JWT 中间件之前（全站生效，含无鉴权路由）。
 */
import type { NextFunction, Request, Response } from 'express';
import { ERR_MAINTENANCE } from '../common/messages.js';
import { getMaintenance } from '../modules/configs/service.js';

/** 豁免判定：探活 / 后台管理 / 配置读写（管理员开关页自救） */
function isExempt(path: string): boolean {
  if (path === '/health') return true;
  if (path === '/api/v1/admin' || path.startsWith('/api/v1/admin/')) return true;
  if (path === '/api/v1/configs' || path.startsWith('/api/v1/configs/')) return true;
  return false;
}

export function maintenanceMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (isExempt(req.path)) {
    next();
    return;
  }
  const maintenance = getMaintenance();
  if (!maintenance.enabled) {
    next();
    return;
  }
  res.status(503).json({
    code: ERR_MAINTENANCE,
    data: { notice: maintenance.notice },
    message: maintenance.notice,
  });
}

/** 导出供单测直接调用（不依赖 Express 挂载） */
export const __test = { isExempt };
