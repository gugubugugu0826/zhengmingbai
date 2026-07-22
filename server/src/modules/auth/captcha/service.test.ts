/**
 * captcha 服务单元测试（临时库，mock 无关，直接落真实 SQLite 临时文件）。
 * 运行：cd server && set DB_FILE=./data/test-captcha.db && npx tsx --test src/modules/auth/captcha/service.test.ts
 * 覆盖验收点：SVG 生成 / 一次性 / 过期 / CAPTCHA_BYPASS 不配时无绕过路径、配上后可绕过。
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TEST_DB = './data/test-captcha.db';

before(async () => {
  process.env.DB_FILE = TEST_DB;
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      /* 不存在则忽略 */
    }
  }
  // 建表（含 v2.2 新表 captchas/email_verifications）
  const { migrate } = await import('../../../db.js');
  migrate();
});

test('createCaptcha: 生成 uuid + SVG dataURL，且带干扰线', async () => {
  const { createCaptcha } = await import('./service.js');
  const { id, svgDataURL } = createCaptcha();
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.ok(svgDataURL.startsWith('data:image/svg+xml;base64,'));
  const svg = Buffer.from(svgDataURL.split(',')[1], 'base64').toString('utf-8');
  assert.ok(svg.includes('<svg'), '应包含 SVG 标签');
  assert.ok(svg.includes('<path'), '应包含干扰线/字符 path');
});

test('verifyCaptcha: 正确答案通过，且一次性作废', async () => {
  const { createCaptcha, verifyCaptcha } = await import('./service.js');
  const { db } = await import('../../../db.js');
  const { id } = createCaptcha();
  const row = db.prepare(`SELECT text FROM captchas WHERE id = ?`).get(id) as { text: string };

  assert.equal(verifyCaptcha(id, row.text), true, '正确答案应通过');
  assert.equal(verifyCaptcha(id, row.text), false, '同一码二次校验必须失败（一次性）');
});

test('verifyCaptcha: 错误答案失败且同样作废记录', async () => {
  const { createCaptcha, verifyCaptcha } = await import('./service.js');
  const { db } = await import('../../../db.js');
  const { id } = createCaptcha();
  const row = db.prepare(`SELECT text FROM captchas WHERE id = ?`).get(id) as { text: string };
  const wrong = row.text === 'aaaaaa' ? 'bbbbbb' : 'aaaaaa';

  assert.equal(verifyCaptcha(id, wrong), false, '错误答案不通过');
  const used = db.prepare(`SELECT used FROM captchas WHERE id = ?`).get(id) as { used: number };
  assert.equal(used.used, 1, '校验失败后记录也应作废');
});

test('verifyCaptcha: 不存在的 id / 空输入返回 false', async () => {
  const { verifyCaptcha } = await import('./service.js');
  assert.equal(verifyCaptcha('no-such-id', 'abc123'), false);
  assert.equal(verifyCaptcha('', ''), false);
});

test('verifyCaptcha: 大小写不敏感', async () => {
  const { createCaptcha, verifyCaptcha } = await import('./service.js');
  const { db } = await import('../../../db.js');
  const { id } = createCaptcha();
  const row = db.prepare(`SELECT text FROM captchas WHERE id = ?`).get(id) as { text: string };
  assert.equal(verifyCaptcha(id, row.text.toUpperCase()), true);
});

test('verifyCaptcha: CAPTCHA_BYPASS 不配时无绕过路径', async () => {
  delete process.env.CAPTCHA_BYPASS;
  const { createCaptcha, verifyCaptcha } = await import('./service.js');
  const { id } = createCaptcha();
  // 任何输入都不应绕过（除非碰巧猜中真实答案，概率 1/32^6，测试用明显非法值）
  assert.equal(verifyCaptcha(id, 'BYPASS-MAGIC-VALUE'), false);
});

test('verifyCaptcha: 配上 CAPTCHA_BYPASS 后输入该值返回 true（不消耗真实记录）', async () => {
  process.env.CAPTCHA_BYPASS = 'qa-magic-2026';
  try {
    const { createCaptcha, verifyCaptcha } = await import('./service.js');
    const { id } = createCaptcha();
    assert.equal(verifyCaptcha(id, 'qa-magic-2026'), true, '命中后门值应直接通过');
    assert.equal(verifyCaptcha(id, 'qa-magic-2026'), true, '后门路径不消耗记录，可重复');
    // 后门值之外仍走正常校验
    assert.equal(verifyCaptcha('nonexistent', 'wrong-value'), false);
  } finally {
    delete process.env.CAPTCHA_BYPASS;
  }
});

test('cleanExpiredCaptchas: 仅清理过期记录', async () => {
  const { createCaptcha, cleanExpiredCaptchas } = await import('./service.js');
  const { db } = await import('../../../db.js');
  const { id: freshId } = createCaptcha();
  // 手工塞一条已过期的
  db.prepare(`INSERT INTO captchas (id, text, used, expires_at) VALUES (?, ?, 0, ?)`).run(
    '00000000-0000-0000-0000-000000000000',
    'abc123',
    '2000-01-01T00:00:00.000Z',
  );
  const cleaned = cleanExpiredCaptchas();
  assert.ok(cleaned >= 1, '至少清理掉过期记录');
  const fresh = db.prepare(`SELECT id FROM captchas WHERE id = ?`).get(freshId);
  assert.ok(fresh, '未过期记录应保留');
});
