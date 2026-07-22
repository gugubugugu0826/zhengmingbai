/**
 * 账号页（v2.2 A-10）：
 * 七项内容 —— 我的点数 / 改用户名 / 绑改手机号 / 改邮箱 / 两个偏好开关 / 退出登录 / 隐私政策。
 * 数据拉取：GET /account/profile；修改类操作走 /account/* 接口。
 */
import { useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { CaptchaInput, type CaptchaInputHandle, type CaptchaValue } from '../components/CaptchaInput';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { TabBar } from '../components/TabBar';
import { toast, useAuthStore } from '../stores/auth';
import type { PublicUser } from '../types';

const PHONE_RE = /^1\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[\u4e00-\u9fa5A-Za-z0-9_]{1,20}$/;

interface ProfileResp {
  user: PublicUser;
  points: { balance: number; total_earned: number; total_spent: number };
  need_reset: boolean;
}

type DialogKind = 'username' | 'phone' | 'email' | 'logout' | null;

export default function AccountPage(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const balance = useAuthStore((s) => s.balance);
  const setUser = useAuthStore((s) => s.setUser);
  const setBalance = useAuthStore((s) => s.setBalance);
  const logout = useAuthStore((s) => s.logout);
  const [dialog, setDialog] = useState<DialogKind>(null);

  useEffect(() => {
    api
      .get<ProfileResp>('/account/profile')
      .then((d) => {
        setUser(d.user);
        setBalance(d.points.balance);
      })
      .catch(() => undefined);
  }, [setUser, setBalance]);

  if (!user) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center">
        <div className="text-[13px] text-warm-light">加载中…</div>
      </div>
    );
  }

  /** 偏好开关（乐观更新 + 失败回滚） */
  const togglePref = (key: 'reminder_enabled' | 'delete_after_analysis', value: 0 | 1): void => {
    const prev = user;
    setUser({ ...user, [key]: value });
    api
      .put<PublicUser>('/account/preferences', { [key]: value })
      .then((fresh) => setUser(fresh))
      .catch((err: unknown) => {
        setUser(prev);
        toast(err instanceof ApiError ? err.message : '设置保存失败', 'error');
      });
  };

  const doLogout = (): void => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-full flex-1 flex-col pb-20">
      <PageHeader title="账号" onBack={() => navigate('/home')} />

      {/* 用户卡片 */}
      <div className="mt-3 px-5">
        <div className="rounded-card bg-card p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-soft text-2xl">
              👤
            </div>
            <div className="flex-1">
              <div className="text-[16px] font-semibold text-warm">
                {user.username || user.nickname || '整明白用户'}
              </div>
              <div className="mt-0.5 text-[12px] text-warm-light">
                {user.email ?? '未绑定邮箱'}
              </div>
              {user.phone && <div className="text-[12px] text-warm-light">{user.phone}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* 七项功能列表 */}
      <div className="mt-5 flex-1 space-y-2 px-5">
        <Row label="我的点数" value={`${balance} 点`} onClick={() => navigate('/points')} />
        <Row
          label="更改用户名"
          value={user.username ?? '未设置'}
          onClick={() => setDialog('username')}
        />
        <Row
          label={user.phone ? '修改手机号' : '绑定手机号'}
          value={user.phone ?? ''}
          onClick={() => setDialog('phone')}
        />
        <Row
          label="更改绑定邮箱"
          value={user.email ?? ''}
          onClick={() => setDialog('email')}
        />

        {/* 偏好开关 */}
        <div className="rounded-card bg-card px-4 py-3 shadow-card">
          <SwitchRow
            label="30 天复查提醒"
            desc="整理完 30 天后提醒你回去看看"
            checked={user.reminder_enabled === 1}
            onChange={(on) => togglePref('reminder_enabled', on ? 1 : 0)}
          />
          <div className="my-3 border-t border-soft/60" />
          <SwitchRow
            label="默认保留整理记录"
            desc="关闭后，新一次整理默认分析完即删照片"
            checked={user.delete_after_analysis === 0}
            onChange={(on) => togglePref('delete_after_analysis', on ? 0 : 1)}
          />
        </div>

        <Row label="隐私政策" value="" onClick={() => navigate('/privacy')} />

        <button
          type="button"
          className="w-full rounded-card bg-card px-4 py-3.5 text-left text-[15px] font-medium text-[#B66A5A] shadow-card"
          onClick={() => setDialog('logout')}
        >
          退出登录
        </button>
      </div>

      <TabBar />

      <UsernameDialog
        open={dialog === 'username'}
        current={user.username ?? ''}
        onClose={() => setDialog(null)}
        onDone={(fresh) => {
          setUser(fresh);
          setDialog(null);
        }}
      />
      <PhoneDialog
        open={dialog === 'phone'}
        onClose={() => setDialog(null)}
        onDone={(fresh) => {
          setUser(fresh);
          setDialog(null);
        }}
      />
      <EmailDialog
        open={dialog === 'email'}
        onClose={() => setDialog(null)}
        onDone={(fresh) => {
          setUser(fresh);
          setDialog(null);
        }}
      />

      <Modal open={dialog === 'logout'} onClose={() => setDialog(null)}>
        <h3 className="text-[17px] font-semibold text-warm">确认退出登录？</h3>
        <p className="mt-2 text-[13px] text-warm-light">退出后需要重新登录才能继续整理</p>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-btn border border-soft py-3 text-[14px] text-warm-light"
            onClick={() => setDialog(null)}
          >
            再想想
          </button>
          <button
            type="button"
            className="flex-1 rounded-btn bg-[#B66A5A] py-3 text-[14px] font-medium text-white"
            onClick={doLogout}
          >
            退出
          </button>
        </div>
      </Modal>
    </div>
  );
}

