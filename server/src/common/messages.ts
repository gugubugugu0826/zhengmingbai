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
export const ERR_PHONE_TAKEN = 2108;

/** v3 新增：注册开关关闭时拒绝新注册（任务书 §5-H，错误码段沿用 21xx） */
export const ERR_REGISTER_CLOSED = 2107;
export const REGISTER_CLOSED_MSG = '暂停注册，稍后再来看看';

/** v3 新增：维护模式拦截（HTTP 503，前端据此渲染全屏维护页） */
export const ERR_MAINTENANCE = 3001;

/** v3 新增：AI 对比功能筹备中（恒 501 口子，本期不承诺 AI） */
export const ERR_NOT_IMPLEMENTED = 1099;
