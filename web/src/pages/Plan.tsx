/**
 * 方案页：示意插画 + 五部分方案（丢弃建议可采纳/拒绝/修改）+ 重生成 + 定格 + 分享 + 找人帮我整理。
 * R41：重生成为异步任务——POST 拿 task_id → 每 2s 轮询 → done 刷新方案；刷新页面可恢复进行中状态。
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ContactModal } from '../components/ContactModal';
import { Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { toast, useAuthStore } from '../stores/auth';
import type { PlanDetail, PlanItem, SessionDetail } from '../types';

interface RegenCost {
  free: boolean;
  cost: number;
  label: string;
}

/** 会话详情附带的活动任务（GET /sessions/:id） */
interface ActiveRegenTask {
  id: number;
  status: 'pending' | 'processing' | 'failed';
  result_json: string | null;
}

/** GET /plans/regen-tasks/:id 响应 */
interface RegenTaskStatus {
  id: number;
  session_id: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  plan?: PlanDetail;
  error?: string;
}

/** R41：轮询重生成任务直至 done/failed（每 2s 一次，最多 2 分钟兜底） */
async function pollRegenTask(taskId: number): Promise<RegenTaskStatus> {
  const deadline = Date.now() + 120000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const task = await api.get<RegenTaskStatus>(`/plans/regen-tasks/${taskId}`);
    if (task.status === 'done' || task.status === 'failed') return task;
    if (Date.now() > deadline) throw new Error('等待超时，请稍后刷新页面看看');
    await new Promise((r) => window.setTimeout(r, 2000));
  }
}

/** GET /plans/t2i-tasks/:id 响应 */
interface T2iTaskStatus {
  id: number;
  plan_id: number;
  status: 'pending' | 'processing' | 'done' | 'failed';
  t2i_image_url?: string;
  can_free_retry?: boolean;
  error?: string;
}

/** 轮询文生图任务直至 done/failed（每 2s 一次，最多 2 分钟兜底，与 pollRegenTask 同款） */
async function pollT2iTask(taskId: number): Promise<T2iTaskStatus> {
  const deadline = Date.now() + 120000;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const task = await api.get<T2iTaskStatus>(`/plans/t2i-tasks/${taskId}`);
    if (task.status === 'done' || task.status === 'failed') return task;
    if (Date.now() > deadline) throw new Error('等待超时，请稍后刷新页面看看');
    await new Promise((r) => window.setTimeout(r, 2000));
  }
}

