/**
 * 系统开关（v3 T04，D3/§5-H）：
 * 保留现有 AI 区 / 提示词区 / 支付区，新增「运营开关」区：
 *   ① 新用户注册开关（ops.registration_enabled）：关闭后注册接口拒绝新注册（C 端提示"暂停注册"）；
 *      切换立即写库即时生效，无需重启。
 *   ② 维护模式（ops.maintenance {enabled, notice}）：开启后全站（Web+小程序）显示维护公告页，
 *      仅管理员可访问后台；开启走二次确认（ConfirmDialog），公告文案可就地编辑；
 *      两键连续 PUT 原子写入 {enabled,notice}，C 端 30s 轮询自动恢复。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from '../../stores/auth';
import { btnGhostCls, btnPrimaryCls, cardCls, inputCls, PageTitle } from '../ui';

type Configs = Record<string, unknown>;

/** 提示词默认值（与服务端 seed 一致，用于"恢复默认"） */
const DEFAULT_PROMPTS: Record<string, string> = {
  'ai.prompt.confirm':
    '你是「整明白」整理助手。请观察用户上传的空间照片，判断：1）照片是否属于同一空间，如需分组请给出分组建议；2）列出你无法确认的物品，用大白话向用户提问。输出 JSON。',
  'ai.prompt.analyze':
    '你是「整明白」整理助手。结合中式生活物品分类知识库，对照片中的物品逐项识别归类，指出杂乱点。输出结构化 JSON。',
  'ai.prompt.plan':
    '你是「整明白」整理助手。根据确认结果与分析结果，生成五部分整理方案：①温和的丢弃建议（明示"你说了算"）②分类归组清单 ③收纳位置+添置建议（只荐品类不带链接）④编号执行步骤 ⑤整理后场景描述。语气温暖，说人话。严格输出给定 JSON Schema。',
};

const PROMPT_LABELS: Record<string, string> = {
  'ai.prompt.confirm': '确认环节提示词',
  'ai.prompt.analyze': '分析环节提示词',
  'ai.prompt.plan': '方案生成提示词',
};

const MODEL_OPTIONS = ['qwen-vl-plus', 'qwen-vl-max', 'glm-4v-flash'];
const TEXT_MODEL_OPTIONS = ['qwen-plus', 'qwen-turbo', 'qwen-max'];

/** 维护模式配置体（与后端 ops.maintenance 契约一致） */
interface MaintenanceCfg {
  enabled: boolean;
  notice: string;
}

const DEFAULT_NOTICE = '系统维护中，请稍后再来';

function parseMaintenance(raw: unknown): MaintenanceCfg {
  if (raw && typeof raw === 'object') {
    const o = raw as { enabled?: unknown; notice?: unknown };
    return { enabled: Boolean(o.enabled), notice: typeof o.notice === 'string' && o.notice.trim() ? o.notice : DEFAULT_NOTICE };
  }
  return { enabled: false, notice: DEFAULT_NOTICE };
}

