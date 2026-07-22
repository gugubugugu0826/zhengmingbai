/**
 * 邮箱验证码落库服务（架构文档 v2.2 §2.1.2 / §2.3.2，A-2/A-8）。
 * 替代阶段2 的内存 Map（重启丢失、不利于限频审计），支持硬性要求：
 *   - 60 秒限频（同邮箱同场景）
 *   - 5 分钟有效
 *   - 一次性（verifyCode 成功即 verified=1 作废）
 *   - 每日发送上限（同邮箱 20 封/自然日，2104）
 *
 * 发送通道复用可插拔 VerificationChannel（env VERIFICATION_CHANNEL=mock|email|sms，
 * T02 切 ses；当前 mock 通道下落库照常、发送打日志，便于联调取码）。
 *
 * 错误码（架构 §4.6）：
 *   2102 邮箱验证码错误或已过期；2103 发送太频繁(60秒限频)；2104 今日发送已达上限
 */
import crypto from 'node:crypto';
import { db, nowIso } from '../../../db.js';
import { BizError } from '../../../common/errors.js';
import { logger } from '../../../common/logger.js';
import { verificationChannel } from './index.js';

/** 错误码段（架构 §4.6 共享约定） */
export const EMAIL_CODE_INVALID = 2102;
export const EMAIL_SEND_TOO_FREQUENT = 2103;
export const EMAIL_DAILY_LIMIT = 2104;

/** 允许的业务场景（register/login/change_email/admin_login/admin_reset_password） */
export const EMAIL_SCENES = [
  'register',
  'login',
  'change_email',
  'admin_login',
  'admin_reset_password',
] as const;
export type EmailScene = (typeof EMAIL_SCENES)[number];

const CODE_TTL_MS = 5 * 60 * 1000; // 5 分钟有效
const RESEND_INTERVAL_MS = 60 * 1000; // 60 秒限频
const DAILY_SEND_LIMIT = 20; // 每邮箱每自然日发送上限

export function isEmailScene(scene: string): scene is EmailScene {
  return (EMAIL_SCENES as readonly string[]).includes(scene);
}

interface LastSentRow {
  created_at: string;
}

interface CountRow {
  cnt: number | bigint;
}

interface CodeRow {
  id: number;
  code: string;
  expires_at: string;
}

/**
 * 生成 6 位数字码并落库，经当前通道发送。
 * 防枚举约定：调用方（路由层）对"不允许发送"的场景自行决定是否静默成功；
 * 本服务只管限频/上限/落库/发送。
 */
export async function sendEmailCode(email: string, scene: EmailScene): Promise<void> {
  const now = Date.now();

  // 60 秒限频：同邮箱同场景最近一次发送距今 < 60s 直接拒绝
  const last = db
    .prepare(
      `SELECT created_at FROM email_verifications
       WHERE email = ? AND scene = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(email, scene) as LastSentRow | undefined;
  if (last && now - new Date(last.created_at).getTime() < RESEND_INTERVAL_MS) {
    throw new BizError(EMAIL_SEND_TOO_FREQUENT, '验证码发送太频繁啦，请 60 秒后再试', 400);
  }

  // 每日上限：同邮箱当天发送总量（自然日，UTC 口径与 created_at 默认值一致）
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const cntRow = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM email_verifications
       WHERE email = ? AND created_at >= ?`,
    )
    .get(email, todayStart.toISOString()) as unknown as CountRow;
  if (Number(cntRow.cnt) >= DAILY_SEND_LIMIT) {
    throw new BizError(EMAIL_DAILY_LIMIT, '该邮箱今日发送已达上限，请明天再试', 400);
  }

  const code = crypto.randomInt(100000, 1000000).toString(); // 6 位数字
  const expiresAt = new Date(now + CODE_TTL_MS).toISOString();
  db.prepare(
    `INSERT INTO email_verifications (email, code, scene, verified, expires_at)
     VALUES (?, ?, ?, 0, ?)`,
  ).run(email, code, scene, expiresAt);

  try {
    await verificationChannel.sendCode(email, code);
  } catch (err) {
    // 发送失败：作废刚落库的码，避免用户拿着"未送达的码"反复尝试占用一次性额度
    db.prepare(
      `UPDATE email_verifications SET verified = 1
       WHERE email = ? AND scene = ? AND code = ? AND verified = 0`,
    ).run(email, scene, code);
    throw err;
  }
  logger.info(
    { email, scene, channel: verificationChannel.name },
    '邮箱验证码已生成并下发',
  );
}

/**
 * 校验邮箱验证码：最新一条未使用记录 + 未过期 + 码相等。
 * 通过即 verified=1 一次性作废；不通过抛 2102。
 */
export function verifyEmailCode(email: string, code: string, scene: EmailScene): void {
  const row = db
    .prepare(
      `SELECT id, code, expires_at FROM email_verifications
       WHERE email = ? AND scene = ? AND verified = 0
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(email, scene) as CodeRow | undefined;

  const invalid = (): never => {
    throw new BizError(EMAIL_CODE_INVALID, '邮箱验证码错误或已过期', 400);
  };

  if (!row) invalid();
  if (row!.expires_at <= nowIso()) invalid();
  if (row!.code !== code) invalid();

  // 一次性作废（仅在全部校验通过后）
  db.prepare(`UPDATE email_verifications SET verified = 1 WHERE id = ?`).run(row!.id);
}
