/**
 * 火山引擎图片生成（图+文生图，v3.1 D-3）。
 * 端点：POST {volcEngineBaseUrl}/images/generations（注意：不是 chat/completions！）
 * 默认模型：doubao-seedream-5-0-pro-260628（configs ai.image_model 可覆盖）
 *
 * ⚠️ 架构硬约束（任务书 D-3）：火山返回的是 24h 临时 URL，超时自动清除。
 * 本客户端内部立即下载临时图 → 走 storage 通道（COS SSE-AES256 / local）落库，
 * 返回 cosKey。任何代码不得把火山临时 URL 落库。
 *
 * 失败一律抛错，由上层（t2i-worker 重试 / 回退素材 SVG）处理，本文件不兜底。
 */
import { config } from '../../config.js';
import { getConfig } from '../configs/service.js';
import { logAiCost, logger } from '../../common/logger.js';
import { storage } from '../upload/storage.js';

/** 默认图生图模型（确切模型 ID 以火山控制台为准，configs ai.image_model 可热切换） */
export const DEFAULT_IMAGE_MODEL = 'doubao-seedream-5-0-pro-260628';

/** 生成图下载上限（对齐 t2i-worker 既有 8MB 限制） */
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** 单张图片生成成本占位估算（¥0.30/张，待火山刊例确认后改这一行，架构 §五-4） */
export function estimateVolcengineImageCost(): number {
  return 0.3;
}

function imageModel(): string {
  return getConfig<string>('ai.image_model', DEFAULT_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL;
}

export interface GenerateFromImagesOptions {
  /** 输出尺寸档位（火山枚举：1K/2K/4K），默认 2K */
  size?: string;
  /** 是否带水印，默认 false（待明确事项 #2：若火山条款不允许去水印，configs 加开关切换） */
  watermark?: boolean;
  /** 关联会话（成本台账用） */
  sessionId?: number | null;
}

/**
 * 图+文生图：传 1~10 张参考图签名 URL + 文字指令，生成图立即下载落存储通道。
 * @param prompt 文字指令（D-6 图+文生图专用提示词，由 t2i-client 组装）
 * @param imageUrls 参考图可访问 URL（用户私有 COS 照片需先签 3600s 签名 URL）；空数组 = 纯文生图
 * @returns { cosKey } 落库后的存储对象键（读取时 storage.signedUrl 现场签发，天然满足 24h 约束）
 */
export async function generateFromImages(
  prompt: string,
  imageUrls: string[],
  opts: GenerateFromImagesOptions = {},
): Promise<{ cosKey: string }> {
  if (!config.volcEngineApiKey) {
    throw new Error('火山引擎 API Key 未配置（VOLCENGINE_API_KEY）');
  }
  const baseUrl = config.volcEngineBaseUrl.replace(/\/+$/, '');
  const model = imageModel();
  const body: Record<string, unknown> = {
    model,
    prompt,
    response_format: 'url',
    size: opts.size ?? '2K',
    stream: false,
    watermark: opts.watermark ?? false,
  };
  if (imageUrls.length === 1) {
    body.image = imageUrls[0];
  } else if (imageUrls.length > 1) {
    body.image = imageUrls;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000); // 2K 图生图约 30s+，留足余量
  let tempUrl: string;
  try {
    const res = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.volcEngineApiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`火山图片生成 HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { data?: Array<{ url?: string }> };
    const url = json.data?.[0]?.url;
    if (!url) throw new Error('火山未返回图片 URL');
    tempUrl = url;
  } finally {
    clearTimeout(timer);
  }

  // ⚠️ 硬约束：24h 临时 URL 立即下载 → 落存储通道（COS/local 自动适配），只返回 cosKey
  const imgRes = await fetch(tempUrl);
  if (!imgRes.ok) throw new Error(`下载生成图失败 HTTP ${imgRes.status}`);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  if (buf.length === 0) throw new Error('下载生成图为空');
  if (buf.length > MAX_IMAGE_BYTES) throw new Error('生成图过大');
  const cosKey = await storage.putObject(buf, 'png');

  logAiCost({
    stage: 'illustration',
    model,
    inputTokens: 0,
    outputTokens: 1,
    estCostYuan: estimateVolcengineImageCost(),
    mock: false,
    sessionId: opts.sessionId ?? null,
  });
  logger.info({ model, cosKey, bytes: buf.length }, '火山图生图完成并已落存储');
  return { cosKey };
}
