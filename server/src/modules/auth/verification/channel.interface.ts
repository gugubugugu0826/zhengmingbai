/**
 * 验证码通道抽象（R47，与支付渠道/存储通道同款"可插拔通道"范式）。
 * 业务代码（auth/routes.ts）只面向接口，切换靠 .env VERIFICATION_CHANNEL。
 */
export interface VerificationChannel {
  readonly name: 'email' | 'sms' | 'mock';
  /**
   * 发送验证码到目标（手机号或邮箱）。
   * v3：scene 可选（默认参数，向后兼容）——SES 通道按 scene 映射模板与变量名，
   * mock/sms 通道忽略该参数。
   */
  sendCode(target: string, code: string, scene?: string): Promise<void>;
}
