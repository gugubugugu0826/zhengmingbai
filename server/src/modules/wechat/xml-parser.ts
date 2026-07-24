/**
 * v3.1 T05：微信回调 XML 迷你解析器（零新增依赖，约 30 行）。
 *
 * 微信消息 XML 结构扁平，只有一层 <xml> 根节点 + <TagName>value</TagName> 或
 * <TagName><![CDATA[value]]></TagName>，无嵌套无属性，正则提取足够可靠。
 * 例：
 *   <xml><ToUserName><![CDATA[gh_xxx]]></ToUserName><MsgType><![CDATA[text]]></MsgType>...</xml>
 */
import type { WechatMessage } from './types.js';

/** 解析微信回调 XML 为扁平对象；非法 XML 返回空对象 */
export function parseWechatXml(xml: string): WechatMessage {
  const message: WechatMessage = {};
  // 先剥根节点 <xml>…</xml> 只处理其子级（微信字段全是一层叶子，无嵌套无属性）
  const rootMatch = /<xml>([\s\S]*)<\/xml>/i.exec(xml);
  const inner = rootMatch ? rootMatch[1] : xml;
  // 逐个匹配叶子节点：值为 CDATA 包裹（内容可含任意字符）或不含 '<' 的普通文本
  const tagPattern = /<(\w+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([^<]*))<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = tagPattern.exec(inner)) !== null) {
    const [, tag, cdata, plain] = match;
    message[tag] = cdata ?? plain ?? '';
  }
  return message;
}
