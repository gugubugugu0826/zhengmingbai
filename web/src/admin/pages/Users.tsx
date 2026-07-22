/**
 * 用户与点数（R34）：手机号搜索 + 排序 + 发点/扣点弹层（备注必填）+ 用户详情抽屉（完整流水）。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import {
  BIZ_TYPE_LABELS,
  fmtPhone,
  fmtTime,
  type AdminUserDetail,
  type AdminUserRow,
  type Paged,
} from '../api';
import { AdminEmpty, AdminModal, btnGhostCls, btnPrimaryCls, cardCls, inputCls, tableCls, tdCls, thCls } from '../ui';

/** 发点/扣点弹层 */
function GrantModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUserRow;
  onClose: () => void;
  onDone: (balance: number) => void;
}): JSX.Element {
  const [kind, setKind] = useState<'grant' | 'deduct'>('grant');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) {
      toast('点数数量要是正整数哦', 'error');
      return;
    }
    if (!reason.trim()) {
      toast('请填写备注原因', 'error');
      return;
    }
    const change = kind === 'grant' ? n : -n;
    if (kind === 'deduct') {
      const after = user.balance - n;
      if (!window.confirm(`确定要扣 ${n} 点吗？对方余额会变成 ${after} 点。`)) return;
    }
    setBusy(true);
    try {
      const result = await api.post<{ balance: number }>(`/admin/users/${user.id}/points`, {
        change,
        reason: reason.trim(),
      });
      toast(`已给 ${fmtPhone(user.phone)} ${kind === 'grant' ? '加' : '扣'} ${n} 点，当前余额 ${result.balance} 点`, 'success');
      onDone(result.balance);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败，请稍后再试', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModal open onClose={onClose} title={`发放点数 · ${fmtPhone(user.phone)}`}>
      <div className="space-y-4">
        <div className="text-[13px] text-warm-light">当前余额：{user.balance} 点</div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">变动类型</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-btn border-2 py-2.5 text-[13px] ${kind === 'grant' ? 'border-primary bg-primary/10 text-primary-dark' : 'border-soft text-warm-light'}`}
              onClick={() => setKind('grant')}
            >
              ＋ 加点
            </button>
            <button
              type="button"
              className={`rounded-btn border-2 py-2.5 text-[13px] ${kind === 'deduct' ? 'border-primary bg-primary/10 text-primary-dark' : 'border-soft text-warm-light'}`}
              onClick={() => setKind('deduct')}
            >
              － 扣点
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">点数数量</div>
          <input
            className={`${inputCls} w-full`}
            type="number"
            min={1}
            placeholder="比如 20"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">
            备注原因 <span className="text-red-500">*</span>
          </div>
          <input
            className={`${inputCls} w-full`}
            maxLength={200}
            placeholder="例如：活跃用户奖励"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <div className="flex gap-2 pt-1">
          <button type="button" className={`${btnGhostCls} flex-1`} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            disabled={busy}
            className={`${btnPrimaryCls} flex-1`}
            onClick={() => void submit()}
          >
            {busy ? '提交中…' : '确认'}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

/** 用户详情抽屉（完整点数流水） */
function DetailDrawer({ userId, onClose }: { userId: number; onClose: () => void }): JSX.Element {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    api
      .get<AdminUserDetail>(`/admin/users/${userId}`, { page, pageSize })
      .then(setDetail)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '详情加载失败', 'error'));
  }, [userId, page]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-card shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-soft px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-warm">用户详情</h3>
          <button type="button" className="text-[18px] text-warm-light" onClick={onClose}>
            ×
          </button>
        </div>
        {!detail ? (
          <Loading />
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            <div className={`${cardCls} mb-4 grid grid-cols-2 gap-3 border border-soft p-4 text-[13px]`}>
              <div>
                <div className="text-warm-light">手机号</div>
                <div className="mt-0.5 font-medium">{fmtPhone(detail.user.phone)}</div>
              </div>
              <div>
                <div className="text-warm-light">昵称</div>
                <div className="mt-0.5 font-medium">{detail.user.nickname || '-'}</div>
              </div>
              <div>
                <div className="text-warm-light">当前余额</div>
                <div className="mt-0.5 font-semibold text-primary-dark">{detail.user.balance} 点</div>
              </div>
              <div>
                <div className="text-warm-light">累计发放 / 消耗</div>
                <div className="mt-0.5 font-medium">
                  {detail.user.total_earned} / {detail.user.total_spent}
                </div>
              </div>
              <div className="col-span-2">
                <div className="text-warm-light">注册时间</div>
                <div className="mt-0.5 font-medium">{fmtTime(detail.user.created_at)}</div>
              </div>
            </div>

            <h4 className="mb-2 text-[14px] font-semibold text-warm">点数流水（共 {detail.transactions.total} 条）</h4>
            {detail.transactions.list.length === 0 ? (
              <AdminEmpty text="还没有流水记录" />
            ) : (
              <table className={tableCls}>
                <thead className="border-b border-soft bg-soft/30">
                  <tr>
                    <th className={thCls}>时间</th>
                    <th className={thCls}>类型</th>
                    <th className={thCls}>变动</th>
                    <th className={thCls}>余额</th>
                    <th className={thCls}>备注</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.transactions.list.map((t) => (
                    <tr key={t.id} className="border-b border-soft/50 last:border-0">
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(t.created_at)}</td>
                      <td className={tdCls}>{BIZ_TYPE_LABELS[t.biz_type] ?? t.biz_type}</td>
                      <td className={`${tdCls} font-medium ${t.change > 0 ? 'text-green-700' : 'text-red-600'}`}>
                        {t.change > 0 ? `+${t.change}` : t.change}
                      </td>
                      <td className={tdCls}>{t.balance_after}</td>
                      <td className={`${tdCls} max-w-[160px] truncate`} title={t.remark}>
                        {t.remark || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {detail.transactions.total > pageSize && (
              <div className="mt-3 flex items-center justify-center gap-3 text-[13px]">
                <button
                  type="button"
                  className={btnGhostCls}
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  上一页
                </button>
                <span className="text-warm-light">
                  第 {page} / {Math.ceil(detail.transactions.total / pageSize)} 页
                </span>
                <button
                  type="button"
                  className={btnGhostCls}
                  disabled={page * pageSize >= detail.transactions.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminUsers(): JSX.Element {
  const [phone, setPhone] = useState('');
  const [sort, setSort] = useState<'created_at' | 'spent'>('created_at');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminUserRow> | null>(null);
  const [granting, setGranting] = useState<AdminUserRow | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const pageSize = 20;

  const load = useCallback((): void => {
    api
      .get<Paged<AdminUserRow>>('/admin/users', {
        phone: phone.trim() || undefined,
        sort,
        order: 'desc',
        page,
        pageSize,
      })
      .then(setData)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '用户列表加载失败', 'error'));
  }, [phone, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <div className="space-y-4">
      {/* 搜索 + 排序 */}
      <div className="flex items-center gap-3">
        <input
          className={`${inputCls} w-64`}
          placeholder="按手机号搜索"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setPage(1);
          }}
        />
        <select
          className={inputCls}
          value={sort}
          onChange={(e) => {
            setSort(e.target.value as 'created_at' | 'spent');
            setPage(1);
          }}
        >
          <option value="created_at">按注册时间</option>
          <option value="spent">按点数消耗</option>
        </select>
      </div>

      {/* 用户列表 */}
      <div className={cardCls}>
        {!data ? (
          <Loading />
        ) : data.list.length === 0 ? (
          <AdminEmpty text="没有匹配的用户" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-soft bg-soft/30">
              <tr>
                <th className={thCls}>手机号</th>
                <th className={thCls}>昵称</th>
                <th className={thCls}>注册时间</th>
                <th className={thCls}>余额</th>
                <th className={thCls}>累计消耗</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((u) => (
                <tr key={u.id} className="border-b border-soft/50 last:border-0">
                  <td className={tdCls}>{fmtPhone(u.phone)}{u.role === 'admin' ? ' 👑' : ''}</td>
                  <td className={tdCls}>{u.nickname || '-'}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(u.created_at)}</td>
                  <td className={`${tdCls} font-medium`}>{u.balance}</td>
                  <td className={tdCls}>{u.total_spent}</td>
                  <td className={tdCls}>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-btn bg-primary px-3 py-1.5 text-[12px] text-white active:bg-primary-dark"
                        onClick={() => setGranting(u)}
                      >
                        发放点数
                      </button>
                      <button
                        type="button"
                        className="rounded-btn border border-soft px-3 py-1.5 text-[12px] text-warm active:bg-soft"
                        onClick={() => setDetailId(u.id)}
                      >
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data && data.total > pageSize && (
        <div className="flex items-center justify-center gap-3 text-[13px]">
          <button type="button" className={btnGhostCls} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            上一页
          </button>
          <span className="text-warm-light">
            第 {page} / {totalPages} 页 · 共 {data.total} 人
          </span>
          <button
            type="button"
            className={btnGhostCls}
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            下一页
          </button>
        </div>
      )}

      {granting && (
        <GrantModal
          user={granting}
          onClose={() => setGranting(null)}
          onDone={() => {
            setGranting(null);
            load();
          }}
        />
      )}
      {detailId !== null && <DetailDrawer userId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
