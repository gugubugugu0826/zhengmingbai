/**
 * AI 确认页：三步卡片推进。
 *  ① 我看到的范围（空间分组，可纠正标签）
 *  ② 这些是什么（模糊物品问答，可回答/跳过）
 *  ③ 你的偏好（丢弃模式 / 分析粒度(点数) / 输出形式；C 必须搭配 A 或 B）
 * 新流程（sessionId='new'）：先选偏好 → 建会话传照片 → confirm/run → ①② → confirm → analyze。
 * 已有会话：confirm/run → ①②③ → confirm → analyze。
 */
import { useEffect, useMemo, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { toast, useAuthStore } from '../stores/auth';
import { useDraftStore } from '../stores/draft';
import {
  SPACE_TYPE_LABELS,
  type ConfirmResult,
  type Photo,
  type PointsRules,
  type SessionDetail,
  type Space,
} from '../types';

type DiscardMode = 'conservative' | 'declutter';
type Granularity = 'region' | 'item';
type OutputForm = 'checklist' | 'todo' | 'annotation';

const OUTPUT_FORMS: Array<{ key: OutputForm; label: string; desc: string }> = [
  { key: 'checklist', label: 'A · 结构化清单', desc: '分类、位置、步骤一页看清' },
  { key: 'todo', label: 'B · 分步待办清单', desc: '照着勾选，一步一步来' },
  { key: 'annotation', label: 'C · 照片标注', desc: '在照片上标出物品归位（需搭配 A 或 B）' },
];

interface PreferenceState {
  discardMode: DiscardMode;
  granularity: Granularity;
  outputForms: OutputForm[];
}

/** 步骤指示条 */
function StepBar({ step, total }: { step: number; total: number }): JSX.Element {
  return (
    <div className="flex items-center gap-2 px-5 pb-2 pt-1">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-primary' : 'bg-soft'}`}
        />
      ))}
    </div>
  );
}

