/**
 * 整理会话服务（R2/R3）：会话生命周期 + 归属校验。
 * 状态机：uploading → confirming → analyzing → planned → executing → done
 * v3：saveAfterPhotos——执行清单收尾"拍张整理后的照片"（photos.kind='after'，复用上传管线）。
 */
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { storage } from '../upload/storage.js';
import { parseBase64Image, validatePhoto } from '../upload/validate.js';
import type { PhotoRow } from '../upload/service.js';

export interface SessionRow {
  id: number;
  user_id: number;
  space_id: number;
  status: string;
  granularity: string | null;
  discard_mode: string | null;
  output_forms: string;
  points_charged: number;
  regen_count: number;
  confirm_state: string | null;
  completed_at: string | null;
  /** R49：1=保留到我的家 0=分析完即删 */
  keep_photos: number;
  created_at: string;
  updated_at: string;
  /** join spaces 冗余，编排器取空间类型/名称用 */
  space_type?: string;
  space_name?: string;
}

/** 校验会话归属（越权 403），顺带 join 空间类型/名称 */
export function getOwnedSession(userId: number, sessionId: number): SessionRow {
  const session = db
    .prepare(
      `SELECT s.*, sp.space_type AS space_type, sp.name AS space_name
       FROM sessions s JOIN spaces sp ON sp.id = s.space_id
       WHERE s.id = ?`,
    )
    .get(sessionId) as SessionRow | undefined;
  if (!session) throw BizError.notFound('整理会话不存在');
  if (session.user_id !== userId) throw BizError.forbidden();
  return session;
}

export function getSession(sessionId: number): SessionRow {
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as
    | SessionRow
    | undefined;
  if (!session) throw BizError.notFound('整理会话不存在');
  return session;
}

// ===================== v3：整理后拍照存档（任务书 §5-F，架构 §3.2-3.3③） =====================

/** 单次最多上传的整理后照片数（设计稿收尾项引导，独立于整理前 20 张上限） */
export const MAX_AFTER_PHOTOS = 9;

/**
 * 上传"整理后"照片：与整理前同一 base64 上传管线（MIME 白名单 + 魔数 + 大小校验 + 存储通道），
 * photos.kind='after' 落库；会话归属由调用方（路由层 getOwnedSession）前置校验。
 * 返回落库的 PhotoRow（调用方负责 withSignedUrls 签 URL）。
 */
export async function saveAfterPhotos(
  userId: number,
  sessionId: number,
  dataUrls: string[],
): Promise<PhotoRow[]> {
  const existing = db
    .prepare(
      `SELECT COUNT(*) AS n FROM photos WHERE session_id = ? AND kind = 'after' AND status = 'active'`,
    )
    .get(sessionId) as { n: number };
  if (dataUrls.length < 1) throw BizError.param('至少上传 1 张照片');
  if (existing.n + dataUrls.length > MAX_AFTER_PHOTOS) {
    throw BizError.param(`整理后的照片最多 ${MAX_AFTER_PHOTOS} 张，当前已有 ${existing.n} 张`);
  }
  // taken_order 接续该会话已有照片的最大序号，保持全局有序
  const maxOrder = db
    .prepare(`SELECT COALESCE(MAX(taken_order), 0) AS m FROM photos WHERE session_id = ?`)
    .get(sessionId) as { m: number };
  const saved: PhotoRow[] = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const { buffer, mime } = parseBase64Image(dataUrls[i]);
    const validated = validatePhoto(buffer, mime);
    const key = await storage.putObject(validated.buffer, validated.ext);
    const result = db
      .prepare(
        `INSERT INTO photos (session_id, user_id, cos_key, kind, taken_order, mime, size_bytes, created_at, updated_at)
         VALUES (?, ?, ?, 'after', ?, ?, ?, ?, ?)`,
      )
      .run(sessionId, userId, key, maxOrder.m + i + 1, mime, buffer.length, nowIso(), nowIso());
    saved.push(
      db
        .prepare('SELECT * FROM photos WHERE id = ?')
        .get(Number(result.lastInsertRowid)) as unknown as PhotoRow,
    );
  }
  return saved;
}
