/**
 * 登录页（v3 §四 验证码新规则）：
 * - 收敛为两个 Tab：「邮箱验证码」「密码登录」（原邮箱密码+手机密码合并，
 *   账号框可输邮箱或手机号，按格式自动选择 login_type，后端两种凭证都认）
 * - 邮箱验证码 Tab：点「发送验证码」弹 CaptchaDialog 图形码弹窗，表单内不常驻图形码；
 *   登录提交复用同一张已消耗的图形码参数（后端校验链只认一次性，提交失败 2101 重开弹窗）
 * - 密码登录 Tab：三行式——账号 / 密码 / 常驻图形验证码（CaptchaInput）
 * - 加「忘记密码」入口 → /forgot-password
 * - 任何登录失败统一提示，不区分账号/密码/验证码错（A-12 防枚举）
 */
import { useRef, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, tokenStore } from '../api';
import { AuthCard } from '../components/AuthCard';
import { CaptchaDialog } from '../components/CaptchaDialog';
import { CaptchaInput, type CaptchaInputHandle, type CaptchaValue } from '../components/CaptchaInput';
import { toast, useAuthStore } from '../stores/auth';
import type { LoginData } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1\d{10}$/;

type LoginTab = 'email_code' | 'password';

const TAB_LABELS: Array<{ key: LoginTab; label: string }> = [
  { key: 'email_code', label: '邮箱验证码' },
  { key: 'password', label: '密码登录' },
];

export default function LoginPage(): JSX.Element {
  const navigate = useNavigate();
  const [tab, setTab] = useState<LoginTab>('email_code');
  const [submitting, setSubmitting] = useState(false);

  // 邮箱验证码 Tab 字段
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  /** 发码成功后保留的图形码参数：提交登录时复用（后端图形码一用即废，链上仅校验一次） */
  const [codeCaptcha, setCodeCaptcha] = useState<CaptchaValue | null>(null);

  // 密码登录 Tab 字段
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const captchaRef = useRef<CaptchaInputHandle>(null);
  const [pwdCaptcha, setPwdCaptcha] = useState<CaptchaValue>({ captchaId: '', captchaCode: '' });

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

  /** 发邮箱验证码（scene=login）：CaptchaDialog 校验通过后回调 */
  const sendEmailCode = async (captchaId: string, captchaCode: string): Promise<void> => {
    try {
      await api.post('/auth/email-code', {
        email,
        scene: 'login',
        captcha_id: captchaId,
        captcha_code: captchaCode,
      });
      toast('验证码已发送，5 分钟内有效', 'success');
      startCountdown();
      setCodeCaptcha({ captchaId, captchaCode });
    } catch (err) {
      setCodeCaptcha(null);
      if (err instanceof ApiError && err.code === 2101) {
        // 图形码一用即废：2101 时重开弹窗（自动刷新新码）
        setCaptchaOpen(true);
        toast('图形验证码不对，再来一次', 'error');
      } else {
        toast(err instanceof ApiError ? err.message : '发送失败，请稍后再试', 'error');
      }
    }
  };

  /** 点「发送验证码」：本地校验邮箱 → 开弹窗 */
  const openSendCaptcha = (): void => {
    if (!EMAIL_RE.test(email)) {
      toast('请输入正确的邮箱地址', 'error');
      return;
    }
    setCaptchaOpen(true);
  };

  const submit = async (): Promise<void> => {
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
      if (!codeCaptcha) {
        toast('请先点「发送验证码」获取邮箱验证码', 'error');
        return;
      }
      body = {
        login_type: 'email_code',
        email,
        email_code: emailCode,
        captcha_id: codeCaptcha.captchaId,
        captcha_code: codeCaptcha.captchaCode,
      };
    } else {
      if (!account) {
        toast('请输入邮箱或手机号', 'error');
        return;
      }
      if (!password) {
        toast('请输入密码', 'error');
        return;
      }
      if (!pwdCaptcha.captchaId || !pwdCaptcha.captchaCode) {
        toast('请先输入图形验证码', 'error');
        return;
      }
      // 账号框可输邮箱或手机号：按格式自动选择 login_type
      if (EMAIL_RE.test(account)) {
        body = {
          login_type: 'email_password',
          email: account,
          password,
          captcha_id: pwdCaptcha.captchaId,
          captcha_code: pwdCaptcha.captchaCode,
        };
      } else if (PHONE_RE.test(account)) {
        body = {
          login_type: 'phone_password',
          phone: account,
          password,
          captcha_id: pwdCaptcha.captchaId,
          captcha_code: pwdCaptcha.captchaCode,
        };
      } else {
        toast('账号格式不对：请输入邮箱或 11 位手机号', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const data = await api.post<LoginData>('/auth/login', body);
      afterLogin(data);
    } catch (err) {
      // 图形码一次性作废：密码登录失败后必须让用户重新过码
      if (tab === 'password') {
        captchaRef.current?.refresh();
      } else if (err instanceof ApiError && err.code === 2101) {
        // 邮箱码登录的图形码参数已失效：重开弹窗让用户重新发码
        setCodeCaptcha(null);
        setCaptchaOpen(true);
        toast('图形验证码过期了，请重新发送验证码', 'error');
        setSubmitting(false);
        return;
      }
      if (err instanceof ApiError) {
        // A-12 防枚举：2001 统一文案；2102 邮箱码错也给统一文案
        if (err.code === 2001 || err.code === 2102) {
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

  return (
    <AuthCard title="登录" subtitle="邮箱验证码或密码，任选一种回家">
      {/* Tab 切换 */}
      <div className="mb-5 flex rounded-btn bg-soft/60 p-1">
        {TAB_LABELS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`flex-1 rounded-btn py-2 text-[13px] transition-colors ${
              tab === t.key ? 'bg-card font-medium text-primary shadow-sm' : 'text-warm-light'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
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
              onClick={openSendCaptcha}
            >
              {countdown > 0 ? `${countdown}s` : '发送验证码'}
            </button>
          </div>
        </>
      )}

      {tab === 'password' && (
        <>
          <label className="mb-1 block text-[13px] text-warm-light">邮箱 / 手机号</label>
          <input
            type="text"
            inputMode="email"
            autoComplete="username"
            maxLength={254}
            placeholder="邮箱或 11 位手机号"
            className="mb-4 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={account}
            onChange={(e) => setAccount(e.target.value.trim())}
          />
          <label className="mb-1 block text-[13px] text-warm-light">密码</label>
          <input
            type="password"
            autoComplete="current-password"
            maxLength={64}
            placeholder="请输入密码"
            className="mb-4 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <label className="mb-1 block text-[13px] text-warm-light">图形验证码</label>
          <div className="mb-5">
            <CaptchaInput ref={captchaRef} value={pwdCaptcha} onChange={setPwdCaptcha} />
          </div>
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

      <div className="mt-4 flex items-center justify-between text-[13px]">
        <span className="text-warm-light">
          还没有账号？
          <Link to="/register" className="ml-1 font-medium text-primary">
            去注册
          </Link>
        </span>
        <Link to="/forgot-password" className="text-warm-light underline-offset-2 hover:text-primary">
          忘记密码？
        </Link>
      </div>

      <CaptchaDialog
        open={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        subtitle="通过人机验证后，验证码就发到你的邮箱"
        onVerified={(captchaId, captchaCode) => {
          setCaptchaOpen(false);
          void sendEmailCode(captchaId, captchaCode);
        }}
      />
    </AuthCard>
  );
}
