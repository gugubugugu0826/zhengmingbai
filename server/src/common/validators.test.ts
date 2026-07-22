/**
 * validators.ts 单元测试（node:test + tsx，零新增依赖）。
 * 运行：cd server && npx tsx --test src/common/validators.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateUsername, validatePassword, validateEmail } from './validators.js';

// ===== validateUsername：2-20 字符，中英文 + 数字 =====

test('validateUsername: 中文/英文/数字组合均通过', () => {
  assert.equal(validateUsername('明白小助手'), null);
  assert.equal(validateUsername('alice2024'), null);
  assert.equal(validateUsername('用户1234'), null);
  assert.equal(validateUsername('ab'), null); // 下界 2 字符
  assert.equal(validateUsername('整明白整整明白整整明白整整明白整明'.repeat(2).slice(0, 20)), null); // 恰好 20
});

test('validateUsername: 长度越界拒绝', () => {
  assert.notEqual(validateUsername('a'), null); // 1 字符
  assert.notEqual(validateUsername(''), null);
  assert.notEqual(validateUsername('整明白整整明白整整明白整整明白整明白'.repeat(2).slice(0, 21)), null); // 21 字符
});

test('validateUsername: 含符号/空格/下划线拒绝', () => {
  assert.notEqual(validateUsername('user name'), null);
  assert.notEqual(validateUsername('user_name'), null);
  assert.notEqual(validateUsername('user@name'), null);
  assert.notEqual(validateUsername('名字！'), null);
});

// ===== validatePassword：≥8 位，含字母 + 数字 =====

test('validatePassword: 合法密码通过', () => {
  assert.equal(validatePassword('abcd1234'), null);
  assert.equal(validatePassword('Passw0rd!'), null);
  assert.equal(validatePassword('a1'.repeat(4)), null); // 恰好 8 位
});

test('validatePassword: 不足 8 位拒绝', () => {
  assert.notEqual(validatePassword('abc123'), null);
  assert.notEqual(validatePassword(''), null);
});

test('validatePassword: 纯字母或纯数字拒绝', () => {
  assert.notEqual(validatePassword('abcdefgh'), null);
  assert.notEqual(validatePassword('12345678'), null);
});

test('validatePassword: 超长拒绝（>64 位）', () => {
  assert.notEqual(validatePassword('a1'.repeat(33)), null);
});

// ===== validateEmail：标准邮箱格式 =====

test('validateEmail: 常见合法邮箱通过', () => {
  assert.equal(validateEmail('guorui@zhengmingbai.cn'), null);
  assert.equal(validateEmail('a.b+tag@sub.example.com'), null);
  assert.equal(validateEmail('user_name@test.org'), null);
});

test('validateEmail: 非法格式拒绝', () => {
  assert.notEqual(validateEmail('notanemail'), null);
  assert.notEqual(validateEmail('a@b'), null); // 域名无点
  assert.notEqual(validateEmail('@no-local.com'), null);
  assert.notEqual(validateEmail('no-domain@'), null);
  assert.notEqual(validateEmail(''), null);
});
