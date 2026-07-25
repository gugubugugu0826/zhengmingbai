/**
 * v3.1 T05：微信公众号消息回调类型定义。
 * 消息体为 XML，经 xml-parser 解析为扁平 { 字段名: 值 } 结构。
 */

/** 解析后的微信回调消息（明文模式；字段名与微信 XML CDATA 节点一一对应） */
export interface WechatMessage {
  ToUserName?: string;
  FromUserName?: string;
  CreateTime?: string;
  MsgType?: string;
  Content?: string;
  Event?: string;
  EventKey?: string;
  MsgId?: string;
  /** 安全模式下整个加密体（出现即说明当前不是明文模式） */
  Encrypt?: string;
  [key: string]: string | undefined;
}

/** GET 签名校验 query 参数 */
export interface WechatVerifyQuery {
  signature?: string;
  timestamp?: string;
  nonce?: string;
  echostr?: string;
}

/** POST 消息回调 query 参数（明文模式同样带签名字段） */
export interface WechatCallbackQuery {
  signature?: string;
  msg_signature?: string;
  timestamp?: string;
  nonce?: string;
  openid?: string;
  encrypt_type?: string;
}
