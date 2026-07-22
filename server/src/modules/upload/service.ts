/**
 * 上传服务（R1/R17/R18）：照片入库 + 签名 URL 签发 + "分析完即删"。
 */
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { storage } from './storage.js';
import { assertPhotoCount, parseBase64Image, validatePhoto } from './validate.js';

export interface PhotoRow {
  id: number;
  session_id: number;
  user_id: number;
  cos_key: string;
  group_tag: string | null;
  status: string;
  taken_order: number;
  mime: string | null;
  size_bytes: number;
  /** v3：'before'（默认，整理前）/ 'after'（整理后拍照存档） */
  kind?: string;
}

export function countSessionPhotos(sessionId: number): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM photos WHERE session_id = ? AND status = 'active'`)
    .get(sessionId) as { n: number };
  return row.n;
}

/** 上传一批 base64 照片（校验 → 存储 → 落库） */
export async function uploadPhotos(
  userId: number,
  sessionId: number,
  dataUrls: string[],
): Promise<PhotoRow[]> {
  const current = countSessionPhotos(sessionId);
  assertPhotoCount(current, dataUrls.length);
  const saved: PhotoRow[] = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const { buffer, mime } = parseBase64Image(dataUrls[i]);
    const validated = validatePhoto(buffer, mime);
    const key = await storage.putObject(validated.buffer, validated.ext);
    const result = db
      .prepare(
        `INSERT INTO photos (session_id, user_id, cos_key, taken_order, mime, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sessionId, userId, key, current + i + 1, mime, buffer.length);
    saved.push(
      db.prepare('SELECT * FROM photos WHERE id = ?').get(Number(result.lastInsertRowid)) as PhotoRow,
    );
  }
  return saved;
}

export function listSessionPhotos(userId: number, sessionId: number): PhotoRow[] {
  return db
    .prepare(
      `SELECT * FROM photos WHERE session_id = ? AND user_id = ? AND status = 'active'
       ORDER BY taken_order`,
    )
    .all(sessionId, userId) as PhotoRow[];
}

/** 为照片批量签发 15 分钟签名 URL（R17：读取一律走签名 URL） */
export function withSignedUrls(photos: PhotoRow[]): Array<PhotoRow & { url: string }> {
  return photos.map((p) => ({ ...p, url: storage.signedUrl(p.cos_key) }));
}

export function deletePhoto(userId: number, photoId: number): void {
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(photoId) as
    | PhotoRow
    | undefined;
  if (!photo) throw BizError.notFound('照片不存在');
  if (photo.user_id !== userId) throw BizError.forbidden();
  void storage.deleteObject(photo.cos_key);
  db.prepare(`UPDATE photos SET status = 'deleted', updated_at = ? WHERE id = ?`).run(
    nowIso(),
    photoId,
  );
}

/** "分析完即删"（R17）：方案生成后异步删除该 session 全部照片，服务端无残留 */
export async function purgeSessionPhotos(sessionId: number): Promise<number> {
  const photos = db
    .prepare(`SELECT * FROM photos WHERE session_id = ? AND status = 'active'`)
    .all(sessionId) as PhotoRow[];
  for (const photo of photos) {
    await storage.deleteObject(photo.cos_key);
    db.prepare(`UPDATE photos SET status = 'deleted', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      photo.id,
    );
  }
  return photos.length;
}

/** 按 id 批量更新分组标签（确认环节用户纠正分组后回写） */
export function setPhotoGroupTags(
  userId: number,
  sessionId: number,
  groups: Array<{ tag: string; photo_ids: number[] }>,
): void {
  const stmt = db.prepare(
    'UPDATE photos SET group_tag = ?, updated_at = ? WHERE id = ? AND session_id = ? AND user_id = ?',
  );
  for (const group of groups) {
    for (const photoId of group.photo_ids) {
      stmt.run(group.tag, nowIso(), photoId, sessionId, userId);
    }
  }
}
