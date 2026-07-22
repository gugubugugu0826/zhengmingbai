/**
 * 整理会话路由（R1-R6 主链路）：
 * 建会话 → 传照片 → AI 确认分组/模糊提问 → 用户确认 → 分析出方案（扣点）。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import { BizError } from '../../common/errors.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import { db, nowIso } from '../../db.js';
import { getOwnedSession, type SessionRow } from './service.js';
import { getSpace } from '../spaces/service.js';
import {
  countSessionPhotos,
  listSessionPhotos,
  purgeSessionPhotos,
  setPhotoGroupTags,
  uploadPhotos,
  withSignedUrls,
} from '../upload/service.js';
import { deletePhotoHandler } from '../upload/routes.js';
import { runConfirm, runAnalyzeAndPlan } from '../ai/orchestrator.js';
import type { SessionContext } from '../ai/orchestrator.types.js';
import { generateIllustration } from '../ai/t2i-client.js';
import { savePlan, planDetail, getLatestPlan } from '../plans/service.js';
import { changeBalance, getBalance } from '../points/service.js';
import { getPointsRules } from '../configs/service.js';
import { scheduleReminder } from '../reminder/service.js';
import { getUserById } from '../auth/service.js';

export const sessionsRouter = Router();

/** 组装编排器上下文 */
function toContext(session: SessionRow): SessionContext {
  const confirmState = session.confirm_state
    ? (JSON.parse(session.confirm_state) as { vague_answers?: string[] })
    : {};
  return {
    sessionId: session.id,
    spaceType: session.space_type ?? 'living',
    spaceName: session.space_name ?? '这个空间',
    discardMode: session.discard_mode ?? 'conservative',
    granularity: session.granularity ?? 'region',
    vagueAnswers: confirmState.vague_answers ?? [],
  };
}

/** POST /sessions — 创建整理会话（keep_photos：1=保留到我的家 0=分析完即删，默认取用户全局偏好反值） */
sessionsRouter.post('/', (req: AuthRequest, res) => {
  const schema = z.object({
    space_id: z.number().int().positive(),
    granularity: z.enum(['region', 'item']).default('region'),
    discard_mode: z.enum(['conservative', 'declutter']).default('conservative'),
    // PRD：输出形式 A/B/C 至少选一项（前端已禁提交，后端兜底防穿透）
    output_forms: z.array(z.string().min(1)).min(1, '请至少选择一种输出形式').default(['plan']),
    keep_photos: z.union([z.literal(0), z.literal(1)]).optional(),
  });
  const { space_id, granularity, discard_mode, output_forms, keep_photos } = schema.parse(req.body);
  getSpace(req.userId!, space_id);
  // R49：未传 keep_photos 时按用户全局偏好（delete_after_analysis 取反）初始化
  const defaultKeep = getUserById(req.userId!).delete_after_analysis === 1 ? 0 : 1;
  const keepPhotos = keep_photos ?? defaultKeep;
  const result = db
    .prepare(
      `INSERT INTO sessions (user_id, space_id, status, granularity, discard_mode, output_forms, keep_photos)
       VALUES (?, ?, 'uploading', ?, ?, ?, ?)`,
    )
    .run(
      req.userId!,
      space_id,
      granularity,
      discard_mode,
      JSON.stringify(output_forms),
      keepPhotos,
    );
  const session = getOwnedSession(req.userId!, Number(result.lastInsertRowid));
  ok(res, session, '整理会话已创建，开始上传照片吧');
});

