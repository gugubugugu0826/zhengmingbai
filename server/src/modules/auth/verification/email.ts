/**
 * 邮箱验证码通道（纠偏版）：腾讯云 SES SendEmail API（HTTPS），区域广州。
 * 个人实名账号不支持 SMTP，必须走 API；密钥复用 COS_SECRET_ID/KEY 同一 CAM 子账号。
 *
 * v3：按 scene 映射模板与变量名（任务书 §6 + 架构设计待明确事项 1，"一模板一变量"）：
 *   - register/login → 54571 登录验证码（{{code}}）
 *   - reset_password → 54718 忘记密码验证码（{{code}}）
 *   - change_email → 54717 更改绑定邮箱验证码（{{code}}）
 *   - legacy_migration → 54719 账号迁移临时密码通知（{{password}}，code 参数承载临时密码）
 * 未列出的 scene（如 admin_login/admin_reset_password）回落默认模板 54571 + {{code}}。
 */
import { ses } from 'tencentcloud-sdk-nodejs-ses';
import { config } from '../../../config.js';
import { BizError } from '../../../common/errors.js';
import { logger } from '../../../common/logger.js';
import type { VerificationChannel } from './channel.interface.js';

const SesClient = ses.v20201002.Client;

/** 模板 ID 表（config.ses.templateIds 的类型别名，scene → 模板 ID） */
type TemplateIdMap = typeof config.ses.templateIds;

/** scene → 模板 ID；未配置 scene 回落默认「登录验证码」模板 */
function templateIdFor(scene: string | undefined): number {
  const map = config.ses.templateIds as TemplateIdMap;
  const id = scene ? (map as Record<string, number | undefined>)[scene] : undefined;
  return id ?? config.ses.templateId;
}

/** scene → 模板变量名：54719 迁移通知是 {{password}}，其余一律 {{code}} */
function templateVarFor(scene: string | undefined): 'code' | 'password' {
  return scene === 'legacy_migration' ? 'password' : 'code';
}

/** 邮件主题按 scene 区分（温暖口语化，不落任何敏感信息） */
function subjectFor(scene: string | undefined): string {
  switch (scene) {
    case 'reset_password':
      return '你的整明白重置密码验证码';
    case 'change_email':
      return '你的整明白换绑邮箱验证码';
    case 'legacy_migration':
      return '你的整明白账号迁移临时密码';
    default:
      return '你的整明白登录验证码';
  }
}

export class EmailVerificationChannel implements VerificationChannel {
  readonly name = 'email' as const;

  private client = new SesClient({
    credential: { secretId: config.ses.secretId, secretKey: config.ses.secretKey },
    region: config.ses.region,
    profile: { httpProfile: { endpoint: 'ses.tencentcloudapi.com' } },
  });

  async sendCode(target: string, code: string, scene?: string): Promise<void> {
    if (!config.ses.secretId || !config.ses.secretKey) {
      throw BizError.param('邮件服务暂未开通，请稍后再试');
    }
    const templateId = templateIdFor(scene);
    const varName = templateVarFor(scene);
    try {
      await this.client.SendEmail({
        FromEmailAddress: `${config.ses.fromAlias} <${config.ses.from}>`,
        Destination: [target],
        Subject: subjectFor(scene),
        Template: {
          TemplateID: templateId,
          TemplateData: JSON.stringify({ [varName]: code }), // 一模板一变量，按 scene 映射变量名
        },
        TriggerType: 1, // 触发类（验证码即时通道）
      });
    } catch (err) {
      const code_ = (err as { code?: string }).code ?? '';
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg, code: code_, target, scene, templateId }, 'SES 发信失败');
      // 运营友好兜底：区分"配置/审核问题"与"临时故障"，绝不泄露内部错误详情给用户
      if (/InvalidTemplateID|NotAuthenticatedSender|WithOutPermission|OperationDenied/.test(code_)) {
        throw BizError.param('邮件服务配置中，请稍后再试');
      }
      throw BizError.param('验证码邮件发送失败，请稍后再试');
    }
  }
}
