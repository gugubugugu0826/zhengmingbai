/**
 * 登录目标格式校验（手机号/邮箱）。
 * 验证码发送/校验逻辑已迁移至 verification/ 通道（R47），本文件仅保留格式断言。
 */
import { BizError } from '../../common/errors.js';

const PHONE_REGEX = /^1\d{10}$/;
const EMAIL_REGEX = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;

export function assertValidPhone(phone: string): void {
  if (!PHONE_REGEX.test(phone)) {
    throw BizError.param('请输入正确的 11 位手机号');
  }
}

export function assertValidEmail(email: string): void {
  if (!EMAIL_REGEX.test(email)) {
    throw BizError.param('请输入正确的邮箱地址');
  }
}
