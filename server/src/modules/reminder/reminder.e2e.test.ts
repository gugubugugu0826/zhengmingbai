/**
 * v3 端到端回归：整理后拍照存档（after-photos）+ 30 天提醒链路（分钟级）。
 * 运行：cd server && set REMIND_AFTER_MINUTES=0 && npx tsx --test src/modules/reminder/reminder.e2e.test.ts
 * （REMIND_AFTER_MINUTES=0 时走 30 天分支；本测试直接手插到期 remind_at 触发 scanner）
 * 覆盖验收点：
 *   - saveAfterPhotos：kind='after' 落库、越权防护、9 张上限、空间详情 after_photos 可见
 *   - 提醒链路：scheduleReminder 幂等 → 到期 scanner 发站内消息（v3 设计稿文案）→ 开关关闭置 cancelled
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TEST_DB = './data/test-reminder-e2e.db';

/** 1x1 像素 PNG（魔数合法的极简图片） */
const PNG_1PX =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

before(async () => {
  process.env.DB_FILE = TEST_DB;
  process.env.STORAGE_CHANNEL = 'local';
  process.env.UPLOAD_DIR = './uploads/test-reminder-e2e';
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      /* 不存在则忽略 */
    }
  }
  fs.rmSync('./uploads/test-reminder-e2e', { recursive: true, force: true });
  const { migrate } = await import('../../db.js');
  migrate();
});

/** 造用户 + 空间 + 会话，返回 { userId, spaceId, sessionId } */
async function seedSession(email: string): Promise<{
  userId: number;
  spaceId: number;
  sessionId: number;
}> {
  const { db } = await import('../../db.js');
  const { hashPassword } = await import('../auth/password.js');
  const u = db
    .prepare(`INSERT INTO users (email, nickname, password_hash, email_verified) VALUES (?, ?, ?, 1)`)
    .run(email, '测试用户', hashPassword('testpass1'));
  const userId = Number(u.lastInsertRowid);
  const sp = db
    .prepare(`INSERT INTO spaces (user_id, name, space_type) VALUES (?, ?, ?)`)
    .run(userId, '客厅', 'living');
  const spaceId = Number(sp.lastInsertRowid);
  const se = db
    .prepare(
      `INSERT INTO sessions (user_id, space_id, status, granularity, discard_mode, output_forms)
       VALUES (?, ?, 'planned', 'region', 'conservative', '["plan"]')`,
    )
    .run(userId, spaceId);
  return { userId, spaceId, sessionId: Number(se.lastInsertRowid) };
}

test('saveAfterPhotos：kind=after 落库，空间详情 after_photos 可见，photos 桶不含 after', async () => {
  const { saveAfterPhotos } = await import('../sessions/service.js');
  const { getSpaceDetail } = await import('../spaces/service.js');
  const { db } = await import('../../db.js');
  const { userId, spaceId, sessionId } = await seedSession('after1@test.com');

  const saved = await saveAfterPhotos(userId, sessionId, [PNG_1PX, PNG_1PX]);
  assert.equal(saved.length, 2);
  assert.equal(saved[0].kind ?? 'after', 'after');
  const row = db
    .prepare(`SELECT kind FROM photos WHERE session_id = ? AND status = 'active' LIMIT 1`)
    .get(sessionId) as { kind: string };
  assert.equal(row.kind, 'after');

  const detail = getSpaceDetail(userId, spaceId);
  assert.equal(detail.after_photos.length, 2, 'after_photos 应有 2 张签名 URL');
  assert.equal(detail.photos.length, 0, 'photos 桶不应混入 after 照片');
  assert.ok(detail.after_photos[0].includes('/api/v1/files/'), '应为本地通道签名 URL');
});

test('saveAfterPhotos：超过 9 张上限抛参数错误；非会话主人被 getOwnedSession 拦截', async () => {
  const { saveAfterPhotos, MAX_AFTER_PHOTOS } = await import('../sessions/service.js');
  const { getOwnedSession } = await import('../sessions/service.js');
  const { userId, sessionId } = await seedSession('after2@test.com');

  const ten = Array.from({ length: MAX_AFTER_PHOTOS + 1 }, () => PNG_1PX);
  await assert.rejects(
    () => saveAfterPhotos(userId, sessionId, ten),
    (err: { code?: number }) => err.code === 1001,
  );

  // 越权：另一个用户访问该会话抛 403
  const { userId: otherId } = await seedSession('after3@test.com');
  assert.throws(
    () => getOwnedSession(otherId, sessionId),
    (err: { code?: number }) => err.code === 2003,
  );
});

test('30 天提醒：幂等安排 → 到期 scanner 发消息（v3 设计稿文案）→ 状态 sent', async () => {
  const { scheduleReminder } = await import('./service.js');
  const { scanDueReminders } = await import('./scanner.js');
  const { db, nowIso } = await import('../../db.js');
  const { userId, sessionId } = await seedSession('remind1@test.com');

  // 幂等：同会话重复安排不重复落库
  scheduleReminder(userId, sessionId);
  scheduleReminder(userId, sessionId);
  const cnt = db
    .prepare(`SELECT COUNT(*) AS n FROM reminders WHERE session_id = ? AND status = 'pending'`)
    .get(sessionId) as { n: number };
  assert.equal(cnt.n, 1, '同会话只应有一条 pending 提醒');

  // 手工把提醒置为"已到期"，触发 scanner（等价于 REMIND_AFTER_MINUTES 分钟级回归）
  db.prepare(`UPDATE reminders SET remind_at = ? WHERE session_id = ?`).run(
    '2000-01-01T00:00:00.000Z',
    sessionId,
  );
  const sent = scanDueReminders();
  assert.ok(sent >= 1, '应至少发出 1 条提醒');

  const msg = db
    .prepare(
      `SELECT type, content FROM messages WHERE user_id = ? AND type = 'reminder_30d'
       ORDER BY id DESC LIMIT 1`,
    )
    .get(userId) as { type: string; content: string };
  assert.ok(msg, '应落站内消息');
  assert.equal(msg.content, '整理完 30 天了，回去看看客厅保持得怎么样', 'v3 设计稿文案');

  const status = db
    .prepare(`SELECT status FROM reminders WHERE session_id = ?`)
    .get(sessionId) as { status: string };
  assert.equal(status.status, 'sent');

  // 已发送的不会重复发
  assert.equal(scanDueReminders(), 0);
  void nowIso;
});

test('30 天提醒：用户关闭 reminder_enabled 时到期置 cancelled 不发消息', async () => {
  const { scheduleReminder } = await import('./service.js');
  const { scanDueReminders } = await import('./scanner.js');
  const { db } = await import('../../db.js');
  const { userId, sessionId } = await seedSession('remind2@test.com');

  db.prepare(`UPDATE users SET reminder_enabled = 0 WHERE id = ?`).run(userId);
  scheduleReminder(userId, sessionId);
  db.prepare(`UPDATE reminders SET remind_at = ? WHERE session_id = ?`).run(
    '2000-01-01T00:00:00.000Z',
    sessionId,
  );
  scanDueReminders();

  const status = db
    .prepare(`SELECT status FROM reminders WHERE session_id = ?`)
    .get(sessionId) as { status: string };
  assert.equal(status.status, 'cancelled', '关开关应置 cancelled');
  const msg = db
    .prepare(`SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND type = 'reminder_30d'`)
    .get(userId) as { n: number };
  assert.equal(msg.n, 0, '关开关不应发消息');
});
