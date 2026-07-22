/**
 * 复查提醒服务（R9，最小化实现）。
 * 整理完成 30 天后提醒复查；一期不挂路由、不调外部推送 API，
 * 仅落库 reminders 表，二期由定时任务扫描 pending 记录并推送。
 */
import { db } from '../../db.js';

/** 复查提醒延迟天数（默认 30 天；QA 可设 REMIND_AFTER_MINUTES 分钟级测试） */
export const REMIND_AFTER_DAYS = Number(process.env.REMIND_AFTER_DAYS || 30);
const REMIND_AFTER_MINUTES = Number(process.env.REMIND_AFTER_MINUTES || 0);

/** 为用户的一次整理会话安排复查提醒（幂等：同会话不重复安排） */
export function scheduleReminder(userId: number, sessionId: number): void {
  const delayMs =
    REMIND_AFTER_MINUTES > 0
      ? REMIND_AFTER_MINUTES * 60 * 1000
      : REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000;
  const remindAt = new Date(Date.now() + delayMs).toISOString();
  db.prepare(
    `INSERT INTO reminders (user_id, session_id, remind_at)
     SELECT ?, ?, ?
     WHERE NOT EXISTS (
       SELECT 1 FROM reminders WHERE session_id = ? AND status = 'pending'
     )`,
  ).run(userId, sessionId, remindAt, sessionId);
}

/** 用户关闭提醒时，取消其全部待发送提醒 */
export function cancelPendingReminders(userId: number): void {
  db.prepare(
    `UPDATE reminders SET status = 'cancelled', updated_at = ? WHERE user_id = ? AND status = 'pending'`,
  ).run(new Date().toISOString(), userId);
}
