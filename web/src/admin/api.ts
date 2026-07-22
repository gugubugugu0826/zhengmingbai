/**
 * admin 后台共享类型与工具。
 */

export interface AdminUserRow {
  id: number;
  phone: string | null;
  nickname: string;
  role: string;
  created_at: string;
  balance: number;
  total_spent: number;
}

export interface AdminUserDetail {
  user: AdminUserRow & {
    reminder_enabled: number;
    delete_after_analysis: number;
    total_earned: number;
  };
  transactions: { list: PointTransaction[]; total: number };
}

export interface PointTransaction {
  id: number;
  change: number;
  balance_after: number;
  biz_type: string;
  biz_id: string;
  remark: string;
  created_at: string;
}

export interface KnowledgeRow {
  id: number;
  space_type: string;
  category: string;
  items_json: string;
  sort: number;
  is_active: number;
}

export interface PackageRow {
  id: number;
  name: string;
  price_fen: number;
  points: number;
  tag: string | null;
  sort: number;
  is_active: number;
}

export interface DashboardSummary {
  users: number;
  analyses: number;
  points_granted: number;
  points_spent: number;
}

export interface AiCostDaily {
  day: string;
  calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_yuan: number;
}

export interface AiCostDetail {
  id: number;
  session_id: number | null;
  stage: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  est_cost_yuan: number;
  mock: number;
  created_at: string;
}

export interface AiCostsResult {
  daily: AiCostDaily[];
  detail: AiCostDetail[];
  over_budget_count: number;
}

/** 列表通用分页形态 */
export interface Paged<T> {
  list: T[];
  total: number;
}

/** 掩码手机号兜底（admin 接口返回全量手机号，直接展示） */
export function fmtPhone(phone: string | null): string {
  return phone ?? '微信用户';
}

/** 时间显示：UTC ISO → 本地短格式 */
export function fmtTime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso.endsWith('Z') ? iso : `${iso}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 点数流水类型中文名 */
export const BIZ_TYPE_LABELS: Record<string, string> = {
  order_recharge: '充值',
  analysis: '分析扣点',
  regen: '重生成扣点',
  gift: '赠送',
  refund: '退款',
  admin_deduct: '管理员扣减',
};
