/**
 * 账号页（v3 A6，按设计稿改造）：
 * 用户卡 + 我的点数卡 + 账号管理（更改用户名/绑定手机/更改邮箱/更改密码）
 * + 隐私与提醒两开关（30 天复查提醒、默认保留整理记录）+ 隐私政策 + 退出登录。
 * 更改邮箱走 CaptchaDialog 弹窗发码（scene=change_email），新邮箱失焦查重。
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { CaptchaDialog } from '../components/CaptchaDialog';
import { CaptchaInput, type CaptchaInputHandle, type CaptchaValue } from '../components/CaptchaInput';
import { useRef } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { toast, useAuthStore } from '../stores/auth';
import type { PublicUser } from '../types';

const PHONE_RE = /^1\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_RE = /^[一-龥A-Za-z0-9_]{1,20}$/;

interface ProfileResp {
  user: PublicUser;
  points: { balance: number; total_earned: number; total_spent: number };
  need_reset: boolean;
}

type DialogKind = 'username' | 'phone' | 'email' | 'password' | 'logout' | null;

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
      <div className="flex min-h-[40vh] w-full items-center justify-center">
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
    <div className="w-full max-w-3xl">
      <PageHeader title="账号" subtitle="账号信息、隐私与提醒设置都在这儿" />

      {/* 用户卡片 */}
      <div className="mx-5 mt-3 rounded-card bg-card p-5 shadow-card md:mx-0">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-soft text-2xl">
            👤
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[16px] font-semibold text-warm">
              {user.username || user.nickname || '整明白用户'}
            </div>
            <div className="mt-0.5 truncate text-[12px] text-warm-light">
              {user.email ?? '未绑定邮箱'}
            </div>
            {user.phone && <div className="text-[12px] text-warm-light">{user.phone}</div>}
          </div>
        </div>
      </div>

      {/* 我的点数卡 */}
      <button
        type="button"
        className="mx-5 mt-4 flex w-[calc(100%-40px)] items-center justify-between rounded-card bg-gradient-to-r from-primary to-primary-dark p-5 text-left text-white shadow-card md:mx-0 md:w-full"
        onClick={() => navigate('/points')}
      >
        <div>
          <div className="text-[13px] opacity-85">我的点数</div>
          <div className="mt-1 text-[28px] font-semibold leading-none">{balance}</div>
          <div className="mt-1.5 text-[12px] opacity-90">点数用于 AI 分析，重生成首次免费</div>
        </div>
        <span className="text-[32px]">🪙</span>
      </button>

      {/* 账号管理 */}
      <div className="mx-5 mt-5 md:mx-0">
        <h3 className="mb-2 px-1 text-[13px] font-medium text-warm-light">账号管理</h3>
        <div className="space-y-2">
          <Row label="更改用户名" value={user.username ?? '未设置'} onClick={() => setDialog('username')} />
          <Row
            label={user.phone ? '修改手机号' : '绑定手机号'}
            value={user.phone ?? ''}
            onClick={() => setDialog('phone')}
          />
          <Row label="更改绑定邮箱" value={user.email ?? ''} onClick={() => setDialog('email')} />
          <Row label="更改密码" value="" onClick={() => setDialog('password')} />
        </div>
      </div>

      {/* 隐私与提醒 */}
      <div className="mx-5 mt-5 md:mx-0">
        <h3 className="mb-2 px-1 text-[13px] font-medium text-warm-light">隐私与提醒</h3>
        <div className="rounded-card bg-card px-4 py-3 shadow-card">
          <SwitchRow
            label="30 天复查提醒"
            desc="整理完 30 天后提醒你回去看看，保持战果"
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
        <div className="mt-2">
          <Row label="隐私政策" value="" onClick={() => navigate('/privacy')} />
        </div>
      </div>

      {/* 退出登录 */}
      <div className="mx-5 mt-5 md:mx-0">
        <button
          type="button"
          className="w-full rounded-card bg-card px-4 py-3.5 text-left text-[15px] font-medium text-[#B66A5A] shadow-card"
          onClick={() => setDialog('logout')}
        >
          退出登录
        </button>
      </div>

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
        currentEmail={user.email ?? ''}
        onClose={() => setDialog(null)}
        onDone={(fresh) => {
          setUser(fresh);
          setDialog(null);
        }}
      />
      <PasswordDialog open={dialog === 'password'} onClose={() => setDialog(null)} />

      <ConfirmDialog
        open={dialog === 'logout'}
        onCancel={() => setDialog(null)}
        onConfirm={doLogout}
        title="确认退出登录？"
        desc="退出后需要重新登录才能继续整理"
        confirmText="退出"
        cancelText="再想想"
      />
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
      className="flex w-full items-center justify-between rounded-card bg-card px-4 py-3.5 text-left shadow-card transition-shadow hover:shadow-float"
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

