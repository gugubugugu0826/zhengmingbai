/**
 * 全局错误处理：BizError 按业务码返回，其余一律 500（不泄露内部细节）。
 */
import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { BizError } from '../common/errors.js';
import { logger } from '../common/logger.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof BizError) {
    res.status(err.httpStatus).json({ code: err.code, data: null, message: err.message });
    return;
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    res.status(400).json({
      code: 1001,
      data: null,
      message: `参数错误：${first ? `${first.path.join('.')} ${first.message}` : '请检查入参'}`,
    });
    return;
  }
  if (err instanceof SyntaxError && 'body' in (err as object)) {
    res.status(400).json({ code: 1001, data: null, message: '请求体不是合法 JSON' });
    return;
  }
  // R51：body 超限映射为 413 + 友好文案（PRD 4.4），不许裸 500
  const errType = (err as { type?: string }).type;
  if (errType === 'entity.too.large') {
    res.status(413).json({
      code: 1013,
      data: null,
      message: '照片太大了，已帮你压缩，请重试一下～还不行的话，少选几张试试。',
    });
    return;
  }
  logger.error({ err }, 'unhandled error');
  res.status(500).json({ code: 1000, data: null, message: '服务器开小差了，请稍后再试' });
}
