/**
 * 方案路由（R4/R6/R8）。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { getOwnedSession } from '../sessions/service.js';
import {
  collectFeedback,
  finalizePlan,
  getLatestPlan,
  getPlanById,
  getPlanItem,
  planDetail,
  setItemChecked,
  updateItemStatus,
} from './service.js';
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';
import { changeBalance, getBalance } from '../points/service.js';
import { getPointsRules } from '../configs/service.js';
import { buildT2iPrompt } from '../ai/t2i-client.js';
import { storage } from '../upload/storage.js';
import type { PlanContent } from '../ai/orchestrator.types.js';

export const plansRouter = Router();

/** 校验方案归属（经 session → user_id，越权返回 403） */
function ownedPlan(userId: number, planId: number) {
  const plan = getPlanById(planId);
  const session = getOwnedSession(userId, plan.session_id);
  return { plan, session };
}

interface T2iTaskRow {
  id: number;
  plan_id: number;
  session_id: number;
  user_id: number;
  status: string;
  image_key: string | null;
  error_message: string | null;
  retry_count: number;
  free_retry_used: number;
  created_at: string;
  updated_at: string;
}

/** 查 t2i 任务 + 越权校验（任务冗余的 user_id 与登录人一致才放行） */
function ownedT2iTask(userId: number, taskId: number): T2iTaskRow {
  const task = db.prepare('SELECT * FROM t2i_tasks WHERE id = ?').get(taskId) as
    | T2iTaskRow
    | undefined;
  if (!task) throw BizError.notFound('任务不存在');
  if (task.user_id !== userId) throw BizError.forbidden();
  return task;
}

/** GET /plans/t2i-tasks/:id — 轮询文生图任务状态（done 附签名 URL；failed 附免费重试资格） */
plansRouter.get('/t2i-tasks/:id', (req: AuthRequest, res) => {
  const task = ownedT2iTask(req.userId!, Number(req.params.id));
  const data: Record<string, unknown> = {
    id: task.id,
    plan_id: task.plan_id,
    status: task.status,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
  if (task.status === 'done' && task.image_key) {
    data.t2i_image_url = storage.signedUrl(task.image_key);
  }
  if (task.status === 'failed') {
    data.can_free_retry = task.free_retry_used === 0;
    data.error = task.error_message ?? '画画失败了，请稍后再试';
  }
  ok(res, data);
});

/** POST /plans/t2i-tasks/:id/retry — 失败后免费重试 1 次（每方案仅 1 次机会） */
plansRouter.post('/t2i-tasks/:id/retry', (req: AuthRequest, res) => {
  const task = ownedT2iTask(req.userId!, Number(req.params.id));
  if (task.status !== 'failed') throw BizError.param('当前任务不在失败状态，不能重试');
  if (task.free_retry_used !== 0) throw BizError.param('免费重试机会已经用过啦');
  db.prepare(
    `UPDATE t2i_tasks SET status = 'pending', retry_count = 0, free_retry_used = 1,
       error_message = NULL, updated_at = ? WHERE id = ?`,
  ).run(nowIso(), task.id);
  ok(res, { task_id: task.id }, '再画一次，马上好～');
});

/** GET /plans/:id — 方案详情（五部分 + 条目状态 + 进度） */
plansRouter.get('/:id', (req: AuthRequest, res) => {
  const { plan } = ownedPlan(req.userId!, Number(req.params.id));
  ok(res, planDetail(plan));
});

const itemStatusSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'modified']),
  user_note: z.string().max(500).optional(),
});

/** PATCH /plans/items/:itemId — 采纳 / 拒绝 / 修改 */
plansRouter.patch('/items/:itemId', (req: AuthRequest, res) => {
  const itemId = Number(req.params.itemId);
  const item = getPlanItem(itemId);
  ownedPlan(req.userId!, item.plan_id);
  const { status, user_note } = itemStatusSchema.parse(req.body);
  updateItemStatus(itemId, status, user_note);
  ok(res, { id: itemId, status }, status === 'accepted' ? '已采纳' : status === 'rejected' ? '已拒绝这条建议' : '已记下你的修改');
});

