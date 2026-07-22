/**
 * 图形验证码服务（架构文档 v2.2 §2.1.3 / §3.4，A-6/A-7）。
 *
 * - 生成：svg-captcha 6 位字母数字（排除 0o1il 混淆字符）+ 2 条干扰线 + 彩色，
 *   答案仅落库（captchas 表），前端只拿到 SVG dataURL。
 * - 校验：一次性（无论对错校验后即 used=1 作废）、5 分钟有效、不区分大小写。
 * - AI 测试后门（A-7）：仅在进程环境变量 CAPTCHA_BYPASS 存在且输入相等时直接通过；
 *   不配该变量 → process.env.CAPTCHA_BYPASS 为 undefined → 条件永假 → 口子不存在
 *   （不是"关了"，是"没有"）。生产 .env 严禁配置。
 */
import crypto from 'node:crypto';
import svgCaptcha from 'svg-captcha';
import { db, nowIso } from '../../../db.js';
import { BizError } from '../../../common/errors.js';

/** 错误码 2101：图形验证码错误或已过期（架构 §4.6 错误码段） */
export const CAPTCHA_ERROR_CODE = 2101;

const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 分钟有效

export interface CaptchaResult {
  /** 下发给前端的验证码 ID（uuid） */
  id: string;
  /** base64 data URL，前端 <img src> 直接渲染 */
  svgDataURL: string;
}

interface CaptchaRow {
  id: string;
  text: string;
  used: number;
  expires_at: string;
}

/** 生成图形验证码：答案落库，返回 { id, svgDataURL } */
export function createCaptcha(): CaptchaResult {
  const captcha = svgCaptcha.create({
    size: 6,
    ignoreChars: '0o1il', // 排除易混淆字符
    noise: 2, // 干扰线
    color: true,
  });
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + CAPTCHA_TTL_MS).toISOString();
  db.prepare(`INSERT INTO captchas (id, text, used, expires_at) VALUES (?, ?, 0, ?)`).run(
    id,
    captcha.text,
    expiresAt,
  );
  const svgDataURL = `data:image/svg+xml;base64,${Buffer.from(captcha.data).toString('base64')}`;
  return { id, svgDataURL };
}

/**
 * 校验图形验证码（一次性：无论对错，查到记录即作废）。
 * @returns true 通过；false 不通过（由调用方决定抛 2101 或走统一失败路径）
 */
export function verifyCaptcha(id: string, input: string): boolean {
  // A-7 后门：仅在显式配置环境变量时存在；不配则该分支永假
  const bypass = process.env.CAPTCHA_BYPASS;
  if (bypass && input === bypass) return true;

  if (!id || !input) return false;
  const row = db.prepare(`SELECT * FROM captchas WHERE id = ?`).get(id) as
    | CaptchaRow
    | undefined;
  if (!row) return false;

  // 一次性：查到即作废（无论对错），防暴力重试同一码
  db.prepare(`UPDATE captchas SET used = 1 WHERE id = ?`).run(id);

  if (row.used !== 0) return false; // 已被消费过
  if (row.expires_at <= nowIso()) return false; // 已过期（ISO UTC 字符串可字典序比较）
  return row.text.toLowerCase() === input.toLowerCase();
}

/** 校验并抛出统一业务错误（2101），供路由层直接使用 */
export function assertCaptcha(id: string, input: string): void {
  if (!verifyCaptcha(id, input)) {
    throw new BizError(CAPTCHA_ERROR_CODE, '图形验证码错误或已过期', 400);
  }
}

/** 清理过期验证码（启动时 + 每 10 分钟由 worker 调用） */
export function cleanExpiredCaptchas(): number {
  const result = db.prepare(`DELETE FROM captchas WHERE expires_at <= ?`).run(nowIso());
  return Number(result.changes);
}
