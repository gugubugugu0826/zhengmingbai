/**
 * Mock 验证码通道：一期演示行为平移（不真正下发，任意 4/6 位数字即过由 store 层放行）。
 * 备案/SES 未开通前的过渡通道。
 */
import { logger } from '../../../common/logger.js';
import type { VerificationChannel } from './channel.interface.js';

export class MockVerificationChannel implements VerificationChannel {
  readonly name = 'mock' as const;

  async sendCode(target: string, code: string, scene?: string): Promise<void> {
    // 演示环境不真正下发，打日志便于联调时取码（scene 仅记录，不影响行为）
    logger.info({ target, code, scene }, '[mock] 验证码已"发送"（演示环境，日志取码）');
  }
}
