/**
 * 照片文件访问路由：签名 URL 校验（R17：过期不可访问）。
 */
import { Router, type Response } from 'express';
import { ok } from '../../common/response.js';
import { BizError } from '../../common/errors.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { storage } from './storage.js';
import { deletePhoto } from './service.js';
import { db } from '../../db.js';

export const filesRouter = Router();

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

/**
 * GET /files/:key?expires&sign — 签名 URL 访问照片。
 * 注意：此接口不走 JWT 中间件（签名本身就是凭证，与 COS 预签名 URL 行为一致），
 * 但仍校验照片存在且未删除。
 */
filesRouter.get('/:key', async (req, res, next) => {
  try {
    const key = req.params.key;
    const expires = Number(req.query.expires || 0);
    const sign = String(req.query.sign || '');
    const objectKey = storage.verifySignedUrl(key, expires, sign);
    // 签名本身是凭证（HMAC 校验已过）；此处是额外的存在性/未删除校验。
    // 用户照片：photos 表有记录则必须 active（防已删照片死链访问）。
    // 文生图生成图：不落 photos 表，只写 plans.t2i_image_key，按该表放行。
    const photo = db
      .prepare(`SELECT id, status, mime FROM photos WHERE cos_key = ?`)
      .get(objectKey) as { id: number; status: string; mime: string | null } | undefined;
    let mime: string | null = null;
    if (photo) {
      if (photo.status !== 'active') {
        throw BizError.notFound('照片不存在或已删除');
      }
      mime = photo.mime;
    } else {
      const plan = db
        .prepare(`SELECT id FROM plans WHERE t2i_image_key = ?`)
        .get(objectKey) as { id: number } | undefined;
      if (!plan) {
        throw BizError.notFound('照片不存在或已删除');
      }
    }
    const buffer = await storage.getObject(objectKey);
    const ext = objectKey.split('.').pop() || 'jpg';
    res.setHeader('Content-Type', mime || MIME_BY_EXT[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

/** DELETE /files/photo/:id — 删除单张照片（需 JWT，挂在 sessions 路由下也可） */
export function deletePhotoHandler(req: AuthRequest, res: Response): void {
  deletePhoto(req.userId!, Number(req.params.id));
  ok(res, { deleted: true }, '照片已删除');
}
