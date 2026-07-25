/**
 * 强制改密页（v2.2 A-5 配套）：
 * - 全屏拦截：无导航、无退出按钮，必须完成改密才能继续
 * - force_password_reset=1 用户调 PUT /account/password 免旧密码
 * - 改密成功后跳首页
 */
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { toast, useAuthStore } from '../stores/auth';
import type { PublicUser } from '../types';

export default function ForceResetPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [newPwd, setNewPwd] = useState('');
  const [newPwd2, setNewPwd2] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (): Promise<void> => {
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
      // force_password_reset 用户免旧密码（后端识别 user 标记）
      const fresh = await api.put<PublicUser>('/account/password', { new_password: newPwd });
      setUser(fresh);
      toast('密码已更新，欢迎回来～', 'success');
      navigate('/home', { replace: true });
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '设置失败，请稍后再试', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col justify-center bg-cream px-5 py-12">
      <div className="mb-8 text-center">
        <div className="mb-3 text-5xl">🔐</div>
        <h1 className="text-[22px] font-semibold text-warm">请先设置新密码</h1>
        <p className="mt-2 text-[13px] leading-6 text-warm-light">
          为了账号安全，首次登录需要把运营同学发你的临时密码
          <br />
          换成你自己记得住的新密码
        </p>
      </div>

      <div className="rounded-card bg-card p-5 shadow-card">
        <label className="mb-1 block text-[13px] text-warm-light">新密码</label>
        <input
          type="password"
          autoComplete="new-password"
          maxLength={64}
          placeholder="至少 8 位，含字母和数字"
          className="mb-4 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={newPwd}
          onChange={(e) => setNewPwd(e.target.value)}
        />
        <label className="mb-1 block text-[13px] text-warm-light">再输一次</label>
        <input
          type="password"
          autoComplete="new-password"
          maxLength={64}
          placeholder="确认新密码"
          className="mb-5 w-full rounded-btn border border-soft bg-cream px-4 py-3 text-[15px] outline-none focus:border-primary"
          value={newPwd2}
          onChange={(e) => setNewPwd2(e.target.value)}
        />
        <button
          type="button"
          disabled={submitting}
          className="w-full rounded-btn bg-primary py-3.5 text-[16px] font-medium text-white active:bg-primary-dark disabled:opacity-60"
          onClick={() => void submit()}
        >
          {submitting ? '保存中…' : '保存并进入'}
        </button>
        <p className="mt-4 text-center text-[12px] text-warm-light">完成前不能访问其他页面</p>
      </div>
    </div>
  );
}
