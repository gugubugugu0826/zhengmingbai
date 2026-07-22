/**
 * 账号（阶段 2 增量 A，设计文档 2.2.5）：
 * 卡片 1"我的密码"（旧+新+确认，调 /admin/password/change）；
 * 卡片 2"管理员列表"（GET /admin/admins）：昵称就地编辑（PUT），
 * "重置密码"按钮仅当前用户 is_super=1 可见，确认弹窗 → reset-password → 新密码大号展示一次。
 * 全链路无明文密码落存储：重置返回的明文只存在组件 state，关弹窗即清。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import { adminTokenStore } from '../auth';
import { fmtTime } from '../api';
import { AdminEmpty, AdminModal, btnGhostCls, btnPrimaryCls, cardCls, inputCls, PageTitle, StatusBadge, tableCls, tdCls, thCls } from '../ui';

interface AdminRow {
  id: number;
  phone: string | null;
  /** v2.2 T04：后端脱敏返回；null = 未迁移（尚未绑定邮箱） */
  email: string | null;
  nickname: string;
  role: string;
  is_super: number;
  created_at: string;
}

/** 从 admin JWT 解析当前登录管理员 uid（仅用于界面定位"我"，安全判定以后端为准） */
function currentAdminId(): number | null {
  const token = adminTokenStore.get();
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { uid?: number };
    return typeof payload.uid === 'number' ? payload.uid : null;
  } catch {
    return null;
  }
}

