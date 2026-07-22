/**
 * 方案服务（R4/R6/R8）：结构化存取、条目采纳/拒绝/修改、重生成、执行清单进度保存。
 * 每个条目在 plan_items 冗余一行承载采纳状态，重生成时喂回编排器。
 */
import { db, nowIso, withTransaction } from '../../db.js';
import { BizError } from '../../common/errors.js';
import type { PlanContent } from '../ai/orchestrator.types.js';
import { validatePlanContent } from './schema-validator.js';
import { storage } from '../upload/storage.js';

export interface PlanRow {
  id: number;
  session_id: number;
  version: number;
  content_json: string;
  illustration_url: string | null;
  effect_image_url: string | null;
  effect_image_status: string;
  t2i_image_key: string | null;
  is_final: number;
  created_at: string;
}

export interface PlanItemRow {
  id: number;
  plan_id: number;
  item_type: string;
  content_json: string;
  status: string;
  user_note: string | null;
  checked: number;
  sort: number;
}

/** 落库方案 + 展开为条目（事务） */
export function savePlan(
  sessionId: number,
  version: number,
  content: PlanContent,
  illustrationUrl: string,
): PlanRow {
  const validated = validatePlanContent(content);
  return withTransaction(() => {
    const result = db
      .prepare(
        `INSERT INTO plans (session_id, version, content_json, illustration_url)
         VALUES (?, ?, ?, ?)`,
      )
      .run(sessionId, version, JSON.stringify(validated), illustrationUrl);
    const planId = Number(result.lastInsertRowid);
    insertPlanItems(planId, validated);
    return db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow;
  });
}

/**
 * 重生成落库（v2.2 BUG-1）：版本号 MAX(version)+1 与 INSERT 在同一事务内完成，
 * 利用 SQLite 单写者串行天然消除"并发重生成版本号重复"竞态（架构 §2.3.8）。
 * 调用方（regen-worker）不再从任务 payload 携带 version。
 */
export function saveNextPlan(
  sessionId: number,
  content: PlanContent,
  illustrationUrl: string,
): PlanRow {
  const validated = validatePlanContent(content);
  return withTransaction(() => {
    const { maxVersion } = db
      .prepare('SELECT COALESCE(MAX(version), 0) AS maxVersion FROM plans WHERE session_id = ?')
      .get(sessionId) as { maxVersion: number };
    const result = db
      .prepare(
        `INSERT INTO plans (session_id, version, content_json, illustration_url)
         VALUES (?, ?, ?, ?)`,
      )
      .run(sessionId, maxVersion + 1, JSON.stringify(validated), illustrationUrl);
    const planId = Number(result.lastInsertRowid);
    insertPlanItems(planId, validated);
    return db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow;
  });
}

function insertPlanItems(planId: number, content: PlanContent): void {
  const stmt = db.prepare(
    `INSERT INTO plan_items (plan_id, item_type, content_json, sort) VALUES (?, ?, ?, ?)`,
  );
  let sort = 0;
  const push = (type: string, item: unknown): void => {
    stmt.run(planId, type, JSON.stringify(item), sort++);
  };
  content.discard_suggestions.forEach((i) => push('discard', i));
  content.groups.forEach((i) => push('group', i));
  content.storage_advice.forEach((i) => push('storage', i));
  content.purchase_advice.forEach((i) => push('purchase', i));
  content.steps.forEach((i) => push('step', i));
}

export function getPlanById(planId: number): PlanRow {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as PlanRow | undefined;
  if (!plan) throw BizError.notFound('方案不存在');
  return plan;
}

export function getLatestPlan(sessionId: number): PlanRow | null {
  return (
    (db
      .prepare('SELECT * FROM plans WHERE session_id = ? ORDER BY version DESC LIMIT 1')
      .get(sessionId) as PlanRow | undefined) ?? null
  );
}

export function listPlanItems(planId: number): PlanItemRow[] {
  return db
    .prepare('SELECT * FROM plan_items WHERE plan_id = ? ORDER BY sort, id')
    .all(planId) as PlanItemRow[];
}

export function getPlanItem(itemId: number): PlanItemRow {
  const item = db.prepare('SELECT * FROM plan_items WHERE id = ?').get(itemId) as
    | PlanItemRow
    | undefined;
  if (!item) throw BizError.notFound('建议条目不存在');
  return item;
}

export type ItemStatus = 'accepted' | 'rejected' | 'modified';

/** 采纳 / 拒绝 / 修改（R6 三种操作均可用） */
export function updateItemStatus(itemId: number, status: ItemStatus, userNote?: string): void {
  if (status === 'modified' && !userNote?.trim()) {
    throw BizError.param('修改建议时请写上你的想法哦');
  }
  db.prepare(
    `UPDATE plan_items SET status = ?, user_note = ?, updated_at = ? WHERE id = ?`,
  ).run(status, userNote?.trim() ?? null, nowIso(), itemId);
}

/** to-do 勾选（R8：进度云端保存，中断重进恢复） */
export function setItemChecked(itemId: number, checked: boolean): void {
  db.prepare('UPDATE plan_items SET checked = ?, updated_at = ? WHERE id = ?').run(
    checked ? 1 : 0,
    nowIso(),
    itemId,
  );
}

/** 定格方案（"全部确认，生成最终方案"） */
export function finalizePlan(planId: number): void {
  db.prepare('UPDATE plans SET is_final = 1, updated_at = ? WHERE id = ?').run(nowIso(), planId);
}

/** 收集用户反馈（重生成时喂回编排器） */
export function collectFeedback(planId: number): { rejected: string[]; modified: string[] } {
  const items = listPlanItems(planId);
  const text = (item: PlanItemRow): string => {
    const c = JSON.parse(item.content_json) as Record<string, unknown>;
    return String(c.item ?? c.name ?? c.category ?? c.action ?? '');
  };
  return {
    rejected: items.filter((i) => i.status === 'rejected').map(text),
    modified: items
      .filter((i) => i.status === 'modified')
      .map((i) => `${text(i)}（用户：${i.user_note}）`),
  };
}

/** 执行清单进度（R8） */
export function todoProgress(planId: number): { total: number; checked: number } {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(checked), 0) AS checked
       FROM plan_items WHERE plan_id = ? AND item_type = 'step' AND status != 'rejected'`,
    )
    .get(planId) as { total: number; checked: number };
  return row;
}

/** 组装完整方案响应（含条目与进度） */
export function planDetail(plan: PlanRow): Record<string, unknown> {
  const items = listPlanItems(plan.id).map((i) => ({
    id: i.id,
    item_type: i.item_type,
    content: JSON.parse(i.content_json),
    status: i.status,
    user_note: i.user_note,
    checked: i.checked,
    sort: i.sort,
  }));
  return {
    id: plan.id,
    session_id: plan.session_id,
    version: plan.version,
    content: JSON.parse(plan.content_json),
    illustration_url: plan.illustration_url,
    effect_image_url: plan.effect_image_url,
    effect_image_status: plan.effect_image_status,
    // 高阶文生图：现场签发 15 分钟签名 URL（与照片同款）；NULL=前端展示素材图
    t2i_image_url: plan.t2i_image_key ? storage.signedUrl(plan.t2i_image_key) : null,
    is_final: plan.is_final,
    items,
    todo_progress: todoProgress(plan.id),
    created_at: plan.created_at,
  };
}
