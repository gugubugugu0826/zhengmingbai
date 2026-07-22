/**
 * 订单支付服务（R13/R14/R25）。
 * 订单状态机：PENDING --支付成功回调--> PAID；PENDING --超时/取消--> CLOSED；（二期）PAID --> REFUNDED
 * 入账走 PointsService.changeBalance 事务 + (order_recharge, order_no) 唯一索引，重放不重复入账。
 */
import { db, nowIso, withTransaction } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { bizNo } from '../../common/idempotency.js';
import { changeBalance } from '../points/service.js';
import { getPaymentChannel } from '../configs/service.js';
import type { IPaymentChannel, OrderLike, PaymentParams } from './payment/channel.interface.js';
import { MockChannel } from './payment/mock.js';
import { WechatPayChannel } from './payment/wechat.js';

const channels: Record<string, IPaymentChannel> = {
  mock: new MockChannel(),
  wechat: new WechatPayChannel(),
};

/** 按下单时快照的渠道取支付通道（防配置切换导致对不上账） */
export function channelOf(name: string): IPaymentChannel {
  return channels[name] ?? channels.mock;
}

export interface PackageRow {
  id: number;
  name: string;
  price_fen: number;
  points: number;
  tag: string | null;
  sort: number;
  is_active: number;
}

export function listPackages(): PackageRow[] {
  return db
    .prepare('SELECT * FROM packages WHERE is_active = 1 ORDER BY sort, id')
    .all() as PackageRow[];
}

/** 4 档套餐种子已统一收口到 seed-cli.ts（阶段 2 R32），本函数移除 */

/** 下单：创建 PENDING 订单（channel 快照），返回拉起支付参数 */
export async function createOrder(
  userId: number,
  packageId: number,
): Promise<{ order: OrderLike; payment: PaymentParams }> {
  const pkg = db.prepare('SELECT * FROM packages WHERE id = ? AND is_active = 1').get(packageId) as
    | PackageRow
    | undefined;
  if (!pkg) throw BizError.notFound('套餐不存在或已下架');
  const channel = getPaymentChannel();
  const orderNo = bizNo('ZMB');
  db.prepare(
    `INSERT INTO orders (order_no, user_id, package_id, amount_fen, points, status, channel)
     VALUES (?, ?, ?, ?, ?, 'PENDING', ?)`,
  ).run(orderNo, userId, pkg.id, pkg.price_fen, pkg.points, channel);
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo) as OrderLike;
  const payment = await channelOf(channel).createPayment(order);
  return { order, payment };
}

/**
 * 支付回调统一处理（与真实支付同一代码路径）：
 * 验签 → 事务（订单状态机校验 + 幂等入账）→ 返回结果。
 * 重放回调：唯一索引拦截，返回已支付，不重复入账。
 */
export async function handlePaymentCallback(
  channelName: string,
  payload: unknown,
  signature: string,
): Promise<{ order_no: string; status: string; balance: number; points_added: number }> {
  const result = await channelOf(channelName).verifyCallback(payload, signature);
  if (!result.success) throw BizError.paymentVerify('支付未成功');

  return withTransaction(() => {
    const order = db
      .prepare('SELECT * FROM orders WHERE order_no = ?')
      .get(result.order_no) as OrderLike | undefined;
    if (!order) throw BizError.notFound('订单不存在');
    if (order.channel !== channelName) {
      throw BizError.paymentVerify('支付渠道与下单时不一致');
    }
    if (order.status === 'PAID') {
      // 重放：直接返回当前余额，幂等
      const acc = db
        .prepare('SELECT balance FROM points_account WHERE user_id = ?')
        .get(order.user_id) as { balance: number } | undefined;
      return {
        order_no: order.order_no,
        status: 'PAID',
        balance: acc?.balance ?? 0,
        points_added: 0,
      };
    }
    if (order.status !== 'PENDING') {
      throw BizError.orderState(`订单已${order.status === 'CLOSED' ? '关闭' : '退款'}，无法支付`);
    }
    // 状态机：PENDING → PAID
    db.prepare(
      `UPDATE orders SET status = 'PAID', paid_at = ?, updated_at = ? WHERE id = ? AND status = 'PENDING'`,
    ).run(result.paid_at, nowIso(), order.id);
    // 点数入账（唯一索引 order_recharge+order_no 兜底防重放）
    const change = changeBalance(
      order.user_id,
      order.points,
      'order_recharge',
      order.order_no,
      `充值：${order.points} 点`,
    );
    return {
      order_no: order.order_no,
      status: 'PAID',
      balance: change.balance,
      points_added: change.replayed ? 0 : order.points,
    };
  });
}

export function listOrders(userId: number): unknown[] {
  return db
    .prepare(
      `SELECT o.id, o.order_no, o.amount_fen, o.points, o.status, o.channel, o.paid_at, o.created_at,
              p.name AS package_name
       FROM orders o JOIN packages p ON p.id = o.package_id
       WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 50`,
    )
    .all(userId);
}

export function getOrder(userId: number, orderNo: string): OrderLike {
  const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(orderNo) as
    | OrderLike
    | undefined;
  if (!order) throw BizError.notFound('订单不存在');
  if (order.user_id !== userId) throw BizError.forbidden();
  return order;
}
