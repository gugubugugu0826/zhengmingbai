/**
 * AI 与支付开关（R37/R44）：AI 区 / 提示词区（多行 + 恢复默认）/ 支付区，分区独立保存。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import { btnGhostCls, btnPrimaryCls, cardCls, inputCls } from '../ui';

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

/** 开关行 */
function Toggle({ checked, onChange, label, desc }: { checked: boolean; onChange: (v: boolean) => void; label: string; desc?: string }): JSX.Element {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <div className="text-[14px] text-warm">{label}</div>
        {desc ? <div className="mt-0.5 text-[12px] text-warm-light">{desc}</div> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-soft'}`}
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

  if (!configs) return <Loading text="正在加载配置…" />;

  return (
    <div className="space-y-5">
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
          <span className="rounded-tag bg-soft px-2.5 py-1 text-[11px] text-warm-light">支付暂缓，购买入口已关闭</span>
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
        <pre className="max-h-48 overflow-auto rounded-btn bg-cream p-3 text-[12px] leading-5 text-warm-light">
          {JSON.stringify(
            Object.fromEntries(
              Object.entries(configs).filter(
                ([k]) => !['points.rules', 'payment.channel'].includes(k) && !k.startsWith('ai.prompt'),
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
    </div>
  );
}
