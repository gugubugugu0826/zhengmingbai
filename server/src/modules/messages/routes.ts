/**
 * 站内消息路由（R48）：复查提醒等系统消息的列表/已读/未读数。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import { BizError } from '../../common/errors.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { db, nowIso } from '../../db.js';

export const messagesRouter = Router();

export interface MessageRow {
  id: number;
  user_id: number;
  type: string;
  title: string;
  content: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

/** GET /messages?unread=1 — 消息列表（最新 50 条，unread=1 时只取未读） */
messagesRouter.get('/', (req: AuthRequest, res) => {
  const query = z
    .object({ unread: z.union([z.literal('1'), z.literal('0')]).optional() })
    .parse(req.query);
  const rows = db
    .prepare(
      `SELECT * FROM messages WHERE user_id = ? ${query.unread === '1' ? 'AND is_read = 0' : ''}
       ORDER BY id DESC LIMIT 50`,
    )
    .all(req.userId!) as unknown as MessageRow[];
  ok(res, rows);
});

/** GET /messages/unread-count — 未读数（首页小红点） */
messagesRouter.get('/unread-count', (req: AuthRequest, res) => {
  const row = db
    .prepare(`SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND is_read = 0`)
    .get(req.userId!) as { n: number };
  ok(res, { count: row.n });
});

/** POST /messages/:id/read — 标记已读（越权 403） */
messagesRouter.post('/:id/read', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const msg = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as
    | MessageRow
    | undefined;
  if (!msg) throw BizError.notFound('消息不存在');
  if (msg.user_id !== req.userId!) throw BizError.forbidden();
  db.prepare(`UPDATE messages SET is_read = 1, updated_at = ? WHERE id = ?`).run(nowIso(), id);
  ok(res, { read: true }, '已读');
});