/** 开关行 */
function Toggle({ checked, onChange, label, desc, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string; disabled?: boolean }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="min-w-0 pr-4">
        <div className="text-[14px] text-warm">{label}</div>
        {desc ? <div className="mt-0.5 text-[12px] leading-5 text-warm-light">{desc}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-primary' : 'bg-border-strong'}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[22px]' : 'translate-x-0.5'}`}
        />
      </button>
    </div>
  );
}

export default function AdminSwitches(): JSX.Element {
  const [configs, setConfigs] = useState<Configs | null>(null);
  // AI 区
  const [aiMock, setAiMock] = useState(true);
  const [visionModel, setVisionModel] = useState('qwen-vl-plus');
  const [textModel, setTextModel] = useState('qwen-plus');
  const [t2iEnabled, setT2iEnabled] = useState(false);
  // 提示词区
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  // 支付区
  const [paymentChannel, setPaymentChannel] = useState('mock');
  // 运营开关区（v3 新增）
  const [regEnabled, setRegEnabled] = useState(true);
  const [maintenance, setMaintenance] = useState<MaintenanceCfg>({ enabled: false, notice: DEFAULT_NOTICE });
  const [opsBusy, setOpsBusy] = useState(false);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);
  const [savingSection, setSavingSection] = useState<string | null>(null);

  const load = useCallback((): void => {
    api
      .get<Configs>('/admin/configs')
      .then((c) => {
        setConfigs(c);
        setAiMock(Boolean(c['ai.mock']));
        setVisionModel(String(c['ai.vision_model'] ?? 'qwen-vl-plus'));
        setTextModel(String(c['ai.text_model'] ?? 'qwen-plus'));
        setT2iEnabled(Boolean(c['ai.t2i_enabled']));
        const p: Record<string, string> = {};
        for (const key of Object.keys(DEFAULT_PROMPTS)) {
          p[key] = String(c[key] ?? DEFAULT_PROMPTS[key]);
        }
        setPrompts(p);
        setPaymentChannel(String(c['payment.channel'] ?? 'mock'));
        setRegEnabled(c['ops.registration_enabled'] !== false);
        setMaintenance(parseMaintenance(c['ops.maintenance']));
      })
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '配置加载失败', 'error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (section: string, entries: Array<[string, unknown]>): Promise<void> => {
    setSavingSection(section);
    try {
      for (const [key, value] of entries) {
        await api.put('/admin/configs', { key, value });
      }
      toast('已保存，即时生效', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败', 'error');
    } finally {
      setSavingSection(null);
    }
  };

  /** 注册开关：切换即写库，失败回滚 UI */
  const toggleRegistration = async (next: boolean): Promise<void> => {
    const prev = regEnabled;
    setRegEnabled(next);
    setOpsBusy(true);
    try {
      await api.put('/admin/configs', { key: 'ops.registration_enabled', value: next });
      toast(next ? '已开放新用户注册' : '已暂停新用户注册', 'success');
    } catch (err) {
      setRegEnabled(prev);
      toast(err instanceof ApiError ? err.message : '切换失败，请重试', 'error');
    } finally {
      setOpsBusy(false);
    }
  };

  /** 维护模式：写 {enabled, notice} 整体，失败回滚 UI */
  const applyMaintenance = async (next: MaintenanceCfg): Promise<void> => {
    const prev = maintenance;
    setMaintenance(next);
    setOpsBusy(true);
    try {
      await api.put('/admin/configs', { key: 'ops.maintenance', value: { enabled: next.enabled, notice: next.notice.trim() || DEFAULT_NOTICE } });
      toast(next.enabled ? '维护模式已开启，全站将显示维护公告' : '维护模式已关闭，全站恢复正常', 'success');
    } catch (err) {
      setMaintenance(prev);
      toast(err instanceof ApiError ? err.message : '切换失败，请重试', 'error');
    } finally {
      setOpsBusy(false);
    }
  };

  const onMaintenanceToggle = (next: boolean): void => {
    if (next) {
      // 开启维护是全局影响操作，走二次确认
      setConfirmMaintenance(true);
    } else {
      void applyMaintenance({ ...maintenance, enabled: false });
    }
  };

  if (!configs) return <Loading text="正在加载配置…" />;

  return (
    <div className="space-y-5">
      <PageTitle title="系统开关" desc="配置改动即时生效，无需重启服务" />

      {/* 运营开关区（v3 新增：注册开关 + 维护模式） */}
      <div className={`${cardCls} p-5`}>
        <h2 className="mb-1 text-[15px] font-semibold text-warm">运营开关</h2>
        <p className="mb-2 text-[12px] text-warm-light">注册与维护模式是全站总闸，切换立即生效，请谨慎操作。</p>
        <div className="divide-y divide-border-subtle">
          <Toggle
            checked={regEnabled}
            disabled={opsBusy}
            onChange={(v) => void toggleRegistration(v)}
            label="新用户注册开关（ops.registration_enabled）"
            desc="关闭后注册接口拒绝新注册，注册页提示「暂停注册，敬请期待」；已有用户登录不受影响"
          />
          <div>
            <Toggle
              checked={maintenance.enabled}
              disabled={opsBusy}
              onChange={onMaintenanceToggle}
              label="维护模式（ops.maintenance）"
              desc="开启后全站（Web + 小程序）显示维护公告页，仅管理员可访问后台；关闭后 C 端 30 秒内自动恢复"
            />
            <label className="block pb-2">
              <span className="mb-1 block text-[13px] text-warm-light">维护公告文案（notice）</span>
              <div className="flex items-center gap-2">
                <input
                  className={`${inputCls} max-w-md flex-1`}
                  maxLength={100}
                  value={maintenance.notice}
                  placeholder="系统维护中，请稍后再来"
                  onChange={(e) => setMaintenance((m) => ({ ...m, notice: e.target.value }))}
                  onBlur={() => {
                    const notice = maintenance.notice.trim() || DEFAULT_NOTICE;
                    if (notice !== maintenance.notice) {
                      setMaintenance((m) => ({ ...m, notice }));
                    }
                    // 文案改动即时保存（带上当前 enabled 状态整体写入）
                    void applyMaintenance({ ...maintenance, notice });
                  }}
                />
                {maintenance.enabled ? (
                  <span className="shrink-0 rounded-sm bg-danger/10 px-2 py-1 text-[11px] text-danger">公告展示中</span>
                ) : null}
              </div>
            </label>
          </div>
        </div>
      </div>

      {/* AI 区 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="mb-1 text-[15px] font-semibold text-warm">AI 设置</h2>
        <p className="mb-2 text-[12px] text-warm-light">ai.mock=true 时全流程走 Mock，可用于演示与排障。</p>
        <Toggle
          checked={aiMock}
          onChange={setAiMock}
          label="Mock 模式（ai.mock）"
          desc="开启后不调用真实模型，秒回假数据"
        />
        <div className="mt-2 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1 block text-[13px] text-warm-light">视觉模型（ai.vision_model）</span>
            <select className={`${inputCls} w-full`} value={visionModel} onChange={(e) => setVisionModel(e.target.value)}>
              {MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              {!MODEL_OPTIONS.includes(visionModel) && <option value={visionModel}>{visionModel}</option>}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[13px] text-warm-light">文本模型（ai.text_model）</span>
            <select className={`${inputCls} w-full`} value={textModel} onChange={(e) => setTextModel(e.target.value)}>
              {TEXT_MODEL_OPTIONS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
              {!TEXT_MODEL_OPTIONS.includes(textModel) && <option value={textModel}>{textModel}</option>}
            </select>
          </label>
        </div>
        <div className="mt-2">
          <Toggle
            checked={t2iEnabled}
            onChange={setT2iEnabled}
            label="文生图示意插画（ai.t2i_enabled）"
            desc="开启后方案插画用通义万相现场生成，失败自动回退素材图"
          />
        </div>
        <div className="mt-3 text-right">
          <button
            type="button"
            disabled={savingSection !== null}
            className={btnPrimaryCls}
            onClick={() =>
              void save('ai', [
                ['ai.mock', aiMock],
                ['ai.vision_model', visionModel],
                ['ai.text_model', textModel],
                ['ai.t2i_enabled', t2iEnabled],
              ])
            }
          >
            {savingSection === 'ai' ? '保存中…' : '保存 AI 设置'}
          </button>
        </div>
      </div>

      {/* 提示词区 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="mb-1 text-[15px] font-semibold text-warm">提示词</h2>
        <p className="mb-3 text-[12px] text-warm-light">改动即时生效，新的 AI 调用会用新提示词。</p>
        <div className="space-y-4">
          {Object.keys(DEFAULT_PROMPTS).map((key) => (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[13px] font-medium text-warm">{PROMPT_LABELS[key] ?? key}</span>
                <button
                  type="button"
                  className="text-[12px] text-warm-light underline hover:text-primary"
                  onClick={() => setPrompts((p) => ({ ...p, [key]: DEFAULT_PROMPTS[key] }))}
                >
                  恢复默认
                </button>
              </div>
              <textarea
                className={`${inputCls} w-full`}
                rows={3}
                value={prompts[key] ?? ''}
                onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 text-right">
          <button
            type="button"
            disabled={savingSection !== null}
            className={btnPrimaryCls}
            onClick={() => void save('prompts', Object.entries(prompts))}
          >
            {savingSection === 'prompts' ? '保存中…' : '保存提示词'}
          </button>
        </div>
      </div>

      {/* 支付区 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="mb-1 text-[15px] font-semibold text-warm">支付渠道</h2>
        <p className="mb-3 text-[12px] text-warm-light">支付暂缓，购买入口已关闭；恢复收费时切到微信支付即可。</p>
        <label className="block max-w-xs">
          <span className="mb-1 block text-[13px] text-warm-light">payment.channel</span>
          <select
            className={`${inputCls} w-full`}
            value={paymentChannel}
            onChange={(e) => setPaymentChannel(e.target.value)}
          >
            <option value="mock">mock（演示，不收款）</option>
            <option value="wechat">wechat（微信支付）</option>
          </select>
        </label>
        <div className="mt-3 flex items-center justify-end gap-2">
          <span className="rounded-sm bg-soft px-2.5 py-1 text-[11px] text-warm-light">支付暂缓，购买入口已关闭</span>
          <button
            type="button"
            disabled={savingSection !== null}
            className={btnPrimaryCls}
            onClick={() => void save('payment', [['payment.channel', paymentChannel]])}
          >
            {savingSection === 'payment' ? '保存中…' : '保存支付设置'}
          </button>
        </div>
      </div>

      {/* 只读参考 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="mb-2 text-[14px] font-semibold text-warm">其他配置（只读参考）</h2>
        <pre className="max-h-48 overflow-auto rounded-md bg-soft/60 p-3 text-[12px] leading-5 text-warm-light">
          {JSON.stringify(
            Object.fromEntries(
              Object.entries(configs).filter(
                ([k]) =>
                  !['points.rules', 'payment.channel', 'ops.registration_enabled', 'ops.maintenance'].includes(k) &&
                  !k.startsWith('ai.prompt'),
              ),
            ),
            null,
            2,
          )}
        </pre>
        <div className="mt-2 text-right">
          <button type="button" className={btnGhostCls} onClick={load}>
            刷新配置
          </button>
        </div>
      </div>

      {/* 开启维护模式二次确认 */}
      <ConfirmDialog
        open={confirmMaintenance}
        onCancel={() => setConfirmMaintenance(false)}
        onConfirm={() => {
          setConfirmMaintenance(false);
          void applyMaintenance({ ...maintenance, enabled: true });
        }}
        title="确认开启维护模式？"
        desc={`开启后 Web 与小程序全站显示维护公告「${maintenance.notice.trim() || DEFAULT_NOTICE}」，普通用户暂时无法使用，仅管理员可访问后台。`}
        confirmText="确认开启"
      />
    </div>
  );
}