/** GET /sessions/:id — 会话详情（含照片、最新方案、进行中的重生成任务 R41） */
sessionsRouter.get('/:id', (req: AuthRequest, res) => {
  const session = getOwnedSession(req.userId!, Number(req.params.id));
  const photos = withSignedUrls(listSessionPhotos(req.userId!, session.id));
  const plan = getLatestPlan(session.id);
  // 刷新页面恢复重生成状态：最近一条 pending/processing/failed 任务
  const activeTask = db
    .prepare(
      `SELECT id, status, result_json FROM regen_tasks
       WHERE session_id = ? AND status IN ('pending', 'processing', 'failed')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(session.id) as
    | { id: number; status: string; result_json: string | null }
    | undefined;
  // 刷新页面恢复文生图轮询：该会话最近一条 pending/processing 的 t2i 任务
  const activeT2iTask = db
    .prepare(
      `SELECT id, plan_id, status FROM t2i_tasks
       WHERE session_id = ? AND status IN ('pending', 'processing')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(session.id) as { id: number; plan_id: number; status: string } | undefined;
  ok(res, {
    ...session,
    photos,
    plan: plan ? planDetail(plan) : null,
    active_regen_task: activeTask ?? null,
    active_t2i_task: activeT2iTask ?? null,
  });
});

const uploadSchema = z.object({
  photos: z.array(z.string().min(32)).min(1).max(20),
});

/** POST /sessions/:id/photos — 批量上传 base64 照片 */
sessionsRouter.post('/:id/photos', sensitiveLimiter, async (req: AuthRequest, res, next) => {
  try {
    const session = getOwnedSession(req.userId!, Number(req.params.id));
    if (!['uploading', 'confirming'].includes(session.status)) {
      throw BizError.param('当前状态不能再传照片啦');
    }
    const { photos } = uploadSchema.parse(req.body);
    const saved = await uploadPhotos(req.userId!, session.id, photos);
    ok(res, withSignedUrls(saved), `已收到 ${saved.length} 张照片`);
  } catch (err) {
    next(err);
  }
});

/** DELETE /sessions/:id/photos/:photoId — 删除单张照片 */
sessionsRouter.delete('/:id/photos/:photoId', (req: AuthRequest, res) => {
  getOwnedSession(req.userId!, Number(req.params.id));
  deletePhotoHandler(req, res);
});

/** POST /sessions/:id/confirm/run — AI 确认：空间分组猜测 + 模糊物品提问 */
sessionsRouter.post('/:id/confirm/run', async (req: AuthRequest, res, next) => {
  try {
    const session = getOwnedSession(req.userId!, Number(req.params.id));
    const photos = listSessionPhotos(req.userId!, session.id);
    if (photos.length === 0) throw BizError.param('先上传至少 1 张照片哦');
    const result = await runConfirm(toContext(session), photos.map((p) => p.id));
    db.prepare(
      `UPDATE sessions SET status = 'confirming', confirm_state = ?, updated_at = ? WHERE id = ?`,
    ).run(JSON.stringify({ ...result, vague_answers: [] }), nowIso(), session.id);
    ok(res, result, '我看完照片啦，确认几个小问题就开始出方案');
  } catch (err) {
    next(err);
  }
});

const confirmSchema = z.object({
  groups: z.array(z.object({ tag: z.string(), photo_ids: z.array(z.number().int()) })).optional(),
  vague_answers: z.array(z.string()).default([]),
});

/** POST /sessions/:id/confirm — 用户确认分组 + 回答模糊物品提问 */
sessionsRouter.post('/:id/confirm', (req: AuthRequest, res) => {
  const session = getOwnedSession(req.userId!, Number(req.params.id));
  const { groups, vague_answers } = confirmSchema.parse(req.body);
  if (groups) setPhotoGroupTags(req.userId!, session.id, groups);
  const prev = session.confirm_state ? JSON.parse(session.confirm_state) : {};
  db.prepare(`UPDATE sessions SET confirm_state = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify({ ...prev, vague_answers }),
    nowIso(),
    session.id,
  );
  ok(res, { confirmed: true }, '确认好啦，马上开始分析');
});

/** POST /sessions/:id/analyze — 分析 + 出方案（扣点主入口） */
sessionsRouter.post('/:id/analyze', sensitiveLimiter, async (req: AuthRequest, res, next) => {
  try {
    const userId = req.userId!;
    const session = getOwnedSession(userId, Number(req.params.id));
    if (!['confirming', 'uploading'].includes(session.status)) {
      // 幂等：重复点分析，已有方案则直接返回最新版，不重复扣点
      const existed = getLatestPlan(session.id);
      if (existed) {
        ok(res, { ...planDetail(existed), charged: 0, balance: getBalance(userId).balance });
        return;
      }
      throw BizError.param('当前状态不能开始分析');
    }
    if (countSessionPhotos(session.id) === 0) throw BizError.param('先上传至少 1 张照片哦');

    const rules = getPointsRules();
    const granularity = (session.granularity || 'region') as 'region' | 'item';
    const cost = rules.analysis[granularity];
    changeBalance(userId, -cost, 'analysis', `analysis:${session.id}`, `AI 分析（${granularity === 'item' ? '物品级' : '区域级'}）`);
    db.prepare(`UPDATE sessions SET status = 'analyzing', points_charged = ?, updated_at = ? WHERE id = ?`).run(
      cost,
      nowIso(),
      session.id,
    );

    const content = await runAnalyzeAndPlan(toContext(session));
    const illustration = await generateIllustration(session.space_type ?? 'living', content.after_state_desc);
    const plan = savePlan(session.id, 1, content, illustration);
    db.prepare(`UPDATE sessions SET status = 'planned', updated_at = ? WHERE id = ?`).run(
      nowIso(),
      session.id,
    );
    // R49："分析完即删"——方案成功落库后立即清除照片（存储 + DB 标记，双端无残留）
    if (session.keep_photos === 0) {
      await purgeSessionPhotos(session.id);
    }
    ok(
      res,
      { ...planDetail(plan), charged: cost, balance: getBalance(userId).balance },
      '方案出来啦，看看合不合心意',
    );
  } catch (err) {
    next(err);
  }
});

/** POST /sessions/:id/complete — 整理完成（写完成时间 + 安排 30 天复查提醒 R48） */
sessionsRouter.post('/:id/complete', (req: AuthRequest, res) => {
  const session = getOwnedSession(req.userId!, Number(req.params.id));
  db.prepare(`UPDATE sessions SET status = 'done', completed_at = ?, updated_at = ? WHERE id = ?`).run(
    nowIso(),
    nowIso(),
    session.id,
  );
  // 幂等：同会话重复 complete 不重复安排
  scheduleReminder(req.userId!, session.id);
  ok(res, { completed: true }, '太棒了！这个空间整明白了');
});
