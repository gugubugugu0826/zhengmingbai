/**
 * 「整明白」共享常量。
 */
import type { SpaceType } from './types';

export const API_PREFIX = '/api/v1';

/** 空间类型中文名 */
export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  bedroom: '卧室',
  kitchen: '厨房',
  wardrobe: '衣柜',
  study: '书房',
  bathroom: '卫生间',
  living: '客厅',
  rental: '出租屋',
  office: '办公室',
  shop: '店铺',
  warehouse: '仓库',
};

export const SPACE_TYPES = Object.keys(SPACE_TYPE_LABELS) as SpaceType[];

/** 单次最多上传照片数（PRD R1） */
export const MAX_PHOTOS_PER_SESSION = 20;

/** 拍照贴士（PRD R1，至少 3 条） */
export const CAPTURE_TIPS: string[] = [
  '把柜门抽屉都打开，光线亮一点，AI 看得更清楚～',
  '全景 + 细节搭配着拍：先拍整体，再拍几个乱得厉害的角落',
  '避免拍到证件、银行卡和他人面部，保护自己和家人的隐私',
];

/** 拍照页常驻隐私提示（PRD R19） */
export const CAPTURE_PRIVACY_NOTE = '小提示：拍照时避免拍到证件、银行卡和他人面部哦';

/** 业务错误码（架构文档 3.4） */
export const ErrorCodes = {
  PARAM_INVALID: 1001,
  NOT_FOUND: 1004,
  RATE_LIMITED: 1005,
  UNAUTHORIZED: 2001,
  FORBIDDEN: 2003,
  INSUFFICIENT_POINTS: 3001,
  ORDER_STATE_INVALID: 3002,
  PAYMENT_VERIFY_FAILED: 3003,
  AI_FAILED: 4001,
} as const;
