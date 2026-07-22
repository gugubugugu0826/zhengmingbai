/**
 * v2.2 共享文案/错误码常量（架构 §4.6）。
 * 防枚举唯一文案：登录失败一律 HTTP 401 + code 2001 + LOGIN_FAIL_MSG。
 * web/src/constants 需保持同字面（T03 落地）。
 */

/** 登录失败统一文案（账号不存在与凭据错误同一句，防枚举） */
export const LOGIN_FAIL_MSG = '账号或凭据不正确，请重试';

/** 邮箱验证码登录时邮箱未注册（A-12 允许此提示，仅 email_code 方式） */
export const EMAIL_NOT_REGISTERED_MSG = '这个邮箱还没注册，先去注册吧';

/** 错误码段 21xx（验证码/注册占用类） */
export const ERR_EMAIL_TAKEN = 2105;
export const ERR_USERNAME_TAKEN = 2106;
export const ERR_PHONE_TAKEN = 2107;
