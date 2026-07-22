/**
 * 老用户迁移管理页（v2.2 T04，PRD A-5）：
 * - 列表：仅未迁移用户（email IS NULL），列为 用户ID/原手机号(脱敏)/注册时间/空间数/方案数/操作
 * - 「绑定邮箱」弹窗：邮箱 + 用户名（服务端即时查重 2105/2106）→ 确认后服务端生成
 *   10 位临时密码并置 force_password_reset=1，明文仅随响应返回一次，大字醒目展示
 * - 绑定成功后该用户从列表消失（自动刷新）
 * - 顶部醒目迁移窗口期提示 + 当前未迁移用户数
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import { fmtTime } from '../api';
import { AdminEmpty, AdminModal, btnGhostCls, btnPrimaryCls, cardCls, inputCls, tableCls, tdCls, thCls } from '../ui';

export interface LegacyUserRow {
  id: number;
  phone: string | null; // 后端已脱敏
  nickname: string;
  role: string;
  created_at: string;
  space_count: number;
  plan_count: number;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 绑定结果（临时密码只显示一次） */
interface BindResult {
  email: string;
  username: string;
  temp_password: string;
}

/** 绑定邮箱弹窗：表单态 → 结果态（临时密码大字展示一次） */
function BindModal({
  user,
  onClose,
  onBound,
}: {
  user: LegacyUserRow;
  onClose: () => void;
  onBound: () => void;
}): JSX.Element {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BindResult | null>(null);

  const submit = async (): Promise<void> => {
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    if (!username.trim()) {
      toast('请输入用户名', 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post<{ id: number } & BindResult>(
        `/admin/legacy-users/${user.id}/bind`,
        { email: email.trim(), username: username.trim() },
      );
      setResult({
        email: data.email,
        username: data.username,
        temp_password: data.temp_password,
      });
    } catch (err) {
      // 2105 邮箱占用 / 2106 用户名占用 直接透传后端文案
      toast(err instanceof ApiError ? err.message : '绑定失败，请稍后再试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const close = (): void => {
    if (result) onBound(); // 已绑定成功：关弹窗时刷新列表
    onClose();
  };

  return (
    <AdminModal open onClose={close} title={`绑定邮箱 · 用户 #${user.id}（${user.phone ?? '微信用户'}）`}>
      {result === null ? (
        <div className="space-y-4">
          <p className="text-[13px] text-warm-light">
            为该老用户设置登录邮箱与用户名。提交后系统将生成
            <span className="font-medium text-warm"> 10 位临时密码</span>
            ，用户首次登录会被强制要求改密。
          </p>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-warm">邮箱（必填）</div>
            <input
              type="email"
              className={`${inputCls} w-full`}
              maxLength={254}
              placeholder="user@example.com"
              value={email}
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-warm">用户名（必填）</div>
            <input
              className={`${inputCls} w-full`}
              maxLength={20}
              placeholder="2-20 个字符"
              value={username}
              autoComplete="off"
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <button type="button" className={`${btnGhostCls} flex-1`} onClick={close}>
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              className={`${btnPrimaryCls} flex-1`}
              onClick={() => void submit()}
            >
              {busy ? '绑定中…' : '确认绑定'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <div className="rounded-btn bg-primary/5 px-3 py-2 text-left text-[12px] text-warm-light">
            <div>邮箱：<span className="font-medium text-warm">{result.email}</span></div>
            <div>用户名：<span className="font-medium text-warm">{result.username}</span></div>
          </div>
          <p className="text-[13px] text-warm-light">临时密码（只显示这一次，请截图/抄录）：</p>
          <div className="select-all rounded-btn border-2 border-primary/40 bg-primary/5 py-4 text-[26px] font-semibold tracking-[0.15em] text-primary-dark">
            {result.temp_password}
          </div>
          <p className="text-[12px] font-medium text-red-500">
            临时密码仅显示一次，请立即通知用户！数据库只存哈希，关闭后无法再次查看
          </p>
          <button type="button" className={`${btnPrimaryCls} w-full`} onClick={close}>
            我已抄录并通知用户，关闭
          </button>
        </div>
      )}
    </AdminModal>
  );
}

export default function LegacyUsers(): JSX.Element {
  const [list, setList] = useState<LegacyUserRow[] | null>(null);
  const [bindTarget, setBindTarget] = useState<LegacyUserRow | null>(null);

  const load = useCallback((): void => {
    api
      .get<{ list: LegacyUserRow[]; total: number }>('/admin/legacy-users')
      .then((data) => setList(data.list))
      .catch((err: unknown) =>
        toast(err instanceof ApiError ? err.message : '未迁移用户列表加载失败', 'error'),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pending = list?.length ?? 0;

  return (
    <div className="space-y-4">
      {/* 迁移窗口期醒目提示 */}
      <div className="rounded-card border-2 border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-2.5">
          <span className="text-[18px] leading-none">⚠️</span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-amber-800">
              迁移窗口期：当前还有 {pending} 位老用户未迁移
            </div>
            <ul className="mt-1.5 list-inside list-disc space-y-1 text-[12px] text-amber-700">
              <li>老用户（手机号/微信注册）在绑定邮箱前无法登录，请尽快完成迁移</li>
              <li>建议先绑定管理员账号，再处理普通用户</li>
              <li>绑定后请立即把邮箱、用户名和临时密码通知到用户本人（临时密码只显示一次）</li>
            </ul>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between border-b border-soft px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-semibold text-warm">未迁移用户</h3>
            <p className="mt-0.5 text-[12px] text-warm-light">
              仅列出尚未绑定邮箱的老用户；绑定成功后自动从列表移除
            </p>
          </div>
          <button
            type="button"
            className="rounded-btn border border-soft px-3 py-1.5 text-[12px] text-warm-light active:bg-soft"
            onClick={load}
          >
            刷新
          </button>
        </div>
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <AdminEmpty text="🎉 所有老用户都已完成迁移" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-soft bg-soft/30">
              <tr>
                <th className={thCls}>用户ID</th>
                <th className={thCls}>原手机号</th>
                <th className={thCls}>昵称</th>
                <th className={thCls}>注册时间</th>
                <th className={thCls}>空间数</th>
                <th className={thCls}>方案数</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="border-b border-soft/50 last:border-0">
                  <td className={tdCls}>{u.id}</td>
                  <td className={tdCls}>{u.phone ?? '微信用户'}</td>
                  <td className={tdCls}>{u.nickname || '-'}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(u.created_at)}</td>
                  <td className={tdCls}>{u.space_count}</td>
                  <td className={tdCls}>{u.plan_count}</td>
                  <td className={tdCls}>
                    <button
                      type="button"
                      className="rounded-btn bg-primary px-3 py-1.5 text-[12px] font-medium text-white active:bg-primary-dark"
                      onClick={() => setBindTarget(u)}
                    >
                      绑定邮箱
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bindTarget && (
        <BindModal user={bindTarget} onClose={() => setBindTarget(null)} onBound={load} />
      )}
    </div>
  );
}
