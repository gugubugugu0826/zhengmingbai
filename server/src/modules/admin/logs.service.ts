/**
 * 管理员操作台账（R33-R37 统一留痕）。
 * 谁（admin_user_id）对什么（target）做了什么（action），细节快照 detail_json。
 */
import { db } from '../../db.js';

export type AdminAction =
  | 'points_grant'
  | 'points_deduct'
  | 'kb_create'
  | 'kb_update'
  | 'kb_delete'
  | 'config_update'
  | 'package_update'
  | 'admin_account_init'
  | 'admin_password_change'
  | 'admin_password_reset'
  | 'legacy_user_bind';

export function writeAdminLog(
  adminUserId: number,
  action: AdminAction,
  target: string,
  detail: unknown,
): void {
  db.prepare(
    `INSERT INTO admin_logs (admin_user_id, action, target, detail_json) VALUES (?, ?, ?, ?)`,
  ).run(adminUserId, action, target, JSON.stringify(detail ?? {}));
}

export function listAdminLogs(
  action: string | undefined,
  page: number,
  pageSize: number,
): { list: unknown[]; total: number } {
  const offset = (page - 1) * pageSize;
  const where = action ? 'WHERE action = ?' : '';
  const params: unknown[] = action ? [action] : [];
  const list = db
    .prepare(
      `SELECT * FROM admin_logs ${where} ORDER BY id DESC LIMIT ? OFFSET ?`,
    )
    .all(...(params as never[]), pageSize, offset);
  const { total } = db
    .prepare(`SELECT COUNT(*) AS total FROM admin_logs ${where}`)
    .get(...(params as never[])) as { total: number };
  return { list, total };
}
