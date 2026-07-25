/**
 * 订单与支付路由（R13/R14）。
 * Mock 支付"点即成功"，但走与真实支付一致的回调验签入账路径。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import {
  createOrder,
  getOrder,
  handlePaymentCallback,
  listOrders,
  listPackages,
} from './service.js';

export const ordersRouter = Router();

/** GET /packages — 套餐列表（后台可配置上下架） */
ordersRouter.get('/packages', (_req: AuthRequest, res) => {
  ok(res, listPackages());
});

const createOrderSchema = z.object({ package_id: z.number().int().positive() });

/** POST /orders — 下单（返回 Mock 支付参数） */
ordersRouter.post('/orders', sensitiveLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { package_id } = createOrderSchema.parse(req.body);
    const result = await createOrder(req.userId!, package_id);
    ok(res, result, '订单已创建');
  } catch (err) {
    next(err);
  }
});

/** GET /orders — 我的订单 */
ordersRouter.get('/orders', (req: AuthRequest, res) => {
  ok(res, listOrders(req.userId!));
});

/** GET /orders/:orderNo — 订单详情 */
ordersRouter.get('/orders/:orderNo', (req: AuthRequest, res) => {
  ok(res, getOrder(req.userId!, req.params.orderNo));
});

const callbackSchema = z.object({
  order_no: z.string().min(6).max(64),
  amount_fen: z.number().int().nonnegative(),
  sign: z.string().min(1).max(128),
});

/**
 * POST /payments/mock/callback — Mock 支付回调。
 * 与真实微信支付回调走同一代码路径：验签 → 事务状态机 → 幂等入账。重放不重复入账。
 */
ordersRouter.post('/payments/mock/callback', sensitiveLimiter, async (req: AuthRequest, res, next) => {
  try {
    const { order_no, amount_fen, sign } = callbackSchema.parse(req.body);
    // 回调也必须本人发起（防伪造他人订单回调）
    getOrder(req.userId!, order_no);
    const result = await handlePaymentCallback('mock', { order_no, amount_fen }, sign);
    ok(res, result, result.points_added > 0 ? `已到账 ${result.points_added} 点` : '订单已支付');
  } catch (err) {
    next(err);
  }
});
