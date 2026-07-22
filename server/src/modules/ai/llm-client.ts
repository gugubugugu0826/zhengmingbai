/**
 * 文本大模型客户端（阶段 2 R40）：百炼兼容模式 qwen-plus 级。
 * response_format=json_object + 提示词内嵌 JSON Schema；输出用 plans/schema-validator 强校验，
 * 不合法自动重试 1 次（把校验错误拼进 prompt），仍失败抛带兜底文案的 BizError。
 */
import { getConfig } from '../configs/service.js';
import { logAiCost } from '../../common/logger.js';
import { BizError } from '../../common/errors.js';
import { validatePlanContent } from '../plans/schema-validator.js';
import { chatCompletion, estimateCostYuan } from './openai-compat.js';

const PLAN_JSON_SCHEMA = `{
  "discard_suggestions": [{"item": "物品名", "reason": "温和的理由", "tone": "gentle"}],
  "groups": [{"name": "分组名", "items": ["物品"], "kb_category": "知识库分类"}],
  "storage_advice": [{"group": "分组名", "location": "收纳位置", "tip": "建议"}],
  "purchase_advice": [{"category": "品类", "reason": "理由", "product_link": null}],
  "steps": [{"no": 1, "action": "动作", "target_groups": ["分组名"], "est_minutes": 10}],
  "scene_summary": "整理后场景一句话",
  "after_state_desc": "整理后场景描述（供插画用）"
}`;

export interface TextModelOptions {
  /** 关联会话（成本台账） */
  sessionId?: number | null;
  /** 成本台账 stage（plan_generate / regen / analyze） */
  stage?: string;
}

/** 从模型输出提取首个 JSON 对象（容错 markdown 包裹/多余文字） */
function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json in output');
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function callTextModel(prompt: string, options: TextModelOptions = {}): Promise<string> {
  const model = getConfig<string>('ai.text_model', 'qwen-plus');
  const stage = options.stage ?? 'plan_generate';

  const schemaHint = `\n\n严格输出 JSON（不要输出任何其他文字），结构如下：${PLAN_JSON_SCHEMA}`;
  let currentPrompt = prompt + schemaHint;

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await chatCompletion({
      model,
      messages: [{ role: 'user', content: currentPrompt }],
      responseFormatJson: true,
      maxTokens: 4000,
    });
    logAiCost({
      stage,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      estCostYuan: estimateCostYuan(model, result.inputTokens, result.outputTokens),
      mock: false,
      sessionId: options.sessionId ?? null,
    });
    try {
      const parsed = extractJson(result.content);
      validatePlanContent(parsed);
      return JSON.stringify(parsed);
    } catch (err) {
      if (attempt === 0) {
        // 输出不合法：把错误拼进 prompt 重试 1 次（R40）
        currentPrompt = `${prompt}\n\n上次你的输出不符合要求，校验错误：${String(err).slice(0, 300)}。请严格按 schema 重新输出。${schemaHint}`;
        continue;
      }
      throw BizError.ai('方案生成出了点小状况，请再试一次，不扣点数的话请联系运营补发');
    }
  }
  throw BizError.ai('方案生成出了点小状况，请再试一次');
}
