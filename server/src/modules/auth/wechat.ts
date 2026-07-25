/**
 * 微信登录（Mock 实现）。
 * 一期演示：任意 code 换出 mock openid（确定性映射，便于演示同一账号）。
 * TODO(二期): 调微信 code2session 接口换取真实 openid：
 *   GET https://api.weixin.qq.com/sns/jscode2session?appid=&secret=&js_code=&grant_type=authorization_code
 */
import crypto from 'node:crypto';
import { BizError } from '../../common/errors.js';
import { config } from '../../config.js';

export function codeToOpenId(code: string): string {
  if (!code || typeof code !== 'string') {
    throw BizError.param('微信登录 code 不能为空');
  }
  if (!config.wechatAppId || !config.wechatSecret) {
    // Mock 模式：确定性 openid，同一 code 永远映射同一账号
    return `mock_${crypto.createHash('md5').update(code).digest('hex').slice(0, 16)}`;
  }
  // TODO(二期): 真实 code2session 请求
  throw BizError.param('微信登录未配置，请使用 Mock 模式');
}
