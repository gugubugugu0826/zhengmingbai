/**
 * 空间档案路由（R11）。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import type { AuthRequest } from '../../middleware/auth.js';
import {
  createSpace,
  deleteSpace,
  getSpaceDetail,
  listSpaces,
  spaceHistory,
  updateSpace,
} from './service.js';

export const spacesRouter = Router();

const createSchema = z.object({
  name: z.string().min(1).max(30),
  space_type: z.string().min(1),
});

/** POST /spaces — 创建空间 */
spacesRouter.post('/', (req: AuthRequest, res) => {
  const { name, space_type } = createSchema.parse(req.body);
  ok(res, createSpace(req.userId!, name, space_type), '空间创建好啦');
});

/** GET /spaces — 空间列表 */
spacesRouter.get('/', (req: AuthRequest, res) => {
  ok(res, listSpaces(req.userId!));
});

/** GET /spaces/:id — 空间详情（v3：补 photos/after_photos 签名 URL + 实时状态） */
spacesRouter.get('/:id', (req: AuthRequest, res) => {
  ok(res, getSpaceDetail(req.userId!, Number(req.params.id)));
});

/** GET /spaces/:id/history — 历次整理记录时间线 */
spacesRouter.get('/:id/history', (req: AuthRequest, res) => {
  ok(res, spaceHistory(req.userId!, Number(req.params.id)));
});

const updateSchema = z.object({
  name: z.string().min(1).max(30).optional(),
  space_type: z.string().min(1).optional(),
});

/** PATCH /spaces/:id — 重命名 / 改类型 */
spacesRouter.patch('/:id', (req: AuthRequest, res) => {
  const patch = updateSchema.parse(req.body);
  ok(res, updateSpace(req.userId!, Number(req.params.id), patch), '已更新');
});

/** DELETE /spaces/:id — 删除空间 */
spacesRouter.delete('/:id', (req: AuthRequest, res) => {
  deleteSpace(req.userId!, Number(req.params.id));
  ok(res, { deleted: true }, '空间已删除');
});
