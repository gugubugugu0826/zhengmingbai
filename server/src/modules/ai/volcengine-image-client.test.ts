/**
 * volcengine-image-client.ts 单元测试（node:test + tsx，mock 全局 fetch，零外部调用）。
 * 运行：cd server && npx tsx --test src/modules/ai/volcengine-image-client.test.ts
 *
 * 覆盖点（对应任务书 D-2/D-3 约束）：
 * 1. 单图/多图/纯文生图的 image 字段形态
 * 2. 24h 临时 URL 必须立即下载（fetch 第二次调用）且不返回外链
 * 3. HTTP 错误 / 响应无 URL / 下载失败 / 空图 / 超大图一律抛错
 * 4. 未配置 VOLCENGINE_API_KEY 直接抛错
 */
import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// fetch mock 必须先于被测模块导入（ESM 顶层 await 支持）
interface MockFetchStep {
  ok: boolean;
  status?: number;
  jsonBody?: unknown;
  binaryBody?: Buffer;
  textBody?: string;
}

const state: {
  steps: MockFetchStep[];
  calls: Array<{ url: string; init?: { body?: string } }>;
} = { steps: [], calls: [] };

globalThis.fetch = (async (url: string | URL, init?: { body?: string }) => {
  state.calls.push({ url: String(url), init });
  const step = state.steps.shift();
  if (!step) throw new Error('mock fetch：无剩余应答');
  return {
    ok: step.ok,
    status: step.status ?? (step.ok ? 200 : 500),
    json: async () => step.jsonBody,
    text: async () => step.textBody ?? JSON.stringify(step.jsonBody ?? {}),
    arrayBuffer: async () => {
      const buf = step.binaryBody ?? Buffer.alloc(0);
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    },
  };
}) as typeof fetch;

const { generateFromImages, estimateVolcengineImageCost, DEFAULT_IMAGE_MODEL } = await import(
  './volcengine-image-client.js'
);
const { config } = await import('../../config.js');
const { storage } = await import('../upload/storage.js');
const { migrate } = await import('../../db.js');

// getConfig 依赖 configs 表：测试库可能全新，先跑幂等迁移
migrate();

/** 存储通道桩：不落盘，记录调用并返回固定 cosKey（验证"客户端内部落 COS 返回 cosKey"） */
const STUB_COS_KEY = 'deadbeefdeadbeefdeadbeefdeadbeef.png';
const putObjectCalls: Array<{ bytes: number; ext: string }> = [];
const originalPutObject = storage.putObject.bind(storage);

beforeEach(() => {
  state.steps = [];
  state.calls = [];
  putObjectCalls.length = 0;
  storage.putObject = (async (buffer: Buffer, ext: string) => {
    putObjectCalls.push({ bytes: buffer.length, ext });
    return STUB_COS_KEY;
  }) as typeof storage.putObject;
  // @ts-expect-error 测试期注入 key（config 为 as const，运行期对象可写）
  config.volcEngineApiKey = 'test-ark-key';
});

afterEach(() => {
  storage.putObject = originalPutObject;
  // @ts-expect-error 复位
  config.volcEngineApiKey = '';
});

/** 便捷构造：生成接口成功 + 图片下载成功 */
function arrangeSuccess(imageBytes = Buffer.from('fake-png-bytes')): void {
  state.steps.push(
    { ok: true, jsonBody: { data: [{ url: 'https://temp.volces.com/x.png?expires=24h' }] } },
    { ok: true, binaryBody: imageBytes },
  );
}

test('单图图生图：image 字段为字符串，生成图下载后落存储返回 cosKey', async () => {
  arrangeSuccess();
  const { cosKey } = await generateFromImages('整理台面', ['https://cos.example.com/ref.png']);
  assert.equal(cosKey, STUB_COS_KEY, '必须返回存储通道 cosKey');
  assert.ok(!cosKey.startsWith('http'), '严禁返回火山临时外链（24h 过期）');
  assert.equal(putObjectCalls.length, 1, '客户端内部必须立即落存储');
  assert.equal(putObjectCalls[0].ext, 'png');
  assert.ok(putObjectCalls[0].bytes > 0);
  assert.equal(state.calls.length, 2, '生成 + 下载各一次');
  const body = JSON.parse(state.calls[0].init?.body ?? '{}') as Record<string, unknown>;
  assert.equal(body.model, DEFAULT_IMAGE_MODEL);
  assert.equal(body.image, 'https://cos.example.com/ref.png');
  assert.equal(body.response_format, 'url');
  assert.equal(body.size, '2K');
  assert.equal(body.stream, false);
  assert.equal(body.watermark, false);
  // 第二次调用必须是下载临时 URL
  assert.ok(String(state.calls[1].url).includes('temp.volces.com'));
});

test('多图参考：image 字段为数组', async () => {
  arrangeSuccess();
  await generateFromImages('参考两张图整理', [
    'https://cos.example.com/a.png',
    'https://cos.example.com/b.png',
  ]);
  const body = JSON.parse(state.calls[0].init?.body ?? '{}') as Record<string, unknown>;
  assert.deepEqual(body.image, ['https://cos.example.com/a.png', 'https://cos.example.com/b.png']);
});

test('纯文生图（无参考图）：不传 image 字段', async () => {
  arrangeSuccess();
  await generateFromImages('温馨厨房场景', []);
  const body = JSON.parse(state.calls[0].init?.body ?? '{}') as Record<string, unknown>;
  assert.equal('image' in body, false);
});

test('生成接口 HTTP 错误：抛错并带状态码', async () => {
  state.steps.push({ ok: false, status: 429, textBody: 'rate limited' });
  await assert.rejects(() => generateFromImages('p', ['u']), /HTTP 429/);
  assert.equal(state.calls.length, 1, '接口失败不应尝试下载');
});

test('响应无图片 URL：抛错', async () => {
  state.steps.push({ ok: true, jsonBody: { data: [] } });
  await assert.rejects(() => generateFromImages('p', ['u']), /未返回图片 URL/);
});

test('下载临时图失败：抛错', async () => {
  state.steps.push(
    { ok: true, jsonBody: { data: [{ url: 'https://temp.volces.com/x.png' }] } },
    { ok: false, status: 403, textBody: 'expired' },
  );
  await assert.rejects(() => generateFromImages('p', ['u']), /下载生成图失败 HTTP 403/);
});

test('下载内容为空：抛错', async () => {
  arrangeSuccess(Buffer.alloc(0));
  await assert.rejects(() => generateFromImages('p', ['u']), /为空/);
});

test('下载内容超 8MB：抛错（对齐 worker 既有限制）', async () => {
  arrangeSuccess(Buffer.alloc(8 * 1024 * 1024 + 1));
  await assert.rejects(() => generateFromImages('p', ['u']), /过大/);
});

test('未配置 VOLCENGINE_API_KEY：直接抛错不发请求', async () => {
  // @ts-expect-error 清空 key
  config.volcEngineApiKey = '';
  await assert.rejects(() => generateFromImages('p', ['u']), /未配置/);
  assert.equal(state.calls.length, 0);
});

test('成本占位估算为 ¥0.30/张（待刊例确认）', () => {
  assert.equal(estimateVolcengineImageCost(), 0.3);
});
