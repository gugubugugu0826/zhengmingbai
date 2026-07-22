/**
 * 管理员路由（R33-R38）：/api/v1/admin/* 整组先过全局 authMiddleware（index.ts），再过 adminAuth。
 */
import { Router } from 'express';
import { z } from 'zod';
import { ok } from '../../common/response.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { adminAuth } from './middleware.js';
import { grantPoints, listUsers, userDetail } from './users.service.js';
import { createKnowledge, deleteKnowledge, updateKnowledge } from './knowledge.service.js';
import { aiCosts, summary } from './dashboard.service.js';
import { listAdminLogs, writeAdminLog } from './logs.service.js';
import { listRows } from '../knowledge/service.js';
import { listConfigs, requireConfigKey, setConfig } from '../configs/service.js';
import { checkAvailability, getUserById } from '../auth/service.js';
import { assertValidEmail } from '../auth/sms.js';
import { generateInitialPassword, hashPassword, verifyPassword } from '../auth/password.js';
import { maskEmail, maskPhone } from '../../common/mask.js';
import { ERR_EMAIL_TAKEN, ERR_USERNAME_TAKEN } from '../../common/messages.js';
import { validateUsername } from '../../common/validators.js';
import { db, nowIso } from '../../db.js';
import { BizError } from '../../common/errors.js';

export const adminRouter = Router();
adminRouter.use(adminAuth);

const pageSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

// ===== 用户管理（R34） =====

adminRouter.get('/users', (req, res) => {
  const q = z
    .object({
      phone: z.string().max(20).optional(),
      sort: z.enum(['created_at', 'spent']).default('created_at'),
      order: z.enum(['asc', 'desc']).default('desc'),
    })
    .merge(pageSchema)
    .parse(req.query);
  ok(res, listUsers(q));
});

adminRouter.get('/users/:id', (req, res) => {
  const { page, pageSize } = pageSchema.parse(req.query);
  ok(res, userDetail(Number(req.params.id), page, pageSize));
});

adminRouter.post('/users/:id/points', (req: AuthRequest, res) => {
  const { change, reason } = z
    .object({ change: z.number().int().refine((n) => n !== 0, '点数变更不能为 0'), reason: z.string().min(1, '请填写备注原因').max(200) })
    .parse(req.body);
  const result = grantPoints(req.userId!, Number(req.params.id), change, reason);
  ok(res, result, change > 0 ? '点数已发放' : '点数已扣减');
});

// ===== 知识库管理（R35） =====

adminRouter.get('/knowledge', (req, res) => {
  const { space_type } = z
    .object({ space_type: z.string().min(1).max(30).optional() })
    .parse(req.query);
  ok(res, listRows(space_type));
});

const kbSchema = z.object({
  space_type: z.string().min(1).max(30),
  category: z.string().min(1).max(50),
  items: z.array(z.string().min(1)).min(1),
  sort: z.number().int().optional(),
  is_active: z.union([z.literal(0), z.literal(1)]).optional(),
});

adminRouter.post('/knowledge', (req: AuthRequest, res) => {
  const input = kbSchema.parse(req.body);
  ok(res, createKnowledge(req.userId!, input), '知识库条目已新增，即时生效');
});

adminRouter.put('/knowledge/:id', (req: AuthRequest, res) => {
  const input = kbSchema.partial().parse(req.body);
  updateKnowledge(req.userId!, Number(req.params.id), input);
  ok(res, { id: Number(req.params.id) }, '知识库条目已更新，即时生效');
});

adminRouter.delete('/knowledge/:id', (req: AuthRequest, res) => {
  deleteKnowledge(req.userId!, Number(req.params.id));
  ok(res, { id: Number(req.params.id) }, '知识库条目已删除');
});

// ===== 配置管理（R36/R37） =====

adminRouter.get('/configs', (_req, res) => {
  ok(res, listConfigs());
});

adminRouter.put('/configs', (req: AuthRequest, res) => {
  const { key, value } = z
    .object({ key: z.string().min(1).max(100), value: z.unknown() })
    .parse(req.body);
  requireConfigKey(key);
  setConfig(key, value, `admin:${req.userId}`);
  writeAdminLog(req.userId!, 'config_update', `config:${key}`, { new: value });
  ok(res, { key, value }, '配置已更新，即时生效');
});

// ===== 套餐管理（R36/R32） =====

adminRouter.get('/packages', (_req, res) => {
  ok(res, db.prepare('SELECT * FROM packages ORDER BY sort, id').all());
});

