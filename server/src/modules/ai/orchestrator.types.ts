/**
 * AI 编排器类型定义。
 */

/** 方案五部分内容（架构文档 2.5，与 plans.content_json 一致） */
export interface PlanContent {
  discard_suggestions: Array<{ item: string; reason: string; tone: string }>;
  groups: Array<{ name: string; items: string[]; kb_category: string }>;
  storage_advice: Array<{ group: string; location: string; tip: string }>;
  purchase_advice: Array<{ category: string; reason: string; product_link: string | null }>;
  steps: Array<{ no: number; action: string; target_groups: string[]; est_minutes: number }>;
  scene_summary: string;
  after_state_desc: string;
}

export interface ConfirmResult {
  groups: Array<{ tag: string; label: string; photo_ids: number[] }>;
  vague_items: Array<{ id: string; photo_id: number; question: string; hint: string }>;
}

export interface SessionContext {
  sessionId: number;
  spaceType: string;
  spaceName: string;
  discardMode: string;
  granularity: string;
  vagueAnswers: string[];
}
