/**
 * 服务入口：Express 装配 + 启动。
 * 挂载约定（架构文档 3.4）：统一前缀 /api/v1；响应 { code, data, message }；
 * JWT 中间件校验除 /api/v1/auth/*、/health、签名文件访问、插画素材外的全部请求。
 */
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { migrate, db } from './db.js';
import { config } from './config.js';
import { logger } from './common/logger.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { maintenanceMiddleware } from './middleware/maintenance.js';
import { authMiddleware } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { authRouter } from './modules/auth/routes.js';
import { captchaRouter } from './modules/auth/captcha/routes.js';
import { spacesRouter } from './modules/spaces/routes.js';
import { sessionsRouter } from './modules/sessions/routes.js';
import { filesRouter } from './modules/upload/routes.js';
import { plansRouter } from './modules/plans/routes.js';
import { pointsRouter } from './modules/points/routes.js';
import { ordersRouter } from './modules/orders/routes.js';
import { configsRouter, publicConfigsRouter } from './modules/configs/routes.js';
import { knowledgeRouter } from './modules/knowledge/routes.js';
import { shareRouter, illustrationsRouter } from './modules/share/routes.js';
import { messagesRouter } from './modules/messages/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { adminAuth } from './modules/admin/middleware.js';
import { adminAuthRouter } from './modules/admin/auth-routes.js';
import { accountRouter } from './modules/account/routes.js';
import { wechatRouter } from './modules/wechat/routes.js';
import { initAdminAccounts } from './modules/auth/admin-init.js';
import { startWorkers, stopWorkers } from './workers.js';

migrate();
// 启动兜底：部署后忘了跑 npm run init-admins 也能自愈（幂等，已初始化的跳过）
initAdminAccounts();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// v3.1 T01：安全响应头（CSP 由反代/静态站点层控制，这里不强行下发，避免误伤管理后台内联资源）
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// v3.1 T01：CORS 白名单（API 无 cookie 场景，credentials 关闭；浏览器端带 Origin 才校验，小程序/服务端直连无 Origin 直接放行）
const corsAllowlist = new Set<string>([
  'https://zhengmingbai.cn',
  'https://www.zhengmingbai.cn',
]);
const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
app.use(
  cors({
    origin(origin, callback) {
      // 无 Origin（小程序/服务端直连/curl）一律放行——实际鉴权由 JWT 承担
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsAllowlist.has(origin)) {
        callback(null, true);
        return;
      }
      // 仅开发环境放行 localhost 任意端口（web 端 Vite dev server 端口不固定）
      if (config.nodeEnv !== 'production' && localhostPattern.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error('CORS origin not allowed'));
    },
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  }),
);

// v3.1 T05：微信回调 XML 体解析（必须在 express.json 之前注册 text 类型，
// 仅匹配 /api/v1/wechat 路径——微信 POST Content-Type 为 text/xml）
app.use('/api/v1/wechat', express.text({ type: ['text/xml', 'application/xml', 'text/*'], limit: '1mb' }));

// base64 照片上传需要较大的 body（R51：20 张压缩后约 1MB/张 ≈ 27MB，留一倍余量）
app.use(express.json({ limit: '60mb' }));

app.use(globalLimiter);

// v3：维护模式（globalLimiter 之后、JWT 之前全站生效；豁免 health/admin/configs）
app.use(maintenanceMiddleware);

/** 健康检查（无需鉴权） */
app.get('/health', (_req, res) => {
  res.json({ code: 0, data: { ok: true }, message: 'ok' });
});

// 无需 JWT 的路由
app.use('/api/v1/auth', authRouter);
// v2.2：图形验证码（无鉴权，自带每 IP 30 次/分限流）
app.use('/api/v1/captcha', captchaRouter);
// v2.2 A-11：/admin 三段式双因子登录（无鉴权，敏感限流）
app.use('/api/v1/admin/auth', adminAuthRouter);
// 签名 URL 本身就是凭证（对齐 COS 预签名行为），不走 JWT
app.use('/api/v1/files', filesRouter);
// 插画素材为静态资源，公开可读
app.use('/api/v1/illustrations', illustrationsRouter);
// v3：公开配置只读（订阅模板 ID / 维护公告；无鉴权，白名单 key）
app.use('/api/v1/configs', publicConfigsRouter);
// v3.1 T05：微信公众号消息回调（无鉴权，微信平台直连；maintenance 已豁免；应答裸文本非 envelope）
app.use('/api/v1/wechat', wechatRouter);

// 其余全部需要登录
app.use('/api/v1', authMiddleware);
app.use('/api/v1/spaces', spacesRouter);
app.use('/api/v1/sessions', sessionsRouter);
app.use('/api/v1/plans', plansRouter);
app.use('/api/v1/points', pointsRouter);
app.use('/api/v1', ordersRouter); // 含 /packages /orders /payments/mock/callback
// 阶段 2：configs 收编管理员权限（遗留 #1：内部配置普通用户不可见/不可改）
app.use('/api/v1/configs', adminAuth, configsRouter);
app.use('/api/v1/knowledge', knowledgeRouter);
app.use('/api/v1/share', shareRouter);
app.use('/api/v1/messages', messagesRouter);
// v2.2 A-10：账号页（需登录，挂在 authMiddleware 之后）
app.use('/api/v1/account', accountRouter);
app.use('/api/v1/admin', adminRouter);

// 兜底 404（统一响应格式）
app.use((_req, res) => {
  res.status(404).json({ code: 1004, data: null, message: '接口不存在' });
});

// 错误处理必须放最后
app.use(errorHandler);

// E-4：PORT 唯一来源为 config.ts（env PORT 已在 config 内读取），删除硬编码 3001 残留
const port = config.port;
const server = app.listen(port, () => {
  logger.info({ port }, `zmb-server listening on http://localhost:${port}`);
  startWorkers();
});

// ===================== v3.1 T03：全局异常兜底 + 优雅关闭 =====================

/** 兜底：未捕获异常记日志不崩进程（Express 同步异常已被 errorHandler 兜住，这里防漏网之鱼） */
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'uncaughtException（进程保持运行）');
});

/** 兜底：未处理的 Promise rejection 记日志不崩进程（worker/异步链漏 catch 时兜底） */
process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'unhandledRejection（进程保持运行）');
});

let shuttingDown = false;

/** SIGTERM/SIGINT 优雅关闭（systemd 重启发版走这里）：停 worker → 关 HTTP → 关 DB → exit 0 */
function gracefulShutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, '收到退出信号，开始优雅关闭');
  stopWorkers();
  server.close(() => {
    logger.info('HTTP server 已关闭');
    try {
      db.close();
      logger.info('数据库连接已关闭');
    } catch (err) {
      logger.warn({ err }, '数据库关闭异常（忽略）');
    }
    process.exit(0);
  });
  // 兜底：10s 内关不掉（有挂起连接）强制退出，防 systemd 超时 SIGKILL 掉 WAL
  setTimeout(() => {
    logger.warn('优雅关闭超时（10s），强制退出');
    process.exit(1);
  }).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