// ============== 修改弹窗 ==============

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

/** 绑改手机号（本期免验证登记，留短信验证口子） */
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
        本期仅登记不验证；短信验证通道开通后会升级为验证码绑定
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

/** 更改绑定邮箱（v3 §5-D）：输新邮箱（失焦查重）→ CaptchaDialog 发码（scene=change_email）→ 输码换绑 */
function EmailDialog({
  open,
  currentEmail,
  onClose,
  onDone,
}: {
  open: boolean;
  currentEmail: string;
  onClose: () => void;
  onDone: (u: PublicUser) => void;
}): JSX.Element | null {
  const [newEmail, setNewEmail] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [captchaOpen, setCaptchaOpen] = useState(false);
  const [emailState, setEmailState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'invalid'>('idle');

  useEffect(() => {
    if (open) {
      setNewEmail('');
      setCode('');
      setEmailState('idle');
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

  /** 新邮箱失焦查重：已被其他账号绑定则提示 */
  const onEmailBlur = async (): Promise<void> => {
    if (!newEmail) {
      setEmailState('idle');
      return;
    }
    if (!EMAIL_RE.test(newEmail)) {
      setEmailState('invalid');
      return;
    }
    if (newEmail === currentEmail) {
      setEmailState('invalid');
      return;
    }
    setEmailState('checking');
    try {
      const r = await api.get<{ available: boolean }>('/auth/check-email', { value: newEmail });
      setEmailState(r.available ? 'ok' : 'taken');
    } catch {
      setEmailState('idle');
    }
  };

  /** 点「发送验证码」：本地校验 → 开图形码弹窗 */
  const openSendCaptcha = (): void => {
    if (!EMAIL_RE.test(newEmail)) {
      toast('请输入正确的新邮箱', 'error');
      return;
    }
    if (newEmail === currentEmail) {
      toast('新邮箱和当前邮箱一样哦', 'error');
      return;
    }
    if (emailState === 'taken') {
      toast('这个邮箱已被其他账号绑定', 'error');
      return;
    }
    setCaptchaOpen(true);
  };

  /** 图形码通过后发码（POST /account/email-code，scene=change_email） */
  const sendCode = async (captchaId: string, captchaCode: string): Promise<void> => {
    try {
      await api.post('/account/email-code', {
        new_email: newEmail,
        scene: 'change_email',
        captcha_id: captchaId,
        captcha_code: captchaCode,
      });
      toast('验证码已发送至新邮箱', 'success');
      startCountdown();
    } catch (err) {
      if (err instanceof ApiError && err.code === 2101) {
        setCaptchaOpen(true);
        toast('图形验证码不对，再来一次', 'error');
      } else {
        if (err instanceof ApiError && err.code === 2105) setEmailState('taken');
        toast(err instanceof ApiError ? err.message : '发送失败', 'error');
      }
    }
  };

  const submit = async (): Promise<void> => {
    if (!EMAIL_RE.test(newEmail)) {
      toast('请输入正确的新邮箱', 'error');
      return;
    }
    if (emailState === 'taken') {
      toast('这个邮箱已被其他账号绑定', 'error');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      toast('验证码是 6 位数字', 'error');
      return;
    }
    setSubmitting(true);
    try {
      const fresh = await api.put<PublicUser>('/account/email', { new_email: newEmail, code });
      toast('邮箱已换绑，下次登录请用新邮箱', 'success');
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
        验证码会发到新邮箱，5 分钟内有效；换绑后旧邮箱不能再登录
      </p>
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="text-[13px] text-warm-light">新邮箱</label>
            {emailState === 'checking' && <span className="text-[12px] text-warm-light">检查中…</span>}
            {emailState === 'ok' && <span className="text-[12px] text-sage-dark">✓ 可用</span>}
            {emailState === 'taken' && <span className="text-[12px] text-[#B66A5A]">已被绑定</span>}
            {emailState === 'invalid' && <span className="text-[12px] text-[#B66A5A]">格式不对</span>}
          </div>
          <input
            type="email"
            inputMode="email"
            maxLength={254}
            placeholder="新邮箱地址"
            className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={newEmail}
            onChange={(e) => {
              setNewEmail(e.target.value.trim());
              setEmailState('idle');
            }}
            onBlur={() => void onEmailBlur()}
          />
        </div>
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
            onClick={openSendCaptcha}
          >
            {countdown > 0 ? `${countdown}s` : '发送验证码'}
          </button>
        </div>
      </div>
      <button
        type="button"
        disabled={submitting || emailState === 'taken'}
        className="mt-5 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white disabled:opacity-60"
        onClick={() => void submit()}
      >
        {submitting ? '提交中…' : '确认换绑'}
      </button>

      <CaptchaDialog
        open={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        subtitle="通过人机验证后，验证码发到新邮箱"
        onVerified={(captchaId, captchaCode) => {
          setCaptchaOpen(false);
          void sendCode(captchaId, captchaCode);
        }}
      />
    </Modal>
  );
}

/** 更改密码（v3 A6 补全）：旧密码 + 新密码 + 确认 */
function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setOldPwd('');
      setNewPwd('');
      setNewPwd2('');
    }
  }, [open]);

  const submit = async (): Promise<void> => {
    if (!oldPwd) {
      toast('请输入当前密码', 'error');
      return;
    }
    if (newPwd.length < 8) {
      toast('新密码至少 8 位', 'error');
      return;
    }
    if (!/[A-Za-z]/.test(newPwd) || !/\d/.test(newPwd)) {
      toast('新密码需要同时包含字母和数字', 'error');
      return;
    }
    if (newPwd !== newPwd2) {
      toast('两次输入的密码不一致', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await api.put<PublicUser>('/account/password', { old_password: oldPwd, new_password: newPwd });
      toast('密码已更新', 'success');
      onClose();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '修改失败', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-[17px] font-semibold text-warm">更改密码</h3>
      <div className="mt-4 space-y-3">
        <input
          type="password"
          autoComplete="current-password"
          maxLength={64}
          placeholder="当前密码"
          className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={oldPwd}
          onChange={(e) => setOldPwd(e.target.value)}
        />
        <input
          type="password"
          autoComplete="new-password"
          maxLength={64}
          placeholder="新密码（至少 8 位，含字母和数字）"
          className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
        />
        <div>
          <input
            type="password"
            autoComplete="new-password"
            maxLength={64}
            placeholder="再输一次新密码"
            className="w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
            value={newPwd2}
            onChange={(e) => setNewPwd2(e.target.value)}
          />
          {newPwd2 && newPwd !== newPwd2 && (
            <p className="mt-1 text-[12px] text-[#B66A5A]">两次输入不一致</p>
          )}
        </div>
      </div>
      <button
        type="button"
        disabled={submitting}
        className="mt-5 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white disabled:opacity-60"
        onClick={() => void submit()}
      >
        {submitting ? '保存中…' : '保存'}
      </button>
    </Modal>
  );
}
