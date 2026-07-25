/**
 * Mock 支付渠道：结构与真实支付完全一致。
 * 前端点"立即支付"按钮 → 拿 createPayment 返回的 sign → 调 /payments/mock/callback，
 * 服务端走与真实支付一致的"回调 → 验签 → 入账"代码路径，二期切换微信支付业务代码零改动。
 */
import crypto from 'node:crypto';
import { config } from '../../../config.js';
import { BizError } from '../../../common/errors.js';
import type {
  IPaymentChannel,
  OrderLike,
  PaymentParams,
  PaymentResult,
  PaymentStatus,
} from './channel.interface.js';

export class MockChannel implements IPaymentChannel {
  readonly name = 'mock' as const;

  private sign(orderNo: string, amountFen: number): string {
    return crypto
      .createHmac('sha256', config.jwtSecret)
      .update(`mockpay:${orderNo}:${amountFen}`)
      .digest('hex')
      .slice(0, 32);
  }

  async createPayment(order: OrderLike): Promise<PaymentParams> {
    return {
      order_no: order.order_no,
      channel: 'mock',
      mock: true,
      sign: this.sign(order.order_no, order.amount_fen),
    };
  }

  async queryPayment(orderNo: string): Promise<PaymentStatus> {
    // Mock 渠道无第三方可查询，订单状态以本地库为准
    void orderNo;
    return 'PENDING';
  }

  /** 验签：HMAC(order_no:amount) 与回调携带的签名比对 */
  async verifyCallback(payload: unknown, signature: string): Promise<PaymentResult> {
    const body = payload as { order_no?: string; amount_fen?: number };
    if (!body?.order_no || typeof body.amount_fen !== 'number') {
      throw BizError.paymentVerify('回调参数不完整');
    }
    const expected = this.sign(body.order_no, body.amount_fen);
    const a = Buffer.from(String(signature || ''));
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw BizError.paymentVerify();
    }
    return {
      order_no: body.order_no,
      success: true,
      paid_at: new Date().toISOString(),
      transaction_id: `MOCK${Date.now()}`,
    };
  }
}
