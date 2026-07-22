/**
 * 邮箱验证码通道（纠偏版）：腾讯云 SES SendEmail API（HTTPS），区域广州。
 * 个人实名账号不支持 SMTP，必须走 API；密钥复用 COS_SECRET_ID/KEY 同一 CAM 子账号。
 */
import { ses } from 'tencentcloud-sdk-nodejs-ses';
import { config } from '../../../config.js';
import { BizError } from '../../../common/errors.js';
import { logger } from '../../../common/logger.js';
import type { VerificationChannel } from './channel.interface.js';

const SesClient = ses.v20201002.Client;

export class EmailVerificationChannel implements VerificationChannel {
  readonly name = 'email' as const;

  private client = new SesClient({
    credential: { secretId: config.ses.secretId, secretKey: config.ses.secretKey },
    region: config.ses.region,
    profile: { httpProfile: { endpoint: 'ses.tencentcloudapi.com' } },
  });

  async sendCode(target: string, code: string): Promise<void> {
    if (!config.ses.secretId || !config.ses.secretKey) {
      throw BizError.param('邮件服务暂未开通，请先用手机号登录');
    }
    try {
      await this.client.SendEmail({
        FromEmailAddress: `${config.ses.fromAlias} <${config.ses.from}>`,
        Destination: [target],
        Subject: '你的整明白登录验证码',
        Template: {
          TemplateID: config.ses.templateId,
          TemplateData: JSON.stringify({ code }), // 模板变量 {{code}}
        },
        TriggerType: 1, // 触发类（验证码即时通道）
      });
    } catch (err) {
      const code_ = (err as { code?: string }).code ?? '';
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg, code: code_, target }, 'SES 发信失败');
      // 运营友好兜底：区分"配置/审核问题"与"临时故障"，绝不泄露内部错误详情给用户
      if (/InvalidTemplateID|NotAuthenticatedSender|WithOutPermission|OperationDenied/.test(code_)) {
        throw BizError.param('邮件服务配置中，请先用手机号登录');
      }
      throw BizError.param('验证码邮件发送失败，请稍后再试或用手机号登录');
    }
  }
}
