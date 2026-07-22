/**
 * 注册页（v3 §四 验证码新规则）：
 * - 表单内不常驻图形码：点「发送验证码」弹 CaptchaDialog，通过后才调发信接口（scene=register）
 * - 注册提交复用发码时的图形码参数（后端链上只校验一次；2101 时重开弹窗重新发码）
 * - 底部「已阅读并同意《用户协议》和《隐私政策》」勾选：默认不勾，不勾禁提交
 * - 注册开关被拒 code 2107 → 提示"暂停注册"；2108 = 手机号占用（v3 新语义）
 */
import { useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, API_CODES, tokenStore } from '../api';
import { AuthCard } from '../components/AuthCard';
import { CaptchaDialog } from '../components/CaptchaDialog';
import type { CaptchaValue } from '../components/CaptchaInput';
import { toast, useAuthStore } from '../stores/auth';
import type { LoginData } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1\d{10}$/;
const USERNAME_RE = /^[一-龥A-Za-z0-9_]{1,20}$/;

type CheckState = 'idle' | 'checking' | 'ok' | 'taken' | 'invalid';

export default function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  /** 发码成功后保留的图形码参数：注册提交时复用 */
  const [codeCaptcha, setCodeCaptcha] = useState<CaptchaValue | null>(null);
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

  const onPhoneBlur = (): void => {
    if (!phone) {
      setPhoneState('idle');
      return;
    }
    if (!PHONE_RE.test(phone)) {
      setPhoneState('invalid');
      return;
    }
    // 手机号查重放在 register 提交时统一判定（后端无独立 check-phone 路由）
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

  /** 点「发送验证码」：本地校验 → 开图形码弹窗 */
  const openSendCaptcha = (): void => {
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    if (emailState === 'taken') {
      toast('这个邮箱已经注册过了，直接登录吧', 'error');
      return;
    }
    setCaptchaOpen(true);
  };

  /** 图形码通过后发码（scene=register） */
  const sendEmailCode = async (captchaId: string, captchaCode: string): Promise<void> => {
    try {
      await api.post('/auth/email-code', {
        email,
        scene: 'register',
        captcha_id: captchaId,
        captcha_code: captchaCode,
      });
      toast('验证码已发送，5 分钟内有效', 'success');
      startCountdown();
      setCodeCaptcha({ captchaId, captchaCode });
    } catch (err) {
      setCodeCaptcha(null);
      if (err instanceof ApiError && err.code === API_CODES.CAPTCHA_WRONG) {
        setCaptchaOpen(true);
        toast('图形验证码不对，再来一次', 'error');
      } else {
        toast(err instanceof ApiError ? err.message : '发送失败，请稍后再试', 'error');
      }
    }
  };

  const submit = async (): Promise<void> => {
    if (!agreed) {
      toast('请先勾选同意《用户协议》和《隐私政策》', 'error');
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
    if (!codeCaptcha) {
      toast('请先点「发送验证码」获取邮箱验证码', 'error');
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
        captcha_id: codeCaptcha.captchaId,
        captcha_code: codeCaptcha.captchaCode,
      });
      tokenStore.set(data.token);
      useAuthStore.setState({ user: data.user, balance: data.points.balance, ready: true });
      toast('注册成功，已送你新人礼包～', 'success');
      navigate('/home', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        // v3 错误码：2107=暂停注册；2108=手机号占用；2105 邮箱占用；2106 用户名占用
        if (err.code === API_CODES.REGISTRATION_PAUSED) {
          toast('暂停注册', 'error');
        } else if (err.code === API_CODES.CAPTCHA_WRONG) {
          // 图形码参数失效：重开弹窗重新发码
          setCodeCaptcha(null);
          setCaptchaOpen(true);
          toast('图形验证码过期了，请重新发送验证码', 'error');
        } else {
          if (err.code === API_CODES.EMAIL_TAKEN) setEmailState('taken');
          if (err.code === API_CODES.USERNAME_TAKEN) setUsernameState('taken');
          if (err.code === API_CODES.PHONE_TAKEN) setPhoneState('taken');
          toast(err.message, 'error');
        }
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
    <AuthCard title="注册整明白" subtitle="一个邮箱就能开始，送新人 20 点礼包">
      <div className="space-y-4">
        {/* 邮箱 */}
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

        {/* 邮箱验证码（点发送弹 CaptchaDialog，表单内不常驻图形码） */}
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
              onClick={openSendCaptcha}
            >
              {countdown > 0 ? `${countdown}s` : '发送验证码'}
            </button>
          </div>
        </div>

        {/* 密码 */}
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

        {/* 确认密码 */}
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

        {/* 用户名 */}
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

        {/* 手机号（选填） */}
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
            onBlur={onPhoneBlur}
          />
        </div>

        {/* 协议勾选（默认不勾，不勾禁提交） */}
        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          className="flex w-full items-start gap-2 text-left"
          onClick={() => setAgreed((v) => !v)}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[12px] ${
              agreed ? 'border-primary bg-primary text-white' : 'border-soft bg-cream'
            }`}
          >
            {agreed ? '✓' : ''}
          </span>
          <span className="text-[13px] leading-5 text-warm-light">
            我已阅读并同意
            <span className="mx-0.5 text-primary">《用户协议》</span>和
            <Link to="/privacy" className="mx-0.5 text-primary" onClick={(e) => e.stopPropagation()}>
              《隐私政策》
            </Link>
          </span>
        </button>

        <button
          type="button"
          disabled={submitting || !agreed}
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

      <CaptchaDialog
        open={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        subtitle="通过人机验证后，注册验证码就发到你的邮箱"
        onVerified={(captchaId, captchaCode) => {
          setCaptchaOpen(false);
          void sendEmailCode(captchaId, captchaCode);
        }}
      />
    </AuthCard>
  );
}
