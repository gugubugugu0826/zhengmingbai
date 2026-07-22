/**
 * 数据看板（R38/R42，v3 T04 换皮）：
 * 4 张数字卡 + AI 成本台账（按天汇总/按次明细切换，近 7/30 天，单次 >¥0.5 标红）。
 * 样式按 v3 设计稿 p16：大圆角卡片、sage/danger 状态色、斑马纹表行。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import type { AiCostsResult, DashboardSummary } from '../api';
import { AdminEmpty, cardCls, PageTitle, StatCard, StatusBadge, tableCls, tdCls, thCls } from '../ui';

export default function AdminDashboard(): JSX.Element {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [costs, setCosts] = useState<AiCostsResult | null>(null);
  const [days, setDays] = useState<7 | 30>(7);
  const [view, setView] = useState<'daily' | 'detail'>('daily');

  const load = useCallback((): void => {
    api
      .get<DashboardSummary>('/admin/dashboard/summary')
      .then(setSummary)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '看板加载失败', 'error'));
    api
      .get<AiCostsResult>('/admin/dashboard/ai-costs', { days })
      .then(setCosts)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '成本台账加载失败', 'error'));
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  if (!summary || !costs) return <Loading text="正在加载看板…" />;

  return (
    <div className="space-y-5">
      <PageTitle title="数据看板" desc="核心业务指标与 AI 调用成本，一眼看清家底" />

      {/* 4 张数字卡 */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="注册用户数" value={summary.users} />
        <StatCard label="分析次数" value={summary.analyses} hint="方案已生成及以后" />
        <StatCard label="点数发放总量" value={summary.points_granted} hint="含注册赠送与人工发放" />
        <StatCard label="点数消耗总量" value={summary.points_spent} hint="分析 + 重生成" />
      </div>

      {/* AI 成本台账 */}
      <div className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[15px] font-semibold text-warm">AI 成本台账</h2>
            {costs.over_budget_count > 0 && (
              <StatusBadge kind="danger" text={`${costs.over_budget_count} 次超过 ¥0.5 红线`} />
            )}
          </div>
          <div className="flex items-center gap-2 text-[13px]">
            <div className="flex overflow-hidden rounded-md border border-border-subtle">
              {(['daily', 'detail'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`px-3 py-1.5 transition-colors ${view === v ? 'bg-primary text-white' : 'text-warm-light hover:bg-soft/60'}`}
                  onClick={() => setView(v)}
                >
                  {v === 'daily' ? '按天汇总' : '按次明细'}
                </button>
              ))}
            </div>
            <div className="flex overflow-hidden rounded-md border border-border-subtle">
              {([7, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`px-3 py-1.5 transition-colors ${days === d ? 'bg-primary text-white' : 'text-warm-light hover:bg-soft/60'}`}
                  onClick={() => setDays(d)}
                >
                  近 {d} 天
                </button>
              ))}
            </div>
          </div>
        </div>

        {view === 'daily' ? (
          costs.daily.length === 0 ? (
            <AdminEmpty text="这段时间还没有 AI 调用记录" />
          ) : (
            <table className={tableCls}>
              <thead className="border-b border-border-subtle bg-soft/40">
                <tr>
                  <th className={thCls}>日期</th>
                  <th className={thCls}>调用次数</th>
                  <th className={thCls}>输入 token</th>
                  <th className={thCls}>输出 token</th>
                  <th className={thCls}>估算成本</th>
                </tr>
              </thead>
              <tbody>
                {costs.daily.map((row) => (
                  <tr key={row.day} className="border-b border-border-subtle/60 last:border-0">
                    <td className={tdCls}>{row.day}</td>
                    <td className={tdCls}>{row.calls}</td>
                    <td className={tdCls}>{row.input_tokens ?? 0}</td>
                    <td className={tdCls}>{row.output_tokens ?? 0}</td>
                    <td className={`${tdCls} ${row.cost_yuan > 0.5 ? 'font-semibold text-danger' : ''}`}>
                      ¥{Number(row.cost_yuan).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : costs.detail.length === 0 ? (
          <AdminEmpty text="这段时间还没有 AI 调用记录" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-border-subtle bg-soft/40">
              <tr>
                <th className={thCls}>时间</th>
                <th className={thCls}>环节</th>
                <th className={thCls}>模型</th>
                <th className={thCls}>输入 token</th>
                <th className={thCls}>输出 token</th>
                <th className={thCls}>估算成本</th>
                <th className={thCls}>Mock</th>
              </tr>
            </thead>
            <tbody>
              {costs.detail.map((row) => {
                const over = row.est_cost_yuan > 0.5;
                return (
                  <tr
                    key={row.id}
                    className={`border-b border-border-subtle/60 last:border-0 ${over ? 'bg-danger/5' : ''}`}
                  >
                    <td className={`${tdCls} ${over ? 'text-danger' : ''}`}>{row.created_at.slice(0, 19).replace('T', ' ')}</td>
                    <td className={`${tdCls} ${over ? 'text-danger' : ''}`}>{row.stage}</td>
                    <td className={`${tdCls} ${over ? 'text-danger' : ''}`}>{row.model}</td>
                    <td className={`${tdCls} ${over ? 'text-danger' : ''}`}>{row.input_tokens}</td>
                    <td className={`${tdCls} ${over ? 'text-danger' : ''}`}>{row.output_tokens}</td>
                    <td className={`${tdCls} ${over ? 'font-semibold text-danger' : ''}`}>
                      ¥{row.est_cost_yuan.toFixed(4)}
                      {over ? ' ⚠️' : ''}
                    </td>
                    <td className={`${tdCls} ${over ? 'text-danger' : ''}`}>{row.mock === 1 ? '是' : '否'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
