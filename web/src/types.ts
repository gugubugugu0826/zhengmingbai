/**
 * 前端类型定义（与 server 响应一一对应）。
 */

export interface PublicUser {
  id: number;
  phone: string | null;
  /** v2.2：登录/注册主键邮箱（脱敏返回），可能为 null（老微信用户） */
  email?: string | null;
  /** v2.2：显式用户名（注册必填），可能为 null */
  username?: string | null;
  /** v2.2：邮箱是否已验证 */
  email_verified?: number;
  nickname: string;
  avatar_url: string | null;
  is_new_gift_used: number;
  reminder_enabled: number;
  delete_after_analysis: number;
  privacy_agreed: boolean;
  /** admin=管理员 user=普通用户（/auth/me 返回，路由守卫用） */
  role: 'admin' | 'user';
  /** 1=超级管理员（仅 role=admin 时有意义，控制"重置密码"按钮可见性） */
  is_super?: number;
  /** v2.2：1=老用户被运营补绑后必须强制改密（路由守卫用） */
  force_password_reset?: number;
}

export interface LoginData {
  token: string;
  user: PublicUser;
  /** v2.2：邮箱/手机号密码登录已下线 is_new；微信一键登录仍返回 */
  is_new?: boolean;
  /** v2.2：1=登录后必须强制改密 */
  need_reset?: boolean;
  points: { balance: number; total_earned: number; total_spent: number };
}

export interface Space {
  id: number;
  name: string;
  space_type: string;
  cover_photo_id: number | null;
  created_at: string;
  session_count: number;
  last_session_at: string | null;
}

export interface SpaceHistoryItem {
  id: number;
  status: string;
  granularity: string | null;
  points_charged: number;
  created_at: string;
  completed_at: string | null;
  photo_count: number;
  illustration_url: string | null;
}

export type SessionStatus =
  | 'uploading'
  | 'confirming'
  | 'analyzing'
  | 'planned'
  | 'executing'
  | 'done'
  | 'failed';

export interface Session {
  id: number;
  user_id: number;
  space_id: number;
  status: SessionStatus;
  granularity: 'region' | 'item' | null;
  discard_mode: 'conservative' | 'declutter' | null;
  output_forms: string; // JSON 字符串
  points_charged: number;
  regen_count: number;
  confirm_state: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  space_type?: string;
  space_name?: string;
}

export interface Photo {
  id: number;
  session_id: number;
  user_id: number;
  cos_key: string;
  group_tag: string | null;
  status: string;
  taken_order: number;
  mime: string | null;
  size_bytes: number;
  url: string;
}

export interface ConfirmResult {
  groups: Array<{ tag: string; label: string; photo_ids: number[] }>;
  vague_items: Array<{ id: string; photo_id: number; question: string; hint: string }>;
}

export interface PlanContent {
  discard_suggestions: Array<{ item: string; reason: string; tone: string }>;
  groups: Array<{ name: string; items: string[]; kb_category: string }>;
  storage_advice: Array<{ group: string; location: string; tip: string }>;
  purchase_advice: Array<{ category: string; reason: string; product_link: string | null }>;
  steps: Array<{ no: number; action: string; target_groups: string[]; est_minutes: number }>;
  scene_summary: string;
  after_state_desc: string;
}

export type PlanItemType = 'discard' | 'group' | 'storage' | 'purchase' | 'step';

export interface PlanItem {
  id: number;
  item_type: PlanItemType;
  content: Record<string, unknown>;
  status: 'pending' | 'accepted' | 'rejected' | 'modified';
  user_note: string | null;
  checked: number;
  sort: number;
}

export interface PlanDetail {
  id: number;
  session_id: number;
  version: number;
  content: PlanContent;
  illustration_url: string | null;
  /** 高阶文生图个性化插画签名 URL；null 时展示素材图 illustration_url */
  t2i_image_url?: string | null;
  effect_image_url: string | null;
  effect_image_status: string;
  is_final: number;
  items: PlanItem[];
  todo_progress: { total: number; checked: number };
  created_at: string;
}

