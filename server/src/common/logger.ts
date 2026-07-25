/**
 * 结构化日志（pino）：AI 成本台账、请求日志统一走这里。
 */
import { pino } from 'pino';
import { db } from '../db.js';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: { service: 'zmb-server' },
});

/** AI 调用成本台账（owner 随时可对账，架构文档 2.6）：pino 日志 + ai_cost_logs 落库（阶段 2 R42） */
export function logAiCost(entry: {
  stage: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estCostYuan: number;
  mock: boolean;
  /** 关联会话（确认环节外的调用可空） */
  sessionId?: number | null;
}): void {
  logger.info({ type: 'ai_cost', ...entry }, `AI调用 ${entry.stage} (${entry.model})`);
  try {
    db.prepare(
      `INSERT INTO ai_cost_logs (session_id, stage, model, input_tokens, output_tokens, est_cost_yuan, mock)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      entry.sessionId ?? null,
      entry.stage,
      entry.model,
      Math.round(entry.inputTokens),
      Math.round(entry.outputTokens),
      entry.estCostYuan,
      entry.mock ? 1 : 0,
    );
  } catch (err) {
    // 落库失败不阻塞主链路（如 migrate 前的极早期调用）
    logger.warn({ err }, 'ai_cost_logs 落库失败');
  }
}

/** 单次完整分析成本红线（¥0.5）：按 session 求和，超线 warn 预警（看板标红由前端做） */
export function warnIfSessionCostOverBudget(sessionId: number, budget = 0.5): void {
  try {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(est_cost_yuan), 0) AS total FROM ai_cost_logs
         WHERE session_id = ? AND mock = 0`,
      )
      .get(sessionId) as { total: number };
    if (row.total > budget) {
      logger.warn(
        { sessionId, totalCostYuan: row.total, budget },
        `单次分析成本超红线：¥${row.total.toFixed(4)} > ¥${budget}`,
      );
    }
  } catch {
    /* 不阻塞 */
  }
}
