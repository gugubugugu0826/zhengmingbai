/**
 * 通用字段校验器（架构文档 v2.2 §4.6 共享约定）。
 * 密码强度与 password-policy.ts 同规则；本模块面向"注册/改绑表单"的服务端硬校验。
 * 返回 null 表示通过，返回 string 为用户可读的失败原因（由调用方包成 BizError）。
 */

const EMAIL_REGEX = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
/** 用户名：2-20 字符，仅中英文与数字（不允许空格/符号/下划线，避免展示与搜索歧义） */
const USERNAME_REGEX = /^[A-Za-z0-9一-龥]{2,20}$/;

/** 用户名：2-20 字符，中英文 + 数字 */
export function validateUsername(username: string): string | null {
  if (!USERNAME_REGEX.test(username)) {
    return '用户名需为 2-20 个字符，仅限中英文和数字';
  }
  return null;
}

/** 密码：≥8 位，必须同时含字母和数字（与 common/password-policy.ts 同规则，三处共用） */
export function validatePassword(password: string): string | null {
  if (password.length < 8) return '密码至少 8 位';
  if (password.length > 64) return '密码最长 64 位';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return '密码需同时包含字母和数字';
  }
  return null;
}

/** 邮箱：标准邮箱格式 */
export function validateEmail(email: string): string | null {
  if (!EMAIL_REGEX.test(email)) {
    return '请输入正确的邮箱地址';
  }
  return null;
}
