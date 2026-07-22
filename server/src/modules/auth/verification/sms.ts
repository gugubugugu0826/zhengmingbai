/**
 * 短信验证码通道（预留空壳）：企业认证后接入腾讯云短信（约 ¥0.05/条）。
 * 与 MockPaymentChannel → WechatPayChannel 同思路：接口先行，实现后填。
 */
import { BizError } from '../../../common/errors.js';
import type { VerificationChannel } from './channel.interface.js';

export class SmsVerificationChannel implements VerificationChannel {
  readonly name = 'sms' as const;

  async sendCode(_target: string, _code: string): Promise<void> {
    // TODO(三期): 企业认证后接入腾讯云短信 SDK 真实下发
    throw BizError.param('短信服务暂未开通，请换其他登录方式');
  }
}
