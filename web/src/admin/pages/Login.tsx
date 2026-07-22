/**
 * /admin 双因子登录页（v2.2 T04，A-11）：
 * 三段式流程，每步独立界面 + 步骤指示器：
 *   Step1 邮箱 + 图形验证码 → 发邮箱验证码（scene=admin_login）；
 *         无论邮箱是否属于管理员都提示"验证码已发送"（后端防枚举静默）。
 *   Step2 邮箱验证码（6 位数字）→ 换 5 分钟一次性 admin_ticket；可返回重发。
 *   Step3 管理员密码 → 换 scope=admin 正式 JWT（存 zmb_admin_token，与 C 端隔离）。
 *
 * 错误处理：
 *   2101 图形码错误 → 自动刷新图形码并提示重试
 *   2102 邮箱码错误 → 提示重新输入（不清邮箱）
 *   2001 密码错误/ticket 过期 → 统一文案；ticket 过期给"返回重新验证"出口
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { toast } from '../../stores/auth';
import { adminTokenStore } from '../auth';

type Step = 1 | 2 | 3;

interface CaptchaData {
  captcha_id: string;
  svg: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const inputCls =
  'w-full rounded-btn border border-soft bg-cream px-3 py-2.5 text-[14px] text-warm outline-none focus:border-primary';
const btnCls =
  'w-full rounded-btn bg-primary px-4 py-2.5 text-[14px] font-medium text-white active:bg-primary-dark disabled:opacity-50';

/** 步骤指示器（1/2/3） */
function StepIndicator({ step }: { step: Step }): JSX.Element {
  const labels = ['验证邮箱', '邮箱验证码', '管理员密码'];
  return (
    <div className="mb-6 flex items-center">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${
                  active
                    ? 'bg-primary text-white'
                    : done
                      ? 'bg-primary/20 text-primary-dark'
                      : 'bg-soft text-warm-light'
                }`}
              >
                {done ? '✓' : n}
              </div>
              <div
                className={`mt-1 whitespace-nowrap text-[11px] ${
                  active ? 'font-medium text-primary-dark' : 'text-warm-light'
                }`}
              >
                {label}
              </div>
            </div>
            {i < labels.length - 1 && (
              <div className={`mx-2 mb-4 h-px flex-1 ${done ? 'bg-primary/40' : 'bg-soft'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** 图形验证码：图片 + 点击刷新 */
function CaptchaBox({
  captcha,
  value,
  onChange,
  onRefresh,
}: {
  captcha: CaptchaData | null;
  value: string;
  onChange: (v: string) => void;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-medium text-warm">图形验证码</div>
      <div className="flex items-center gap-2">
        <input
          className={`${inputCls} flex-1`}
          maxLength={8}
          placeholder="请输入图中字符"
          value={value}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value.trim())}
        />
        <button
          type="button"
          title="看不清？点击刷新"
          className="h-[42px] w-[110px] shrink-0 overflow-hidden rounded-btn border border-soft bg-white"
          onClick={onRefresh}
        >
          {captcha ? (
            <img src={captcha.svg} alt="图形验证码" className="h-full w-full object-contain" />
          ) : (
            <span className="text-[12px] text-warm-light">加载中…</span>
          )}
        </button>
      </div>
    </div>
  );
}

export default function AdminLogin(): JSX.Element {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  // Step1：邮箱 + 图形码
  const [email, setEmail] = useState('');
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null);
  const [captchaCode, setCaptchaCode] = useState('');

  // Step2：邮箱验证码
  const [emailCode, setEmailCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  // Step3：密码（admin_ticket 只存组件 state，不落任何存储）
  const [adminTicket, setAdminTicket] = useState('');
  const [password, setPassword] = useState('');
  const [ticketExpired, setTicketExpired] = useState(false);

  /** 拉取/刷新图形验证码（进入 Step1 与 2101 后都会调） */
  const refreshCaptcha = useCallback((): void => {
    setCaptchaCode('');
    api
      .get<CaptchaData>('/captcha')
      .then(setCaptcha)
      .catch(() => toast('图形验证码加载失败，请稍后重试', 'error'));
  }, []);

  useEffect(() => {
    // 已持有 admin token 直接进后台
    if (adminTokenStore.get()) {
      navigate('/admin/dashboard', { replace: true });
      return;
    }
    refreshCaptcha();
  }, [navigate, refreshCaptcha]);

  const startCountdown = (): void => {
    setCountdown(60);
    const timer = window.setInterval(() => {
      setCountdown((n) => {
        if (n <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  };

  /** Step1 提交：图形码前置 + 发邮箱码（防枚举：任何邮箱都提示已发送） */
  const submitStep1 = async (): Promise<void> => {
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    if (!captcha || !captchaCode) {
      toast('请输入图形验证码', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post('/admin/auth/step1', {
        email,
        captcha_id: captcha.captcha_id,
        captcha_code: captchaCode,
      });
      toast('验证码已发送至邮箱，5 分钟内有效（若邮箱属于管理员账号）', 'success');
      setEmailCode('');
      setStep(2);
      startCountdown();
    } catch (err) {
      if (err instanceof ApiError && err.code === 2101) {
        toast('图形验证码错误或已过期，请重新输入', 'error');
        refreshCaptcha();
      } else {
        toast(err instanceof ApiError ? err.message : '发送失败，请稍后再试', 'error');
        refreshCaptcha(); // 图形码一次性，任何失败都需换新
      }
    } finally {
      setBusy(false);
    }
  };

  /** 重发邮箱码（回到 Step1 取新图形码再发，保持"发码必过图形码"约束） */
  const resendEmailCode = (): void => {
    setStep(1);
    refreshCaptcha();
    toast('请重新输入图形验证码后再次发送', 'info');
  };

  /** Step2 提交：验邮箱码 → admin_ticket */
  const submitStep2 = async (): Promise<void> => {
    if (!/^\d{6}$/.test(emailCode)) {
      toast('邮箱验证码是 6 位数字', 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post<{ admin_ticket: string }>('/admin/auth/step2', {
        email,
        code: emailCode,
      });
      setAdminTicket(data.admin_ticket);
      setPassword('');
      setTicketExpired(false);
      setStep(3);
      toast('邮箱验证通过，请输入管理员密码', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.code === 2102) {
        toast('邮箱验证码错误或已过期，请重新输入', 'error');
      } else {
        toast(err instanceof ApiError ? err.message : '验证失败，请稍后再试', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  /** Step3 提交：ticket + 密码 → scope=admin 正式 token */
  const submitStep3 = async (): Promise<void> => {
    if (!password) {
      toast('请输入管理员密码', 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await api.post<{ token: string }>('/admin/auth/step3', {
        admin_ticket: adminTicket,
        password,
      });
      adminTokenStore.set(data.token);
      toast('登录成功，欢迎回来', 'success');
      navigate('/admin/dashboard', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.message.includes('票据')) {
          // ticket 过期（5 分钟）：提示并给返回出口
          setTicketExpired(true);
          toast('登录票据已过期，请返回重新验证邮箱', 'error');
        } else {
          toast(err.message, 'error'); // 2001 统一文案：账号或密码错误
        }
      } else {
        toast('登录失败，请稍后再试', 'error');
      }
    } finally {
      setBusy(false);
    }
  };

  const onEnter = (fn: () => Promise<void>) => (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') void fn();
  };

  return (
    <div className="flex min-h-full w-full items-center justify-center bg-[#F5F2ED] px-4 py-10">
      <div className="w-full max-w-sm rounded-card bg-card p-6 shadow-card">
        <div className="mb-1 text-center text-[18px] font-semibold text-warm">整明白 · 总控台</div>
        <div className="mb-5 text-center text-[12px] text-warm-light">
          管理员双因子登录（仅管理员可进入）
        </div>

        <StepIndicator step={step} />

        {step === 1 && (
          <div className="space-y-4" onKeyDown={onEnter(submitStep1)}>
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-warm">管理员邮箱</div>
              <input
                type="email"
                className={inputCls}
                maxLength={254}
                placeholder="name@example.com"
                value={email}
                autoComplete="username"
                onChange={(e) => setEmail(e.target.value.trim())}
              />
            </div>
            <CaptchaBox
              captcha={captcha}
              value={captchaCode}
              onChange={setCaptchaCode}
              onRefresh={refreshCaptcha}
            />
            <button
              type="button"
              disabled={busy}
              className={btnCls}
              onClick={() => void submitStep1()}
            >
              {busy ? '发送中…' : '发送邮箱验证码'}
            </button>
            <p className="text-center text-[12px] text-warm-light">
              若邮箱属于管理员账号，将收到 6 位数字验证码
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4" onKeyDown={onEnter(submitStep2)}>
            <div className="rounded-btn bg-soft/50 px-3 py-2 text-[12px] text-warm-light">
              验证码已发送至 <span className="font-medium text-warm">{email}</span>
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-warm">邮箱验证码</div>
              <input
                className={`${inputCls} tracking-[0.3em]`}
                maxLength={6}
                placeholder="6 位数字"
                value={emailCode}
                inputMode="numeric"
                autoComplete="one-time-code"
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              className={btnCls}
              onClick={() => void submitStep2()}
            >
              {busy ? '验证中…' : '下一步'}
            </button>
            <div className="flex items-center justify-between text-[12px]">
              <button
                type="button"
                className="text-warm-light hover:text-primary disabled:opacity-50"
                disabled={countdown > 0}
                onClick={resendEmailCode}
              >
                {countdown > 0 ? `重新发送（${countdown}s）` : '重新发送验证码'}
              </button>
              <button
                type="button"
                className="text-warm-light hover:text-primary"
                onClick={() => {
                  setStep(1);
                  refreshCaptcha();
                }}
              >
                更换邮箱
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4" onKeyDown={onEnter(submitStep3)}>
            <div className="rounded-btn bg-soft/50 px-3 py-2 text-[12px] text-warm-light">
              邮箱验证已通过，票据 5 分钟内有效
            </div>
            <div>
              <div className="mb-1.5 text-[13px] font-medium text-warm">管理员密码</div>
              <input
                type="password"
                className={inputCls}
                maxLength={64}
                placeholder="请输入管理员密码"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <button
              type="button"
              disabled={busy}
              className={btnCls}
              onClick={() => void submitStep3()}
            >
              {busy ? '登录中…' : '进入总控台'}
            </button>
            {ticketExpired && (
              <button
                type="button"
                className="w-full text-center text-[12px] text-primary hover:text-primary-dark"
                onClick={() => {
                  setStep(2);
                  setEmailCode('');
                  setTicketExpired(false);
                }}
              >
                票据已过期？返回重新输入邮箱验证码
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
