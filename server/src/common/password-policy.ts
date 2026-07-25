/**
 * 密码强度统一规则（架构文档 v2.2 §4.6）：注册 / 改密 / 迁移改密三处共用。
 * 规则：≥8 位，必须同时含字母和数字。前端同规则预校验仅作体验优化，以后端为准。
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;

/** 校验通过返回 true */
export function isPasswordStrong(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/** 校验失败返回用户可读原因；通过返回 null */
export function passwordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return '密码至少 8 位';
  if (password.length > PASSWORD_MAX_LENGTH) return '密码最长 64 位';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return '密码需同时包含字母和数字';
  }
  return null;
}
