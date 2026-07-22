/**
 * 提示词读取（约定：提示词只从 configs 表读 ai.prompt.*，禁止硬编码在业务代码里）。
 * 本文件只做"从配置取提示词"的胶水，默认文案见 configs/seed。
 */
import { getConfig } from '../configs/service.js';

export function getPrompt(stage: 'confirm' | 'analyze' | 'plan'): string {
  return getConfig<string>(`ai.prompt.${stage}`, '');
}
