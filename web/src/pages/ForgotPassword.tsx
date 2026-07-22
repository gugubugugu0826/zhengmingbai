/**
 * 忘记密码页（v3 §5-C，新页面）：
 * 流程：输邮箱 → 点「发送验证码」弹 CaptchaDialog 图形码 → POST /auth/email-code
 * （scene='reset_password'，未注册邮箱也统一提示"验证码已发送"，防枚举）
 * → 输 6 位验证码 + 新密码（≥8 位含字母数字）+ 确认 → POST /auth/password-reset
 * → 重置成功回登录页。重置后旧密码立即失效（后端覆盖哈希天然生效）。
 */
import { useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { AuthCard } from '../components/AuthCard';
import { CaptchaDialog } from '../components/CaptchaDialog';
import { toast } from '../stores/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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

  /** 点「发送验证码」：本地校验邮箱 → 开图形码弹窗 */
  const openSendCaptcha = (): void => {
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    setCaptchaOpen(true);
  };

  /** 图形码通过后发码（scene=reset_password，防枚举统一提示） */
  const sendEmailCode = async (captchaId: string, captchaCode: string): Promise<void> => {
    try {
      await api.post('/auth/email-code', {
        email,
        scene: 'reset_password',
        captcha_id: captchaId,
        captcha_code: captchaCode,
      });
      // 防枚举：无论邮箱是否注册都提示已发送
      toast('验证码已发送，5 分钟内有效', 'success');
      setCodeSent(true);
      startCountdown();
    } catch (err) {
      if (err instanceof ApiError && err.code === 2101) {
        setCaptchaOpen(true);
        toast('图形验证码不对，再来一次', 'error');
      } else {
        toast(err instanceof ApiError ? err.message : '发送失败，请稍后再试', 'error');
      }
    }
  };

  const submit = async (): Promise<void> => {
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast('邮箱验证码是 6 位数字', 'error');
      return;
    }
    if (password.length < 8) {
      toast('新密码至少 8 位', 'error');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast('新密码需要同时包含字母和数字', 'error');
      return;
    }
    if (password !== password2) {
      toast('两次输入的密码不一致', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/auth/password-reset', { email, code, new_password: password });
      toast('密码已重置，请用新密码登录', 'success');
      navigate('/login', { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '重置失败，请稍后再试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthCard title="找回密码" subtitle="通过注册邮箱重置密码，重置后旧密码立即失效">
      <label className="mb-1 block text-[13px] text-warm-light">注册邮箱</label>
      <input
        type="email"
        inputMode="email"
        autoComplete="email"
        maxLength={254}
        placeholder="you@example.com"
        className="mb-4 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
        value={email}
        onChange={(e) => setEmail(e.target.value.trim())}
      />

      <label className="mb-1 block text-[13px] text-warm-light">邮箱验证码</label>
      <div className="mb-4 flex gap-3">
        <input
          type="tel"
          inputMode="numeric"
          maxLength={6}
          placeholder="6 位数字"
          className="flex-1 rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        />
        <button
          type="button"
          disabled={countdown > 0}
          className="w-28 rounded-btn border border-primary text-[13px] text-primary disabled:border-soft disabled:text-warm-light"
          onClick={openSendCaptcha}
        >
          {countdown > 0 ? `${countdown}s` : '发送验证码'}
        </button>
      </div>
      {codeSent && (
        <p className="-mt-2 mb-4 text-[12px] text-warm-light">
          如果这个邮箱注册过，验证码已经发过去了，记得看看垃圾邮件～
        </p>
      )}

      <label className="mb-1 block text-[13px] text-warm-light">新密码</label>
      <input
        type="password"
        autoComplete="new-password"
        maxLength={64}
        placeholder="至少 8 位，含字母和数字"
        className="mb-4 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <label className="mb-1 block text-[13px] text-warm-light">确认新密码</label>
      <input
        type="password"
        autoComplete="new-password"
        maxLength={64}
        placeholder="再输一次"
        className="mb-1 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
        value={password2}
        onChange={(e) => setPassword2(e.target.value)}
      />
      {password2 && password !== password2 && (
        <p className="mb-1 text-[12px] text-[#B66A5A]">两次输入不一致</p>
      )}

      <button
        type="button"
        disabled={submitting}
        className="mt-4 w-full rounded-btn bg-primary py-3.5 text-[16px] font-medium text-white active:bg-primary-dark disabled:opacity-60"
        onClick={() => void submit()}
      >
        {submitting ? '重置中…' : '重置密码'}
      </button>

      <p className="mt-4 text-center text-[13px] text-warm-light">
        想起来了？
        <Link to="/login" className="ml-1 font-medium text-primary">
          回登录
        </Link>
      </p>

      <CaptchaDialog
        open={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        subtitle="通过人机验证后，重置验证码就发到你的邮箱"
        onVerified={(captchaId, captchaCode) => {
          setCaptchaOpen(false);
          void sendEmailCode(captchaId, captchaCode);
        }}
      />
    </AuthCard>
  );
}
