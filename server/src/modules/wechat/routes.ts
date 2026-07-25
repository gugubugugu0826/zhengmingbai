/**
 * v3.1 T05：微信公众号消息回调路由。
 *
 * 挂载：app.use('/api/v1/wechat', wechatRouter)，在 authMiddleware 之前（无鉴权，
 * 微信平台直连服务器）。maintenanceMiddleware 已豁免 /api/v1/wechat（维护模式下
 * 微信回调不能 503，否则平台连续失败会停用回调配置）。
 *
 * 应答格式（架构文档共享知识）：微信回调**不走**统一 JSON envelope——
 *   GET 验签通过须返**裸 echostr 文本**；POST 统一返裸 'success' 文本。
 */
import { Router, type Request, type Response } from 'express';
import { logger } from '../../common/logger.js';
import {
  verifySignature,
  verifyCallbackSignature,
  handleCallbackMessage,
} from './service.js';
import type { WechatVerifyQuery, WechatCallbackQuery } from './types.js';

export const wechatRouter = Router();

/** GET 接入验证：签名校验通过则原样返回裸 echostr（微信平台只认裸文本） */
function handleGetVerify(req: Request, res: Response): void {
  const query = req.query as WechatVerifyQuery;
  if (verifySignature(query)) {
    res.type('text/plain').send(query.echostr ?? '');
    return;
  }
  logger.warn({ query }, '微信回调签名校验失败（GET）');
  res.status(403).type('text/plain').send('forbidden');
}

/** POST 消息回调：验签 → 解析 → 统一应答 success */
function handlePostMessage(req: Request, res: Response): void {
  const query = req.query as WechatCallbackQuery;
  if (!verifyCallbackSignature(query)) {
    logger.warn({ query }, '微信回调签名校验失败（POST）');
    res.status(403).type('text/plain').send('forbidden');
    return;
  }
  // express.text 已在 index.ts 挂载（仅 /api/v1/wechat 前缀，text/xml 命中），req.body 为原始 XML 字符串
  const rawXml = typeof req.body === 'string' ? req.body : '';
  const reply = handleCallbackMessage(rawXml);
  res.type('text/plain').send(reply);
}

// 规范/微信后台配置使用 /message（见任务书 §六）；同时保留根路径 / 以兼容早期配置，避免 404。
wechatRouter.get('/', handleGetVerify);
wechatRouter.get('/message', handleGetVerify);
wechatRouter.post('/', handlePostMessage);
wechatRouter.post('/message', handlePostMessage);