const checkSchema = z.object({ checked: z.boolean() });

/** PATCH /plans/items/:itemId/check — 执行清单勾选（中断重进恢复） */
plansRouter.patch('/items/:itemId/check', (req: AuthRequest, res) => {
  const itemId = Number(req.params.itemId);
  const item = getPlanItem(itemId);
  ownedPlan(req.userId!, item.plan_id);
  const { checked } = checkSchema.parse(req.body);
  setItemChecked(itemId, checked);
  const plan = getPlanById(item.plan_id);
  ok(res, planDetail(plan).todo_progress, checked ? '又搞定一步，继续保持～' : '已取消勾选');
});

/** POST /plans/:id/finalize — 全部确认，生成最终方案 */
plansRouter.post('/:id/finalize', (req: AuthRequest, res) => {
  const { plan, session } = ownedPlan(req.userId!, Number(req.params.id));
  finalizePlan(plan.id);
  db.prepare(`UPDATE sessions SET status = 'executing', updated_at = ? WHERE id = ?`).run(
    nowIso(),
    session.id,
  );
  ok(res, planDetail(getPlanById(plan.id)), '方案已定格，照着做就行，一步一步来');
});

/**
 * POST /plans/:id/regenerate — 重生成（R6/R41：先扣点后排队，异步执行，立即返回 task_id）。
 * 失败任务不退点，admin 可人工补发——与真实支付平台一致的处理惯例。
 */
plansRouter.post('/:id/regenerate', (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { plan, session } = ownedPlan(userId, Number(req.params.id));
  // 幂等：同一会话已有进行中任务则直接返回该任务，不重复扣点排队
  const active = db
    .prepare(
      `SELECT id FROM regen_tasks WHERE session_id = ? AND status IN ('pending', 'processing') ORDER BY id DESC LIMIT 1`,
    )
    .get(session.id) as { id: number } | undefined;
  if (active) {
    ok(res, { task_id: active.id, charged: 0, balance: getBalance(userId).balance }, '已有进行中的重生成任务');
    return;
  }
  const rules = getPointsRules();
  const granularity = (session.granularity || 'region') as 'region' | 'item';
  const isFirstFree = session.regen_count === 0;
  const cost = isFirstFree ? 0 : rules.regen_after_first[granularity];

  if (!isFirstFree) {
    changeBalance(userId, -cost, 'regen', `regen:${plan.session_id}:${session.regen_count + 1}`, `重生成方案（第 ${session.regen_count + 1} 次）`);
  }
  db.prepare('UPDATE sessions SET regen_count = regen_count + 1, updated_at = ? WHERE id = ?').run(
    nowIso(),
    session.id,
  );

  const result = db
    .prepare(
      `INSERT INTO regen_tasks (session_id, user_id, plan_id, status, payload_json)
       VALUES (?, ?, ?, 'pending', ?)`,
    )
    .run(
      session.id,
      userId,
      plan.id,
      JSON.stringify({
        // 注：version 仅作 prompt 语义（"第 N 版"），真实落库版本号由
        // saveNextPlan 在同一事务内 MAX(version)+1 决定（BUG-1）
        version: plan.version + 1,
        granularity,
        cost_charged: cost,
        feedback: collectFeedback(plan.id),
      }),
    );
  ok(
    res,
    { task_id: Number(result.lastInsertRowid), charged: cost, balance: getBalance(userId).balance },
    isFirstFree ? '已免费提交重新生成' : `已提交重新生成，仅收成本价 ${cost} 点`,
  );
});

