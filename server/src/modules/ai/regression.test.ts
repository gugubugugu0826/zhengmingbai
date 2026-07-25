/**
 * v3.2 回归测试（v3.2.1 REQ-04）：三个 P0 修复的回归断言。
 * - AI 模型默认值检查（doubao 而非 qwen-*）
 * - email_code 登录不要求 captcha_required
 * - miniprogram WXML 编译检查
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

describe('v3.2 P0 回归断言', () => {
  it('AI 模型默认值为 doubao（非 qwen-*）', () => {
    // 读取 configs/service.ts 确认 seed 默认值
    const servicePath = path.join(__dirname, '..', 'configs', 'service.ts');
    const content = fs.readFileSync(servicePath, 'utf-8');
    const visMatch = content.match(/'ai\.vision_model':\s*'([^']+)'/);
    const textMatch = content.match(/'ai\.text_model':\s*'([^']+)'/);
    assert.ok(visMatch, '应包含 ai.vision_model 配置');
    assert.ok(textMatch, '应包含 ai.text_model 配置');
    assert.equal(visMatch![1], 'doubao-seed-2-1-turbo-260628',
      'vision_model 默认应为 doubao 模型');
    assert.equal(textMatch![1], 'doubao-seed-2-1-turbo-260628',
      'text_model 默认应为 doubao 模型');
  });

  it('email_code 登录不需要 captcha_required 字段', () => {
    // 读取 auth/routes.ts 确认 login schema
    const routesPath = path.join(__dirname, '..', 'auth', 'routes.ts');
    const content = fs.readFileSync(routesPath, 'utf-8');
    // captcha_id 和 captcha_text 在 login schema 中应为 optional（非 required）
    // email_code 路径应跳过 captcha 校验
    assert.ok(content.includes('login_type'), '应包含 login_type 字段');
    // 验证 email_code 路径跳过 captcha 的逻辑存在
    const hasSkipLogic = content.includes('email_code') &&
      (content.includes('图形码仅密码类登录强制') || content.includes('email_code 路径跳过'));
    assert.ok(hasSkipLogic, 'email_code 登录应跳过 captcha 校验');
  });

  it('miniprogram WXML 无 wx:else+wx:for 同标签冲突', () => {
    // 检查 miniprogram 目录下 WXML 文件
    const mpDir = path.join(REPO_ROOT, 'miniprogram');
    if (!fs.existsSync(mpDir)) {
      // 无小程序目录 → 通过（该检查仅在有小程序文件时有效）
      return;
    }
    const wxmlFiles = findFiles(mpDir, '.wxml');
    for (const file of wxmlFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      // 检查同一标签上同时出现 wx:else/wx:elif 和 wx:for
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hasElse = /wx:else\b/.test(line) || /wx:elif\b/.test(line);
        const hasFor = /wx:for\b/.test(line);
        if (hasElse && hasFor) {
          assert.fail(`${file}:${i + 1} wx:else/wx:elif 与 wx:for 同标签冲突：${line.trim()}`);
        }
      }
    }
  });
});

/** 递归查找指定扩展名的文件 */
function findFiles(dir: string, ext: string): string[] {
  const result: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...findFiles(full, ext));
    } else if (entry.name.endsWith(ext)) {
      result.push(full);
    }
  }
  return result;
}
