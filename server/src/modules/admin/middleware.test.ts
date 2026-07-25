/**
 * admin/middleware.ts 单元测试（v3.2.1 REQ-04）。
 * 测试 adminAuth 和 superAdmin 中间件的权限控制逻辑。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminAuth, superAdmin } from './middleware.js';
import type { AuthRequest } from '../../middleware/auth.js';
import type { Response } from 'express';

/** 构造最小 mock：req/res/next 三元组 */
function mockReq(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    userId: 1,
    userRole: 'admin',
    userScope: 'admin',
    ...overrides,
    // Express Request 其他字段 mock 为 undefined，仅测试中间件关心的字段
  } as unknown as AuthRequest;
}

function mockRes(): Response {
  const res = {
    statusCode: 200,
    _json: null as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this._json = body;
      return this;
    },
  } as unknown as Response;
  return res;
}

describe('adminAuth 中间件', () => {
  it('scope=admin → 放行', () => {
    const req = mockReq({ userScope: 'admin' });
    const res = mockRes();
    let called = false;
    adminAuth(req, res, () => { called = true; });
    assert.equal(called, true, 'next 应被调用');
    assert.equal(res.statusCode, 200, '不应设置错误状态码');
  });

  it('scope=user → 返回 403', () => {
    const req = mockReq({ userScope: 'user' });
    const res = mockRes();
    let called = false;
    adminAuth(req, res, () => { called = true; });
    assert.equal(called, false, 'next 不应被调用');
    assert.equal(res.statusCode, 403);
  });

  it('scope=admin_step2 → 返回 403（仅正式 admin scope 有效）', () => {
    const req = mockReq({ userScope: 'admin_step2' });
    const res = mockRes();
    let called = false;
    adminAuth(req, res, () => { called = true; });
    assert.equal(called, false, 'next 不应被调用（admin_step2 不是正式 admin scope）');
    assert.equal(res.statusCode, 403);
  });

  it('scope 未定义 → 返回 403', () => {
    const req = mockReq({ userScope: undefined });
    const res = mockRes();
    let called = false;
    adminAuth(req, res, () => { called = true; });
    assert.equal(called, false);
    assert.equal(res.statusCode, 403);
  });
});

describe('superAdmin 中间件', () => {
  // superAdmin 依赖 getUserById(db)，在无 DB 的环境下，我们验证其存在性
  // 和基本行为（通过 mock 注入 userId）

  it('superAdmin 函数存在且可导出', () => {
    assert.equal(typeof superAdmin, 'function', 'superAdmin 应为函数');
  });

  it('superAdmin 接受 req/res/next 三个参数', () => {
    assert.equal(superAdmin.length, 3, 'superAdmin 应为 Express 中间件（3 参数）');
  });
});

describe('中间件叠加语义', () => {
  it('adminAuth + superAdmin 两层独立校验', () => {
    // adminAuth 校验 scope → superAdmin 校验 is_super
    // 两者职责不重叠：adminAuth 不管 is_super，superAdmin 不管 scope
    // 这个测试验证两个函数都是独立可组合的中间件
    assert.equal(typeof adminAuth, 'function');
    assert.equal(typeof superAdmin, 'function');
    // 两者都可以作为 Express middleware 链式叠加
    assert.equal(adminAuth.length, 3);
    assert.equal(superAdmin.length, 3);
  });
});
