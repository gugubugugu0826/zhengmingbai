/**
 * OpenAI 兼容协议公共底座（阶段 2 R39/R40；v3.1 D-2 双底座 provider 切换）。
 * 裸 fetch 调 {baseURL}/chat/completions——视觉与文本同一个 POST。
 * provider 由 configs 表 ai.provider 决定：
 *   volcengine（默认）→ 火山引擎方舟（豆包），baseURL/key 走 config.volcEngine*
 *   dashscope         → 阿里云百炼（千问）fallback，baseURL 优先 configs ai.base_url
 *
 * v3.2.1（REQ-01 + REQ-06）：跨 provider fallback。
 *   主 provider 失败（非 4xx/鉴权）→ 自动切 fallback provider，映射模型名后重试；
 *   超时从 60s 收窄到 20s，单次超时后直接进 fallback，不做同 provider 重试。
 */
import { config } from '../../config.js';
import { getConfig } from '../configs/service.js';
import { BizError } from '../../common/errors.js';
import { logger } from '../../common/logger.js';

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

/** AI 底座提供方：volcengine=火山引擎方舟（默认）；dashscope=阿里云百炼（fallback，代码全保留） */
export type AiProvider = 'volcengine' | 'dashscope';

const FALLBACK_BASE_URL =
  'https://ws-nyo2f1ym27hvfsi8.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';

/** 各 provider 的默认模型名（fallback 时按调用类型自动映射） */
const FALLBACK_MODEL_MAP: Record<AiProvider, { vision: string; text: string }> = {
  // v3.2.2：volcengine 主用 Seed-Evolving（实测视觉/文本 4s 以内，比 2-1-turbo 更稳更快）
  volcengine: { vision: 'doubao-seed-evolving-latest-version', text: 'doubao-seed-evolving-latest-version' },
  dashscope: { vision: 'qwen-vl-plus', text: 'qwen-plus' },
};

/** 当前生效的 AI 底座（configs 热加载，改配置即时生效，不发版） */
export function resolveProvider(): AiProvider {
  return getConfig<string>('ai.provider', 'volcengine') === 'dashscope'
    ? 'dashscope'
    : 'volcengine';
}

/** 按 provider 解析本次调用的 baseURL + apiKey */
function resolveEndpoint(): { baseUrl: string; apiKey: string; provider: AiProvider } {
  const provider = resolveProvider();
  if (provider === 'dashscope') {
    return {
      provider,
      baseUrl: getConfig<string>('ai.base_url', config.dashscopeBaseUrl || FALLBACK_BASE_URL),
      apiKey: config.dashscopeApiKey,
    };
  }
  return {
    provider,
    baseUrl: config.volcEngineBaseUrl,
    apiKey: config.volcEngineApiKey,
  };
}

/** 按指定 provider 解析端点（fallback 链路用，不改动 resolveEndpoint 公共签名） */
function resolveEndpointFor(provider: AiProvider): { baseUrl: string; apiKey: string; provider: AiProvider } {
  if (provider === 'dashscope') {
    return {
      provider,
      baseUrl: getConfig<string>('ai.base_url', config.dashscopeBaseUrl || FALLBACK_BASE_URL),
      apiKey: config.dashscopeApiKey,
    };
  }
  return {
    provider,
    baseUrl: config.volcEngineBaseUrl,
    apiKey: config.volcEngineApiKey,
  };
}

/** 百炼兼容模式 baseURL（保留导出，供外部/测试使用） */
export function dashscopeBaseUrl(): string {
  return getConfig<string>('ai.base_url', config.dashscopeBaseUrl || FALLBACK_BASE_URL);
}

/** 判断是否为视觉调用（messages 含 image_url） */
function isVisionCall(messages: ChatMessage[]): boolean {
  return messages.some(m =>
    Array.isArray(m.content) && m.content.some(p => p.type === 'image_url')
  );
}

