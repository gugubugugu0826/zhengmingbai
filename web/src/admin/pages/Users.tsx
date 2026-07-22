/**
 * 用户管理（R34，v3 T04 换皮）：
 * 搜索（邮箱/手机号关键字）+ 排序 + 列表（注册邮箱/绑定手机脱敏展示，设计稿 p17 列结构）
 * + 发点/扣点弹层（备注必填，扣点走 ConfirmDialog 二次确认）
 * + 用户详情抽屉（完整流水，Pagination 复用）。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { Pagination } from '../../components/Pagination';
import { toast } from '../../stores/auth';
import {
  BIZ_TYPE_LABELS,
  fmtEmail,
  fmtPhone,
  fmtTime,
  type AdminUserDetail,
  type AdminUserRow,
  type Paged,
} from '../api';
import { AdminEmpty, AdminModal, btnGhostCls, btnPrimaryCls, cardCls, inputCls, PageTitle, tableCls, tdCls, thCls } from '../ui';

const PAGE_SIZE = 20;

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
  const [confirmDeduct, setConfirmDeduct] = useState(false);

  const displayName = user.email ?? fmtPhone(user.phone);

  const validate = (): { n: number; ok: boolean } => {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) {
      toast('点数数量要是正整数哦', 'error');
      return { n, ok: false };
    }
    if (!reason.trim()) {
      toast('请填写备注原因', 'error');
      return { n, ok: false };
    }
    return { n, ok: true };
  };

  const doSubmit = async (n: number): Promise<void> => {
    setBusy(true);
    try {
      const change = kind === 'grant' ? n : -n;
      const result = await api.post<{ balance: number }>(`/admin/users/${user.id}/points`, {
        change,
        reason: reason.trim(),
      });
      toast(`已给 ${displayName} ${kind === 'grant' ? '加' : '扣'} ${n} 点，当前余额 ${result.balance} 点`, 'success');
      onDone(result.balance);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败，请稍后再试', 'error');
    } finally {
      setBusy(false);
    }
  };

  const submit = (): void => {
    const { n, ok } = validate();
    if (!ok) return;
    if (kind === 'deduct') {
      // 扣点是不可逆操作，走统一确认弹窗
      setConfirmDeduct(true);
      return;
    }
    void doSubmit(n);
  };

  return (
    <AdminModal open onClose={onClose} title={`发放点数 · ${displayName}`}>
      <div className="space-y-4">
        <div className="text-[13px] text-warm-light">当前余额：{user.balance} 点</div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">变动类型</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              className={`rounded-md border-2 py-2.5 text-[13px] transition-colors ${kind === 'grant' ? 'border-primary bg-primary/10 text-primary-dark' : 'border-border-subtle text-warm-light'}`}
              onClick={() => setKind('grant')}
            >
              ＋ 加点
            </button>
            <button
              type="button"
              className={`rounded-md border-2 py-2.5 text-[13px] transition-colors ${kind === 'deduct' ? 'border-primary bg-primary/10 text-primary-dark' : 'border-border-subtle text-warm-light'}`}
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
            备注原因 <span className="text-danger">*</span>
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
            onClick={submit}
          >
            {busy ? '提交中…' : '确认'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeduct}
        onCancel={() => setConfirmDeduct(false)}
        onConfirm={() => {
          setConfirmDeduct(false);
          const { n, ok } = validate();
          if (ok) void doSubmit(n);
        }}
        title="确认扣点？"
        desc={`确定要扣 ${amount || 0} 点吗？对方余额会变成 ${user.balance - (Number(amount) || 0)} 点，操作会记入操作日志。`}
        confirmText="确认扣点"
      />
    </AdminModal>
  );
}

/** 用户详情抽屉（完整点数流水） */
function DetailDrawer({ userId, onClose }: { userId: number; onClose: () => void }): JSX.Element {
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api
      .get<AdminUserDetail>(`/admin/users/${userId}`, { page, pageSize: PAGE_SIZE })
      .then(setDetail)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '详情加载失败', 'error'));
  }, [userId, page]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-card shadow-float"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3.5">
          <h3 className="text-[15px] font-semibold text-warm">用户详情</h3>
          <button type="button" className="text-[18px] text-warm-light hover:text-warm" onClick={onClose}>
            ×
          </button>
        </div>
        {!detail ? (
          <Loading />
        ) : (
          <div className="flex-1 overflow-y-auto p-5">
            <div className={`${cardCls} mb-4 grid grid-cols-2 gap-3 border border-border-subtle p-4 text-[13px]`}>
              <div>
                <div className="text-warm-light">注册邮箱</div>
                <div className="mt-0.5 font-medium">{fmtEmail(detail.user.email)}</div>
              </div>
              <div>
                <div className="text-warm-light">绑定手机</div>
                <div className="mt-0.5 font-medium">{detail.user.phone ?? '未绑定'}</div>
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
              <div>
                <div className="text-warm-light">注册时间</div>
                <div className="mt-0.5 font-medium">{fmtTime(detail.user.created_at)}</div>
              </div>
            </div>

            <h4 className="mb-2 text-[14px] font-semibold text-warm">点数流水（共 {detail.transactions.total} 条）</h4>
            {detail.transactions.list.length === 0 ? (
              <AdminEmpty text="还没有流水记录" />
            ) : (
              <table className={tableCls}>
                <thead className="border-b border-border-subtle bg-soft/40">
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
                    <tr key={t.id} className="border-b border-border-subtle/60 last:border-0">
                      <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(t.created_at)}</td>
                      <td className={tdCls}>{BIZ_TYPE_LABELS[t.biz_type] ?? t.biz_type}</td>
                      <td className={`${tdCls} font-medium ${t.change > 0 ? 'text-sage-dark' : 'text-danger'}`}>
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
            <div className="mt-3 flex justify-center">
              <Pagination
                page={page}
                total={detail.transactions.total}
                pageSize={PAGE_SIZE}
                onChange={setPage}
                showJumper={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminUsers(): JSX.Element {
  const [keyword, setKeyword] = useState('');
  const [sort, setSort] = useState<'created_at' | 'spent'>('created_at');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminUserRow> | null>(null);
  const [granting, setGranting] = useState<AdminUserRow | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback((): void => {
    const kw = keyword.trim();
    api
      .get<Paged<AdminUserRow>>('/admin/users', {
        // 后端沿用 phone 参数做关键字模糊匹配（兼容手机号与邮箱前缀）
        phone: kw || undefined,
        sort,
        order: 'desc',
        page,
        pageSize: PAGE_SIZE,
      })
      .then(setData)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '用户列表加载失败', 'error'));
  }, [keyword, sort, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="用户管理"
        desc="邮箱与手机号均已脱敏展示；发点扣点会记入操作日志"
        extra={
          <div className="flex items-center gap-2">
            <input
              className={`${inputCls} w-64`}
              placeholder="搜索用户邮箱或手机号"
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value);
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
        }
      />

      {/* 用户列表 */}
      <div className={cardCls}>
        {!data ? (
          <Loading />
        ) : data.list.length === 0 ? (
          <AdminEmpty text="没有匹配的用户" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-border-subtle bg-soft/40">
              <tr>
                <th className={thCls}>用户</th>
                <th className={thCls}>注册邮箱</th>
                <th className={thCls}>绑定手机</th>
                <th className={thCls}>注册时间</th>
                <th className={thCls}>点数余额</th>
                <th className={thCls}>累计消耗</th>
                <th className={thCls}>操作</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((u) => (
                <tr key={u.id} className="border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-soft/30">
                  <td className={tdCls}>
                    {u.nickname || '-'}
                    {u.role === 'admin' ? ' 👑' : ''}
                  </td>
                  <td className={tdCls}>{fmtEmail(u.email)}</td>
                  <td className={tdCls}>{u.phone ?? '未绑定'}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(u.created_at)}</td>
                  <td className={`${tdCls} font-medium`}>{u.balance} 点</td>
                  <td className={tdCls}>{u.total_spent}</td>
                  <td className={tdCls}>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-primary px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-primary-dark"
                        onClick={() => setGranting(u)}
                      >
                        发放点数
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-warm transition-colors hover:bg-soft"
                        onClick={() => setDetailId(u.id)}
                      >
                        查看
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data ? (
        <div className="flex items-center justify-center gap-4">
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
          <span className="text-[12px] text-warm-light">共 {data.total} 条用户</span>
        </div>
      ) : null}

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
