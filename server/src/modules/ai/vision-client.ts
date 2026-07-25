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
  // v3.2.2 P0：视觉回退到千问 qwen-vl-plus（实测 30s 看 6 张图；豆包视觉偶发 60s+ abort）
  const model = getConfig<string>('ai.vision_model', 'qwen-vl-plus');

  // 照片 id → base64 inline（避免依赖 Doubao 端去拉 COS URL；实测 inline 5s 内返回，URL 方式常卡 60s+）
  const parts: ChatContentPart[] = [{ type: 'text', text: message.prompt }];
  const stmt = db.prepare(`SELECT cos_key, mime FROM photos WHERE id = ?`);
  for (const id of message.images) {
    const row = stmt.get(Number(id)) as { cos_key: string; mime: string | null } | undefined;
    if (!row) continue;
    try {
      const buf = await storage.getObject(row.cos_key);
      const mime = row.mime || 'image/jpeg';
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
      parts.push({ type: 'image_url', image_url: { url: dataUrl } });
    } catch (err) {
      logger.warn({ err, cos_key: row.cos_key }, 'vision: 读取照片失败，跳过');
    }
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
