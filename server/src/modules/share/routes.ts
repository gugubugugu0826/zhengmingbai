/**
 * 分享路由（R7）：分享卡片数据 + SVG 卡片图。
 */
import { Router } from 'express';
import { ok } from '../../common/response.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { getOwnedSession } from '../sessions/service.js';
import { buildShareCard } from './service.js';
import { renderShareCardSvg, renderIllustrationSvg } from './card-render.js';

export const shareRouter = Router();

/** GET /share/:sessionId/card — 分享卡片数据（封面签名 URL + ≤5 条方案要点） */
shareRouter.get('/:sessionId/card', (req: AuthRequest, res) => {
  const session = getOwnedSession(req.userId!, Number(req.params.sessionId));
  ok(res, buildShareCard(session));
});

/** GET /share/:sessionId/card.svg — 分享卡片 SVG（750x1000，纯 SVG 拼接） */
shareRouter.get('/:sessionId/card.svg', (req: AuthRequest, res) => {
  const session = getOwnedSession(req.userId!, Number(req.params.sessionId));
  const card = buildShareCard(session);
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(
    renderShareCardSvg({
      spaceLabel: card.space_label,
      points: card.points,
      brand: card.brand,
    }),
  );
});

export const illustrationsRouter = Router();

/** GET /illustrations/:scene.svg — 示意插画素材（R5 一期素材图，无需鉴权） */
illustrationsRouter.get('/:scene.svg', (req, res) => {
  const scene = req.params.scene;
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(renderIllustrationSvg(scene));
});
