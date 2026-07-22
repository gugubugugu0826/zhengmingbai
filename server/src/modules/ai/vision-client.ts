/**
 * 视觉模型客户端（阶段 2 R39）：百炼兼容模式多模态对话。
 * 图片走签名 URL（image_url，百炼服务端回源拉图；本地 local 通道用 PUBLIC_BASE_URL 拼接），
 * 模型名读 configs 表 ai.vision_model。真实 token/成本从响应 usage 取。
 */
import { config } from '../../config.js';
import { getConfig } from '../configs/service.js';
import { logAiCost, logger } from '../../common/logger.js';
import { db } from '../../db.js';
import { storage } from '../upload/storage.js';
import { chatCompletion, estimateCostYuan, type ChatContentPart } from './openai-compat.js';

export interface VisionMessage {
  /** 照片 id 列表（兼容一期编排器签名；内部转签名 URL） */
  images: string[];
  prompt: string;
  /** 关联会话（成本台账） */
  sessionId?: number | null;
}

export async function callVisionModel(message: VisionMessage): Promise<string> {
  const model = getConfig<string>('ai.vision_model', 'qwen-vl-plus');

  // 照片 id → 可拉图 URL。COS 通道直接给公网预签名 URL；本地通道（开发）百炼回源拉不到
  // localhost，退化为 base64 data URL（视觉确认阶段照片量小，可接受；生产走 COS 不受影响）。
  const publicBase = (process.env.PUBLIC_BASE_URL || '').replace(/\/+$/, '');
  const parts: ChatContentPart[] = [{ type: 'text', text: message.prompt }];
  const stmt = db.prepare(`SELECT cos_key, mime FROM photos WHERE id = ?`);
  for (const id of message.images) {
    const row = stmt.get(Number(id)) as { cos_key: string; mime: string | null } | undefined;
    if (!row) continue;
    let url = storage.signedUrl(row.cos_key, 900);
    if (url.startsWith('/')) {
      // 本地相对路径：有公网入口才拼 URL，否则内联 base64
      if (publicBase && !publicBase.includes('localhost') && !publicBase.includes('127.0.0.1')) {
        url = `${publicBase}${url}`;
      } else {
        const buf = await storage.getObject(row.cos_key);
        const mime = row.mime || 'image/jpeg';
        url = `data:${mime};base64,${buf.toString('base64')}`;
      }
    }
    parts.push({ type: 'image_url', image_url: { url } });
  }

  const result = await chatCompletion({
    model,
    messages: [{ role: 'user', content: parts }],
  });
  logAiCost({
    stage: 'confirm',
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    estCostYuan: estimateCostYuan(model, result.inputTokens, result.outputTokens),
    mock: false,
    sessionId: message.sessionId ?? null,
  });
  return result.content;
}