adminRouter.put('/packages/:id', (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const old = db.prepare('SELECT * FROM packages WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!old) throw BizError.notFound('套餐不存在');
  const input = z
    .object({
      name: z.string().min(1).max(50).optional(),
      price_fen: z.number().int().nonnegative().optional(),
      points: z.number().int().positive().optional(),
      tag: z.string().max(50).nullable().optional(),
      sort: z.number().int().optional(),
      is_active: z.union([z.literal(0), z.literal(1)]).optional(),
    })
    .parse(req.body);
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined) {
      sets.push(`${k} = ?`);
      values.push(v);
    }
  }
  if (sets.length > 0) {
    sets.push('updated_at = ?');
    values.push(nowIso(), id);
    db.prepare(`UPDATE packages SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]));
    writeAdminLog(req.userId!, 'package_update', `package:${old.name}`, { id, old, new: input });
  }
  ok(res, db.prepare('SELECT * FROM packages WHERE id = ?').get(id), '套餐已更新');
});

// ===== 经营看板（R38/R42） =====

adminRouter.get('/dashboard/summary', (_req, res) => {
  ok(res, summary());
});

adminRouter.get('/dashboard/ai-costs', (req, res) => {
  const { days } = z
    .object({ days: z.coerce.number().int().positive().max(90).default(7) })
    .parse(req.query);
  ok(res, aiCosts(days));
});

// ===== 老用户迁移（v2.2 T04，PRD A-5） =====

/**
 * GET /admin/legacy-users — 未迁移用户列表（email IS NULL）。
 * 手机号脱敏返回；附带空间数/方案数供运营判断用户价值。
 */
adminRouter.get('/legacy-users', (_req, res) => {
  const list = db
    .prepare(
      `SELECT u.id, u.phone, u.nickname, u.role, u.created_at,
              (SELECT COUNT(*) FROM spaces s WHERE s.user_id = u.id) AS space_count,
              (SELECT COUNT(*) FROM sessions se WHERE se.user_id = u.id) AS plan_count
       FROM users u
       WHERE u.email IS NULL
       ORDER BY u.id`,
    )
    .all() as Array<{
    id: number;
    phone: string | null;
    nickname: string;
    role: string;
    created_at: string;
    space_count: number | bigint;
    plan_count: number | bigint;
  }>;
  ok(res, {
    total: list.length,
    list: list.map((u) => ({
      id: u.id,
      phone: maskPhone(u.phone),
      nickname: u.nickname,
      role: u.role,
      created_at: u.created_at,
      space_count: Number(u.space_count),
      plan_count: Number(u.plan_count),
    })),
  });
});

/**
 * POST /admin/legacy-users/:id/bind — 为老用户绑定邮箱 + 用户名并生成 10 位临时密码。
 * 临时密码明文仅随本响应返回一次（库中只存 scrypt 哈希）；绑定后 user 从列表消失。
 * 同时置 email_verified=1（运营人工核对过，架构 §4.6 A-5）与 force_password_reset=1
 * （用户首次登录强制改密）。邮箱/用户名即时查重（2105/2106，409）。
 */
adminRouter.post('/legacy-users/:id/bind', (req: AuthRequest, res) => {
  const { email, username } = z
    .object({
      email: z.string().min(3).max(254),
      username: z.string().min(1).max(20),
    })
    .parse(req.body);
  assertValidEmail(email);
  const usernameErr = validateUsername(username);
  if (usernameErr) throw BizError.param(usernameErr);

  const target = db
    .prepare(`SELECT id, phone, email FROM users WHERE id = ?`)
    .get(Number(req.params.id)) as { id: number; phone: string | null; email: string | null } | undefined;
  if (!target) throw BizError.notFound('用户不存在');
  if (target.email) throw BizError.param('该用户已完成迁移，无需重复绑定');

  // 绑定场景允许明示占用（与注册同约定，A-12）
  if (!checkAvailability('email', email)) {
    throw new BizError(ERR_EMAIL_TAKEN, '该邮箱已被注册', 409);
  }
  if (!checkAvailability('username', username)) {
    throw new BizError(ERR_USERNAME_TAKEN, '该用户名已被占用', 409);
  }

  const plain = generateInitialPassword();
  db.prepare(
    `UPDATE users
     SET email = ?, username = ?, email_verified = 1, password_hash = ?,
         force_password_reset = 1, updated_at = ?
     WHERE id = ?`,
  ).run(email, username, hashPassword(plain), nowIso(), target.id);
  writeAdminLog(req.userId!, 'legacy_user_bind', `user:${target.id}`, {
    target_phone: maskPhone(target.phone),
    email: maskEmail(email),
  });
  // 明文仅此一次随响应返回，前端弹窗大字展示并提示立即转交；库中只存哈希
  ok(
    res,
    { id: target.id, email, username, temp_password: plain },
    '绑定成功：临时密码只显示这一次，请立即通知用户',
  );
});

// ===== 操作日志（R33） =====

adminRouter.get('/logs', (req, res) => {
  const q = z
    .object({ action: z.string().max(30).optional() })
    .merge(pageSchema)
    .parse(req.query);
  ok(res, listAdminLogs(q.action, q.page, q.pageSize));
});

// ===== 管理员账号体系（阶段 2 增量 A，设计文档 2.2.4） =====

// BUG-3：脱敏统一走 common/mask.ts（本文件不再保留本地实现）

/** POST /admin/password/change — 改自己的密码（旧密码校验通过才改） */
adminRouter.post('/password/change', (req: AuthRequest, res) => {
  const { old_password, new_password } = z
    .object({
      old_password: z.string().min(1),
      new_password: z
        .string()
        .min(8, '密码至少 8 位')
        .max(64)
        .regex(/[a-zA-Z]/, '密码要包含字母')
        .regex(/\d/, '密码要包含数字'),
    })
    .parse(req.body);
  const user = getUserById(req.userId!);
  if (!user.password_hash || !verifyPassword(old_password, user.password_hash)) {
    throw BizError.param('原密码不正确');
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(new_password),
    nowIso(),
    user.id,
  );
  writeAdminLog(req.userId!, 'admin_password_change', `user:${user.id}`, {});
  ok(res, { changed: true }, '密码已更新，下次登录请用新密码');
});

/** GET /admin/admins — 管理员账号列表（绝不返回 password_hash；phone/email 脱敏） */
adminRouter.get('/admins', (_req, res) => {
  const list = db
    .prepare(
      `SELECT id, phone, email, nickname, role, is_super, created_at FROM users WHERE role = 'admin' ORDER BY is_super DESC, id`,
    )
    .all() as Array<{
    id: number;
    phone: string | null;
    email: string | null;
    nickname: string;
    role: string;
    is_super: number;
    created_at: string;
  }>;
  ok(res, { list: list.map((a) => ({ ...a, phone: maskPhone(a.phone), email: maskEmail(a.email) })) });
});

/** PUT /admin/admins/:id — 改管理员昵称 */
adminRouter.put('/admins/:id', (req: AuthRequest, res) => {
  const { nickname } = z.object({ nickname: z.string().min(1, '昵称不能为空').max(30) }).parse(req.body);
  const target = db
    .prepare(`SELECT id, role FROM users WHERE id = ?`)
    .get(Number(req.params.id)) as { id: number; role: string } | undefined;
  if (!target || target.role !== 'admin') throw BizError.notFound('管理员不存在');
  db.prepare('UPDATE users SET nickname = ?, updated_at = ? WHERE id = ?').run(
    nickname,
    nowIso(),
    target.id,
  );
  ok(res, { id: target.id, nickname }, '昵称已更新');
});

/** POST /admin/admins/:id/reset-password — 仅超管：重置指定管理员密码，明文返回一次 */
adminRouter.post('/admins/:id/reset-password', (req: AuthRequest, res) => {
  // 不信任 JWT 之外的输入：handler 内再查当前操作者 is_super
  const me = getUserById(req.userId!);
  if (me.is_super !== 1) throw BizError.forbidden('仅超级管理员可重置密码');
  const target = db
    .prepare(`SELECT id, role, phone FROM users WHERE id = ?`)
    .get(Number(req.params.id)) as { id: number; role: string; phone: string | null } | undefined;
  // 不能对普通用户重置出"幽灵密码"
  if (!target || target.role !== 'admin') throw BizError.notFound('管理员不存在');
  const plain = generateInitialPassword();
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(plain),
    nowIso(),
    target.id,
  );
  writeAdminLog(req.userId!, 'admin_password_reset', `user:${target.id}`, {
    target_phone: maskPhone(target.phone),
  });
  // 明文仅此一次随响应返回，前端弹窗展示并提示立即转交；库中只存哈希
  ok(res, { id: target.id, password: plain }, '密码已重置，请立即转交（只显示这一次）');
});