/** 通用列表行 */
function Row({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-card bg-card px-4 py-3.5 text-left shadow-card active:bg-soft/60"
      onClick={onClick}
    >
      <span className="text-[15px] text-warm">{label}</span>
      <span className="flex items-center gap-2 text-[13px] text-warm-light">
        {value && <span className="max-w-[180px] truncate">{value}</span>}
        <span>›</span>
      </span>
    </button>
  );
}

/** 开关行 */
function SwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[14px] font-medium text-warm">{label}</div>
        <div className="mt-0.5 text-[12px] leading-5 text-warm-light">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-soft'}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// ============== 三个修改弹窗 ==============

/** 改用户名 */
function UsernameDialog({
  open,
  current,
  onClose,
  onDone,
}: {
  open: boolean;
  current: string;
  onClose: () => void;
  onDone: (u: PublicUser) => void;
}): JSX.Element | null {
  const [value, setValue] = useState(current);
  const [state, setState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(current);
      setState('idle');
    }
  }, [open, current]);

  const onBlur = async (): Promise<void> => {
    if (!value) {
      setState('idle');
      return;
    }
    if (!USERNAME_RE.test(value)) {
      setState('invalid');
      return;
    }
    setState('checking');
    try {
      const r = await api.get<{ available: boolean }>('/auth/check-username', { value });
      setState(r.available ? 'ok' : 'taken');
    } catch {
      setState('idle');
    }
  };

  const submit = async (): Promise<void> => {
    if (!USERNAME_RE.test(value)) {
      toast('用户名 1-20 字，支持中文/英文/数字/下划线', 'error');
      return;
    }
    if (state === 'taken') {
      toast('这个用户名被占了', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const fresh = await api.put<PublicUser>('/account/username', { username: value });
      toast('用户名已更新', 'success');
      onDone(fresh);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '更新失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-[17px] font-semibold text-warm">更改用户名</h3>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[13px] text-warm-light">新用户名</label>
          {state === 'checking' && <span className="text-[12px] text-warm-light">检查中…</span>}
          {state === 'ok' && <span className="text-[12px] text-sage-dark">✓ 可用</span>}
          {state === 'taken' && <span className="text-[12px] text-[#B66A5A]">已被占用</span>}
          {state === 'invalid' && <span className="text-[12px] text-[#B66A5A]">格式不对</span>}
        </div>
        <input
          type="text"
          maxLength={20}
          placeholder="1-20 个字符"
          className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setState('idle');
          }}
          onBlur={() => void onBlur()}
        />
      </div>
      <button
        type="button"
        disabled={submitting || state === 'taken'}
        className="mt-5 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white disabled:opacity-60"
        onClick={() => void submit()}
      >
        {submitting ? '保存中…' : '保存'}
      </button>
    </Modal>
  );
}

