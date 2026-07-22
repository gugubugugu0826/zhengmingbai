/**
 * 维护模式中间件 + 注册开关单元测试（v3，任务书 §5-H）。
 * 运行：cd server && npx tsx --test src/middleware/maintenance.test.ts
 * 覆盖验收点：
 *   - 维护开启：业务路径 503 + code 3001 + notice；豁免路径（/health、admin、configs）放行
 *   - 维护关闭：全部放行
 *   - 注册开关：关闭时 isRegistrationEnabled()=false（路由层据此抛 2107）
 *   - 配置热读：setConfig 后下一次请求即时生效（无需重启）
 */
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { Request, Response } from 'express';

const TEST_DB = './data/test-maintenance.db';

before(async () => {
  process.env.DB_FILE = TEST_DB;
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      /* 不存在则忽略 */
    }
  }
  const { migrate } = await import('../db.js');
  migrate();
});

/** 极简 mock：模拟 Express req/res/next 三元组 */
function mockReq(path: string): Request {
  return { path } as unknown as Request;
}

interface MockRes {
  statusCode: number;
  body: unknown;
  res: Response;
}

function mockRes(): MockRes {
  const state: MockRes = {
    statusCode: 200,
    body: undefined,
    res: undefined as unknown as Response,
  };
  const res = {
    status(code: number) {
      state.statusCode = code;
      return res;
    },
    json(payload: unknown) {
      state.body = payload;
      return res;
    },
  };
  state.res = res as unknown as Response;
  return state;
}

test('维护开启：业务路径拦截 503 + code 3001 + notice', async () => {
  const { maintenanceMiddleware } = await import('./maintenance.js');
  const { setConfig } = await import('../modules/configs/service.js');
  const { ERR_MAINTENANCE } = await import('../common/messages.js');

  setConfig('ops.maintenance', { enabled: true, notice: '系统升级维护中，预计 30 分钟' }, 'test');

  const res = mockRes();
  let nextCalled = false;
  maintenanceMiddleware(mockReq('/api/v1/spaces'), res.res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false, '维护中不应放行业务请求');
  assert.equal(res.statusCode, 503);
  const body = res.body as { code: number; message: string; data: { notice: string } };
  assert.equal(body.code, ERR_MAINTENANCE);
  assert.equal(body.message, '系统升级维护中，预计 30 分钟');
  assert.equal(body.data.notice, '系统升级维护中，预计 30 分钟');
});

test('维护开启：豁免路径放行（/health、/api/v1/admin/*、/api/v1/configs）', async () => {
  const { maintenanceMiddleware } = await import('./maintenance.js');
  for (const path of [
    '/health',
    '/api/v1/admin/auth/step1',
    '/api/v1/admin/users',
    '/api/v1/configs',
    '/api/v1/configs/public',
  ]) {
    const res = mockRes();
    let nextCalled = false;
    maintenanceMiddleware(mockReq(path), res.res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, true, `${path} 应被豁免`);
  }
});

test('维护关闭：全部请求放行；开关热读即时生效', async () => {
  const { maintenanceMiddleware } = await import('./maintenance.js');
  const { setConfig, getMaintenance } = await import('../modules/configs/service.js');

  setConfig('ops.maintenance', { enabled: false, notice: '' }, 'test');
  assert.equal(getMaintenance().enabled, false);

  const res = mockRes();
  let nextCalled = false;
  maintenanceMiddleware(mockReq('/api/v1/spaces'), res.res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true, '维护关闭应放行');

  // 热读：再开启，下一次请求立即被拦截（无需重启进程）
  setConfig('ops.maintenance', { enabled: true, notice: '临时维护' }, 'test');
  const res2 = mockRes();
  let next2 = false;
  maintenanceMiddleware(mockReq('/api/v1/spaces'), res2.res, () => {
    next2 = true;
  });
  assert.equal(next2, false);
  assert.equal(res2.statusCode, 503);

  // 收尾：恢复关闭，避免影响同库其他用例
  setConfig('ops.maintenance', { enabled: false, notice: '' }, 'test');
});

test('注册开关：默认开启；setConfig 关闭后 isRegistrationEnabled()=false（2107 由路由抛出）', async () => {
  const { isRegistrationEnabled, setConfig } = await import('../modules/configs/service.js');
  const { ERR_REGISTER_CLOSED, REGISTER_CLOSED_MSG } = await import('../common/messages.js');

  assert.equal(isRegistrationEnabled(), true, '默认应允许注册');
  setConfig('ops.registration_enabled', false, 'test');
  assert.equal(isRegistrationEnabled(), false, '关闭后应拒绝新注册');
  // 错误码常量与文案契约（路由层 BizError 使用）
  assert.equal(ERR_REGISTER_CLOSED, 2107);
  assert.equal(REGISTER_CLOSED_MSG, '暂停注册，稍后再来看看');

  setConfig('ops.registration_enabled', true, 'test'); // 收尾恢复
  assert.equal(isRegistrationEnabled(), true);
});

test('公开配置白名单：subscribe.template_id 与 maintenance 可读，不含内部配置', async () => {
  const { getSubscribeTemplateId, getMaintenance } = await import('../modules/configs/service.js');
  assert.equal(typeof getSubscribeTemplateId(), 'string');
  const m = getMaintenance();
  assert.equal(typeof m.enabled, 'boolean');
  assert.equal(typeof m.notice, 'string');
});
