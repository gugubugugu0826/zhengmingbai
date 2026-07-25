/**
 * 点数路由：余额查询、流水查询。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { getBalance, listTransactions } from './service.js';

export const pointsRouter = Router();

/** GET /points/balance — 当前点数余额 */
pointsRouter.get('/balance', (req: AuthRequest, res) => {
  ok(res, getBalance(req.userId!));
});

const txQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

/** GET /points/transactions — 点数流水（R12：点数变动有流水记录） */
pointsRouter.get('/transactions', (req: AuthRequest, res) => {
  const { page, pageSize } = txQuerySchema.parse(req.query);
  ok(res, listTransactions(req.userId!, page, pageSize));
});
