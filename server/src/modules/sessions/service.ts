/**
 * 整理会话服务（R2/R3）：会话生命周期 + 归属校验。
 * 状态机：uploading → confirming → analyzing → planned → executing → done
 */
import { db } from '../../db.js';
import { BizError } from '../../common/errors.js';

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
