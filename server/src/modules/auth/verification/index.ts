/**
 * 验证码通道工厂 + 验证码生成/存储/校验（R47）。
 * - 通道按 .env VERIFICATION_CHANNEL=mock|email|sms 实例化（进程级切换）。
 * - 验证码：6 位随机码存内存 Map（10 分钟过期，每目标 60 秒限发一次），单机 2G 够用。
 * - mock 通道：任意 4 位或 6 位数字即过（一期演示行为平移，发送时也会落一个真码便于联调）。
 */
import crypto from 'node:crypto';
import { config } from '../../../config.js';
import { BizError } from '../../../common/errors.js';
import type { VerificationChannel } from './channel.interface.js';
import { MockVerificationChannel } from './mock.js';
import { EmailVerificationChannel } from './email.js';
import { SmsVerificationChannel } from './sms.js';

/** 当前生效的验证码通道 */
export const verificationChannel: VerificationChannel =
  config.verificationChannel === 'email'
    ? new EmailVerificationChannel()
    : config.verificationChannel === 'sms'
      ? new SmsVerificationChannel()
      : new MockVerificationChannel();

interface CodeEntry {
  code: string;
  expiresAt: number;
  lastSentAt: number;
}

const CODE_TTL_MS = 10 * 60 * 1000; // 10 分钟有效
const RESEND_INTERVAL_MS = 60 * 1000; // 每目标 60 秒限发一次

const store = new Map<string, CodeEntry>();

/** 生成并发送验证码（限发：60 秒内重复请求直接拒绝） */
export async function sendVerificationCode(target: string): Promise<{ mock: boolean; hint: string }> {
  const now = Date.now();
  const existing = store.get(target);
  if (existing && now - existing.lastSentAt < RESEND_INTERVAL_MS) {
    throw BizError.param('验证码发送太频繁啦，请 60 秒后再试');
  }
  const code = crypto.randomInt(100000, 1000000).toString(); // 6 位
  store.set(target, { code, expiresAt: now + CODE_TTL_MS, lastSentAt: now });
  await verificationChannel.sendCode(target, code);
  const isMock = verificationChannel.name === 'mock';
  return {
    mock: isMock,
    hint: isMock ? '演示环境：任意 4 位数字即可登录' : '验证码已发送，10 分钟内有效',
  };
}

/** 校验验证码（mock 通道任意 4/6 位数字即过；真实通道比对存储码 + 有效期） */
export function verifyCode(target: string, code: string): void {
  if (verificationChannel.name === 'mock') {
    if (!/^\d{4,6}$/.test(code)) throw BizError.param('验证码是数字哦');
    return;
  }
  const entry = store.get(target);
  if (!entry || Date.now() > entry.expiresAt) {
    throw BizError.param('验证码已过期，请重新获取');
  }
  if (entry.code !== code) {
    throw BizError.param('验证码不正确，请检查后重试');
  }
  store.delete(target); // 一次性使用
}
