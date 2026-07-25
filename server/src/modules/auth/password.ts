/**
 * 管理员密码底座（阶段 2 增量 A）：node:crypto scrypt，零新增依赖。
 * 存储格式 `salt:hash`（hex），每密码随机 16 字节盐；校验用 timingSafeEqual 恒时比较。
 * 绝不明文落库、绝不明文入日志。
 */
import crypto from 'node:crypto';

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(plain, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(hashHex, 'hex');
  return crypto.timingSafeEqual(hash, expected); // 恒时比较，防计时侧信道
}

/** 生成人类可输的 10 位随机初始密码（去掉 0/O、1/l/I 混淆字符，保证同时含字母和数字） */
export function generateInitialPassword(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  for (;;) {
    let pwd = '';
    const bytes = crypto.randomBytes(10);
    for (let i = 0; i < 10; i++) pwd += alphabet[bytes[i] % alphabet.length];
    if (/[A-Za-z]/.test(pwd) && /[0-9]/.test(pwd)) return pwd;
  }
}
