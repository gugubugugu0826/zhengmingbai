/**
 * 复查提醒扫描器（R48）：定时查到期的 pending 提醒 → 写站内消息 → 置 sent。
 * 用户关闭 reminder_enabled 时置 cancelled 不发消息。
 * 间隔与 REMIND_AFTER_DAYS 均可通过 env 覆盖（QA 用分钟级测试）。
 */
import { db, nowIso } from '../../db.js';
import { logger } from '../../common/logger.js';
import { getConfig } from '../configs/service.js';
import { sendReminderSubscribeMessage } from '../wechat/subscribe-push.js';

/** 30 天提醒默认文案（v3 设计稿口径；configs `reminder.template` 可覆盖，{{space_name}} 可变） */
const DEFAULT_REMINDER_TEMPLATE = '整理完 30 天了，回去看看{{space_name}}保持得怎么样';

/** 扫描间隔（默认 10 分钟；QA 可设 REMINDER_SCAN_INTERVAL_MS=60000 分钟级测） */
const SCAN_INTERVAL_MS = Number(process.env.REMINDER_SCAN_INTERVAL_MS || 10 * 60 * 1000);

interface DueReminder {
  id: number;
  user_id: number;
  session_id: number;
  space_id: number;
  space_name: string;
  reminder_enabled: number;
  /** v3.1 T05：订阅消息推送 openid（Mock 用户为 mock_ 前缀，推送层自动跳过） */
  wechat_openid: string | null;
}

/** 扫描一轮：到期 pending → 写 messages 置 sent（关开关则置 cancelled） */
export function scanDueReminders(): number {
  const due = db
    .prepare(
      `SELECT r.id, r.user_id, r.session_id, s.space_id, sp.name AS space_name, u.reminder_enabled,
              u.wechat_openid
       FROM reminders r
       JOIN sessions s ON s.id = r.session_id
       JOIN spaces sp ON sp.id = s.space_id
       JOIN users u ON u.id = r.user_id
       WHERE r.status = 'pending' AND r.remind_at <= ?`,
    )
    .all(nowIso()) as unknown as DueReminder[];

  let sent = 0;
  for (const r of due) {
    if (r.reminder_enabled === 0) {
      db.prepare(`UPDATE reminders SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(
        nowIso(),
        r.id,
      );
      continue;
    }
    // v3 设计稿文案（configs reminder.template 可热改；{{space_name}} 替换为空间名）
    const template = getConfig<string>('reminder.template', DEFAULT_REMINDER_TEMPLATE);
    const content = template.replaceAll('{{space_name}}', r.space_name);
    db.prepare(
      `INSERT INTO messages (user_id, type, title, content, link) VALUES (?, ?, ?, ?, ?)`,
    ).run(
      r.user_id,
      'reminder_30d',
      `好久不见，${r.space_name}还好吗？`,
      content,
      `/spaces?focus=${r.space_id}`,
    );
    db.prepare(`UPDATE reminders SET status = 'sent', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      r.id,
    );
    sent += 1;
    // v3.1 T05：站内消息之外增量触达——微信订阅消息推送。
    // 模板 ID 未配 / Mock 环境 / Mock openid 时静默跳过（只发站内消息）；失败仅记日志不影响状态机。
    if (r.wechat_openid) {
      sendReminderSubscribeMessage({
        openid: r.wechat_openid,
        spaceName: r.space_name,
        page: `pages/spaces/spaces?focus=${r.space_id}`,
      }).catch((err) => logger.warn({ err, reminderId: r.id }, '订阅消息推送异常'));
    }
  }
  if (due.length > 0) {
    logger.info({ due: due.length, sent }, '复查提醒扫描完成');
  }
  return sent;
}

/** 启动扫描器，返回 interval 句柄供优雅关闭 */
export function startReminderScanner(): NodeJS.Timeout {
  const timer = setInterval(() => {
    try {
      scanDueReminders();
    } catch (err) {
      logger.warn({ err }, 'reminder scanner 异常');
    }
  }, SCAN_INTERVAL_MS);
  timer.unref?.();
  logger.info({ intervalMs: SCAN_INTERVAL_MS }, '复查提醒 scanner 已启动');
  return timer;
}
