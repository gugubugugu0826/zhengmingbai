/**
 * 邮箱验证码落库服务单元测试（VERIFICATION_CHANNEL=mock，不落 SES，日志取码）。
 * 运行：cd server && set DB_FILE=./data/test-emailverif.db && set VERIFICATION_CHANNEL=mock &&
 *       npx tsx --test src/modules/auth/verification/email-verification.test.ts
 * 覆盖：落库 / 60 秒限频(2103) / 校验一次性(2102) / 场景隔离。
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TEST_DB = './data/test-emailverif.db';

before(async () => {
  process.env.DB_FILE = TEST_DB;
  process.env.VERIFICATION_CHANNEL = 'mock'; // 明确走 mock 通道，不发真实邮件
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      /* 不存在则忽略 */
    }
  }
  // 建表（含 v2.2 新表 email_verifications）
  const { migrate } = await import('../../../db.js');
  migrate();
});

test('sendEmailCode: 生成 6 位数字码落库（mock 通道发送）', async () => {
  const { sendEmailCode } = await import('./email-verification.service.js');
  const { db } = await import('../../../db.js');
  await sendEmailCode('user1@test.com', 'register');
  const row = db
    .prepare(
      `SELECT code, scene, verified FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get('user1@test.com') as { code: string; scene: string; verified: number };
  assert.match(row.code, /^\d{6}$/, '应为 6 位数字');
  assert.equal(row.scene, 'register');
  assert.equal(row.verified, 0);
});

test('sendEmailCode: 60 秒内重复发送抛 2103', async () => {
  const { sendEmailCode, EMAIL_SEND_TOO_FREQUENT } = await import(
    './email-verification.service.js'
  );
  await sendEmailCode('user2@test.com', 'register');
  await assert.rejects(
    () => sendEmailCode('user2@test.com', 'register'),
    (err: { code?: number }) => {
      assert.equal(err.code, EMAIL_SEND_TOO_FREQUENT);
      return true;
    },
  );
});

test('sendEmailCode: 不同场景互不触发限频', async () => {
  const { sendEmailCode } = await import('./email-verification.service.js');
  await sendEmailCode('user3@test.com', 'register');
  await sendEmailCode('user3@test.com', 'login'); // 场景不同，不应限频
});

test('verifyEmailCode: 正确码通过并一次性作废，错误码/过期抛 2102', async () => {
  const { sendEmailCode, verifyEmailCode, EMAIL_CODE_INVALID } = await import(
    './email-verification.service.js'
  );
  const { db } = await import('../../../db.js');
  const email = 'user4@test.com';
  await sendEmailCode(email, 'login');
  const row = db
    .prepare(`SELECT code FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1`)
    .get(email) as { code: string };

  // 错误码 → 2102，且不作废（用户可继续尝试同一有效码）
  assert.throws(
    () => verifyEmailCode(email, row.code === '000000' ? '111111' : '000000', 'login'),
    (err: { code?: number }) => err.code === EMAIL_CODE_INVALID,
  );
  // 正确码 → 通过
  verifyEmailCode(email, row.code, 'login');
  // 再次使用 → 已作废 → 2102
  assert.throws(
    () => verifyEmailCode(email, row.code, 'login'),
    (err: { code?: number }) => err.code === EMAIL_CODE_INVALID,
  );
});

test('verifyEmailCode: 过期记录抛 2102', async () => {
  const { verifyEmailCode, EMAIL_CODE_INVALID } = await import('./email-verification.service.js');
  const { db } = await import('../../../db.js');
  db.prepare(
    `INSERT INTO email_verifications (email, code, scene, verified, expires_at)
     VALUES (?, ?, ?, 0, ?)`,
  ).run('user5@test.com', '123456', 'login', '2000-01-01T00:00:00.000Z');
  assert.throws(
    () => verifyEmailCode('user5@test.com', '123456', 'login'),
    (err: { code?: number }) => err.code === EMAIL_CODE_INVALID,
  );
});

test('verifyEmailCode: 场景不匹配视为无效', async () => {
  const { sendEmailCode, verifyEmailCode, EMAIL_CODE_INVALID } = await import(
    './email-verification.service.js'
  );
  const { db } = await import('../../../db.js');
  const email = 'user6@test.com';
  await sendEmailCode(email, 'change_email');
  const row = db
    .prepare(`SELECT code FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1`)
    .get(email) as { code: string };
  assert.throws(
    () => verifyEmailCode(email, row.code, 'login'),
    (err: { code?: number }) => err.code === EMAIL_CODE_INVALID,
  );
});
