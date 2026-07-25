/**
 * 上传校验（R18）：白名单 MIME、单张 ≤10MB、数量 ≤20、读文件头魔数二次校验。
 */
import { BizError } from '../../common/errors.js';

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PHOTOS = 20;

/** 允许的 MIME → 扩展名与魔数 */
const ALLOWED: Record<string, { ext: string; magic: (buf: Buffer) => boolean }> = {
  'image/jpeg': {
    ext: 'jpg',
    magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  'image/png': {
    ext: 'png',
    magic: (b) =>
      b.length > 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  'image/webp': {
    ext: 'webp',
    magic: (b) =>
      b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
  // HEIC/HEIF: ftyp box，品牌 heic/heix/hevc/mif1
  'image/heic': {
    ext: 'heic',
    magic: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp',
  },
};

export interface ValidatedPhoto {
  buffer: Buffer;
  ext: string;
  mime: string;
}

/** 解析 data:image/xxx;base64,.... 为 Buffer */
export function parseBase64Image(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([a-z0-9/+.-]+);base64,(.+)$/is.exec(dataUrl || '');
  if (!match) throw BizError.param('照片格式不正确，请重新选择');
  const mime = match[1].toLowerCase();
  let buffer: Buffer;
  try {
    buffer = Buffer.from(match[2], 'base64');
  } catch {
    throw BizError.param('照片数据损坏，请重新上传');
  }
  return { buffer, mime };
}

/** 完整校验：MIME 白名单 + 大小 + 魔数二次校验 */
export function validatePhoto(buffer: Buffer, mime: string): ValidatedPhoto {
  const rule = ALLOWED[mime];
  if (!rule) {
    throw BizError.param('只支持 JPG / PNG / WebP / HEIC 格式的照片哦');
  }
  if (buffer.length === 0) throw BizError.param('照片是空的，请重新上传');
  if (buffer.length > MAX_PHOTO_BYTES) {
    throw BizError.param('单张照片不能超过 10MB，请压缩后再传');
  }
  // 魔数二次校验：防伪造 Content-Type 上传可执行文件
  if (!rule.magic(buffer)) {
    throw BizError.param('照片内容校验未通过，请换一张试试');
  }
  return { buffer, ext: rule.ext, mime };
}

export function assertPhotoCount(current: number, incoming: number): void {
  if (incoming < 1) throw BizError.param('至少上传 1 张照片');
  if (current + incoming > MAX_PHOTOS) {
    throw BizError.param(`一次最多上传 ${MAX_PHOTOS} 张照片，当前已有 ${current} 张`);
  }
}
