/**
 * 异步重生成 worker（R41）：setInterval 每 3 秒取一条 pending 任务串行处理。
 * 状态机：pending → processing → done / failed；失败 retry_count<1 置回 pending 重试 1 次。
 * 进程重启恢复：processing 超 5 分钟的僵死任务在启动时重置回 pending。
 * SQLite 单写者天然适合单 worker 串行，不存在并发抢任务问题。
 */
import { db, nowIso } from '../../db.js';
import { logger } from '../../common/logger.js';
import { runRegenerate } from './orchestrator.js';
import { generateIllustration } from './t2i-client.js';
import { saveNextPlan, collectFeedback, type PlanRow } from '../plans/service.js';
import type { SessionRow } from '../sessions/service.js';

interface RegenTaskRow {
  id: number;
  session_id: number;
  user_id: number;
  plan_id: number;
  status: string;
  payload_json: string;
  retry_count: number;
}

interface TaskPayload {
  version: number;
  granularity: 'region' | 'item';
  cost_charged: number;
}

/** 启动时回收僵死任务（processing 超 5 分钟视为进程崩溃遗留） */
export function recoverStaleTasks(): void {
  const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const result = db
    .prepare(
      `UPDATE regen_tasks SET status = 'pending', updated_at = ?
       WHERE status = 'processing' AND updated_at < ?`,
    )
    .run(nowIso(), staleBefore);
  if (Number(result.changes) > 0) {
    logger.warn({ recovered: Number(result.changes) }, '回收僵死重生成任务');
  }
}

async function processTask(task: RegenTaskRow): Promise<void> {
  const payload = JSON.parse(task.payload_json) as TaskPayload;
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(task.plan_id) as
    | PlanRow
    | undefined;
  const session = db
    .prepare(
      `SELECT s.*, sp.space_type AS space_type, sp.name AS space_name
       FROM sessions s JOIN spaces sp ON sp.id = s.space_id WHERE s.id = ?`,
    )
    .get(task.session_id) as SessionRow | undefined;
  if (!plan || !session) throw new Error('任务关联的方案或会话不存在');

  const feedback = collectFeedback(plan.id);
  const confirmState = session.confirm_state
    ? (JSON.parse(session.confirm_state) as { vague_answers?: string[] })
    : {};
  const content = await runRegenerate(
    {
      sessionId: session.id,
      spaceType: session.space_type ?? 'living',
      spaceName: session.space_name ?? '这个空间',
      discardMode: session.discard_mode ?? 'conservative',
      granularity: payload.granularity,
      vagueAnswers: confirmState.vague_answers ?? [],
    },
    // 仅作 prompt 语义展示（"第 N 版"）；真实落库版本号由 saveNextPlan 事务内决定
    payload.version,
    feedback,
  );
  const illustration = await generateIllustration(
    session.space_type ?? 'living',
    content.after_state_desc,
    session.id,
  );
  // BUG-1：版本号不再取 payload（入队时的旧值），落库时在同一事务内 MAX(version)+1
  const newPlan = saveNextPlan(session.id, content, illustration);
  db.prepare(
    `UPDATE regen_tasks SET status = 'done', result_json = ?, updated_at = ? WHERE id = ?`,
  ).run(JSON.stringify({ plan_id: newPlan.id }), nowIso(), task.id);
  logger.info({ taskId: task.id, planId: newPlan.id }, '重生成任务完成');
}

/** 处理一条任务（claim → 执行 → 状态回写），worker 每 tick 调用 */
async function tick(): Promise<void> {
  // 原子 claim：只有当前任务仍是 pending 才能置为 processing，防重复处理
  const task = db
    .prepare(`SELECT * FROM regen_tasks WHERE status = 'pending' ORDER BY id LIMIT 1`)
    .get() as RegenTaskRow | undefined;
  if (!task) return;
  const claimed = db
    .prepare(
      `UPDATE regen_tasks SET status = 'processing', updated_at = ? WHERE id = ? AND status = 'pending'`,
    )
    .run(nowIso(), task.id);
  if (Number(claimed.changes) === 0) return;

  try {
    await processTask(task);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ taskId: task.id, err: message }, '重生成任务失败');
    if (task.retry_count < 1) {
      // 重试 1 次：置回 pending 排队
      db.prepare(
        `UPDATE regen_tasks SET status = 'pending', retry_count = retry_count + 1, updated_at = ? WHERE id = ?`,
      ).run(nowIso(), task.id);
    } else {
      db.prepare(
        `UPDATE regen_tasks SET status = 'failed', result_json = ?, updated_at = ? WHERE id = ?`,
      ).run(
        JSON.stringify({ error_message: '重新生成失败了，请稍后再试，点数问题请联系运营' }),
        nowIso(),
        task.id,
      );
    }
  }
}

/** 启动重生成 worker（每 3 秒轮询），返回 interval 句柄供优雅关闭 */
export function startRegenWorker(): NodeJS.Timeout {
  recoverStaleTasks();
  const timer = setInterval(() => {
    tick().catch((err) => logger.warn({ err }, 'regen worker tick 异常'));
  }, 3000);
  timer.unref?.();
  logger.info('重生成 worker 已启动（3s 轮询）');
  return timer;
}
