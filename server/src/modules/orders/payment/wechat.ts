/**
 * 微信支付渠道（二期空壳）：一期只建类与配置项，切换方式 = 改 configs.payment.channel。
 * TODO(二期): 接入微信支付 V3 API（JSAPI/小程序支付）：
 *   - createPayment: 下单接口返回 prepay_id，二次签名返回前端拉起参数
 *   - verifyCallback: 用平台证书验签 + AES-GCM 解密 resource
 *   - refund: 申请退款接口
 */
import { BizError } from '../../../common/errors.js';
import type {
  IPaymentChannel,
  OrderLike,
  PaymentParams,
  PaymentResult,
  PaymentStatus,
  RefundResult,
} from './channel.interface.js';

export class WechatPayChannel implements IPaymentChannel {
  readonly name = 'wechat' as const;

  async createPayment(_order: OrderLike): Promise<PaymentParams> {
    throw BizError.param('微信支付二期上线，当前请切换到 Mock 渠道（configs: payment.channel=mock）');
  }

  async queryPayment(_orderNo: string): Promise<PaymentStatus> {
    throw BizError.param('微信支付二期上线');
  }

  async verifyCallback(_payload: unknown, _signature: string): Promise<PaymentResult> {
    throw BizError.paymentVerify('微信支付二期上线');
  }

  async refund(_order: OrderLike, _amountFen: number, _reason: string): Promise<RefundResult> {
    throw BizError.param('退款功能二期上线');
  }
}
