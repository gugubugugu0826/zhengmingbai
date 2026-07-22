/**
 * 业务错误：code 遵循 3.4 错误码段（1xxx 通用 / 2xxx 鉴权 / 3xxx 点数订单 / 4xxx AI）。
 */
export class BizError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly httpStatus: number = 400,
  ) {
    super(message);
    this.name = 'BizError';
  }

  static param(message: string): BizError {
    return new BizError(1001, message, 400);
  }
  static notFound(message = '资源不存在'): BizError {
    return new BizError(1004, message, 404);
  }
  static unauthorized(message = '请先登录'): BizError {
    return new BizError(2001, message, 401);
  }
  static forbidden(message = '无权访问该资源'): BizError {
    return new BizError(2003, message, 403);
  }
  static insufficientPoints(need: number, balance: number): BizError {
    return new BizError(3001, `点数不足：本次需要 ${need} 点，当前余额 ${balance} 点`, 400);
  }
  static orderState(message: string): BizError {
    return new BizError(3002, message, 400);
  }
  static paymentVerify(message = '支付回调验签失败'): BizError {
    return new BizError(3003, message, 400);
  }
  static ai(message: string): BizError {
    return new BizError(4001, message, 502);
  }
}
