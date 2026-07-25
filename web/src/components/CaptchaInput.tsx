/**
 * 图形验证码组件（v2.2 A-6）：
 * - 首次挂载自动拉 GET /captcha；点击图片或刷新按钮重发
 * - 受控输入，把 {captchaId, captchaCode} 通过 onChange 上抛
 * - 验证码一用即废（后端约束），父级提交失败时调 ref.refresh() 重置
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type JSX,
} from 'react';
import { api } from '../api';

export interface CaptchaValue {
  captchaId: string;
  captchaCode: string;
}

export interface CaptchaInputHandle {
  /** 主动刷新验证码（提交失败后调用） */
  refresh: () => void;
}

interface CaptchaInputProps {
  value: CaptchaValue;
  onChange: (v: CaptchaValue) => void;
  /** 输入框 placeholder */
  placeholder?: string;
}

interface CaptchaResp {
  captcha_id: string;
  svg: string;
}

export const CaptchaInput = forwardRef<CaptchaInputHandle, CaptchaInputProps>(
  function CaptchaInput({ value, onChange, placeholder = '图形验证码' }, ref): JSX.Element {
    const [svg, setSvg] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const aliveRef = useRef(true);

    const refresh = useCallback((): void => {
      setLoading(true);
      api
        .get<CaptchaResp>('/captcha')
        .then((d) => {
          if (!aliveRef.current) return;
          setSvg(d.svg);
          // 刷新后 captcha_id 变了、旧输入作废
          onChange({ captchaId: d.captcha_id, captchaCode: '' });
        })
        .catch(() => {
          if (!aliveRef.current) return;
          setSvg('');
        })
        .finally(() => {
          if (aliveRef.current) setLoading(false);
        });
    }, [onChange]);

    useImperativeHandle(ref, () => ({ refresh }), [refresh]);

    useEffect(() => {
      aliveRef.current = true;
      refresh();
      return () => {
        aliveRef.current = false;
      };
    }, [refresh]);

    return (
      <div className="flex gap-2">
        <input
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={8}
          placeholder={placeholder}
          className="flex-1 rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={value.captchaCode}
          onChange={(e) => onChange({ ...value, captchaCode: e.target.value.trim() })}
        />
        <button
          type="button"
          aria-label="刷新图形验证码"
          disabled={loading}
          className="flex h-[46px] w-[110px] shrink-0 items-center justify-center overflow-hidden rounded-btn border border-soft bg-white disabled:opacity-60"
          onClick={refresh}
          title="看不清？点我换一张"
        >
          {svg ? (
            <img src={svg} alt="图形验证码" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[12px] text-warm-light">{loading ? '加载中…' : '点击刷新'}</span>
          )}
        </button>
      </div>
    );
  },
);
