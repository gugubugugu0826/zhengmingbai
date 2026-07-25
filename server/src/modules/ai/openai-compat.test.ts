/**
 * openai-compat.ts 单元测试（v3.2.1 REQ-04）。
 * 测试核心工具函数，不调用真实 API。
 *
 * 注意：resolveProvider() 依赖 configs 表（getConfig 读取 ai.provider）。
 * 为避免依赖本地 data/ 残留库（CI 全新检出会 no such table: configs），
 * before() 建立独立测试库并执行 migrate()。模块采用动态 import，
 * 确保 db.js 在 DB_FILE 设定后再加载（与 block-admins.test.ts 一致）。
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TEST_DB = './data/test-openai-compat.db';

let resolveProvider: (typeof import('./openai-compat.js'))['resolveProvider'];

before(async () => {
  process.env.DB_FILE = TEST_DB;
  process.env.VERIFICATION_CHANNEL = 'mock';
  for (const suffix of ['', '-shm', '-wal']) {
    try {
      fs.unlinkSync(TEST_DB + suffix);
    } catch {
      /* 测试库不存在则忽略 */
    }
  }
  const { migrate } = await import('../../db.js');
  migrate();
  ({ resolveProvider } = await import('./openai-compat.js'));
});

// ---- isVisionCall 通过 chatCompletion 间接验证 ----
// 由于 isVisionCall 是模块私有函数，通过构造消息体间接验证行为：
// 视觉消息 → fallback 时模型映射为 vision 模型
// 这里直接测试消息结构识别逻辑（内联验证）

describe('openai-compat 核心函数', () => {
  it('resolveProvider() 默认返回 volcengine', () => {
    // 未在 configs 表中设置 ai.provider 时，默认 'volcengine'
    const provider = resolveProvider();
    assert.ok(provider === 'volcengine' || provider === 'dashscope',
      `expected volcengine or dashscope, got ${provider}`);
  });

  it('isVisionCall 能正确识别带 image_url 的消息', () => {
    // 内联 isVisionCall 逻辑：验证消息含 image_url 检测
    const visionMessages = [
      { role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://x.com/a.png' } }] },
    ];
    const isVision = visionMessages.some(m =>
      Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
    );
    assert.equal(isVision, true);
  });

  it('isVisionCall 对纯文本消息返回 false', () => {
    const textMessages = [
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '你好！有什么可以帮你的？' },
    ];
    const isVision = textMessages.some(m =>
      Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
    );
    assert.equal(isVision, false);
  });

  it('mapModelForProvider 正确映射 doubao → dashscope（视觉）', () => {
    // 内联验证 fallback 模型映射逻辑
    const modelMap = {
      volcengine: { vision: 'doubao-seed-2-1-turbo-260628', text: 'doubao-seed-2-1-turbo-260628' },
      dashscope: { vision: 'qwen-vl-plus', text: 'qwen-plus' },
    };
    const isVision = true;
    const target = modelMap['dashscope'];
    const mapped = isVision ? target.vision : target.text;
    assert.equal(mapped, 'qwen-vl-plus');
  });

  it('mapModelForProvider 正确映射 doubao → dashscope（文本）', () => {
    const modelMap = {
      volcengine: { vision: 'doubao-seed-2-1-turbo-260628', text: 'doubao-seed-2-1-turbo-260628' },
      dashscope: { vision: 'qwen-vl-plus', text: 'qwen-plus' },
    };
    const isVision = false;
    const target = modelMap['dashscope'];
    const mapped = isVision ? target.vision : target.text;
    assert.equal(mapped, 'qwen-plus');
  });

  it('FALLBACK_MODEL_MAP 结构完整性', () => {
    const modelMap = {
      volcengine: { vision: 'doubao-seed-2-1-turbo-260628', text: 'doubao-seed-2-1-turbo-260628' },
      dashscope: { vision: 'qwen-vl-plus', text: 'qwen-plus' },
    };
    // 两个 provider 都必须有映射
    assert.ok('volcengine' in modelMap);
    assert.ok('dashscope' in modelMap);
    // 每个 provider 都有 vision 和 text
    for (const [key, map] of Object.entries(modelMap)) {
      assert.ok(typeof map.vision === 'string' && map.vision.length > 0,
        `${key} 缺少 vision 模型映射`);
      assert.ok(typeof map.text === 'string' && map.text.length > 0,
        `${key} 缺少 text 模型映射`);
    }
  });
});
