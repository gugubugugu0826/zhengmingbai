/**
 * mask.ts 单元测试（node:test + tsx，零新增依赖）。
 * 运行：cd server && npx tsx --test src/common/mask.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maskPhone, maskEmail } from './mask.js';

test('maskPhone: 标准 11 位手机号 → 139****1111 格式', () => {
  assert.equal(maskPhone('13911111111'), '139****1111');
  assert.equal(maskPhone('13800000000'), '138****0000');
});

test('maskPhone: 带首尾空白可容忍', () => {
  assert.equal(maskPhone('  13912345678 '), '139****5678');
});

test('maskPhone: null/undefined → null', () => {
  assert.equal(maskPhone(null), null);
  assert.equal(maskPhone(undefined), null);
});

test('maskPhone: 过短输入打码兜底（不泄露原文）', () => {
  assert.equal(maskPhone('123'), '****');
  assert.equal(maskPhone(''), '****');
});

test('maskEmail: 标准邮箱 → 首字符+***@域名', () => {
  assert.equal(maskEmail('guorui@zhengmingbai.cn'), 'g***@zhengmingbai.cn');
  assert.equal(maskEmail('a@example.com'), 'a***@example.com');
});

test('maskEmail: null/undefined → null', () => {
  assert.equal(maskEmail(null), null);
  assert.equal(maskEmail(undefined), null);
});

test('maskEmail: 无 @ 的非法输入打码兜底', () => {
  assert.equal(maskEmail('notanemail'), '**********');
  assert.equal(maskEmail('@no-local.com'), '*************'); // 13 字符全打码
});