/** 偏好三件套（丢弃模式 / 粒度 / 输出形式），新会话与已有会话复用 */
function PreferencePicker({
  value,
  onChange,
  rules,
}: {
  value: PreferenceState;
  onChange: (next: PreferenceState) => void;
  rules: PointsRules | null;
}): JSX.Element {
  const toggleForm = (form: OutputForm): void => {
    const has = value.outputForms.includes(form);
    onChange({
      ...value,
      outputForms: has ? value.outputForms.filter((f) => f !== form) : [...value.outputForms, form],
    });
  };

  return (
    <div className="space-y-5">
      {/* 丢弃模式 */}
      <div>
        <h3 className="mb-2 text-[15px] font-semibold text-warm">丢弃模式</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={`rounded-card border-2 bg-card p-4 text-left shadow-card ${
              value.discardMode === 'conservative' ? 'border-primary' : 'border-transparent'
            }`}
            onClick={() => onChange({ ...value, discardMode: 'conservative' })}
          >
            <div className="text-[15px] font-medium text-warm">🌿 保守模式</div>
            <div className="mt-1 text-[12px] text-warm-light">只建议明显用不上的，慢慢来</div>
          </button>
          <button
            type="button"
            className={`rounded-card border-2 bg-card p-4 text-left shadow-card ${
              value.discardMode === 'declutter' ? 'border-primary' : 'border-transparent'
            }`}
            onClick={() => onChange({ ...value, discardMode: 'declutter' })}
          >
            <div className="text-[15px] font-medium text-warm">🍃 断舍离模式</div>
            <div className="mt-1 text-[12px] text-warm-light">大胆一点，给生活腾地方</div>
          </button>
        </div>
      </div>

      {/* 分析粒度 */}
      <div>
        <h3 className="mb-2 text-[15px] font-semibold text-warm">分析粒度</h3>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className={`rounded-card border-2 bg-card p-4 text-left shadow-card ${
              value.granularity === 'region' ? 'border-primary' : 'border-transparent'
            }`}
            onClick={() => onChange({ ...value, granularity: 'region' })}
          >
            <div className="text-[15px] font-medium text-warm">区域级</div>
            <div className="mt-1 text-[12px] text-warm-light">按区域出方案，够用好上手</div>
            <div className="mt-2 inline-block rounded-tag bg-soft px-2 py-0.5 text-[12px] text-primary-dark">
              {rules ? `${rules.analysis.region} 点` : '… 点'}
            </div>
          </button>
          <button
            type="button"
            className={`rounded-card border-2 bg-card p-4 text-left shadow-card ${
              value.granularity === 'item' ? 'border-primary' : 'border-transparent'
            }`}
            onClick={() => onChange({ ...value, granularity: 'item' })}
          >
            <div className="text-[15px] font-medium text-warm">物品级</div>
            <div className="mt-1 text-[12px] text-warm-light">细到每件物品，方案更精准</div>
            <div className="mt-2 inline-block rounded-tag bg-soft px-2 py-0.5 text-[12px] text-primary-dark">
              {rules ? `${rules.analysis.item} 点` : '… 点'}
            </div>
          </button>
        </div>
      </div>

      {/* 输出形式 */}
      <div>
        <h3 className="mb-2 text-[15px] font-semibold text-warm">输出形式（可多选）</h3>
        <div className="space-y-3">
          {OUTPUT_FORMS.map((form) => {
            const checked = value.outputForms.includes(form.key);
            return (
              <button
                key={form.key}
                type="button"
                className={`flex w-full items-center gap-3 rounded-card border-2 bg-card p-4 text-left shadow-card ${
                  checked ? 'border-primary' : 'border-transparent'
                }`}
                onClick={() => toggleForm(form.key)}
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[12px] ${
                    checked ? 'border-primary bg-primary text-white' : 'border-soft bg-cream'
                  }`}
                >
                  {checked ? '✓' : ''}
                </span>
                <span>
                  <span className="block text-[14px] font-medium text-warm">{form.label}</span>
                  <span className="block text-[12px] text-warm-light">{form.desc}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ConfirmPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const isNew = sessionId === 'new';
  const draft = useDraftStore((s) => s.draft);
  const balance = useAuthStore((s) => s.balance);
  const setBalance = useAuthStore((s) => s.setBalance);

  const [step, setStep] = useState(0); // 新流程：0=偏好 1=分组 2=问答；已有会话：0=分组 1=问答 2=偏好
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [rules, setRules] = useState<PointsRules | null>(null);
  const [prefs, setPrefs] = useState<PreferenceState>({
    discardMode: 'conservative',
    granularity: 'region',
    outputForms: ['checklist'],
  });

  const stepsTotal = isNew ? 3 : 3;

  // 加载点数规则（普通用户拿不到 /configs——阶段2已收编 admin；用公开默认值兜底，与后端 seed 一致）
  useEffect(() => {
    // 默认值与 server DEFAULT_POINTS_RULES 保持一致；后台改价后 C 端按钮显示可能滞后，不影响实际扣点（后端按 configs 计）
    setRules({
      analysis: { region: 10, item: 25 },
      regen_after_first: { region: 3, item: 8 },
      effect_image_p2: 50,
      new_user_gift_points: 20,
    });
  }, []);

  // 新流程校验草稿；已有会话拉详情
  useEffect(() => {
    if (isNew) {
      if (!draft || draft.photos.length === 0) {
        toast('先拍几张照片再来哦', 'info');
        navigate('/capture', { replace: true });
      }
      return;
    }
    setLoading(true);
    api
      .get<SessionDetail>(`/sessions/${sessionId}`)
      .then((detail) => {
        setSession(detail);
        setPhotos(detail.photos);
        if (detail.plan) {
          navigate(`/plan/${detail.id}`, { replace: true });
        }
      })
      .catch((err: unknown) => {
        toast(err instanceof ApiError ? err.message : '会话加载失败', 'error');
        navigate('/home', { replace: true });
      })
      .finally(() => setLoading(false));
  }, [isNew, sessionId, draft, navigate]);

  /** 新流程第 0 步：建会话 + 传照片 + confirm/run */
  const createSessionAndRun = async (): Promise<void> => {
    if (!draft) return;
    setBusy(true);
    try {
      const label = SPACE_TYPE_LABELS[draft.spaceType] ?? '空间';
      const spaces = await api.get<Space[]>('/spaces');
      let space = spaces.find((s) => s.space_type === draft.spaceType);
      if (!space) {
        space = await api.post<Space>('/spaces', { name: `我的${label}`, space_type: draft.spaceType });
      }
      const created = await api.post<{ id: number }>('/sessions', {
        space_id: space.id,
        granularity: prefs.granularity,
        discard_mode: prefs.discardMode,
        output_forms: prefs.outputForms,
        // R49：Capture 页勾选"保留到我的家"的结果（批次 C 接入勾选 UI 后生效）
        ...(draft.keepPhotos !== undefined ? { keep_photos: draft.keepPhotos } : {}),
      });
      const uploaded = await api.post<Photo[]>(`/sessions/${created.id}/photos`, {
        photos: draft.photos,
      });
      const detail = await api.get<SessionDetail>(`/sessions/${created.id}`);
      setSession(detail);
      setPhotos(uploaded);
      const result = await api.post<ConfirmResult>(`/sessions/${created.id}/confirm/run`);
      setConfirmResult(result);
      useDraftStore.getState().clearDraft();
      window.history.replaceState(null, '', `/confirm/${created.id}`);
      setStep(1);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '上传失败，请稍后再试', 'error');
    } finally {
      setBusy(false);
    }
  };

  /** 已有会话：确认页第一步先跑 confirm/run */
  const runConfirm = async (): Promise<void> => {
    if (!session) return;
    setBusy(true);
    try {
      const result = await api.post<ConfirmResult>(`/sessions/${session.id}/confirm/run`);
      setConfirmResult(result);
      setStep(1);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'AI 确认失败，请稍后再试', 'error');
    } finally {
      setBusy(false);
    }
  };

  // 已有会话进入时自动跑 confirm/run
  useEffect(() => {
    if (!isNew && session && !confirmResult && !busy && step === 0) {
      void runConfirm();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, isNew]);

  /** 照片 URL：服务器照片用签名 URL，本地草稿（用户纠正失败时回显）用 dataURL */
  const photoUrlOf = useMemo((): ((id: number) => string) => {
    const map = new Map<number, string>();
    photos.forEach((p) => map.set(p.id, p.url));
    return (id: number): string => map.get(id) ?? '';
  }, [photos]);

  const outputValid =
    prefs.outputForms.length > 0 &&
    !(prefs.outputForms.includes('annotation') && prefs.outputForms.length === 1);

  const analysisCost = rules ? rules.analysis[prefs.granularity] : null;

  /** 最终提交：confirm → analyze → 方案页 */
  const submitAll = async (): Promise<void> => {
    if (!session) return;
    if (!outputValid) {
      toast('选 C 的话，记得再搭配 A 或 B 哦', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/sessions/${session.id}/confirm`, {
        groups: confirmResult?.groups.map((g) => ({ tag: g.tag, photo_ids: g.photo_ids })),
        vague_answers: Object.entries(answers)
          .filter(([, v]) => v.trim())
          .map(([k, v]) => `${k}: ${v.trim()}`),
      });
      const plan = await api.post<{ id: number; balance: number; charged: number }>(
        `/sessions/${session.id}/analyze`,
      );
      setBalance(plan.balance);
      toast('方案出来啦，看看合不合心意', 'success');
      navigate(`/plan/${session.id}`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 3001) {
        toast(err.message, 'error');
        navigate('/store');
      } else {
        toast(err instanceof ApiError ? err.message : '分析失败，请稍后再试', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Loading text="正在打开确认页…" />;

  // 新流程步骤 0：偏好选择（先选偏好再建会话）
  if (isNew && !session) {
    return (
      <div className="w-full max-w-3xl">
        <PageHeader title="你的偏好" onBack={() => navigate('/capture')} back />
        <StepBar step={1} total={stepsTotal} />
        <div className="px-5 pt-2 md:px-0">
          <PreferencePicker value={prefs} onChange={setPrefs} rules={rules} />
        </div>
        <div className="px-5 pt-6 md:px-0">
          <button
            type="button"
            disabled={busy || !outputValid}
            className="w-full rounded-btn bg-primary py-4 text-[16px] font-semibold text-white shadow-card active:bg-primary-dark disabled:opacity-50"
            onClick={() => void createSessionAndRun()}
          >
            {busy ? '正在上传照片并分析…' : '继续'}
          </button>
          {!outputValid && (
            <p className="mt-2 text-center text-[12px] text-warm-light">选 C 的话，记得再搭配 A 或 B 哦</p>
          )}
        </div>
      </div>
    );
  }

  if (!session) return <Loading />;

  const stepIndex = isNew ? step : step; // 已有会话：0=分组 1=问答 2=偏好

  /** 分组卡片内容 */
  const renderGroups = (): JSX.Element => {
    if (!confirmResult) return <Loading text="AI 正在看照片…" />;
    return (
      <div className="grid gap-4 px-5 md:grid-cols-2 md:px-0">
        <div>
          <h2 className="text-[18px] font-semibold text-warm">我看到的范围</h2>
          <p className="mt-1 text-[13px] text-warm-light">
            我把照片分了 {confirmResult.groups.length} 组，看看对不对～
          </p>
        </div>
        {confirmResult.groups.map((group) => (
          <div key={group.tag} className="rounded-card bg-card p-4 shadow-card">
            <div className="mb-3 text-[14px] font-medium text-warm">{group.label}</div>
            <div className="flex flex-wrap gap-2">
              {group.photo_ids.map((pid) => (
                <img
                  key={pid}
                  src={photoUrlOf(pid)}
                  alt={`照片 ${pid}`}
                  className="h-16 w-16 rounded-btn border border-soft object-cover"
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  /** 模糊物品问答 */
  const renderVague = (): JSX.Element => {
    if (!confirmResult) return <Loading />;
    if (confirmResult.vague_items.length === 0) {
      return (
        <div className="px-5">
          <div className="rounded-card bg-card p-6 text-center shadow-card">
            <div className="mb-2 text-3xl">👌</div>
            <div className="text-[15px] font-medium text-warm">没有认不出来的东西</div>
            <div className="mt-1 text-[13px] text-warm-light">照片都很清楚，直接下一步吧</div>
          </div>
        </div>
      );
    }
    return (
      <div className="grid gap-4 px-5 md:grid-cols-2 md:px-0">
        <div className="md:col-span-2">
          <h2 className="text-[18px] font-semibold text-warm">这些是什么？</h2>
          <p className="mt-1 text-[13px] text-warm-light">有几样东西我没认出来，告诉我它是啥，方案会更准～</p>
        </div>
        {confirmResult.vague_items.map((item) => (
          <div key={item.id} className="rounded-card bg-card p-4 shadow-card">
            {photoUrlOf(item.photo_id) ? (
              <img
                src={photoUrlOf(item.photo_id)}
                alt="模糊物品照片"
                className="mb-3 h-40 w-full rounded-btn border border-soft object-cover"
              />
            ) : null}
            <div className="mb-1 text-[14px] font-medium text-warm">
              {item.question || '这个东西我没认出来，它是什么呀？'}
            </div>
            {item.hint ? <div className="mb-2 text-[12px] text-warm-light">提示：{item.hint}</div> : null}
            <div className="flex gap-2">
              <input
                className="flex-1 rounded-btn border border-soft bg-cream px-3 py-2 text-[14px] outline-none focus:border-primary"
                placeholder="比如：加湿器 / 囤的纸巾…"
                value={answers[item.id] ?? ''}
                onChange={(e) =>
                  setAnswers((prev) => ({ ...prev, [item.id]: e.target.value }))
                }
              />
              <button
                type="button"
                className="rounded-btn border border-soft px-3 text-[13px] text-warm-light active:bg-soft"
                onClick={() => setAnswers((prev) => ({ ...prev, [item.id]: '' }))}
              >
                跳过
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderStep = (): JSX.Element => {
    // 已有会话：0=分组 1=问答 2=偏好；新流程会话创建后：1=分组 2=问答
    if (isNew) {
      if (stepIndex === 1) return renderGroups();
      return renderVague();
    }
    if (stepIndex === 0) return renderGroups();
    if (stepIndex === 1) return renderVague();
    return (
      <div className="px-5 md:px-0">
        <h2 className="mb-3 text-[18px] font-semibold text-warm">你的偏好</h2>
        <PreferencePicker value={prefs} onChange={setPrefs} rules={rules} />
      </div>
    );
  };

  const isLastStep = isNew ? stepIndex === 2 : stepIndex === 2;
  const shownStep = isNew ? stepIndex + 1 : stepIndex + 1;

  return (
    <div className="w-full max-w-3xl">
      <PageHeader title="AI 确认" subtitle="确认分组和偏好，AI 马上出方案" />
      <StepBar step={shownStep} total={stepsTotal} />
      <div className="pt-2">{renderStep()}</div>
      <div className="px-5 pt-6 md:px-0">
        {isLastStep ? (
          <>
            <button
              type="button"
              disabled={busy || !outputValid}
              className="w-full rounded-btn bg-primary py-4 text-[16px] font-semibold text-white shadow-card active:bg-primary-dark disabled:opacity-50"
              onClick={() => void submitAll()}
            >
              {busy
                ? 'AI 正在出方案…'
                : `生成方案${analysisCost !== null ? `（${analysisCost} 点，余额 ${balance}）` : ''}`}
            </button>
            {!outputValid && (
              <p className="mt-2 text-center text-[12px] text-warm-light">
                选 C 的话，记得再搭配 A 或 B 哦
              </p>
            )}
          </>
        ) : (
          <button
            type="button"
            disabled={busy || !confirmResult}
            className="w-full rounded-btn bg-primary py-4 text-[16px] font-semibold text-white shadow-card active:bg-primary-dark disabled:opacity-50"
            onClick={() => setStep(stepIndex + 1)}
          >
            继续
          </button>
        )}
      </div>
    </div>
  );
}
