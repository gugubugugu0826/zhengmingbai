/**
 * 空间档案服务（R11）："我的家"多空间 CRUD + 历次整理记录时间线。
 * 越权防护：所有查询强制带 user_id 条件。
 */
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';

const SPACE_TYPES = new Set([
  'bedroom', 'kitchen', 'wardrobe', 'study', 'bathroom',
  'living', 'rental', 'office', 'shop', 'warehouse', 'other',
]);

export interface SpaceRow {
  id: number;
  user_id: number;
  name: string;
  space_type: string;
  cover_photo_id: number | null;
  created_at: string;
}

export function assertSpaceType(spaceType: string): void {
  if (!SPACE_TYPES.has(spaceType)) {
    throw BizError.param(`不支持的空间类型：${spaceType}`);
  }
}

export function createSpace(userId: number, name: string, spaceType: string): SpaceRow {
  assertSpaceType(spaceType);
  if (!name || name.length > 30) throw BizError.param('空间名字 1-30 个字哦');
  const result = db
    .prepare('INSERT INTO spaces (user_id, name, space_type) VALUES (?, ?, ?)')
    .run(userId, name.trim(), spaceType);
  return getSpace(userId, Number(result.lastInsertRowid));
}

export function getSpace(userId: number, spaceId: number): SpaceRow {
  const space = db.prepare('SELECT * FROM spaces WHERE id = ?').get(spaceId) as
    | SpaceRow
    | undefined;
  if (!space) throw BizError.notFound('空间不存在');
  if (space.user_id !== userId) throw BizError.forbidden();
  return space;
}

/** 空间列表：附带最近整理时间与记录数 */
export function listSpaces(userId: number): unknown[] {
  return db
    .prepare(
      `SELECT s.id, s.name, s.space_type, s.cover_photo_id, s.created_at,
              (SELECT COUNT(*) FROM sessions ss WHERE ss.space_id = s.id) AS session_count,
              (SELECT MAX(ss.created_at) FROM sessions ss WHERE ss.space_id = s.id) AS last_session_at
       FROM spaces s WHERE s.user_id = ? ORDER BY s.updated_at DESC`,
    )
    .all(userId);
}

export function updateSpace(
  userId: number,
  spaceId: number,
  patch: { name?: string; space_type?: string },
): SpaceRow {
  getSpace(userId, spaceId);
  if (patch.space_type !== undefined) assertSpaceType(patch.space_type);
  if (patch.name !== undefined && (!patch.name || patch.name.length > 30)) {
    throw BizError.param('空间名字 1-30 个字哦');
  }
  db.prepare(
    `UPDATE spaces SET name = COALESCE(?, name), space_type = COALESCE(?, space_type),
       updated_at = ? WHERE id = ? AND user_id = ?`,
  ).run(patch.name?.trim() ?? null, patch.space_type ?? null, nowIso(), spaceId, userId);
  return getSpace(userId, spaceId);
}

export function deleteSpace(userId: number, spaceId: number): void {
  getSpace(userId, spaceId);
  db.prepare('DELETE FROM spaces WHERE id = ? AND user_id = ?').run(spaceId, userId);
}

/** 空间历史记录（按时间倒序，R11） */
export function spaceHistory(userId: number, spaceId: number): unknown[] {
  getSpace(userId, spaceId);
  return db
    .prepare(
      `SELECT s.id, s.status, s.granularity, s.points_charged, s.created_at, s.completed_at,
              (SELECT COUNT(*) FROM photos p WHERE p.session_id = s.id AND p.status = 'active') AS photo_count,
              (SELECT p.illustration_url FROM plans p WHERE p.session_id = s.id ORDER BY p.version DESC LIMIT 1) AS illustration_url
       FROM sessions s WHERE s.space_id = ? AND s.user_id = ?
       ORDER BY s.created_at DESC`,
    )
    .all(spaceId, userId);
}
