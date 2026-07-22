/**
 * 执行清单页：步骤勾选（进度云端保存）、顶部进度条、重进恢复、全部完成提示 + 会话完成回写。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { toast } from '../stores/auth';
import type { PlanDetail, PlanItem, SessionDetail } from '../types';

export default function TodoListPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [progress, setProgress] = useState({ total: 0, checked: 0 });
  const [completed, setCompleted] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const detail = await api.get<SessionDetail>(`/sessions/${sessionId}`);
      setSession(detail);
      if (!detail.plan) {
        navigate(`/confirm/${sessionId}`, { replace: true });
        return;
      }
      setPlan(detail.plan);
      setProgress(detail.plan.todo_progress);
      setCompleted(detail.status === 'done');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '清单加载失败', 'error');
      navigate('/home', { replace: true });
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || !plan) return <Loading text="正在打开清单…" />;

  const steps = plan.items
    .filter((i) => i.item_type === 'step' && i.status !== 'rejected')
    .sort((a, b) => a.sort - b.sort);

  const toggle = async (item: PlanItem): Promise<void> => {
    const nextChecked = item.checked !== 1;
    // 乐观更新
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => (i.id === item.id ? { ...i, checked: nextChecked ? 1 : 0 } : i)),
          }
        : prev,
    );
    setProgress((prev) => ({
      total: prev.total,
      checked: prev.checked + (nextChecked ? 1 : -1),
    }));
    try {
      const result = await api.patch<{ total: number; checked: number }>(
        `/plans/items/${item.id}/check`,
        { checked: nextChecked },
      );
      setProgress(result);
      if (nextChecked) toast('又搞定一步，继续保持～', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败，请稍后再试', 'error');
      void load(); // 失败回滚：重新拉取
    }
  };

  const allDone = progress.total > 0 && progress.checked >= progress.total;

  const finishSession = async (): Promise<void> => {
    try {
      await api.post(`/sessions/${session.id}/complete`);
      setCompleted(true);
      toast('太棒了！这个空间整明白了', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败', 'error');
    }
  };

  const percent = progress.total === 0 ? 0 : Math.round((progress.checked / progress.total) * 100);

  return (
    <div className="flex min-h-full flex-1 flex-col pb-6">
      <PageHeader title="执行清单" onBack={() => navigate(`/plan/${session.id}`)} />

      {/* 顶部进度 */}
      <div className="px-5 pt-2">
        <div className="rounded-card bg-card p-4 shadow-card">
          <div className="mb-2 flex items-end justify-between">
            <div className="text-[15px] font-semibold text-warm">
              已完成 {progress.checked}/{progress.total}
            </div>
            {progress.checked > 0 && !allDone && (
              <div className="text-[12px] text-warm-light">
                上次收拾到第 {progress.checked} 步，继续加油
              </div>
            )}
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-soft">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      {/* 步骤清单 */}
      <div className="mt-5 flex-1 space-y-3 px-5">
        {steps.map((item) => {
          const content = item.content as { no?: number; action?: string; est_minutes?: number };
          const checked = item.checked === 1;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-card p-4 text-left shadow-card transition-colors ${
                checked ? 'bg-sage/15' : 'bg-card'
              }`}
              onClick={() => void toggle(item)}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[13px] ${
                  checked ? 'pop-check border-primary bg-primary text-white' : 'border-soft bg-cream'
                }`}
              >
                {checked ? '✓' : ''}
              </span>
              <span className="flex-1">
                <span
                  className={`block text-[14px] ${checked ? 'text-warm-light line-through' : 'text-warm'}`}
                >
                  {content.no}. {content.action}
                </span>
                <span className="mt-0.5 block text-[12px] text-warm-light">
                  约 {content.est_minutes ?? 10} 分钟
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 全部完成提示 */}
      {allDone && (
        <div className="px-5 pt-6">
          {completed ? (
            <div className="rounded-card border border-sage/40 bg-sage/15 p-5 text-center">
              <div className="mb-1 text-3xl">🎉</div>
              <div className="text-[16px] font-semibold text-warm">搞定！给自己点个赞</div>
              <div className="mt-1 text-[13px] text-warm-light">30 天后我再来看看你。</div>
              <button
                type="button"
                className="mt-4 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white active:bg-primary-dark"
                onClick={() => navigate('/spaces')}
              >
                去看看我的空间
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full rounded-btn bg-primary py-4 text-[16px] font-semibold text-white shadow-card active:bg-primary-dark"
              onClick={() => void finishSession()}
            >
              全部搞定，标记完成 🎉
            </button>
          )}
        </div>
      )}
    </div>
  );
}