/** 绑改手机号（免验证，留 TODO(sms) 口子） */
function PhoneDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (u: PublicUser) => void;
}): JSX.Element | null {
  const captchaRef = useRef<CaptchaInputHandle>(null);
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captchaId: '', captchaCode: '' });
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPhone('');
      setCaptcha({ captchaId: '', captchaCode: '' });
    }
  }, [open]);

  const submit = async (): Promise<void> => {
    if (!PHONE_RE.test(phone)) {
      toast('请输入 11 位手机号', 'error');
      return;
    }
    if (!captcha.captchaId || !captcha.captchaCode) {
      toast('请先完成图形验证', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const fresh = await api.put<PublicUser>('/account/phone', {
        phone,
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      });
      toast('手机号已绑定', 'success');
      onDone(fresh);
    } catch (err) {
      captchaRef.current?.refresh();
      toast(err instanceof ApiError ? err.message : '绑定失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-[17px] font-semibold text-warm">绑定/修改手机号</h3>
      <p className="mt-2 text-[12px] leading-5 text-warm-light">
        当前免验证直接改，未来需短信验证（TODO）
      </p>
      <div className="mt-4 space-y-3">
        <input
          type="tel"
          inputMode="numeric"
          maxLength={11}
          placeholder="11 位手机号"
          className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={phone}
          onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
        />
        <CaptchaInput ref={captchaRef} value={captcha} onChange={setCaptcha} />
      </div>
      <button
        type="button"
        disabled={submitting}
        className="mt-5 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white disabled:opacity-60"
        onClick={() => void submit()}
      >
        {submitting ? '绑定中…' : '确认绑定'}
      </button>
    </Modal>
  );
}

/** 改邮箱：输入新邮箱 → 发码 → 输入验证码 → 确认 */
function EmailDialog({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (u: PublicUser) => void;
}): JSX.Element | null {
  const captchaRef = useRef<CaptchaInputHandle>(null);
  const [captcha, setCaptcha] = useState<CaptchaValue>({ captchaId: '', captchaCode: '' });
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setNewEmail('');
      setCode('');
      setCaptcha({ captchaId: '', captchaCode: '' });
    }
  }, [open]);

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

  const sendCode = async (): Promise<void> => {
    if (!EMAIL_RE.test(newEmail)) {
      toast('请输入正确的新邮箱', 'error');
      return;
    }
    if (!captcha.captchaId || !captcha.captchaCode) {
      toast('请先完成图形验证', 'error');
      return;
    }
    try {
      await api.post('/account/email-code', {
        new_email: newEmail,
        captcha_id: captcha.captchaId,
        captcha_code: captcha.captchaCode,
      });
      toast('验证码已发送至新邮箱', 'success');
      startCountdown();
      captchaRef.current?.refresh();
    } catch (err) {
      captchaRef.current?.refresh();
      toast(err instanceof ApiError ? err.message : '发送失败', 'error');
    }
  };

  const submit = async (): Promise<void> => {
    if (!EMAIL_RE.test(newEmail)) {
      toast('请输入正确的新邮箱', 'error');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast('验证码是 6 位数字', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const fresh = await api.put<PublicUser>('/account/email', { new_email: newEmail, code });
      toast('邮箱已换绑', 'success');
      onDone(fresh);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '换绑失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-[17px] font-semibold text-warm">更改绑定邮箱</h3>
      <p className="mt-2 text-[12px] leading-5 text-warm-light">
        验证码会发到新邮箱，5 分钟内有效
      </p>
      <div className="mt-4 space-y-3">
        <input
          type="email"
          inputMode="email"
          maxLength={254}
          placeholder="新邮箱地址"
          className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value.trim())}
        />
        <CaptchaInput ref={captchaRef} value={captcha} onChange={setCaptcha} />
        <div className="flex gap-3">
          <input
            type="tel"
            inputMode="numeric"
            maxLength={6}
            placeholder="6 位数字验证码"
            className="flex-1 rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          />
          <button
            type="button"
            disabled={countdown > 0}
            className="w-28 rounded-btn border border-primary text-[13px] text-primary disabled:border-soft disabled:text-warm-light"
            onClick={() => void sendCode()}
          >
            {countdown > 0 ? `${countdown}s` : '发送验证码'}
          </button>
        </div>
      </div>
      <button
        type="button"
        disabled={submitting}
        className="mt-5 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white disabled:opacity-60"
        onClick={() => void submit()}
      >
        {submitting ? '提交中…' : '确认换绑'}
      </button>
    </Modal>
  );
}