/** GET /plans/regen-tasks/:id — 查询重生成任务状态（越权校验 user_id；done 附新方案详情） */
plansRouter.get('/regen-tasks/:id', (req: AuthRequest, res) => {
  const task = db.prepare('SELECT * FROM regen_tasks WHERE id = ?').get(Number(req.params.id)) as
    | {
        id: number;
        session_id: number;
        user_id: number;
        status: string;
        result_json: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!task) throw BizError.notFound('任务不存在');
  if (task.user_id !== req.userId) throw BizError.forbidden();
  const result = task.result_json
    ? (JSON.parse(task.result_json) as { plan_id?: number; error_message?: string })
    : {};
  const data: Record<string, unknown> = {
    id: task.id,
    session_id: task.session_id,
    status: task.status,
    created_at: task.created_at,
    updated_at: task.updated_at,
  };
  if (task.status === 'done' && result.plan_id) {
    data.plan = planDetail(getPlanById(result.plan_id));
  }
  if (task.status === 'failed') {
    data.error = result.error_message ?? '重新生成失败了，请稍后再试';
  }
  ok(res, data);
});

/** GET /plans/:id/regen-cost — 查询重生成费用（前端按钮明示用） */
plansRouter.get('/:id/regen-cost', (req: AuthRequest, res) => {
  const { session } = ownedPlan(req.userId!, Number(req.params.id));
  const rules = getPointsRules();
  const granularity = (session.granularity || 'region') as 'region' | 'item';
  const isFirstFree = session.regen_count === 0;
  ok(res, {
    free: isFirstFree,
    cost: isFirstFree ? 0 : rules.regen_after_first[granularity],
    label: isFirstFree ? '首次重生成免费' : `重生成仅收成本价 ${rules.regen_after_first[granularity]} 点`,
  });
});

/**
 * POST /plans/:id/t2i — 发起高阶文生图（扣 5 点，异步 worker 画完自动换图）。
 * 幂等：同方案已有进行中任务直接复用，不重复扣点。
 * 余额不足抛 3001 原样给前端（弹联系运营）。失败不退点（自动重试 1 次 + 免费重试 1 次双层保护）。
 */
plansRouter.post('/:id/t2i', (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { plan, session } = ownedPlan(userId, Number(req.params.id));
  // 幂等短路：同方案已有 pending/processing 任务直接返回该 task_id（双击/重试不重复扣点）
  const active = db
    .prepare(
      `SELECT id FROM t2i_tasks WHERE plan_id = ? AND status IN ('pending', 'processing') ORDER BY id DESC LIMIT 1`,
    )
    .get(plan.id) as { id: number } | undefined;
  if (active) {
    ok(res, { task_id: active.id, charged: 0, balance: getBalance(userId).balance }, '正在画你的家…');
    return;
  }

  const COST = 5;
  const content = JSON.parse(plan.content_json) as PlanContent;
  const prompt = buildT2iPrompt(content.after_state_desc);
  // bizId 用任务序号保证每次发起独立入账；3001 余额不足原样抛
  const seq =
    (db.prepare('SELECT COUNT(*) AS c FROM t2i_tasks WHERE plan_id = ?').get(plan.id) as {
      c: number;
    }).c + 1;
  changeBalance(userId, -COST, 't2i', `t2i:${plan.id}:${seq}`, '生成专属示意图');
  const r = db
    .prepare(
      `INSERT INTO t2i_tasks (plan_id, session_id, user_id, status, prompt) VALUES (?, ?, ?, 'pending', ?)`,
    )
    .run(plan.id, session.id, userId, prompt);
  ok(
    res,
    { task_id: Number(r.lastInsertRowid), charged: COST, balance: getBalance(userId).balance },
    '正在画你的家…',
  );
});

/** POST /plans/:id/t2i/use-asset — 换用素材图（清空 t2i_image_key；COS 对象可留不删） */
plansRouter.post('/:id/t2i/use-asset', (req: AuthRequest, res) => {
  const { plan } = ownedPlan(req.userId!, Number(req.params.id));
  db.prepare('UPDATE plans SET t2i_image_key = NULL, updated_at = ? WHERE id = ?').run(
    nowIso(),
    plan.id,
  );
  ok(res, planDetail(getPlanById(plan.id)), '已换回素材图');
});

// 兜底：plans 路由里用到的 latest plan 查询导出（sessions 路由复用）
export { getLatestPlan };