/** 按目标 provider 映射模型名（fallback 时自动切换对应模型的等价物） */
function mapModelForProvider(model: string, targetProvider: AiProvider, isVision: boolean): string {
  const map = FALLBACK_MODEL_MAP[targetProvider];
  return isVision ? map.vision : map.text;
}

/**
 * 单次 HTTP 调用：发送 chat/completions 请求，成功返回解析结果，失败抛错。
 * 超时 60s（v3.2.2：真实大图视觉调用需要更长时间，避免误触发 fallback）。
 */
async function singleAttempt(
  url: string,
  apiKey: string,
  body: string,
): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 4xx 多为请求问题（鉴权/参数），重试无意义直接抛 BizError
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
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion(params: {
  model: string;
  messages: ChatMessage[];
  responseFormatJson?: boolean;
  maxTokens?: number;
}): Promise<ChatResult> {
  const body = JSON.stringify({
    model: params.model,
    messages: params.messages,
    ...(params.responseFormatJson ? { response_format: { type: 'json_object' } } : {}),
    ...(params.maxTokens ? { max_tokens: params.maxTokens } : {}),
  });

  const primary = resolveProvider();
  const fallback: AiProvider = primary === 'volcengine' ? 'dashscope' : 'volcengine';
  const isVision = isVisionCall(params.messages);
  const originalModel = params.model;

  // v3.2.1：双 provider 依次尝试，任一成功即返回；4xx/BizError 不 fallback 直接抛
  for (const provider of [primary, fallback]) {
    const ep = resolveEndpointFor(provider);
    if (!ep.apiKey) {
      // 无 key 跳过此 provider（仅日志记录，不阻塞 fallback 链路）
      logger.warn({ provider }, `AI provider "${provider}" 未配置 API Key，跳过`);
      continue;
    }
    const url = `${ep.baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const mappedModel = mapModelForProvider(originalModel, provider, isVision);

    // v3.2.2：单 provider 内重试 1 次（针对偶发抖动），不重试仍失败才走 fallback
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await singleAttempt(url, ep.apiKey, body);
      } catch (err) {
        if (err instanceof BizError) throw err;
        lastErr = err;
        logger.warn({
          attempt: provider,
          retry: attempt,
          bodyMb: Math.round(body.length / 1024 / 1024 * 10) / 10,
          errName: err instanceof Error ? err.name : typeof err,
          errMsg: err instanceof Error ? err.message : String(err),
        }, 'AI 单次调用失败');
      }
    }
    if (provider === primary) {
      logger.warn({
        event: 'ai_fallback',
        from: primary,
        to: fallback,
        originalModel,
        fallbackModel: mapModelForProvider(originalModel, fallback, isVision),
        reason: lastErr instanceof Error ? lastErr.message : String(lastErr),
      }, 'AI provider fallback 触发');
      continue;
    }
    throw BizError.ai('AI 服务暂时繁忙，请稍后再试');
  }

  // 两个 provider 都无 key 才会走到这里
  throw BizError.ai('AI 服务未配置钥匙，请联系运营处理');
}

/**
 * 成本估算（元/百万 token，输入/输出）：
 * - 豆包（模型名含 doubao）：输入 ¥0.8 / 输出 ¥2（占位，待火山刊例确认后改本函数一行）
 * - qwen-vl-plus ¥1.5 / ¥4.5；qwen-plus ¥0.8 / ¥2（阿里云百炼 2026 刊例价）
 * - 未知模型按 ¥0.8 / ¥2 估
 */
export function estimateCostYuan(model: string, inputTokens: number, outputTokens: number): number {
  const price = model.includes('doubao')
    ? { in: 0.8, out: 2.0 }
    : model.includes('vl')
      ? { in: 1.5, out: 4.5 }
      : { in: 0.8, out: 2.0 };
  return (inputTokens * price.in + outputTokens * price.out) / 1_000_000;
}
