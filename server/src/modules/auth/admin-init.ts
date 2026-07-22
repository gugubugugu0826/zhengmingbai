/**
 * 管理员账号初始化（阶段 2 增量 A，设计文档 2.2.3）。
 * 入口一：seed-cli `npm run init-admins`；入口二：index.ts 启动兜底（幂等，已初始化跳过）。
 * 名单以代码内常量为准（owner 拍板的 4 人），与 ADMIN_PHONES 环境变量保持一致。
 *
 * 幂等核心：已有 password_hash 的账号什么都不动。
 * 随机初始密码只在"新建/补密"那一次打印到控制台——唯一可见时机，不落盘、不入库（库中只有哈希）。
 */
import { db, nowIso } from '../../db.js';
import { writeAdminLog } from '../admin/logs.service.js';
import { generateInitialPassword, hashPassword } from './password.js';
import type { UserRow } from './service.js';

// 超管初始密码从环境变量读取（缺省时随机生成并仅打印一次，与普通管理员一致）。
// 这样源码仓库不含任何明文密码，符合"密码只显示一次、不落盘"的设计。
const SUPER_ADMIN = {
  phone: '15880263498',
  nickname: 'gugu',
  password: process.env.SUPER_ADMIN_INITIAL_PASSWORD || null,
};
const ADMINS = [
  { phone: '18291765778', nickname: '管理员-5778' },
  { phone: '13959295528', nickname: '管理员-5528' },
  { phone: '13806026445', nickname: '管理员-6445' },
];

export function initAdminAccounts(): void {
  // 超管先行：后续写 admin_logs 以超管 id 作 operator（系统初始化无操作人，detail 注明 system）
  const { userId: superId, generated: superGenerated } = ensureAdmin(
    SUPER_ADMIN.phone,
    SUPER_ADMIN.nickname,
    SUPER_ADMIN.password,
    1,
  );
  if (superGenerated) {
    console.log(
      `[admin-init] ${SUPER_ADMIN.phone} 超管初始密码（仅此一次显示，请立即转交并提醒修改）: ${superGenerated}`,
    );
  }
  // 普通管理员：随机密码；仅在"新建/补密"时打印到控制台（唯一可见时机）
  for (const a of ADMINS) {
    const { generated } = ensureAdmin(a.phone, a.nickname, null, 0, superId);
    if (generated) {
      console.log(
        `[admin-init] ${a.phone} 初始密码（仅此一次显示，请立即转交并提醒修改）: ${generated}`,
      );
    }
  }
}

/**
 * 幂等保证单个管理员账号就位。
 * @returns userId 该账号 id；generated 本次新生成的随机明文密码（仅普通管理员新建/补密时非 null）
 */
function ensureAdmin(
  phone: string,
  nickname: string,
  fixedPassword: string | null,
  isSuper: number,
  operatorId?: number,
): { userId: number; generated: string | null } {
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone) as UserRow | undefined;
  if (user?.password_hash) return { userId: user.id, generated: null }; // 已有密码：不动（幂等核心）
  const plain = fixedPassword ?? generateInitialPassword();
  const hash = hashPassword(plain);
  let userId: number;
  if (user) {
    db.prepare(
      `UPDATE users SET password_hash=?, is_super=?, role='admin', nickname=?, updated_at=? WHERE id=?`,
    ).run(hash, isSuper, nickname, nowIso(), user.id);
    userId = user.id;
  } else {
    const r = db
      .prepare(`INSERT INTO users (phone, nickname, role, password_hash, is_super) VALUES (?,?,?,?,?)`)
      .run(phone, nickname, 'admin', hash, isSuper);
    userId = Number(r.lastInsertRowid);
  }
  // admin_user_id 外键 NOT NULL：operator 取超管 id（超管一定先被 ensure 出来）
  writeAdminLog(operatorId ?? userId, 'admin_account_init', `user:${phone}`, {
    operator: 'system',
    is_super: isSuper,
  });
  return { userId, generated: fixedPassword ? null : plain };
}
