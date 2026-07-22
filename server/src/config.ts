/**
 * 全局配置：读取 .env（无外部依赖的极简解析）+ 环境变量。
 * 运行期可变配置（点数规则/支付开关/AI 开关等）一律走 configs 表热加载（见 modules/configs）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(SERVER_ROOT, '..');

/** 极简 .env 解析：KEY=VALUE，支持引号与注释 */
function loadDotEnv(): void {
  for (const p of [path.join(SERVER_ROOT, '.env'), path.join(REPO_ROOT, '.env')]) {
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, 'utf-8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

loadDotEnv();

function resolveFromServer(p: string): string {
  return path.isAbsolute(p) ? p : path.join(SERVER_ROOT, p);
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  fileSignSecret: process.env.FILE_SIGN_SECRET || 'dev-file-secret-change-me',
  dbFile: resolveFromServer(process.env.DB_FILE || './data/zhengmingbai.db'),
  uploadDir: resolveFromServer(process.env.UPLOAD_DIR || './uploads'),
  /** env 仅作 configs 表的初始兜底，运行期以 configs 表为准（改配置=改数据库，不发版） */
  aiMock: (process.env.AI_MOCK || 'true') === 'true',
  paymentChannel: process.env.PAYMENT_CHANNEL || 'mock',
  /** 存储通道（R45）：local|cos，进程级切换 */
  storageChannel: process.env.STORAGE_CHANNEL || 'local',
  /** 验证码通道（R47）：mock|email|sms，进程级切换（登录前置环节不依赖数据库） */
  verificationChannel: process.env.VERIFICATION_CHANNEL || 'mock',
  /** 二期真实服务钥匙 */
  dashscopeApiKey: process.env.DASHSCOPE_API_KEY || '',
  /** 百炼 OpenAI 兼容模式 baseURL（业务空间专属域名，公共域名对业务空间 key 报错） */
  dashscopeBaseUrl:
    process.env.DASHSCOPE_BASE_URL ||
    'https://ws-nyo2f1ym27hvfsi8.cn-beijing.maas.aliyuncs.com/compatible-mode/v1',
  wechatAppId: process.env.WECHAT_APPID || '',
  wechatSecret: process.env.WECHAT_SECRET || '',
  cos: {
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    bucket: process.env.COS_BUCKET || '',
    region: process.env.COS_REGION || '',
  },
  /** 腾讯云 SES SendEmail API（email 验证码通道用；密钥复用 COS 同一 CAM 子账号） */
  ses: {
    secretId: process.env.COS_SECRET_ID || '',
    secretKey: process.env.COS_SECRET_KEY || '',
    region: process.env.SES_REGION || 'ap-guangzhou',
    from: process.env.SES_FROM || 'noreply@zhengmingbai.cn',
    fromAlias: '整明白',
    templateId: Number(process.env.SES_TEMPLATE_ID || 54571), // 「登录验证码」模板，变量 {{code}}
    /**
     * v3：SES 模板按 scene 映射（任务书 §6，env 可覆盖）。
     * - register/login → 54571 登录验证码（变量 {{code}}）
     * - reset_password → 54718 忘记密码验证码（变量 {{code}}）
     * - change_email → 54717 更改绑定邮箱验证码（变量 {{code}}）
     * - legacy_migration → 54719 账号迁移临时密码通知（变量 {{password}}）
     * admin_login/admin_reset_password 等未列场景回落默认模板 54571。
     */
    templateIds: {
      register: Number(process.env.SES_TEMPLATE_ID_REGISTER || 54571),
      login: Number(process.env.SES_TEMPLATE_ID_LOGIN || 54571),
      reset_password: Number(process.env.SES_TEMPLATE_ID_RESET_PASSWORD || 54718),
      change_email: Number(process.env.SES_TEMPLATE_ID_CHANGE_EMAIL || 54717),
      legacy_migration: Number(process.env.SES_TEMPLATE_ID_LEGACY_MIGRATION || 54719),
    },
  },
} as const;

// R50：生产环境禁止使用默认弱密钥，直接拒绝启动
if (config.nodeEnv === 'production') {
  if (
    config.jwtSecret === 'dev-only-secret-change-me' ||
    config.fileSignSecret === 'dev-file-secret-change-me'
  ) {
    throw new Error('生产环境必须通过 .env 配置 JWT_SECRET / FILE_SIGN_SECRET');
  }
}
