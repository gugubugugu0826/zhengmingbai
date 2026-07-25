/**
 * 分享服务（R7）：组装分享卡片数据。
 * 封面 = 该 session 首张照片的签名 URL；要点 = 最新方案步骤前 5 条。
 */
import { db } from '../../db.js';
import { storage } from '../upload/storage.js';
import { getLatestPlan } from '../plans/service.js';
import type { PlanContent } from '../ai/orchestrator.types.js';
import type { SessionRow } from '../sessions/service.js';
import { SPACE_TYPE_LABELS } from '../ai/mock-data.js';

export interface ShareCardPayload {
  cover_url: string | null;
  points: string[];
  brand: '整明白';
  space_label: string;
}

/** 组装分享卡片数据（session 归属已在路由层校验） */
export function buildShareCard(session: SessionRow): ShareCardPayload {
  const firstPhoto = db
    .prepare(
      `SELECT cos_key FROM photos
       WHERE session_id = ? AND status = 'active' ORDER BY taken_order LIMIT 1`,
    )
    .get(session.id) as { cos_key: string } | undefined;

  const plan = getLatestPlan(session.id);
  let points: string[] = [];
  if (plan) {
    const content = JSON.parse(plan.content_json) as PlanContent;
    points = content.steps
      .slice()
      .sort((a, b) => a.no - b.no)
      .slice(0, 5)
      .map((s) => s.action);
  }

  return {
    cover_url: firstPhoto ? storage.signedUrl(firstPhoto.cos_key) : null,
    points,
    brand: '整明白',
    space_label: SPACE_TYPE_LABELS[session.space_type ?? ''] ?? '这个空间',
  };
}
