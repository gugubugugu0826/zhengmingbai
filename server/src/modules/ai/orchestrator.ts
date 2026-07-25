/**
 * AI 编排器（约定：AI 调用一律走这里，业务代码禁止直连模型 SDK）。
 * 流水线：确认（多轮）→ 分析（知识库先验+视觉兜底）→ 方案生成 → 示意插画。
 * ai.mock=true 时全程返回预置数据，不花一分钱走通全流程（阶段1 验收依赖此开关）。
 * 阶段 2：真实 client 接入，成本台账 ai_cost_logs 落库，单次分析成本超 ¥0.5 预警。
 */
import { isAiMock } from '../configs/service.js';
import { logAiCost, warnIfSessionCostOverBudget } from '../../common/logger.js';
import { mockConfirmResult, mockPlanContent } from './mock-data.js';
import { getKnowledgeFor } from './knowledge.js';
import { generateIllustration } from './t2i-client.js';
import { getPrompt } from './prompts.js';
import { BizError } from '../../common/errors.js';
import { callVisionModel } from './vision-client.js';
import { callTextModel } from './llm-client.js';
import type { ConfirmResult, PlanContent, SessionContext } from './orchestrator.types.js';
import { SPACE_TYPE_LABELS } from './mock-data.js';

/** 从模型输出中提取首个 JSON 对象（容错 markdown ```json 包裹、前后多余文字） */
function extractJson<T>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no json');
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

/** ① 确认环节：识别空间分组 + 模糊物品 */
export async function runConfirm(
  session: SessionContext,
  photoIds: number[],
): Promise<ConfirmResult> {
  if (isAiMock()) {
    logAiCost({ stage: 'confirm', model: 'mock', inputTokens: 0, outputTokens: 0, estCostYuan: 0, mock: true, sessionId: session.sessionId });
    return mockConfirmResult(photoIds, SPACE_TYPE_LABELS[session.spaceType] ?? '这个空间');
  }
  const prompt = `${getPrompt('confirm')}\n空间类型：${session.spaceName}。照片 id 依次为 [${photoIds.join(',')}]，groups.photo_ids 请用这些 id。只输出 JSON 本身、不要用 markdown 包裹：{"groups":[{"tag":"分组标识","label":"分组名","photo_ids":[1]}],"vague_items":[{"id":"v1","photo_id":1,"question":"大白话提问","hint":"补充说明"}]}`;
  const raw = await callVisionModel({ images: photoIds.map(String), prompt, sessionId: session.sessionId });
  try {
    return extractJson<ConfirmResult>(raw);
  } catch {
    throw BizError.ai('照片识别出了点小状况，请再试一次');
  }
}

/** ② 分析 + ③ 方案生成（Mock 模式直接返回精心编写的方案） */
export async function runAnalyzeAndPlan(session: SessionContext): Promise<PlanContent> {
  const knowledge = getKnowledgeFor(session.spaceType);
  if (isAiMock()) {
    logAiCost({ stage: 'analyze+plan', model: 'mock', inputTokens: 0, outputTokens: 0, estCostYuan: 0, mock: true, sessionId: session.sessionId });
    return mockPlanContent({
      spaceType: session.spaceType,
      spaceName: session.spaceName,
      discardMode: session.discardMode,
      granularity: session.granularity,
      vagueAnswers: session.vagueAnswers,
      regenVersion: 1,
      rejectedNotes: [],
    });
  }
  const prompt = `${getPrompt('analyze')}\n知识库先验：${JSON.stringify(knowledge)}\n${getPrompt('plan')}\n空间：${session.spaceName}（${session.spaceType}），颗粒度：${session.granularity}，丢弃偏好：${session.discardMode}，用户补充回答：${JSON.stringify(session.vagueAnswers)}`;
  const raw = await callTextModel(prompt, { sessionId: session.sessionId, stage: 'plan_generate' });
  warnIfSessionCostOverBudget(session.sessionId);
  return JSON.parse(raw) as PlanContent;
}

/** 重生成：把用户采纳/拒绝/修改意见一并喂入（R6） */
export async function runRegenerate(
  session: SessionContext,
  version: number,
  feedback: { rejected: string[]; modified: string[] },
): Promise<PlanContent> {
  if (isAiMock()) {
    logAiCost({ stage: 'regen', model: 'mock', inputTokens: 0, outputTokens: 0, estCostYuan: 0, mock: true, sessionId: session.sessionId });
    return mockPlanContent({
      spaceType: session.spaceType,
      spaceName: session.spaceName,
      discardMode: session.discardMode,
      granularity: session.granularity,
      vagueAnswers: session.vagueAnswers,
      regenVersion: version,
      rejectedNotes: [...feedback.rejected, ...feedback.modified],
    });
  }
  const prompt = `${getPrompt('plan')}\n空间：${session.spaceName}（${session.spaceType}），颗粒度：${session.granularity}，这是第 ${version} 版方案。用户对上一版的反馈：${JSON.stringify(feedback)}（被拒绝的建议不要再提，按用户修改意见调整）`;
  const raw = await callTextModel(prompt, { sessionId: session.sessionId, stage: 'regen' });
  warnIfSessionCostOverBudget(session.sessionId);
  return JSON.parse(raw) as PlanContent;
}

/** ④ 示意插画 */
export async function runIllustration(
  spaceType: string,
  afterStateDesc: string,
  sessionId?: number | null,
): Promise<string> {
  return generateIllustration(spaceType, afterStateDesc, sessionId);
}
