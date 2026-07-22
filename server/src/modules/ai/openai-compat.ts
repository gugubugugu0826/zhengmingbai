/**
 * 百炼 OpenAI 兼容模式公共底座（阶段 2 R39/R40）。
 * 裸 fetch 调 {baseURL}/chat/completions——视觉（qwen-vl-plus）与文本（qwen-plus）同一个 POST。
 * baseURL 优先 configs 表 ai.base_url，兜底 .env DASHSCOPE_BASE_URL，再兜底业务空间专属域名。
 * 超时 60s，网络/5xx 失败自动重试 1 次（退避 2s）。
 */
import { config } from '../../config.js';
import { getConfig } from '../configs/service.js';
import { BizError } from '../../common/errors.js';

export interface ChatContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContentPart[];
}

export interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

const FALLBACK_BASE_URL =
  'https://ws-nyo2f1ym27hvfsi8.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';

export function dashscopeBaseUrl(): string {
  return getConfig<string>('ai.base_url', config.dashscopeBaseUrl || FALLBACK_BASE_URL);
}

export async function chatCompletion(params: {
  model: string;
  messages: ChatMessage[];
  responseFormatJson?: boolean;
  maxTokens?: number;
}): Promise<ChatResult> {
  if (!config.dashscopeApiKey) {
    throw BizError.ai('AI 服务未配置钥匙，请联系运营处理');
  }
  const url = `${dashscopeBaseUrl().replace(/\/+$/, '')}/chat/completions`;
  const body = JSON.stringify({
    model: params.model,
    messages: params.messages,
    ...(params.responseFormatJson ? { response_format: { type: 'json_object' } } : {}),
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
  });

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2000));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.dashscopeApiKey}`,
        },
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // 4xx 多为请求问题（鉴权/参数），重试无意义直接抛
        if (res.status >= 400 && res.status < 500) {
          throw BizError.ai(`AI 服务返回错误（${res.status}），请稍后再试`);
        }
        throw new Error(`AI HTTP ${res.status}: ${text.slice(0, 200)}`);
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        usage?: ChatUsage;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error('AI 返回内容为空');
      return {
        content,
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      };
    } catch (err) {
      if (err instanceof BizError) throw err;
      lastErr = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw BizError.ai('AI 服务暂时繁忙，请稍后再试');
}

/**
 * 成本估算（阿里云百炼 2026 刊例价，元/百万 token，输入/输出）：
 * qwen-vl-plus ¥1.5 / ¥4.5；qwen-plus ¥0.8 / ¥2；未知模型按 qwen-plus 估。
 */
export function estimateCostYuan(model: string, inputTokens: number, outputTokens: number): number {
  const price = model.includes('vl')
    ? { in: 1.5, out: 4.5 }
    : { in: 0.8, out: 2.0 };
  return (inputTokens * price.in + outputTokens * price.out) / 1_000_000;
}
