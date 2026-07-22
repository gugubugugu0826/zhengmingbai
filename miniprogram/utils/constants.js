/**
 * 共享常量（v3，与 Web 端 types.ts 对齐）
 *
 * 空间 10 类枚举、偏好三件套选项、状态标签、API 路径常量。
 */

/* ============ 空间类型（10 种完整，D10 对齐 Web） ============ */

const SPACE_TYPE_LABELS = {
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

/** Capture 页可选空间类型（10 项，与 Web SPACE_CHOICES 一致） */
const SPACE_CHOICES = [
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

/** 空间类型 → emoji（列表页用） */
function spaceEmoji(spaceType) {
  const found = SPACE_CHOICES.find((c) => c.type === spaceType);
  return found ? found.emoji : '🏠';
}

/* ============ 偏好三件套（D10 对齐 Web Confirm 页） ============ */

/** 丢弃模式 */
const DISCARD_MODES = [
  { key: 'conservative', label: '🌿 保守模式', desc: '只建议明显用不上的，慢慢来' },
  { key: 'declutter', label: '🍃 断舍离模式', desc: '大胆一点，给生活腾地方' },
];

/** 分析粒度（点数标价以后端 DEFAULT_POINTS_RULES 为准，前端展示用默认值） */
const GRANULARITIES = [
  { key: 'region', label: '区域级', desc: '按区域出方案，够用好上手', points: 10 },
  { key: 'item', label: '物品级', desc: '细到每件物品，方案更精准', points: 25 },
];

/** 输出形式（C 必须搭配 A 或 B） */
const OUTPUT_FORMS = [
  { key: 'checklist', label: 'A · 结构化清单', desc: '分类、位置、步骤一页看清' },
  { key: 'todo', label: 'B · 分步待办清单', desc: '照着勾选，一步一步来' },
  { key: 'annotation', label: 'C · 照片标注', desc: '在照片上标出物品归位（需搭配 A 或 B）' },
];

/* ============ 会话 / 空间状态 ============ */

const SESSION_STATUS_LABELS = {
  uploading: '照片上传中',
  confirming: '待确认',
  analyzing: 'AI 分析中',
  planned: '方案已生成',
  executing: '正在执行',
  done: '已完成',
  failed: '未完成',
};

/** 空间状态机（裁决 §五-I-2）：已采纳未开始=待执行；有勾选=执行中；全勾=已完成 */
const SPACE_STATUS = {
  PENDING: '待执行',
  DOING: '执行中',
  DONE: '已完成',
};

/* ============ 消息筛选 Tab（§5-I-3） ============ */

const MESSAGE_TABS = [
  { key: 'all', label: '全部' },
  { key: 'reminder', label: '复查提醒' },
  { key: 'points', label: '点数变动' },
  { key: 'system', label: '系统通知' },
];

/** 消息 type → 筛选 Tab（宽松匹配，与 Web Messages 页一致） */
function matchMessageTab(msg, tab) {
  if (tab === 'all') return true;
  const t = (msg.type || '').toLowerCase();
  if (tab === 'reminder') return t.indexOf('reminder') >= 0 || t.indexOf('review') >= 0;
  if (tab === 'points') return t.indexOf('point') >= 0;
  return t.indexOf('system') >= 0 || t === 'notice' || t === 'announcement';
}

/* ============ 拍照 / 上传限制 ============ */

/** 开始整理照片上限 */
const MAX_PHOTOS = 20;

/** 整理后照片上限（after-photos） */
const MAX_AFTER_PHOTOS = 9;

/* ============ 格式化工具 ============ */

/** "今天整理过 / 昨天整理过 / N 天前整理过" */
function formatLastTime(iso) {
  if (!iso) return '还没整理过';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return '今天整理过';
  if (days === 1) return '昨天整理过';
  if (days < 30) return `${days} 天前整理过`;
  return `${Math.floor(days / 30)} 个月前整理过`;
}

/** ISO → "M月D日" */
function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** ISO → "M月D日 HH:mm" */
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

module.exports = {
  SPACE_TYPE_LABELS,
  SPACE_CHOICES,
  spaceEmoji,
  DISCARD_MODES,
  GRANULARITIES,
  OUTPUT_FORMS,
  SESSION_STATUS_LABELS,
  SPACE_STATUS,
  MESSAGE_TABS,
  matchMessageTab,
  MAX_PHOTOS,
  MAX_AFTER_PHOTOS,
  formatLastTime,
  formatDate,
  formatDateTime,
};
