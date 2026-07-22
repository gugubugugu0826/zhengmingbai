/**
 * 支付渠道抽象（架构文档 2.3）：替换渠道不改业务代码。
 */

export interface OrderLike {
  id: number;
  order_no: string;
  user_id: number;
  amount_fen: number;
  points: number;
  status: string;
  channel: string;
}

export interface PaymentParams {
  order_no: string;
  channel: 'mock' | 'wechat';
  /** mock：前端拿 sign 直接调回调接口，模拟"点即成功" */
  sign?: string;
  mock?: boolean;
  /** wechat（二期）：prepay_id / timeStamp / nonceStr / package / signType / paySign */
  prepay_id?: string;
}

export type PaymentStatus = 'PAID' | 'PENDING' | 'CLOSED';

export interface PaymentResult {
  order_no: string;
  success: boolean;
  paid_at: string;
  /** 支付平台流水号（Mock 自造） */
  transaction_id: string;
}

export interface RefundResult {
  success: boolean;
  refund_id: string;
}

export interface IPaymentChannel {
  readonly name: 'mock' | 'wechat';
  /** 创建支付单，返回前端拉起支付所需参数（Mock 直接返回成功标记） */
  createPayment(order: OrderLike): Promise<PaymentParams>;
  /** 主动查询支付结果（兜底对账用） */
  queryPayment(orderNo: string): Promise<PaymentStatus>;
  /** 校验支付平台异步回调签名并解析结果（Mock 由本地按钮直接回调） */
  verifyCallback(payload: unknown, signature: string): Promise<PaymentResult>;
  /** 退款（一期只定义不实现，字段预留） */
  refund?(order: OrderLike, amountFen: number, reason: string): Promise<RefundResult>;
}
