/**
 * 忘记密码单元测试（v3，任务书 §5-C；VERIFICATION_CHANNEL=mock，日志取码不落 SES）。
 * 运行：cd server && npx tsx --test src/modules/auth/password-reset.test.ts
 * 覆盖验收点：
 *   - resetPasswordByEmail 全流程：发码 → 验码重置 → 旧密码立即失效 → 新密码可登录
 *   - 防枚举：邮箱未注册抛 2102（与验证码错误同文案，不暴露是否注册）
 *   - 一次性码：重置后同一码不可复用（2102）
 *   - 场景隔离：login 场景的码不能用于 reset_password
 *   - 密码强度：弱密码被 password-policy 拦截
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TEST_DB = './data/test-pwdreset.db';

before(async () => {
  process.env.DB_FILE = TEST_DB;
  process.env.VERIFICATION_CHANNEL = 'mock';
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      /* 不存在则忽略 */
    }
  }
  const { migrate } = await import('../../db.js');
  migrate();
});

/** 造一个带密码的用户并返回其 id */
async function seedUser(email: string, password: string): Promise<number> {
  const { db } = await import('../../db.js');
  const { hashPassword } = await import('./password.js');
  const r = db
    .prepare(
      `INSERT INTO users (email, username, nickname, password_hash, email_verified)
       VALUES (?, ?, ?, ?, 1)`,
    )
    .run(email, email.split('@')[0], '测试用户', hashPassword(password));
  return Number(r.lastInsertRowid);
}

/** 从库里取某邮箱某场景最新一条验证码 */
async function latestCode(email: string, scene: string): Promise<string> {
  const { db } = await import('../../db.js');
  const row = db
    .prepare(
      `SELECT code FROM email_verifications WHERE email = ? AND scene = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(email, scene) as { code: string };
  return row.code;
}

test('忘记密码全流程：发码 → 重置 → 旧密码失效 → 新密码可登录', async () => {
  const { sendEmailCode } = await import('./verification/email-verification.service.js');
  const { resetPasswordByEmail, login } = await import('./service.js');
  const email = 'reset-flow@test.com';
  await seedUser(email, 'oldpass123');

  await sendEmailCode(email, 'reset_password');
  const code = await latestCode(email, 'reset_password');
  resetPasswordByEmail(email, code, 'newpass456');

  // 旧密码立即失效：统一失败文案 2001
  assert.throws(
    () => login({ login_type: 'email_password', email, password: 'oldpass123' }),
    (err: { code?: number }) => err.code === 2001,
  );
  // 新密码可登录
  const result = login({ login_type: 'email_password', email, password: 'newpass456' });
  assert.ok(result.token, '新密码应能登录并签发 token');
});

test('防枚举：邮箱未注册时重置抛 2102（与验证码错误同文案）', async () => {
  const { resetPasswordByEmail } = await import('./service.js');
  const { EMAIL_CODE_INVALID } = await import('./verification/email-verification.service.js');
  assert.throws(
    () => resetPasswordByEmail('no-such-user@test.com', '123456', 'newpass456'),
    (err: { code?: number; message?: string }) => {
      assert.equal(err.code, EMAIL_CODE_INVALID);
      assert.equal(err.message, '邮箱验证码错误或已过期');
      return true;
    },
  );
});

test('一次性码：重置成功后同一验证码不可复用（2102）', async () => {
  const { sendEmailCode, EMAIL_CODE_INVALID } = await import(
    './verification/email-verification.service.js'
  );
  const { resetPasswordByEmail } = await import('./service.js');
  const email = 'reset-once@test.com';
  await seedUser(email, 'oldpass123');

  await sendEmailCode(email, 'reset_password');
  const code = await latestCode(email, 'reset_password');
  resetPasswordByEmail(email, code, 'newpass456');
  assert.throws(
    () => resetPasswordByEmail(email, code, 'another789'),
    (err: { code?: number }) => err.code === EMAIL_CODE_INVALID,
  );
});

test('场景隔离：login 场景的验证码不能用于 reset_password', async () => {
  const { sendEmailCode, EMAIL_CODE_INVALID } = await import(
    './verification/email-verification.service.js'
  );
  const { resetPasswordByEmail } = await import('./service.js');
  const email = 'reset-scene@test.com';
  await seedUser(email, 'oldpass123');

  await sendEmailCode(email, 'login');
  const code = await latestCode(email, 'login');
  assert.throws(
    () => resetPasswordByEmail(email, code, 'newpass456'),
    (err: { code?: number }) => err.code === EMAIL_CODE_INVALID,
  );
});

test('密码强度：弱密码被 password-policy 拦截（≥8 位含字母数字）', async () => {
  const { passwordPolicyError } = await import('../../common/password-policy.js');
  assert.equal(passwordPolicyError('short1'), '密码至少 8 位');
  assert.equal(passwordPolicyError('onlyletters'), '密码需同时包含字母和数字');
  assert.equal(passwordPolicyError('12345678'), '密码需同时包含字母和数字');
  assert.equal(passwordPolicyError('goodpass1'), null);
});

test('更改邮箱：换绑后旧邮箱不可登录、新邮箱可登录', async () => {
  const { sendEmailCode } = await import('./verification/email-verification.service.js');
  const { changeEmail } = await import('../account/service.js');
  const { login } = await import('./service.js');
  const oldEmail = 'change-old@test.com';
  const newEmail = 'change-new@test.com';
  const userId = await seedUser(oldEmail, 'mypassword1');

  await sendEmailCode(newEmail, 'change_email');
  const code = await latestCode(newEmail, 'change_email');
  changeEmail(userId, newEmail, code);

  // 旧邮箱立即不可登录（email 字段已被覆盖）
  assert.throws(
    () => login({ login_type: 'email_password', email: oldEmail, password: 'mypassword1' }),
    (err: { code?: number }) => err.code === 2001,
  );
  // 新邮箱可登录
  const result = login({ login_type: 'email_password', email: newEmail, password: 'mypassword1' });
  assert.ok(result.token);
});

test('更改邮箱查重：新邮箱已被其他账号占用抛 2105', async () => {
  const { sendEmailCode } = await import('./verification/email-verification.service.js');
  const { changeEmail } = await import('../account/service.js');
  const { ERR_EMAIL_TAKEN } = await import('../../common/messages.js');
  const emailA = 'taken-a@test.com';
  const emailB = 'taken-b@test.com';
  const userA = await seedUser(emailA, 'mypassword1');
  await seedUser(emailB, 'mypassword1');

  await sendEmailCode(emailB, 'change_email');
  const code = await latestCode(emailB, 'change_email');
  assert.throws(
    () => changeEmail(userA, emailB, code),
    (err: { code?: number }) => err.code === ERR_EMAIL_TAKEN,
  );
});
