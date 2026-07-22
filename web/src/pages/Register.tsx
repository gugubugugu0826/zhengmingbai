/**
 * 注册页（v2.2 A-2）：
 * 表单顺序：图形验证码 → 邮箱 → 邮箱验证码 → 密码 → 确认密码 → 用户名（即时查重）→ 手机号（选填，即时查重）。
 * 注册成功即登录（后端返回 token + user），need_reset=false，直接跳首页。
 */
import { useRef, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, tokenStore } from '../api';
import { CaptchaInput, type CaptchaInputHandle, type CaptchaValue } from '../components/CaptchaInput';
import { toast, useAuthStore } from '../stores/auth';
import type { LoginData } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1\d{10}$/;
const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]{1,20}$/;

type CheckState = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';

export default function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const captchaRef = useRef<CaptchaInputHandle>(null);
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captchaId: '', captchaCode: '' });
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [usernameState, setUsernameState] = useState<CheckState>('idle');
  const [phoneState, setPhoneState] = useState<CheckState>('idle');
  const [emailState, setEmailState] = useState<CheckState>('idle');

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

  /** 即时查重（失焦触发）：check-username / check-email */
  const checkField = async (kind: 'username' | 'email', value: string): Promise<boolean> => {
    try {
      const resp = await api.get<{ available: boolean }>(`/auth/check-${kind}`, { value });
      return resp.available;
    } catch {
      return true; // 网络失败不阻塞，由后端 register 兜底
    }
  };

  const onUsernameBlur = async (): Promise<void> => {
    if (!username) {
      setUsernameState('idle');
      return;
    }
    if (!USERNAME_RE.test(username)) {
      setUsernameState('invalid');
      return;
    }
    setUsernameState('checking');
    const ok = await checkField('username', username);
    setUsernameState(ok ? 'ok' : 'taken');
  };

  const onPhoneBlur = async (): Promise<void> => {
    if (!phone) {
      setPhoneState('idle');
      return;
    }
    if (!PHONE_RE.test(phone)) {
      setPhoneState('invalid');
      return;
    }
    // 后端只提供 check-username/check-email，手机号查重放在 register 提交时统一判定
    setPhoneState('ok');
  };

  const onEmailBlur = async (): Promise<void> => {
    if (!email) {
      setEmailState('idle');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      setEmailState('invalid');
      return;
    }
    setEmailState('checking');
    const ok = await checkField('email', email);
    setEmailState(ok ? 'ok' : 'taken');
  };

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
        scene: 'register',
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      });
      toast('验证码已发送，5 分钟内有效', 'success');
      startCountdown();
      captchaRef.current?.refresh();
    } catch (err) {
      captchaRef.current?.refresh();
      toast(err instanceof ApiError ? err.message : '发送失败，请稍后再试', 'error');
    }
  };

  const submit = async (): Promise<void> => {
    // 前置校验
    if (!captcha.captchaId || !captcha.captchaCode) {
      toast('请先完成图形验证', 'error');
      return;
    }
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    if (emailState === 'taken') {
      toast('这个邮箱已经注册过了，直接登录吧', 'error');
      return;
    }
    if (!/^\d{6}$/.test(emailCode)) {
      toast('邮箱验证码是 6 位数字', 'error');
      return;
    }
    if (password.length < 8) {
      toast('密码至少 8 位', 'error');
      return;
    }
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      toast('密码需要同时包含字母和数字', 'error');
      return;
    }
    if (password !== password2) {
      toast('两次输入的密码不一致', 'error');
      return;
    }
    if (!USERNAME_RE.test(username)) {
      toast('用户名 1-20 个字符，支持中文/英文/数字/下划线', 'error');
      return;
    }
    if (usernameState === 'taken') {
      toast('这个用户名被占了，换一个吧', 'error');
      return;
    }
    if (phone && !PHONE_RE.test(phone)) {
      toast('手机号格式不对哦', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const data = await api.post<LoginData>('/auth/register', {
        email,
        email_code: emailCode,
        password,
        username,
        phone: phone || undefined,
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      });
      tokenStore.set(data.token);
      useAuthStore.setState({ user: data.user, balance: data.points.balance, ready: true });
      toast('注册成功，已送你新人礼包～', 'success');
      navigate('/home', { replace: true });
    } catch (err) {
      captchaRef.current?.refresh();
      if (err instanceof ApiError) {
        // 占用类错误（2105/2106/2107）明示
        if (err.code === 2105) setEmailState('taken');
        if (err.code === 2106) setUsernameState('taken');
        if (err.code === 2107) setPhoneState('taken');
        toast(err.message, 'error');
      } else {
        toast('注册失败，请稍后再试', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const checkHint = (state: CheckState, kind: 'username' | 'email' | 'phone'): JSX.Element | null => {
    if (state === 'idle') return null;
    if (state === 'checking') return <span className="text-[12px] text-warm-light">检查中…</span>;
    if (state === 'ok') return <span className="text-[12px] text-sage-dark">✓ 可用</span>;
    if (state === 'invalid')
      return (
        <span className="text-[12px] text-[#B66A5A]">
          {kind === 'username' ? '格式不对（1-20 字）' : '格式不对'}
        </span>
      );
    return (
      <span className="text-[12px] text-[#B66A5A]">
        {kind === 'username' ? '已被占用' : kind === 'email' ? '已注册过' : '已被绑定'}
      </span>
    );
  };

  return (
    <div className="flex min-h-full flex-1 flex-col px-5 py-8">
      <div className="mb-6 text-center">
        <div className="mb-2 text-4xl">🧺</div>
        <h1 className="text-[22px] font-semibold text-warm">注册整明白</h1>
        <p className="mt-1 text-[13px] text-warm-light">一个邮箱就能开始，送新人 20 点礼包</p>
      </div>

      <div className="space-y-4 rounded-card bg-card p-5 shadow-card">
        {/* 1. 图形验证码 */}
        <div>
          <label className="mb-1 block text-[13px] text-warm-light">图形验证码</label>
          <CaptchaInput ref={captchaRef} value={captcha} onChange={setCaptcha} />
        </div>

        {/* 2. 邮箱 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[13px] text-warm-light">邮箱</label>
            {checkHint(emailState, 'email')}
          </div>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            placeholder="you@example.com"
            className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value.trim());
              setEmailState('idle');
            }}
            onBlur={() => void onEmailBlur()}
          />
        </div>

        {/* 3. 邮箱验证码 */}
        <div>
          <label className="mb-1 block text-[13px] text-warm-light">邮箱验证码</label>
          <div className="flex gap-3">
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
        </div>

        {/* 4. 密码 */}
        <div>
          <label className="mb-1 block text-[13px] text-warm-light">密码</label>
          <input
            type="password"
            autoComplete="new-password"
            maxLength={64}
            placeholder="至少 8 位，含字母和数字"
            className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {/* 5. 确认密码 */}
        <div>
          <label className="mb-1 block text-[13px] text-warm-light">确认密码</label>
          <input
            type="password"
            autoComplete="new-password"
            maxLength={64}
            placeholder="再输一次"
            className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
          />
          {password2 && password !== password2 && (
            <p className="mt-1 text-[12px] text-[#B66A5A]">两次输入不一致</p>
          )}
        </div>

        {/* 6. 用户名 */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[13px] text-warm-light">用户名</label>
            {checkHint(usernameState, 'username')}
          </div>
          <input
            type="text"
            autoComplete="username"
            maxLength={20}
            placeholder="1-20 个字符"
            className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              setUsernameState('idle');
            }}
            onBlur={() => void onUsernameBlur()}
          />
        </div>

        {/* 7. 手机号（选填） */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[13px] text-warm-light">手机号（选填）</label>
            {checkHint(phoneState, 'phone')}
          </div>
          <input
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            maxLength={11}
            placeholder="方便找回账号"
            className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={phone}
            onChange={(e) => {
              setPhone(e.target.value.replace(/\D/g, ''));
              setPhoneState('idle');
            }}
            onBlur={() => void onPhoneBlur()}
          />
        </div>

        <button
          type="button"
          disabled={submitting}
          className="w-full rounded-btn bg-primary py-3.5 text-[16px] font-medium text-white active:bg-primary-dark disabled:opacity-60"
          onClick={() => void submit()}
        >
          {submitting ? '注册中…' : '注册'}
        </button>

        <p className="text-center text-[13px] text-warm-light">
          已有账号？
          <Link to="/login" className="ml-1 font-medium text-primary">
            去登录
          </Link>
        </p>
      </div>
    </div>
  );
}
