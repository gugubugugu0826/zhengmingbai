/**
 * v3 图形验证码弹窗（验证码新规则核心组件，4 处发信动作复用）：
 * 注册 / 忘记密码 / 更改邮箱 / 登录邮箱验证码——点击「发送验证码」时弹出本组件，
 * 校验通过后才调发信接口；表单内不常驻图形码。
 *
 * 用法（T03/T04）：
 *   const [captchaOpen, setCaptchaOpen] = useState(false);
 *   // 点「发送验证码」→ 先做本地表单校验 → setCaptchaOpen(true)
 *   <CaptchaDialog
 *     open={captchaOpen}
 *     onClose={() => setCaptchaOpen(false)}
 *     onVerified={(captchaId, captchaCode) => {
 *       setCaptchaOpen(false);
 *       void sendEmailCode({ captcha_id: captchaId, captcha_code: captchaCode });
 *     }}
 *   />
 * 注意：图形码一用即废。若发信接口返回 2101（图形码错误），重新打开弹窗即可（会自动刷新）。
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api';
import { Modal } from './Modal';

interface CaptchaDialogProps {
  open: boolean;
  /** 用户取消（点遮罩/取消按钮） */
  onClose: () => void;
  /** 图形码校验通过（本地非空校验）后回调，携带调发信接口所需参数 */
  onVerified: (captchaId: string, captchaCode: string) => void;
  /** 弹窗副标题（默认「先过一下人机验证」） */
  subtitle?: string;
}

interface CaptchaResp {
  captcha_id: string;
  svg: string;
}

export function CaptchaDialog({
  open,
  onClose,
  onVerified,
  subtitle = '先过一下人机验证',
}: CaptchaDialogProps): JSX.Element {
  const [captchaId, setCaptchaId] = useState('');
  const [svg, setSvg] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback((): void => {
    setLoading(true);
    setError('');
    api
      .get<CaptchaResp>('/captcha')
      .then((d) => {
        setCaptchaId(d.captcha_id);
        setSvg(d.svg);
        setCode('');
      })
      .catch(() => {
        setSvg('');
        setError('验证码加载失败，点图片重试');
      })
      .finally(() => setLoading(false));
  }, []);

  // 每次打开弹窗拉一张新图形码
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    if (!code.trim()) {
      setError('先输入图片里的字符');
      return;
    }
    if (!captchaId) {
      setError('验证码还没加载好，点图片刷新一下');
      return;
    }
    onVerified(captchaId, code.trim());
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h2 className="mb-1 text-[17px] font-semibold text-warm">人机验证</h2>
      <p className="mb-4 text-[13px] text-warm-light">{subtitle}</p>
      <form onSubmit={submit} className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            inputMode="text"
            autoComplete="off"
            maxLength={8}
            placeholder="输入图片里的字符"
            className="flex-1 rounded-md border border-border-subtle bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={code}
            onChange={(e) => setCode(e.target.value.trim())}
          />
          <button
            type="button"
            aria-label="刷新图形验证码"
            disabled={loading}
            className="flex h-[46px] w-[110px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-card disabled:opacity-60"
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
        {error && <p className="text-[13px] text-danger">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            className="flex-1 rounded-md border border-border-subtle py-3 text-[14px] text-warm-light active:bg-tint"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 rounded-md bg-primary py-3 text-[14px] font-medium text-white active:bg-primary-dark disabled:opacity-60"
          >
            确认发送
          </button>
        </div>
      </form>
    </Modal>
  );
}
