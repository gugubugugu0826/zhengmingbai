/**
 * 服务入口：Express 装配 + 启动。
 * 挂载约定（架构文档 3.4）：统一前缀 /api/v1；响应 { code, data, message }；
 * JWT 中间件校验除 /api/v1/auth/*、/health、签名文件访问、插画素材外的全部请求。
 */
import express from 'express';
import { migrate } from './db.js';
import { config } from './config.js';
import { logger } from './common/logger.js';
import { globalLimiter } from './middleware/rateLimit.js';
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
import { configsRouter } from './modules/configs/routes.js';
import { knowledgeRouter } from './modules/knowledge/routes.js';
import { shareRouter, illustrationsRouter } from './modules/share/routes.js';
import { messagesRouter } from './modules/messages/routes.js';
import { adminRouter } from './modules/admin/routes.js';
import { adminAuth } from './modules/admin/middleware.js';
import { adminAuthRouter } from './modules/admin/auth-routes.js';
import { accountRouter } from './modules/account/routes.js';
import { initAdminAccounts } from './modules/auth/admin-init.js';
import { startWorkers } from './workers.js';

migrate();
// 启动兜底：部署后忘了跑 npm run init-admins 也能自愈（幂等，已初始化的跳过）
initAdminAccounts();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// base64 照片上传需要较大的 body（R51：20 张压缩后约 1MB/张 ≈ 27MB，留一倍余量）
app.use(express.json({ limit: '60mb' }));

app.use(globalLimiter);

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
app.listen(port, () => {
  logger.info({ port }, `zmb-server listening on http://localhost:${port}`);
  startWorkers();
});