/** 卡片 1：我的密码 */
function PasswordCard(): JSX.Element {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    if (!oldPwd) {
      toast('请输入原密码', 'error');
      return;
    }
    if (newPwd.length < 8 || newPwd.length > 64) {
      toast('新密码要 8-64 位哦', 'error');
      return;
    }
    if (!/[a-zA-Z]/.test(newPwd) || !/\d/.test(newPwd)) {
      toast('新密码要同时包含字母和数字', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      toast('两次输入的新密码不一致', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post('/admin/password/change', { old_password: oldPwd, new_password: newPwd });
      toast('密码已更新，下次登录请用新密码', 'success');
      setOldPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '修改失败，请稍后再试', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${cardCls} p-5`}>
      <h3 className="mb-4 text-[15px] font-semibold text-warm">我的密码</h3>
      <div className="max-w-sm space-y-3">
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">原密码</div>
          <input
            type="password"
            className={`${inputCls} w-full`}
            maxLength={64}
            placeholder="请输入当前密码"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">新密码</div>
          <input
            type="password"
            className={`${inputCls} w-full`}
            maxLength={64}
            placeholder="8-64 位，含字母和数字"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">确认新密码</div>
          <input
            type="password"
            className={`${inputCls} w-full`}
            maxLength={64}
            placeholder="再输入一次新密码"
            value={confirmPwd}
            onChange={(e) => setConfirmPwd(e.target.value)}
          />
        </div>
        <button type="button" disabled={busy} className={btnPrimaryCls} onClick={() => void submit()}>
          {busy ? '提交中…' : '修改密码'}
        </button>
      </div>
    </div>
  );
}

/** 昵称就地编辑单元格 */
function NicknameCell({ admin, onSaved }: { admin: AdminRow; onSaved: () => void }): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(admin.nickname);
  const [busy, setBusy] = useState(false);

  const save = async (): Promise<void> => {
    const nickname = value.trim();
    if (!nickname) {
      toast('昵称不能为空', 'error');
      return;
    }
    if (nickname === admin.nickname) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await api.put(`/admin/admins/${admin.id}`, { nickname });
      toast('昵称已更新', 'success');
      setEditing(false);
      onSaved();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        className="text-left hover:text-primary"
        title="点击编辑昵称"
        onClick={() => {
          setValue(admin.nickname);
          setEditing(true);
        }}
      >
        {admin.nickname || '-'} ✏️
      </button>
    );
  }
  return (
    <span className="flex items-center gap-1.5">
      <input
        className={`${inputCls} w-28 !py-1`}
        maxLength={30}
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <button
        type="button"
        disabled={busy}
        className="text-[12px] text-primary"
        onClick={() => void save()}
      >
        存
      </button>
      <button type="button" className="text-[12px] text-warm-light" onClick={() => setEditing(false)}>
        取消
      </button>
    </span>
  );
}

/** 重置密码确认/结果弹窗 */
function ResetModal({ admin, onClose }: { admin: AdminRow; onClose: () => void }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState<string | null>(null);

  const doReset = async (): Promise<void> => {
    setBusy(true);
    try {
      const result = await api.post<{ id: number; password: string }>(
        `/admin/admins/${admin.id}/reset-password`,
      );
      setNewPassword(result.password);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '重置失败，请稍后再试', 'error');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModal open onClose={onClose} title={`重置密码 · ${admin.phone ?? admin.nickname}`}>
      {newPassword === null ? (
        <div className="space-y-4">
          <p className="text-[13px] text-warm">
            确定要重置 <span className="font-medium">{admin.nickname}</span> 的密码吗？
            旧密码将立即失效，系统会生成一个新随机密码。
          </p>
          <div className="flex gap-2">
            <button type="button" className={`${btnGhostCls} flex-1`} onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              className={`${btnPrimaryCls} flex-1`}
              onClick={() => void doReset()}
            >
              {busy ? '重置中…' : '确认重置'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-[13px] text-warm-light">新密码（只显示这一次，请截图/抄录转交）：</p>
          <div className="rounded-md border-2 border-primary/40 bg-primary/5 py-4 text-[26px] font-semibold tracking-[0.2em] text-primary-dark">
            {newPassword}
          </div>
          <p className="text-[12px] text-danger">
            关闭后无法再次查看，数据库里只存哈希，谁也查不到原文
          </p>
          <button type="button" className={`${btnPrimaryCls} w-full`} onClick={onClose}>
            我已抄录，关闭
          </button>
        </div>
      )}
    </AdminModal>
  );
}

export default function AdminAccount(): JSX.Element {
  const [list, setList] = useState<AdminRow[] | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminRow | null>(null);
  const [myIsSuper, setMyIsSuper] = useState(false);

  const load = useCallback((): void => {
    api
      .get<{ list: AdminRow[] }>('/admin/admins')
      .then((data) => {
        setList(data.list);
        const myId = currentAdminId();
        const self = data.list.find((a) => a.id === myId);
        setMyIsSuper(self?.is_super === 1);
      })
      .catch((err: unknown) =>
        toast(err instanceof ApiError ? err.message : '管理员列表加载失败', 'error'),
      );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageTitle title="管理员账号" desc="改自己的密码、管理管理员列表；退出登录在右上角" />

      <PasswordCard />

      <div className={cardCls}>
        <div className="border-b border-border-subtle px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-warm">管理员列表</h3>
          <p className="mt-0.5 text-[12px] text-warm-light">
            点击昵称可就地编辑；重置密码仅超级管理员可用；未迁移的管理员需先到「老用户迁移」完成邮箱绑定
          </p>
        </div>
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <AdminEmpty text="还没有管理员账号" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-border-subtle bg-soft/40">
              <tr>
                <th className={thCls}>ID</th>
                <th className={thCls}>手机号</th>
                <th className={thCls}>邮箱</th>
                <th className={thCls}>昵称</th>
                <th className={thCls}>角色</th>
                <th className={thCls}>迁移状态</th>
                <th className={thCls}>创建时间</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => (
                <tr key={a.id} className="border-b border-border-subtle/60 last:border-0">
                  <td className={tdCls}>{a.id}</td>
                  <td className={tdCls}>{a.phone ?? '-'}</td>
                  <td className={tdCls}>{a.email ?? '-'}</td>
                  <td className={tdCls}>
                    <NicknameCell admin={a} onSaved={load} />
                  </td>
                  <td className={tdCls}>{a.is_super === 1 ? '👑 超级管理员' : '管理员'}</td>
                  <td className={tdCls}>
                    {a.email ? (
                      <StatusBadge kind="success" text="✓ 已迁移" />
                    ) : (
                      <span title="该管理员尚未绑定邮箱，请到「老用户迁移」页完成绑定，否则无法通过 /admin 双因子登录">
                        <StatusBadge kind="warning" text="⚠ 未迁移 · 请先绑定邮箱" />
                      </span>
                    )}
                  </td>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(a.created_at)}</td>
                  <td className={tdCls}>
                    {myIsSuper && (
                      <button
                        type="button"
                        className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-warm transition-colors hover:bg-soft"
                        onClick={() => setResetTarget(a)}
                      >
                        重置密码
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {resetTarget && <ResetModal admin={resetTarget} onClose={() => setResetTarget(null)} />}
    </div>
  );
}
