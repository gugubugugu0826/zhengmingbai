/**
 * 示意插画（R5/R44）。
 * 默认 ai.t2i_enabled=false：按空间类型匹配预生成素材插画（本地 SVG，成本 0，绝不翻车）。
 * 开关打开后按 after_state_desc 调通义万相（DashScope 原生异步任务），任何失败回退素材图。
 */
import { config } from '../../config.js';
import { getConfig } from '../configs/service.js';
import { logAiCost, logger } from '../../common/logger.js';

/** 素材图按空间类型匹配（10 类空间 → 4 张手绘风 SVG 场景，生成逻辑见 share/card-render） */
const SCENE_BY_SPACE: Record<string, string> = {
  kitchen: 'kitchen',
  bedroom: 'bedroom',
  wardrobe: 'wardrobe',
  study: 'bedroom',
  bathroom: 'bedroom',
  living: 'living',
  rental: 'bedroom',
  office: 'living',
  shop: 'living',
  warehouse: 'living',
};

export function pickIllustration(spaceType: string): string {
  const scene = SCENE_BY_SPACE[spaceType] ?? 'living';
  return `/api/v1/illustrations/${scene}.svg`;
}

/** 通义万相 baseURL：从兼容模式地址推导原生 API 地址（…/compatible-mode/v1 → …/api/v1） */
function nativeBaseUrl(): string {
  const compat = getConfig<string>('ai.base_url', config.dashscopeBaseUrl);
  return compat.replace(/\/compatible-mode\/v1\/?$/, '/api/v1');
}

/** 通义万相异步文生图（P1 基础版）：创建任务 → 轮询取图。约 ¥0.14/张。 */
async function wanxText2Image(prompt: string): Promise<string> {
  const base = nativeBaseUrl();
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${config.dashscopeApiKey}`,
    'X-DashScope-Async': 'enable',
  };
  const createRes = await fetch(`${base}/services/aigc/text2image/image-synthesis`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'wanx2.1-t2i-turbo',
      input: { prompt },
      parameters: { size: '1024*1024', n: 1 },
    }),
  });
  if (!createRes.ok) throw new Error(`wanx create HTTP ${createRes.status}`);
  const created = (await createRes.json()) as { output?: { task_id?: string } };
  const taskId = created.output?.task_id;
  if (!taskId) throw new Error('wanx 未返回 task_id');

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pollRes = await fetch(`${base}/tasks/${taskId}`, {
      headers: { authorization: `Bearer ${config.dashscopeApiKey}` },
    });
    if (!pollRes.ok) continue;
    const polled = (await pollRes.json()) as {
      output?: { task_status?: string; results?: Array<{ url?: string }> };
      usage?: { image_count?: number };
    };
    const status = polled.output?.task_status;
    if (status === 'SUCCEEDED') {
      const url = polled.output?.results?.[0]?.url;
      if (!url) throw new Error('wanx 成功但无图片 URL');
      return url;
    }
    if (status === 'FAILED' || status === 'CANCELED') throw new Error(`wanx 任务 ${status}`);
  }
  throw new Error('wanx 任务超时');
}

/** 高阶文生图风格前缀（configs 表 ai.prompt.t2i 可调，带默认值兜底） */
function t2iStylePrefix(): string {
  return getConfig<string>('ai.prompt.t2i', '温馨手绘风格家居场景插画，暖色调，柔和光线：');
}

/** 供 t2i-worker 调用：返回万相图片的临时 URL（成功）或抛错（触发重试/失败） */
export async function fetchWanxImage(prompt: string): Promise<string> {
  return wanxText2Image(prompt);
}

/** 组装高阶文生图完整提示词：风格前缀 + 方案整理后场景描述（截 200 字） */
export function buildT2iPrompt(afterStateDesc: string): string {
  return `${t2iStylePrefix()}${afterStateDesc.slice(0, 200)}`;
}

/**
 * 文生图（开关默认关）。失败一律回退素材图——插画是锦上添花，绝不能让主流程翻车。
 */
export async function generateIllustration(
  spaceType: string,
  afterStateDesc: string,
  sessionId?: number | null,
): Promise<string> {
  const t2iEnabled = getConfig<boolean>('ai.t2i_enabled', false);
  if (!t2iEnabled) {
    logAiCost({ stage: 'illustration', model: 'asset-library', inputTokens: 0, outputTokens: 0, estCostYuan: 0, mock: true, sessionId: sessionId ?? null });
    return pickIllustration(spaceType);
  }
  try {
    const prompt = `温馨手绘风格家居场景插画：${afterStateDesc.slice(0, 200)}`;
    const url = await wanxText2Image(prompt);
    logAiCost({ stage: 'illustration', model: 'wanx2.1-t2i-turbo', inputTokens: 0, outputTokens: 1, estCostYuan: 0.14, mock: false, sessionId: sessionId ?? null });
    return url;
  } catch (err) {
    logger.warn({ err }, '文生图失败，回退素材插画');
    logAiCost({ stage: 'illustration', model: 'asset-library', inputTokens: 0, outputTokens: 0, estCostYuan: 0, mock: true, sessionId: sessionId ?? null });
    return pickIllustration(spaceType);
  }
}