export interface PointsRules {
  analysis: { region: number; item: number };
  regen_after_first: { region: number; item: number };
  effect_image_p2: number;
  new_user_gift_points: number;
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

export interface OrderResult {
  order: {
    id: number;
    order_no: string;
    amount_fen: number;
    points: number;
    status: string;
    channel: string;
  };
  payment: {
    order_no: string;
    channel: string;
    mock: boolean;
    sign: string;
  };
}

export interface PayCallbackResult {
  order_no: string;
  status: string;
  balance: number;
  points_added: number;
}

export interface ShareCard {
  cover_url: string | null;
  points: string[];
  brand: string;
  space_label: string;
}

export interface SessionDetail extends Session {
  photos: Photo[];
  plan: PlanDetail | null;
  /** 会话最近一条进行中的文生图任务（刷新页面续轮询用） */
  active_t2i_task?: { id: number; plan_id: number; status: string } | null;
}

export const SPACE_TYPE_LABELS: Record<string, string> = {
  kitchen: '厨房',
  bedroom: '卧室',
  wardrobe: '衣柜',
  study: '书房',
  bathroom: '卫生间',
  living: '客厅',
  rental: '出租屋',
  office: '办公室',
  shop: '店铺',
  warehouse: '仓库',
  other: '其他',
};

/**
 * Capture 页可选空间类型（PRD 4.1 + BUG-6 修复）：
 * - 第 9 项 "其他" 提交 type='other'（原错配 'rental'）
 * - 新增第 10 项 "仓库" type='warehouse'
 */
export const SPACE_CHOICES: Array<{ type: string; label: string; emoji: string }> = [
  { type: 'kitchen', label: '厨房', emoji: '🍳' },
  { type: 'bedroom', label: '卧室', emoji: '🛏️' },
  { type: 'wardrobe', label: '衣柜', emoji: '👗' },
  { type: 'study', label: '书房', emoji: '📚' },
  { type: 'bathroom', label: '卫生间', emoji: '🛁' },
  { type: 'living', label: '客厅', emoji: '🛋️' },
  { type: 'office', label: '办公室', emoji: '💼' },
  { type: 'shop', label: '店铺', emoji: '🏪' },
  { type: 'warehouse', label: '仓库', emoji: '📦' },
  { type: 'other', label: '其他', emoji: '🧺' },
];

/* ================= v3 T02 增量 ================= */

/** 照片类别：before=整理前（存量默认）/ after=整理后（前后对比存档） */
export type PhotoKind = 'before' | 'after';

/** 公开配置（GET /configs/public，无鉴权） */
export interface PublicConfigs {
  /** 小程序订阅消息模板 ID（空串 = 不展示授权引导） */
  subscribe_template_id: string;
  maintenance: {
    enabled: boolean;
    notice: string;
  };
}

/** 忘记密码——发送邮箱验证码（scene=reset_password，弹窗图形码通过后才调用） */
export interface EmailCodePayload {
  email: string;
  scene: 'register' | 'login' | 'reset_password' | 'change_email';
  captcha_id: string;
  captcha_code: string;
}

/** 忘记密码——重置（POST /auth/password-reset） */
export interface PasswordResetPayload {
  email: string;
  code: string;
  new_password: string;
}

/** after-photos 上传响应（POST /sessions/:id/after-photos） */
export interface AfterPhotosResult {
  photos: Array<{ id: number; url: string; kind: PhotoKind }>;
}

/** 空间详情响应增量：整理后照片（前后对比并排展示，T03 使用） */
export interface SpaceDetailPhotos {
  photos: string[];
  after_photos: string[];
}

export const SESSION_STATUS_LABELS: Record<string, string> = {
  uploading: '照片上传中',
  confirming: '待确认',
  analyzing: 'AI 分析中',
  planned: '方案已生成',
  executing: '正在执行',
  done: '已完成',
  failed: '未完成',
};
