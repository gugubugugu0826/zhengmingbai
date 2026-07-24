/**
 * v3.1 T05：微信公众号消息回调服务层。
 *
 * - 签名校验：Token + timestamp + nonce 字典序排序拼接后 sha1，与 signature 比对。
 *   Token 唯一来源为环境变量 WECHAT_MSG_TOKEN（config.wechatMsgToken），
 *   代码内不留明文默认值（安全红线，凭据轮转后的纪律）。
 * - 兼容明文模式先行：遇 <Encrypt>（安全模式加密体）记日志返 success，
 *   不实现 AES 解密（EncodingAESKey 走 WECHAT_MSG_AES_KEY，留待二期）。
 */
import crypto from 'node:crypto';
import { config } from '../../config.js';
import { logger } from '../../common/logger.js';
import { parseWechatXml } from './xml-parser.js';
import type { WechatMessage, WechatVerifyQuery, WechatCallbackQuery } from './types.js';

/** 计算微信签名：sort([token, timestamp, nonce]).join('') 的 sha1 hex */
function calcSignature(token: string, timestamp: string, nonce: string): string {
  const joined = [token, timestamp, nonce].sort().join('');
  return crypto.createHash('sha1').update(joined).digest('hex');
}

/** GET 签名校验（接入验证）：通过返回 true，Token 未配置或签名不符返回 false */
export function verifySignature(query: WechatVerifyQuery): boolean {
  const token = config.wechatMsgToken;
  if (!token) {
    logger.warn('WECHAT_MSG_TOKEN 未配置，微信回调签名校验不可用');
    return false;
  }
  const { signature, timestamp, nonce } = query;
  if (!signature || !timestamp || !nonce) return false;
  return calcSignature(token, timestamp, nonce) === signature;
}

/** POST 消息回调签名校验（明文模式沿用 GET 同款签名算法） */
export function verifyCallbackSignature(query: WechatCallbackQuery): boolean {
  const token = config.wechatMsgToken;
  if (!token) return false;
  const { signature, timestamp, nonce } = query;
  if (!signature || !timestamp || !nonce) return false;
  return calcSignature(token, timestamp, nonce) === signature;
}

/**
 * 处理一条回调消息：解析 → 分支日志 → 返回微信要求的应答文本。
 * 统一返 'success'（微信收不到 success 会重试推送）。
 */
export function handleCallbackMessage(rawXml: string): string {
  const message: WechatMessage = parseWechatXml(rawXml);

  if (message.Encrypt) {
    // 安全模式加密体：不实现 AES 解密，记日志放行
    logger.info('微信回调为安全模式加密消息（<Encrypt>），暂不解密，直接应答 success');
    return 'success';
  }

  logger.info(
    {
      msgType: message.MsgType,
      event: message.Event,
      from: message.FromUserName,
      msgId: message.MsgId,
    },
    '微信回调消息（明文模式）',
  );
  return 'success';
}
