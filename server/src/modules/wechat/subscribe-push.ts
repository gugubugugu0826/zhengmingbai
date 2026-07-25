/**
 * v3.1 T05：微信订阅消息推送（公众号/小程序 subscribeMessage.send）。
 *
 * 设计决策（按任务书"模板 ID 未配时静默跳过"）：
 * - 模板 ID 走 configs 表 `subscribe.template_id`（与既有公开配置同一个 key，老板后台热配）；
 * - 用户 openid 取 users.wechat_openid；Mock 登录产生的 `mock_` 前缀 openid 直接跳过；
 * - WECHAT_APPID / WECHAT_SECRET 未配置（一期 Mock 环境）时整体禁用，**静默跳过只发站内消息**；
 * - access_token 简单缓存（7000s 有效期，提前 5 分钟过期），进程内单例即可。
 */
import { config } from '../../config.js';
import { logger } from '../../common/logger.js';
import { getConfig } from '../configs/service.js';

interface CachedToken {
  token: string;
  expiresAt: number;
}

let tokenCache: CachedToken | null = null;

/** 是否具备真实推送条件（AppID/Secret 已配 = 非 Mock 环境） */
function pushEnabled(): boolean {
  return Boolean(config.wechatAppId && config.wechatSecret);
}

/** 取微信 access_token（进程内缓存，失败抛错由调用方兜底） */
async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now) return tokenCache.token;

  const url =
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential` +
    `&appid=${encodeURIComponent(config.wechatAppId)}` +
    `&secret=${encodeURIComponent(config.wechatSecret)}`;
  const resp = await fetch(url);
  const body = (await resp.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };
  if (!body.access_token) {
    throw new Error(`微信 access_token 获取失败: ${body.errcode ?? ''} ${body.errmsg ?? 'unknown'}`);
  }
  // 提前 5 分钟过期，防边界时刻 token 失效
  tokenCache = {
    token: body.access_token,
    expiresAt: now + ((body.expires_in ?? 7200) - 300) * 1000,
  };
  return tokenCache.token;
}

export interface SubscribePushPayload {
  /** 用户微信 openid（users.wechat_openid） */
  openid: string;
  /** 空间名（模板变量） */
  spaceName: string;
  /** 点击跳转小程序页面路径 */
  page: string;
}

/**
 * 发送"30 天复查提醒"订阅消息。
 * 返回 true=已推送；false=静默跳过（模板未配 / Mock 环境 / Mock openid）。
 * 推送失败只记日志不抛错（站内消息已发，订阅推送是增量触达，失败不影响主流程）。
 */
export async function sendReminderSubscribeMessage(payload: SubscribePushPayload): Promise<boolean> {
  // 模板 ID 未配置：静默跳过（老板后台后配，configs.subscribe.template_id）
  const templateId = getConfig<string>('subscribe.template_id', '') || '';
  if (!templateId) return false;
  // Mock 环境（AppID/Secret 未配）：静默跳过
  if (!pushEnabled()) return false;
  // Mock 登录的 openid（mock_ 前缀）推不出去，跳过
  if (!payload.openid || payload.openid.startsWith('mock_')) return false;

  try {
    const accessToken = await getAccessToken();
    const resp = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: payload.openid,
          template_id: templateId,
          page: payload.page,
          data: {
            thing1: { value: payload.spaceName.slice(0, 20) },
            time2: { value: new Date().toISOString().slice(0, 19).replace('T', ' ') },
          },
        }),
      },
    );
    const body = (await resp.json()) as { errcode?: number; errmsg?: string };
    if (body.errcode && body.errcode !== 0) {
      // 43101=用户未订阅授权等，属正常业务分支，warn 即可
      logger.warn({ errcode: body.errcode, errmsg: body.errmsg, openid: payload.openid }, '订阅消息推送失败');
      return false;
    }
    logger.info({ openid: payload.openid, templateId }, '订阅消息推送成功');
    return true;
  } catch (err) {
    logger.warn({ err, openid: payload.openid }, '订阅消息推送异常（静默忽略）');
    return false;
  }
}
