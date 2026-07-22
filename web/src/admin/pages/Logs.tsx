/**
 * 操作日志（v3 T04 新增页，R33 台账可视化）：
 * 管理员操作全量留痕：谁对什么做了什么，detail 快照就地展开。
 * 支持按操作类型筛选 + v3 Pagination 分页。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { Pagination } from '../../components/Pagination';
import { toast } from '../../stores/auth';
import { ADMIN_ACTION_LABELS, fmtTime, type AdminLogRow, type Paged } from '../api';
import { AdminEmpty, cardCls, inputCls, PageTitle, tableCls, tdCls, thCls } from '../ui';

const PAGE_SIZE = 20;

/** detail_json 安全解析（老数据可能不是合法 JSON） */
function parseDetail(json: string): string {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const entries = Object.entries(obj);
    if (entries.length === 0) return '-';
    return entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('；');
  } catch {
    return json || '-';
  }
}

export default function AdminLogs(): JSX.Element {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<Paged<AdminLogRow> | null>(null);

  const load = useCallback((): void => {
    api
      .get<Paged<AdminLogRow>>('/admin/logs', {
        action: action || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then(setData)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '日志加载失败', 'error'));
  }, [action, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <PageTitle
        title="操作日志"
        desc="管理员每一次发放点数、改配置、迁移用户都留在这里，可追溯可审计"
        extra={
          <select
            className={inputCls}
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部操作类型</option>
            {Object.entries(ADMIN_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        }
      />

      <div className={cardCls}>
        {!data ? (
          <Loading />
        ) : data.list.length === 0 ? (
          <AdminEmpty text="还没有匹配的操作日志" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-border-subtle bg-soft/40">
              <tr>
                <th className={thCls}>时间</th>
                <th className={thCls}>管理员</th>
                <th className={thCls}>操作</th>
                <th className={thCls}>对象</th>
                <th className={thCls}>细节</th>
              </tr>
            </thead>
            <tbody>
              {data.list.map((log) => (
                <tr key={log.id} className="border-b border-border-subtle/60 last:border-0">
                  <td className={`${tdCls} whitespace-nowrap`}>{fmtTime(log.created_at)}</td>
                  <td className={tdCls}>#{log.admin_user_id}</td>
                  <td className={tdCls}>
                    <span className="rounded-sm bg-primary/10 px-2 py-0.5 text-[11px] text-primary-dark">
                      {ADMIN_ACTION_LABELS[log.action] ?? log.action}
                    </span>
                  </td>
                  <td className={`${tdCls} text-warm-secondary`}>{log.target}</td>
                  <td className={`${tdCls} max-w-[320px] truncate text-warm-light`} title={parseDetail(log.detail_json)}>
                    {parseDetail(log.detail_json)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {data ? (
        <div className="flex justify-center">
          <Pagination page={page} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
        </div>
      ) : null}
    </div>
  );
}
