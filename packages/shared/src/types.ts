/**
 * 「整明白」共享类型定义（web 与 miniprogram 复用）。
 * 与 server 数据库结构、API 响应一一对应。
 */

/** 统一响应格式（架构文档 3.4） */
export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

export type SpaceType =
  | 'bedroom'
  | 'kitchen'
  | 'wardrobe'
  | 'study'
  | 'bathroom'
  | 'living'
  | 'rental'
  | 'office'
  | 'shop'
  | 'warehouse';

export type SessionStatus =
  | 'uploading'
  | 'confirming'
  | 'analyzing'
  | 'planned'
  | 'executing'
  | 'done'
  | 'failed';

export type Granularity = 'region' | 'item';
export type DiscardMode = 'conservative' | 'declutter';
/** A=checklist 结构化清单 / B=todo 分步待办 / C=annotation 照片标注（必须搭配 A 或 B） */
export type OutputForm = 'checklist' | 'todo' | 'annotation';

export type PlanItemType = 'discard' | 'group' | 'storage' | 'purchase' | 'step';
export type PlanItemStatus = 'pending' | 'accepted' | 'rejected' | 'modified';

export interface User {
  id: number;
  phone: string | null;
  nickname: string;
  avatar_url: string | null;
  is_new_gift_used: number;
  reminder_enabled: number;
  delete_after_analysis: number;
  privacy_agreed_at: string | null;
}

export interface Space {
  id: number;
  user_id: number;
  name: string;
  space_type: SpaceType;
  cover_photo_id: number | null;
  created_at: string;
  last_session_at?: string | null;
  session_count?: number;
}

export interface Session {
  id: number;
  user_id: number;
  space_id: number;
  status: SessionStatus;
  granularity: Granularity | null;
  discard_mode: DiscardMode | null;
  output_forms: OutputForm[];
  points_charged: number;
  regen_count: number;
  space_name?: string;
  space_type?: SpaceType;
  created_at: string;
  completed_at: string | null;
}

export interface Photo {
  id: number;
  session_id: number;
  group_tag: string | null;
  status: string;
  taken_order: number;
  url?: string;
}

/** 确认环节：空间分组 */
export interface ConfirmGroup {
  tag: string;
  label: string;
  photo_ids: number[];
}

/** 确认环节：模糊物品 */
export interface VagueItem {
  id: string;
  photo_id: number;
  question: string;
  hint: string;
}

export interface ConfirmStartResult {
  groups: ConfirmGroup[];
  vague_items: VagueItem[];
}

/** 方案五部分内容（架构文档 2.5） */
export interface PlanContent {
  discard_suggestions: Array<{ item: string; reason: string; tone: string }>;
  groups: Array<{ name: string; items: string[]; kb_category: string }>;
  storage_advice: Array<{ group: string; location: string; tip: string }>;
  purchase_advice: Array<{ category: string; reason: string; product_link: string | null }>;
  steps: Array<{ no: number; action: string; target_groups: string[]; est_minutes: number }>;
  scene_summary: string;
  after_state_desc: string;
}

export interface PlanItem {
  id: number;
  plan_id: number;
  item_type: PlanItemType;
  content: Record<string, unknown>;
  status: PlanItemStatus;
  user_note: string | null;
  checked: number;
  sort: number;
}

export interface Plan {
  id: number;
  session_id: number;
  version: number;
  content: PlanContent;
  illustration_url: string | null;
  effect_image_url: string | null;
  effect_image_status: string;
  is_final: number;
  items: PlanItem[];
  created_at: string;
}

export interface PointsBalance {
  balance: number;
  total_earned: number;
  total_spent: number;
}

export interface PointsTransaction {
  id: number;
  change: number;
  balance_after: number;
  biz_type: string;
  biz_id: string;
  remark: string | null;
  created_at: string;
}

export interface Package {
  id: number;
  name: string;
  price_fen: number;
  points: number;
  tag: string | null;
  sort: number;
  is_active: number;
}

export type OrderStatus = 'PENDING' | 'PAID' | 'CLOSED' | 'REFUNDED';

export interface Order {
  id: number;
  order_no: string;
  package_id: number;
  package_name?: string;
  amount_fen: number;
  points: number;
  status: OrderStatus;
  channel: string;
  paid_at: string | null;
  created_at: string;
}

export interface PaymentParams {
  order_no: string;
  channel: 'mock' | 'wechat';
  /** mock 渠道：前端直接拿 sign 调回调接口，模拟"点即成功" */
  sign?: string;
  mock?: boolean;
}

/** 点数规则（存 configs.points.rules） */
export interface PointsRules {
  analysis: { region: number; item: number };
  regen_after_first: { region: number; item: number };
  effect_image_p2: number;
  new_user_gift: string;
}
