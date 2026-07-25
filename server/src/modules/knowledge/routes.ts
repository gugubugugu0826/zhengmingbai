/**
 * 知识库路由（R16）：按空间类型查询分类知识（需登录）。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import { listBySpace, listRows } from './service.js';

export const knowledgeRouter = Router();

const querySchema = z.object({
  space_type: z.string().min(1).max(30).optional(),
  raw: z.coerce.boolean().default(false),
});

/** GET /knowledge?space_type=kitchen — 某空间类型的分类知识 */
knowledgeRouter.get('/', (req, res) => {
  const { space_type, raw } = querySchema.parse(req.query);
  if (raw) {
    ok(res, listRows(space_type));
    return;
  }
  ok(res, space_type ? listBySpace(space_type) : listRows());
});
