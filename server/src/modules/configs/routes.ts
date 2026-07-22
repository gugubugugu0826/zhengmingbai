/**
 * 配置中心路由：读取/更新配置（一期单管理员演示版，operator 记为 user:{id}）。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { getConfig, listConfigs, requireConfigKey, setConfig } from './service.js';

export const configsRouter = Router();

const updateSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.unknown(),
});

/** GET /configs — 全部配置 */
configsRouter.get('/', (_req, res) => {
  ok(res, listConfigs());
});

/** GET /configs/:key — 单个配置 */
configsRouter.get('/:key', (req, res) => {
  const key = req.params.key;
  requireConfigKey(key);
  const value = getConfig<unknown>(key, null);
  ok(res, { key, value });
});

/** PUT /configs — 更新配置（即时生效 + 操作日志） */
configsRouter.put('/', (req: AuthRequest, res) => {
  const { key, value } = updateSchema.parse(req.body);
  requireConfigKey(key);
  setConfig(key, value, `user:${req.userId}`);
  ok(res, { key, value }, '配置已更新，即时生效');
});
