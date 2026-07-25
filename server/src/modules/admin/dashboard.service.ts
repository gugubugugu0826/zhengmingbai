/**
 * 管理员-经营看板（R38/R42）：汇总数字卡 + AI 成本台账。
 */
import { db } from '../../db.js';

/** 4 张数字卡：注册用户数 / 分析次数 / 点数发放总量 / 消耗总量 */
export function summary(): Record<string, number> {
  const users = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n;
  // 分析次数：走到 planned 及以后的会话数（planned/executing/done）
  const analyses = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM sessions WHERE status IN ('planned', 'executing', 'done')`,
      )
      .get() as { n: number }
  ).n;
  const granted = (
    db
      .prepare(`SELECT COALESCE(SUM(change), 0) AS n FROM points_transaction WHERE change > 0`)
      .get() as { n: number }
  ).n;
  const spent = (
    db
      .prepare(`SELECT COALESCE(SUM(-change), 0) AS n FROM points_transaction WHERE change < 0`)
      .get() as { n: number }
  ).n;
  return { users, analyses, points_granted: granted, points_spent: spent };
}

/** AI 成本台账：按天汇总 + 按次明细（单次 >¥0.5 由前端标红） */
export function aiCosts(days: number): {
  daily: unknown[];
  detail: unknown[];
  over_budget_count: number;
} {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const daily = db
    .prepare(
      `SELECT substr(created_at, 1, 10) AS day,
              COUNT(*) AS calls,
              SUM(input_tokens) AS input_tokens,
              SUM(output_tokens) AS output_tokens,
              ROUND(SUM(est_cost_yuan), 4) AS cost_yuan
       FROM ai_cost_logs WHERE created_at >= ?
       GROUP BY day ORDER BY day DESC`,
    )
    .all(since);
  const detail = db
    .prepare(
      `SELECT * FROM ai_cost_logs WHERE created_at >= ? ORDER BY id DESC LIMIT 200`,
    )
    .all(since);
  const over = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM ai_cost_logs WHERE created_at >= ? AND est_cost_yuan > 0.5`,
      )
      .get(since) as { n: number }
  ).n;
  return { daily, detail, over_budget_count: over };
}