/** 丢弃建议条目操作按钮组 */
function DiscardItem({
  item,
  onChanged,
}: {
  item: PlanItem;
  onChanged: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.user_note ?? '');
  const [busy, setBusy] = useState(false);
  const content = item.content as { item?: string; reason?: string };

  const act = async (status: 'accepted' | 'rejected' | 'modified'): Promise<void> => {
    if (status === 'modified' && !note.trim()) {
      toast('修改建议时请写上你的想法哦', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.patch(`/plans/items/${item.id}`, {
        status,
        user_note: status === 'modified' ? note.trim() : undefined,
      });
      toast(
        status === 'accepted' ? '已采纳' : status === 'rejected' ? '已拒绝这条建议' : '已记下你的修改',
        'success',
      );
      setEditing(false);
      onChanged();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  const statusBadge =
    item.status === 'accepted' ? (
      <span className="rounded-tag bg-sage/30 px-2 py-0.5 text-[11px] text-sage-dark">已采纳</span>
    ) : item.status === 'rejected' ? (
      <span className="rounded-tag bg-soft px-2 py-0.5 text-[11px] text-warm-light">已拒绝</span>
    ) : item.status === 'modified' ? (
      <span className="rounded-tag bg-primary/15 px-2 py-0.5 text-[11px] text-primary-dark">已修改</span>
    ) : null;

  return (
    <div className="rounded-card bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-medium text-warm">{content.item ?? '这件物品'}</div>
          <div className="mt-1 text-[13px] leading-5 text-warm-light">{content.reason ?? ''}</div>
          {item.user_note ? (
            <div className="mt-1 text-[12px] text-primary-dark">你的想法：{item.user_note}</div>
          ) : null}
        </div>
        {statusBadge}
      </div>
      {editing ? (
        <div className="mt-3">
          <textarea
            className="mb-2 w-full rounded-btn border border-soft bg-cream px-3 py-2 text-[13px] outline-none focus:border-primary"
            rows={2}
            placeholder="写下你的想法，比如：留着当纪念品"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 rounded-btn border border-soft py-2 text-[12px] text-warm-light"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            <button
              type="button"
              disabled={busy}
              className="flex-1 rounded-btn bg-primary py-2 text-[12px] font-medium text-white active:bg-primary-dark disabled:opacity-60"
              onClick={() => void act('modified')}
            >
              保存修改
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-btn bg-sage/80 py-2 text-[12px] font-medium text-white active:bg-sage-dark disabled:opacity-60"
            onClick={() => void act('accepted')}
          >
            采纳
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-btn border border-soft py-2 text-[12px] text-warm active:bg-soft disabled:opacity-60"
            onClick={() => void act('rejected')}
          >
            拒绝
          </button>
          <button
            type="button"
            disabled={busy}
            className="flex-1 rounded-btn border border-soft py-2 text-[12px] text-warm active:bg-soft disabled:opacity-60"
            onClick={() => setEditing(true)}
          >
            修改
          </button>
        </div>
      )}
    </div>
  );
}

/** 分享卡片弹层：JSON 数据 + SVG 图（可长按保存/截图） */
function ShareModal({
  sessionId,
  onClose,
}: {
  sessionId: number;
  onClose: () => void;
}): JSX.Element {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    // SVG 接口需带 JWT（浏览器 <img> 不能带 header），用 axios 拉 blob 转本地 URL
    import('axios').then(({ default: axios }) => {
      axios
        .get(`/api/v1/share/${sessionId}/card.svg`, {
          responseType: 'blob',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('zmb_token') ?? ''}`,
          },
        })
        .then((resp) => {
          revoked = URL.createObjectURL(resp.data as Blob);
          setSvgUrl(revoked);
        })
        .catch(() => toast('分享卡片加载失败', 'error'));
    });
    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [sessionId]);

  return (
    <Modal open onClose={onClose}>
      <h3 className="mb-3 text-center text-[16px] font-semibold text-warm">分享我的整理方案</h3>
      {svgUrl ? (
        <img src={svgUrl} alt="分享卡片" className="w-full rounded-card border border-soft" />
      ) : (
        <Loading text="正在生成卡片…" />
      )}
      <p className="mt-3 text-center text-[12px] text-warm-light">长按图片保存，或截屏分享给朋友～</p>
    </Modal>
  );
}

export default function PlanPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const setBalance = useAuthStore((s) => s.setBalance);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [regenCost, setRegenCost] = useState<RegenCost | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [busy, setBusy] = useState(false);
  /** R41：重生成进行中（含刷新页面后恢复的进行中任务） */
  const [regenerating, setRegenerating] = useState(false);
  const regeneratingRef = useRef(false);
  regeneratingRef.current = regenerating;

  /** 高阶文生图：生成中状态 + 失败后可免费重试的任务 + 点数不足弹窗 */
  const [t2iGenerating, setT2iGenerating] = useState(false);
  const t2iGeneratingRef = useRef(false);
  t2iGeneratingRef.current = t2iGenerating;
  const [t2iFailedTask, setT2iFailedTask] = useState<T2iTaskStatus | null>(null);
  const [showContact, setShowContact] = useState(false);

  /** 应用重生成结果：done 刷新方案，failed 提示可重试 */
  const applyRegenResult = useCallback(
    async (task: RegenTaskStatus): Promise<void> => {
      if (task.status === 'done') {
        if (task.plan) {
          setPlan(task.plan);
          const cost = await api.get<RegenCost>(`/plans/${task.plan.id}/regen-cost`);
          setRegenCost(cost);
        } else {
          await loadRef.current();
        }
        const bal = await api.get<{ balance: number }>('/points/balance').catch(() => null);
        if (bal) setBalance(bal.balance);
        toast('新的一版方案出来啦', 'success');
      } else {
        toast(task.error ?? '重新生成失败了，别担心，点按钮再试一次就好', 'error');
      }
    },
    [setBalance],
  );

  const loadRef = useRef<() => Promise<void>>(async () => {});

  /** 文生图结果落地：done 刷新方案（含新签名图）+ 刷新余额；failed 记录免费重试资格 */
  const applyT2iResult = useCallback(
    async (task: T2iTaskStatus): Promise<void> => {
      if (task.status === 'done') {
        setT2iFailedTask(null);
        await loadRef.current();
        const bal = await api.get<{ balance: number }>('/points/balance').catch(() => null);
        if (bal) setBalance(bal.balance);
        toast('专属示意图画好啦', 'success');
      } else {
        setT2iFailedTask(task);
        toast(task.error ?? '画画失败了，点重试免费再画一次', 'error');
      }
    },
    [setBalance],
  );

  /** 发起文生图 / 免费重试后共用的等待流程 */
  const waitT2iTask = useCallback(
    async (taskId: number): Promise<void> => {
      setT2iGenerating(true);
      try {
        const task = await pollT2iTask(taskId);
        await applyT2iResult(task);
      } catch (err) {
        toast(err instanceof Error ? err.message : '任务状态查询失败，请刷新重试', 'error');
      } finally {
        setT2iGenerating(false);
      }
    },
    [applyT2iResult],
  );

  const load = useCallback(async (): Promise<void> => {
    try {
      const detail = await api.get<SessionDetail & { active_regen_task?: ActiveRegenTask | null }>(
        `/sessions/${sessionId}`,
      );
      setSession(detail);
      if (!detail.plan) {
        // 还没出方案：送回确认页
        navigate(`/confirm/${sessionId}`, { replace: true });
        return;
      }
      setPlan(detail.plan);
      const cost = await api.get<RegenCost>(`/plans/${detail.plan.id}/regen-cost`);
      setRegenCost(cost);
      // R41：刷新页面恢复进行中任务状态（pending/processing 续轮询，failed 提示）
      const active = detail.active_regen_task;
      if (active && !regeneratingRef.current) {
        if (active.status === 'pending' || active.status === 'processing') {
          setRegenerating(true);
          try {
            const task = await pollRegenTask(active.id);
            await applyRegenResult(task);
          } catch (err) {
            toast(err instanceof Error ? err.message : '任务状态查询失败，请刷新重试', 'error');
          } finally {
            setRegenerating(false);
          }
        } else if (active.status === 'failed') {
          const msg = (() => {
            try {
              return active.result_json
                ? (JSON.parse(active.result_json) as { error_message?: string }).error_message
                : null;
            } catch {
              return null;
            }
          })();
          toast(msg ?? '上次重新生成失败了，点按钮再试一次就好', 'error');
        }
      }
      // 文生图：刷新页面恢复进行中的任务（pending/processing 直接续轮询）
      const activeT2i = detail.active_t2i_task;
      if (activeT2i && !t2iGeneratingRef.current && detail.plan && activeT2i.plan_id === detail.plan.id) {
        void waitT2iTask(activeT2i.id);
      }
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '方案加载失败', 'error');
      navigate('/home', { replace: true });
    }
  }, [sessionId, navigate, applyRegenResult, waitT2iTask]);
  loadRef.current = load;

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || !plan) return <Loading text="正在打开方案…" />;

  const content = plan.content;
  const discardItems = plan.items.filter((i) => i.item_type === 'discard');
  const outputForms: string[] = (() => {
    try {
      return JSON.parse(session.output_forms || '[]') as string[];
    } catch {
      return [];
    }
  })();
  const showAnnotation = outputForms.includes('annotation');
  const showChecklist = outputForms.length === 0 || outputForms.includes('checklist');
  const showTodo = outputForms.includes('todo') || outputForms.length === 0 || showChecklist;

  /** R41：发起重生成——先扣点排队拿 task_id，再轮询等待结果 */
  const regenerate = async (): Promise<void> => {
    setRegenerating(true);
    try {
      const data = await api.post<{ task_id: number; balance: number }>(`/plans/${plan.id}/regenerate`);
      setBalance(data.balance);
      const task = await pollRegenTask(data.task_id);
      await applyRegenResult(task);
    } catch (err) {
      if (err instanceof ApiError && err.code === 3001) {
        toast(err.message, 'error');
        navigate('/store');
      } else {
        toast(
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : '重新生成失败，请稍后再试',
          'error',
        );
      }
    } finally {
      setRegenerating(false);
    }
  };

  /** 发起高阶文生图（扣 5 点；3001 弹联系运营；成功后进入轮询） */
  const generateT2i = async (): Promise<void> => {
    setT2iGenerating(true);
    setT2iFailedTask(null);
    try {
      const data = await api.post<{ task_id: number; charged: number; balance: number }>(
        `/plans/${plan.id}/t2i`,
      );
      setBalance(data.balance);
      const task = await pollT2iTask(data.task_id);
      await applyT2iResult(task);
    } catch (err) {
      if (err instanceof ApiError && err.code === 3001) {
        setShowContact(true);
      } else {
        toast(
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : '生成失败，请稍后再试',
          'error',
        );
      }
    } finally {
      setT2iGenerating(false);
    }
  };

  /** 失败后免费重试 1 次（复用同一 task，重新进入轮询） */
  const retryT2i = async (): Promise<void> => {
    if (!t2iFailedTask) return;
    const taskId = t2iFailedTask.id;
    setT2iFailedTask(null);
    setT2iGenerating(true);
    try {
      const data = await api.post<{ task_id: number }>(`/plans/t2i-tasks/${taskId}/retry`);
      const task = await pollT2iTask(data.task_id);
      await applyT2iResult(task);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '重试失败，请稍后再试', 'error');
    } finally {
      setT2iGenerating(false);
    }
  };

  /** 换回素材图（清空个性化插画，响应为最新 planDetail 直接套用） */
  const useAssetImage = async (): Promise<void> => {
    setT2iGenerating(true);
    try {
      const detail = await api.post<PlanDetail>(`/plans/${plan.id}/t2i/use-asset`);
      setPlan(detail);
      toast('已换回素材图', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败，请稍后再试', 'error');
    } finally {
      setT2iGenerating(false);
    }
  };

  const finalize = async (): Promise<void> => {
    setBusy(true);
    try {
      await api.post(`/plans/${plan.id}/finalize`);
      toast('方案已定格，照着做就行，一步一步来', 'success');
      navigate(`/todo/${session.id}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col pb-32">
      <PageHeader
        title="整理方案"
        onBack={() => navigate('/home')}
        right={
          <button type="button" aria-label="分享" className="text-lg" onClick={() => setShowShare(true)}>
            📤
          </button>
        }
      />

      {/* 示意插画（高阶文生图：t2i_image_url 优先，空则素材图） */}
      <div className="px-5">
        <div className="overflow-hidden rounded-card bg-card shadow-card">
          {t2iGenerating ? (
            <div className="flex h-44 flex-col items-center justify-center gap-2 bg-soft">
              <span className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-[13px] text-warm-light">正在画你的家…</span>
            </div>
          ) : plan.t2i_image_url || plan.illustration_url ? (
            <img
              src={plan.t2i_image_url ?? plan.illustration_url ?? ''}
              alt="整理后示意"
              className="h-44 w-full object-cover"
            />
          ) : (
            <div className="flex h-44 items-center justify-center bg-soft text-4xl">🏡</div>
          )}
          <div className="p-4">
            <div className="text-[15px] font-semibold text-warm">整理后大概长这样</div>
            <div className="mt-1 text-[12px] text-warm-light">{content.after_state_desc}</div>
            <div className="mt-3">
              {plan.t2i_image_url ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={t2iGenerating || regenerating}
                    className="flex-1 rounded-btn border border-primary py-2 text-[12px] font-medium text-primary active:bg-soft disabled:opacity-50"
                    onClick={() => void generateT2i()}
                  >
                    {t2iGenerating ? '正在画你的家…' : '重新生成 · 5 点'}
                  </button>
                  <button
                    type="button"
                    disabled={t2iGenerating || regenerating}
                    className="shrink-0 text-[12px] text-warm-light underline active:text-warm disabled:opacity-50"
                    onClick={() => void useAssetImage()}
                  >
                    换用素材图
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={t2iGenerating || regenerating}
                    className="w-full rounded-btn bg-primary py-2 text-[12px] font-medium text-white active:bg-primary-dark disabled:opacity-50"
                    onClick={() => void generateT2i()}
                  >
                    {t2iGenerating ? '正在画你的家…' : '✨ 生成专属示意图 · 5 点'}
                  </button>
                  {t2iFailedTask?.can_free_retry && (
                    <button
                      type="button"
                      disabled={t2iGenerating}
                      className="w-full rounded-btn border border-primary py-2 text-[12px] font-medium text-primary active:bg-soft disabled:opacity-50"
                      onClick={() => void retryT2i()}
                    >
                      免费重试
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ① 丢弃建议 */}
      {discardItems.length > 0 && (
        <section className="mt-6 px-5">
          <h2 className="mb-1 text-[16px] font-semibold text-warm">① 这些东西可能用不上了</h2>
          <p className="mb-3 text-[13px] text-warm-light">不过你说了算。</p>
          <div className="space-y-3">
            {discardItems.map((item) => (
              <DiscardItem key={item.id} item={item} onChanged={() => void load()} />
            ))}
          </div>
        </section>
      )}

      {/* ② 分类归组清单 */}
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[16px] font-semibold text-warm">② 分类归组</h2>
        <div className="space-y-3">
          {content.groups.map((group, idx) => (
            <div key={idx} className="rounded-card bg-card p-4 shadow-card">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[14px] font-medium text-warm">{group.name}</span>
                <span className="rounded-tag bg-soft px-2 py-0.5 text-[11px] text-warm-light">
                  {group.items.length} 样
                </span>
              </div>
              <div className="text-[13px] leading-6 text-warm-light">{group.items.join('、')}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ③ 收纳位置 + 添置建议 */}
      <section className="mt-6 px-5">
        <h2 className="mb-3 text-[16px] font-semibold text-warm">③ 放在哪儿 &amp; 添点什么</h2>
        <div className="space-y-3">
          {content.storage_advice.map((advice, idx) => (
            <div key={`s-${idx}`} className="rounded-card bg-card p-4 shadow-card">
              <div className="text-[14px] font-medium text-warm">
                {advice.group} → {advice.location}
              </div>
              <div className="mt-1 text-[13px] text-warm-light">{advice.tip}</div>
            </div>
          ))}
          {content.purchase_advice.map((advice, idx) => (
            <div key={`p-${idx}`} className="rounded-card border border-sage/40 bg-sage/10 p-4">
              <div className="text-[14px] font-medium text-warm">🛒 建议添置：{advice.category}</div>
              <div className="mt-1 text-[13px] text-warm-light">{advice.reason}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ④ 编号步骤 */}
      <section className="mt-6 px-5">
        <h2 className="mb-1 text-[16px] font-semibold text-warm">④ 照着做就行</h2>
        <p className="mb-3 text-[13px] text-warm-light">别担心，一步一步来。</p>
        <div className="space-y-3">
          {content.steps
            .slice()
            .sort((a, b) => a.no - b.no)
            .map((stepItem) => (
              <div key={stepItem.no} className="flex gap-3 rounded-card bg-card p-4 shadow-card">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-semibold text-white">
                  {stepItem.no}
                </span>
                <div className="flex-1">
                  <div className="text-[14px] text-warm">{stepItem.action}</div>
                  <div className="mt-1 text-[12px] text-warm-light">
                    约 {stepItem.est_minutes} 分钟 · {stepItem.target_groups.join('、')}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* ⑤ 照片标注（选了 C 才展示） */}
      {showAnnotation && (
        <section className="mt-6 px-5">
          <h2 className="mb-3 text-[16px] font-semibold text-warm">⑤ 照片标注</h2>
          <div className="space-y-3">
            {session.photos.map((photo) => (
              <div key={photo.id} className="overflow-hidden rounded-card bg-card shadow-card">
                <img src={photo.url} alt="标注照片" className="w-full object-cover" />
                <div className="p-3 text-[12px] text-warm-light">
                  {photo.group_tag ? `分组：${photo.group_tag} · ` : ''}按上面的步骤归位即可
                </div>
              </div>
            ))}
            {session.photos.length === 0 && (
              <div className="rounded-card bg-card p-4 text-center text-[13px] text-warm-light shadow-card">
                照片已按隐私设置删除，标注不可用
              </div>
            )}
          </div>
        </section>
      )}

      {/* 找人帮我整理 */}
      <div className="mt-6 px-5">
        <button
          type="button"
          className="w-full rounded-btn border border-primary/50 bg-card py-3 text-[14px] text-primary-dark active:bg-soft"
          onClick={() => setShowComingSoon(true)}
        >
          🙋 不想自己动手？找人帮我整理
        </button>
      </div>

      {/* 底部固定栏 */}
      <div className="fixed bottom-0 left-1/2 z-30 w-full max-w-md -translate-x-1/2 border-t border-soft bg-card/95 px-5 py-3 backdrop-blur">
        {regenerating && (
          <div className="mb-2 flex items-center justify-center gap-2 text-[13px] text-warm-light">
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            正在重新生成，大约需要 30 秒
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="button"
            disabled={busy || regenerating || t2iGenerating}
            className="flex-1 rounded-btn border border-primary py-3 text-[13px] font-medium text-primary active:bg-soft disabled:opacity-50"
            onClick={() => void regenerate()}
          >
            {regenerating ? '重新生成中…' : (regenCost?.label ?? '重新生成')}
          </button>
          <button
            type="button"
            disabled={busy || regenerating || t2iGenerating || plan.is_final === 1}
            className="flex-[2] rounded-btn bg-primary py-3 text-[15px] font-semibold text-white active:bg-primary-dark disabled:opacity-50"
            onClick={() => void finalize()}
          >
            {plan.is_final === 1 ? '已生成最终方案' : '全部确认，生成最终方案'}
          </button>
        </div>
      </div>

      {showShare && <ShareModal sessionId={session.id} onClose={() => setShowShare(false)} />}
      {showContact && <ContactModal open onClose={() => setShowContact(false)} />}
      {showComingSoon && (
        <Modal open onClose={() => setShowComingSoon(false)}>
          <div className="py-4 text-center">
            <div className="mb-2 text-4xl">🚧</div>
            <div className="text-[16px] font-semibold text-warm">敬请期待</div>
            <p className="mt-2 text-[13px] text-warm-light">
              专业收纳师上门服务正在筹备中，上线后第一时间告诉你～
            </p>
            <button
              type="button"
              className="mt-5 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white active:bg-primary-dark"
              onClick={() => setShowComingSoon(false)}
            >
              好的
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
