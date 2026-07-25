/**
 * t2i-client.ts 单元测试（v3.2.1 REQ-04）。
 * 测试 pickIllustration、buildT2iPrompt、buildImagePrompt 等工具函数。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  pickIllustration,
  buildT2iPrompt,
  buildImagePrompt,
} from './t2i-client.js';

describe('pickIllustration 空间类型匹配', () => {
  it('kitchen → kitchen.svg', () => {
    assert.equal(pickIllustration('kitchen'), '/api/v1/illustrations/kitchen.svg');
  });

  it('bedroom → bedroom.svg', () => {
    assert.equal(pickIllustration('bedroom'), '/api/v1/illustrations/bedroom.svg');
  });

  it('wardrobe → wardrobe.svg', () => {
    assert.equal(pickIllustration('wardrobe'), '/api/v1/illustrations/wardrobe.svg');
  });

  it('unknown → living.svg（默认回落）', () => {
    assert.equal(pickIllustration('attic'), '/api/v1/illustrations/living.svg');
  });

  it('study → bedroom.svg（映射）', () => {
    assert.equal(pickIllustration('study'), '/api/v1/illustrations/bedroom.svg');
  });

  it('bathroom → bedroom.svg（映射）', () => {
    assert.equal(pickIllustration('bathroom'), '/api/v1/illustrations/bedroom.svg');
  });
});

describe('buildT2iPrompt 提示词组装', () => {
  it('拼接风格前缀 + 截断描述', () => {
    const desc = '客厅沙发靠墙摆放，茶几上无杂物，电视柜整洁。';
    const prompt = buildT2iPrompt(desc);
    assert.ok(prompt.includes(desc), '应包含完整描述（未超过 200 字）');
    assert.ok(prompt.length > desc.length, '应有风格前缀');
  });

  it('超过 200 字截断', () => {
    const longDesc = '整'.repeat(250);
    const prompt = buildT2iPrompt(longDesc);
    assert.ok(prompt.length < longDesc.length + 100, '超过 200 字应截断');
  });
});

describe('buildImagePrompt 图+文提示词组装', () => {
  it('包含方案描述', () => {
    const desc = '整理后的客厅干净整洁';
    const prompt = buildImagePrompt(desc);
    assert.ok(prompt.includes(desc));
  });

  it('包含关键动作', () => {
    const actions = ['把书放回书架', '把衣服叠好放进衣柜'];
    const prompt = buildImagePrompt('整洁的卧室', actions);
    assert.ok(prompt.includes('把书放回书架'));
    assert.ok(prompt.includes('把衣服叠好放进衣柜'));
  });

  it('超过 10 个动作截断', () => {
    const actions = Array.from({ length: 15 }, (_, i) => `动作${i + 1}`);
    const prompt = buildImagePrompt('整洁', actions);
    // 第 11 个动作不应出现
    assert.ok(!prompt.includes('动作11'));
    // 第 10 个动作应出现
    assert.ok(prompt.includes('动作10'));
  });

  it('动作列表为空时降级', () => {
    const prompt = buildImagePrompt('整洁的卧室', []);
    assert.ok(prompt.includes('（按整理方案执行）'));
  });
});
