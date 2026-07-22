/**
 * 出参脱敏统一入口（架构文档 v2.2 §4.6，BUG-3）。
 * 任何用户列表 / profile / 流水关联展示的出参必过 mask，code review 卡点。
 */

/** 手机号脱敏：139****1111（前 3 后 4，中间 4 个星）；非法/过短输入原样打码兜底 */
export function maskPhone(phone: string | null | undefined): string | null {
  if (phone === null || phone === undefined) return null;
  const trimmed = phone.trim();
  if (trimmed.length < 7) return '*'.repeat(Math.max(trimmed.length, 4));
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

/** 邮箱脱敏：g***@zhengmingbai.cn（本地段仅留首字符，域名完整保留） */
export function maskEmail(email: string | null | undefined): string | null {
  if (email === null || email === undefined) return null;
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '*'.repeat(Math.max(trimmed.length, 4));
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}
