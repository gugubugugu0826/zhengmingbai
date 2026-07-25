/**
 * 安全基础测试（v3.2.1 REQ-04）。
 * - JWT 伪造检测
 * - SQL 注入防护
 * - 限流验证
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { DatabaseSync } from 'node:sqlite';

describe('JWT 安全', () => {
  const correctSecret = 'correct-secret-for-testing';
  const wrongSecret = 'wrong-secret-attacker-guessed';

  it('用错误密钥签发的 token 应被拒绝', () => {
    // 用正确密钥签发
    const goodToken = jwt.sign({ uid: 1, role: 'user', scope: 'user' }, correctSecret,
      { algorithm: 'HS256', expiresIn: '1h' });

    // 用正确密钥验证 → 通过
    const goodPayload = jwt.verify(goodToken, correctSecret, { algorithms: ['HS256'] }) as {
      uid: number;
    };
    assert.equal(goodPayload.uid, 1);

    // 用错误密钥验证 → 抛错
    assert.throws(() => {
      jwt.verify(goodToken, wrongSecret, { algorithms: ['HS256'] });
    }, { message: /invalid signature|signature/ });
  });

  it('alg=none 攻击被拒绝', () => {
    // 构造 alg=none 的 token（经典 JWT 攻击手法）
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ uid: 1, role: 'admin' })).toString('base64url');
    const noneToken = `${header}.${payload}.`;

    assert.throws(() => {
      jwt.verify(noneToken, correctSecret, { algorithms: ['HS256'] });
    });
  });
});

describe('SQL 注入防护', () => {
  it('node:sqlite prepared statement 防止注入', () => {
    // node:sqlite 的 prepared statement 使用参数化查询，
    // 恶意输入作为字面值处理，不会改变 SQL 语义
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT)');
      const stmt = db.prepare('INSERT INTO test (name) VALUES (?)');
      stmt.run("test'); DROP TABLE test; --");

      // 表仍然存在（DROP TABLE 未被执行）
      const row = db.prepare("SELECT name FROM test WHERE name = ?").get(
        "test'); DROP TABLE test; --"
      ) as { name: string } | undefined;
      assert.ok(row, '恶意输入作为数据被正确存储');
      assert.equal(row!.name, "test'); DROP TABLE test; --");
    } finally {
      db.close();
    }
  });

  it('OR 1=1 注入不改变查询语义', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)');
      db.prepare('INSERT INTO users (name) VALUES (?)').run('alice');
      db.prepare('INSERT INTO users (name) VALUES (?)').run('bob');

      // 注入尝试：name = "' OR 1=1 --"
      const stmt = db.prepare('SELECT * FROM users WHERE name = ?');
      const row = stmt.get("' OR 1=1 --") as { id: number } | undefined;
      // prepared statement 把整个字符串作为值匹配，不当作 SQL 执行
      assert.equal(row, undefined, '注入输入不应该匹配到任何行');
    } finally {
      db.close();
    }
  });
});

describe('限流验证', () => {
  it('限流中间件模块存在且可导入', async () => {
    // 验证限流中间件文件存在并可加载
    const mod = await import('./middleware/rateLimit.js');
    assert.ok(typeof mod.globalLimiter === 'function', 'globalLimiter 应为中间件函数');
    assert.ok(typeof mod.sensitiveLimiter === 'function', 'sensitiveLimiter 应为中间件函数');
  });
});
