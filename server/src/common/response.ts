/**
 * 统一响应格式：{ code: 0, data, message: "ok" }（架构文档 3.4）。
 */
import type { Response } from 'express';

export function ok<T>(res: Response, data: T, message = 'ok'): void {
  res.json({ code: 0, data, message });
}
