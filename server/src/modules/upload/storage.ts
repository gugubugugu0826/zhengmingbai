/**
 * 存储通道抽象（R17/R45）。
 * LocalStorageChannel：本地开发默认，存 server/uploads/，HMAC 签名 URL 模拟 COS 过期行为。
 * COSChannel：生产用腾讯云 COS，预签名 URL（15 分钟）+ 服务端加密 AES256。
 * 按 .env STORAGE_CHANNEL=local|cos 工厂实例化，业务代码零改动。
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import COS from 'cos-nodejs-sdk-v5';
import { config } from '../../config.js';
import { BizError } from '../../common/errors.js';

export interface StorageChannel {
  readonly name: 'local' | 'cos';
  /** 保存文件，返回对象键 */
  putObject(buffer: Buffer, ext: string): Promise<string>;
  /** 读取文件（服务端内部使用） */
  getObject(key: string): Promise<Buffer>;
  /** 删除对象（"分析完即删"） */
  deleteObject(key: string): Promise<void>;
  /** 签发带过期时间的访问 URL（15 分钟） */
  signedUrl(key: string, expiresInSec?: number): string;
  /** 校验签名 URL，返回对象键；过期/伪造一律拒绝 */
  verifySignedUrl(key: string, expires: number, sign: string): string;
}

/** 本地存储通道：模拟 COS 的加密存储 + 签名 URL 行为 */
export class LocalStorageChannel implements StorageChannel {
  readonly name = 'local' as const;
  private readonly dir: string;

  constructor(dir: string = config.uploadDir) {
    this.dir = dir;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private keyPath(key: string): string {
    // 防路径穿越
    if (!/^[a-f0-9]{32}\.[a-z0-9]+$/.test(key)) throw BizError.forbidden('非法的照片标识');
    return path.join(this.dir, key);
  }

  async putObject(buffer: Buffer, ext: string): Promise<string> {
    // 对象键用随机 UUID，不可遍历（对齐 COS 安全要求）
    const key = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    fs.writeFileSync(this.keyPath(key), buffer);
    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    const p = this.keyPath(key);
    if (!fs.existsSync(p)) throw BizError.notFound('照片不存在或已删除');
    return fs.readFileSync(p);
  }

  async deleteObject(key: string): Promise<void> {
    const p = this.keyPath(key);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  private sign(key: string, expires: number): string {
    return crypto
      .createHmac('sha256', config.fileSignSecret)
      .update(`${key}:${expires}`)
      .digest('hex')
      .slice(0, 32);
  }

  signedUrl(key: string, expiresInSec = 900): string {
    const expires = Math.floor(Date.now() / 1000) + expiresInSec;
    return `/api/v1/files/${key}?expires=${expires}&sign=${this.sign(key, expires)}`;
  }

  verifySignedUrl(key: string, expires: number, sign: string): string {
    if (!expires || !sign) throw BizError.forbidden('链接无效');
    if (Math.floor(Date.now() / 1000) > expires) {
      throw BizError.forbidden('链接已过期，请刷新页面重新获取');
    }
    const expected = this.sign(key, expires);
    const a = Buffer.from(sign);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      throw BizError.forbidden('链接签名不正确');
    }
    return key;
  }
}

/**
 * COS 通道（R45）：cos-nodejs-sdk-v5 实装。
 * 预签名 URL 由腾讯云网关校验过期，服务端无需 verify；
 * putObject 开启 SSE-AES256 服务端加密；key 与本地通道同格式（32 位 hex + 扩展名）。
 */
export class COSChannel implements StorageChannel {
  readonly name = 'cos' as const;
  private readonly cos: COS;
  private readonly bucket: string;
  private readonly region: string;

  constructor() {
    if (!config.cos.secretId || !config.cos.secretKey || !config.cos.bucket || !config.cos.region) {
      throw new Error('COS 未配置：请填写 COS_SECRET_ID / COS_SECRET_KEY / COS_BUCKET / COS_REGION');
    }
    this.cos = new COS({ SecretId: config.cos.secretId, SecretKey: config.cos.secretKey });
    this.bucket = config.cos.bucket;
    this.region = config.cos.region;
  }

  async putObject(buffer: Buffer, ext: string): Promise<string> {
    const key = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    await this.cos.putObject({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Body: buffer,
      ServerSideEncryption: 'AES256',
    });
    return key;
  }

  async getObject(key: string): Promise<Buffer> {
    try {
      const result = await this.cos.getObject({ Bucket: this.bucket, Region: this.region, Key: key });
      return result.Body as Buffer;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      if (status === 404) throw BizError.notFound('照片不存在或已删除');
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.cos.deleteObject({ Bucket: this.bucket, Region: this.region, Key: key });
    } catch (err) {
      // 删除幂等：对象不存在不视为错误（purge 重试安全）
      const status = (err as { statusCode?: number }).statusCode;
      if (status !== 404) throw err;
    }
  }

  /** 预签名 URL（默认 15 分钟过期，由腾讯云网关强制校验） */
  signedUrl(key: string, expiresInSec = 900): string {
    return this.cos.getObjectUrl({
      Bucket: this.bucket,
      Region: this.region,
      Key: key,
      Sign: true,
      Expires: expiresInSec,
    });
  }

  verifySignedUrl(): string {
    throw new Error('COS 签名 URL 由腾讯云网关校验，服务端无需 verify');
  }
}

/** 当前生效的存储通道：按 .env STORAGE_CHANNEL=local|cos 工厂实例化（R45） */
export const storage: StorageChannel =
  config.storageChannel === 'cos' ? new COSChannel() : new LocalStorageChannel();
