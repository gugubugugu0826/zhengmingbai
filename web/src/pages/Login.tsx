/**
 * 登录页（v2.2 A-3）：三 tab —— 邮箱验证码 / 邮箱密码 / 手机密码。
 * 三个 tab 都内嵌图形验证码；任何登录失败统一提示，不区分账号/密码/验证码错。
 * need_reset=true 跳 /force-reset-password；email_code 未注册邮箱提示去注册。
 */
import { useRef, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, tokenStore } from '../api';
import { CaptchaInput, type CaptchaInputHandle, type CaptchaValue } from '../components/CaptchaInput';
import { toast, useAuthStore } from '../stores/auth';
import type { LoginData } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1\d{10}$/;

type LoginTab = 'email_code' | 'email_password' | 'phone_password';

const TAB_LABELS: Array<{ key: LoginTab; label: string }> = [
  { key: 'email_code', label: '邮箱验证码' },
  { key: 'email_password', label: '邮箱密码' },
  { key: 'phone_password', label: '手机密码' },
];

const EMPTY_CAPTCHA: CaptchaValue = { captchaId: '', captchaCode: '' };

export default function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [tab, setTab] = useState<LoginTab>('email_code');
  const [submitting, setSubmitting] = useState(false);
  const captchaRef = useRef<CaptchaInputHandle>(null);

  // 三 tab 各自的字段（独立维护，切 tab 不清空）
  const [captcha, setCaptcha] = useState<CaptchaValue>(EMPTY_CAPTCHA);
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailForPwd, setEmailForPwd] = useState('');
  const [passwordForEmail, setPasswordForEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [passwordForPhone, setPasswordForPhone] = useState('');

  // 邮箱验证码发送倒计时
  const [countdown, setCountdown] = useState(0);

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

  /** 登录成功后路由：need_reset 强制改密，否则跳首页 */
  const afterLogin = (data: LoginData): void => {
    tokenStore.set(data.token);
    useAuthStore.setState({ user: data.user, balance: data.points.balance, ready: true });
    if (data.need_reset || data.user.force_password_reset === 1) {
      toast('为了账号安全，请先设置新密码', 'info');
      navigate('/force-reset-password', { replace: true });
      return;
    }
    toast('欢迎回来～', 'success');
    navigate('/home', { replace: true });
  };

  /** 发邮箱验证码（scene=login） */
  const sendEmailCode = async (): Promise<void> => {
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    if (!captcha.captchaId || !captcha.captchaCode) {
      toast('请先完成图形验证', 'error');
      return;
    }
    try {
      await api.post('/auth/email-code', {
        email,
        scene: 'login',
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      });
      toast('验证码已发送，5 分钟内有效', 'success');
      startCountdown();
      // 发码消耗了图形码，立即换一张
      captchaRef.current?.refresh();
    } catch (err) {
      captchaRef.current?.refresh();
      toast(err instanceof ApiError ? err.message : '发送失败，请稍后再试', 'error');
    }
  };

  const submit = async (): Promise<void> => {
    if (!captcha.captchaId || !captcha.captchaCode) {
      toast('请先完成图形验证', 'error');
      return;
    }
    let body: Record<string, unknown>;
    if (tab === 'email_code') {
      if (!EMAIL_RE.test(email)) {
        toast('请输入正确的邮箱地址', 'error');
        return;
      }
      if (!/^\d{6}$/.test(emailCode)) {
        toast('邮箱验证码是 6 位数字', 'error');
        return;
      }
      body = {
        login_type: 'email_code',
        email,
        email_code: emailCode,
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      };
    } else if (tab === 'email_password') {
      if (!EMAIL_RE.test(emailForPwd)) {
        toast('请输入正确的邮箱地址', 'error');
        return;
      }
      if (!passwordForEmail) {
        toast('请输入密码', 'error');
        return;
      }
      body = {
        login_type: 'email_password',
        email: emailForPwd,
        password: passwordForEmail,
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      };
    } else {
      if (!PHONE_RE.test(phone)) {
        toast('请输入 11 位手机号', 'error');
        return;
      }
      if (!passwordForPhone) {
        toast('请输入密码', 'error');
        return;
      }
      body = {
        login_type: 'phone_password',
        phone,
        password: passwordForPhone,
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      };
    }

    setSubmitting(true);
    try {
      const data = await api.post<LoginData>('/auth/login', body);
      afterLogin(data);
    } catch (err) {
      // 图形码一次性作废：失败后必须让用户重新过码
      captchaRef.current?.refresh();
      if (err instanceof ApiError) {
        // A-12 防枚举：2001 统一文案；2102 邮箱码错也给统一文案
        if (err.code === 2001 || err.code === 2102) {
          // email_code 模式下后端会区分"未注册邮箱"——通过 message 中包含"注册"识别
          if (tab === 'email_code' && /注册/.test(err.message)) {
            toast('这个邮箱还没注册，先去注册吧', 'error');
          } else {
            toast('账号或凭据不正确，请重试', 'error');
          }
        } else {
          toast(err.message, 'error');
        }
      } else {
        toast('登录失败，请稍后再试', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchTab = (t: LoginTab): void => {
    if (t === tab) return;
    setTab(t);
    // 切 tab 换一张新图形码，避免跨 tab 复用旧 captcha_id
    captchaRef.current?.refresh();
  };

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center px-5 py-12">
      <div className="mb-8 text-center">
        <div className="mb-3 text-5xl">🧺</div>
        <h1 className="text-[24px] font-semibold text-warm">整明白</h1>
        <p className="mt-2 text-[13px] text-warm-light">AI 整理收纳助手 · 把家一点一点整明白</p>
      </div>

      <div className="rounded-card bg-card p-5 shadow-card">
        {/* Tab 切换 */}
        <div className="mb-5 flex rounded-btn bg-soft/60 p-1">
          {TAB_LABELS.map((t) => (
            <button
              key={t.key}
              type="button"
              className={`flex-1 rounded-btn py-2 text-[13px] transition-colors ${
                tab === t.key ? 'bg-card font-medium text-primary shadow-sm' : 'text-warm-light'
              }`}
              onClick={() => switchTab(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* 图形验证码（三个 tab 共用） */}
        <div className="mb-4">
          <CaptchaInput ref={captchaRef} value={captcha} onChange={setCaptcha} />
        </div>

        {tab === 'email_code' && (
          <>
            <label className="mb-1 block text-[13px] text-warm-light">邮箱</label>
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
            <div className="mb-5 flex gap-3">
              <input
                type="tel"
                inputMode="numeric"
                maxLength={6}
                placeholder="6 位数字"
                className="flex-1 rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ''))}
              />
              <button
                type="button"
                disabled={countdown > 0}
                className="w-28 rounded-btn border border-primary text-[13px] text-primary disabled:border-soft disabled:text-warm-light"
                onClick={() => void sendEmailCode()}
              >
                {countdown > 0 ? `${countdown}s` : '发送验证码'}
              </button>
            </div>
          </>
        )}

        {tab === 'email_password' && (
          <>
            <label className="mb-1 block text-[13px] text-warm-light">邮箱</label>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
              className="mb-4 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
              value={emailForPwd}
              onChange={(e) => setEmailForPwd(e.target.value.trim())}
            />
            <label className="mb-1 block text-[13px] text-warm-light">密码</label>
            <input
              type="password"
              autoComplete="current-password"
              maxLength={64}
              placeholder="请输入密码"
              className="mb-5 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
              value={passwordForEmail}
              onChange={(e) => setPasswordForEmail(e.target.value)}
            />
          </>
        )}

        {tab === 'phone_password' && (
          <>
            <label className="mb-1 block text-[13px] text-warm-light">手机号</label>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={11}
              placeholder="11 位手机号"
              className="mb-4 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            />
            <label className="mb-1 block text-[13px] text-warm-light">密码</label>
            <input
              type="password"
              autoComplete="current-password"
              maxLength={64}
              placeholder="请输入密码"
              className="mb-5 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
              value={passwordForPhone}
              onChange={(e) => setPasswordForPhone(e.target.value)}
            />
          </>
        )}

        <button
          type="button"
          disabled={submitting}
          className="w-full rounded-btn bg-primary py-3.5 text-[16px] font-medium text-white active:bg-primary-dark disabled:opacity-60"
          onClick={() => void submit()}
        >
          {submitting ? '登录中…' : '登录'}
        </button>

        <p className="mt-4 text-center text-[13px] text-warm-light">
          还没有账号？
          <Link to="/register" className="ml-1 font-medium text-primary">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}
