/**
 * 空间档案服务（R11）："我的家"多空间 CRUD + 历次整理记录时间线。
 * 越权防护：所有查询强制带 user_id 条件。
 * v3：getSpaceDetail——空间详情补 photos/after_photos 签名 URL 数组（前后对比并排展示）。
 */
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { storage } from '../upload/storage.js';
import type { PhotoRow } from '../upload/service.js';

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

// ===================== v3：空间详情含前后对比（任务书 §5-F，架构 §3.3⑥） =====================

/** 空间详情响应：基础字段 + 整理前/整理后签名 URL 数组 + 实时状态 */
export interface SpaceDetail extends SpaceRow {
  /** 整理前照片（kind='before'，15 分钟签名 URL，按拍摄序） */
  photos: string[];
  /** 整理后照片（kind='after'，收尾拍照存档） */
  after_photos: string[];
  /** 空间状态机口径：已采纳未开始=待执行；有勾选=执行中；全勾=已完成 */
  status: string;
}

/**
 * 空间详情：聚合该空间全部会话的照片（before/after 分桶，签名 URL）。
 * 状态按最近一次已采纳方案的勾选进度实时计算（不信任何静态数字）。
 */
export function getSpaceDetail(userId: number, spaceId: number): SpaceDetail {
  const space = getSpace(userId, spaceId);
  const rows = db
    .prepare(
      `SELECT p.cos_key, p.kind
       FROM photos p
       JOIN sessions s ON s.id = p.session_id
       WHERE s.space_id = ? AND p.user_id = ? AND p.status = 'active'
       ORDER BY p.taken_order, p.id`,
    )
    .all(spaceId, userId) as Array<Pick<PhotoRow, 'cos_key'> & { kind: string }>;
  const photos: string[] = [];
  const afterPhotos: string[] = [];
  for (const row of rows) {
    if (row.kind === 'after') afterPhotos.push(storage.signedUrl(row.cos_key));
    else photos.push(storage.signedUrl(row.cos_key));
  }
  return { ...space, photos, after_photos: afterPhotos, status: spaceStatus(userId, spaceId) };
}

/** 空间状态实时计算：最新已采纳（planned/executing/done）会话的清单勾选进度 */
function spaceStatus(userId: number, spaceId: number): string {
  const session = db
    .prepare(
      `SELECT id, status FROM sessions
       WHERE space_id = ? AND user_id = ? AND status IN ('planned', 'executing', 'done')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(spaceId, userId) as { id: number; status: string } | undefined;
  if (!session) return '待整理';
  if (session.status === 'done') return '已完成';
  const plan = db
    .prepare(`SELECT id FROM plans WHERE session_id = ? AND is_final = 1 ORDER BY version DESC LIMIT 1`)
    .get(session.id) as { id: number } | undefined;
  if (!plan) return '待执行';
  const agg = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(checked), 0) AS checked FROM plan_items WHERE plan_id = ?`,
    )
    .get(plan.id) as { total: number; checked: number };
  if (agg.total === 0 || agg.checked === 0) return '待执行';
  if (agg.checked >= agg.total) return '已完成';
  return '执行中';
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
