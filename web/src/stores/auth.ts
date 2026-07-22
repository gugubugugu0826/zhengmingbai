/**
 * 全局状态：登录用户 + 全局 toast。
 * v2.2：login 抽象移除（登录逻辑下沉到 Login/Register 页面组件，需要 captcha 上下文）。
 */
import { create } from 'zustand';
import { api, tokenStore } from '../api';
import type { PublicUser } from '../types';

interface AuthState {
  user: PublicUser | null;
  balance: number;
  ready: boolean; // 首次 /auth/me 是否已拉取（路由守卫用）
  fetchMe: () => Promise<void>;
  logout: () => void;
  setBalance: (balance: number) => void;
  setUser: (user: PublicUser) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  balance: 0,
  ready: false,

  async fetchMe() {
    try {
      const data = await api.get<{ user: PublicUser; points: { balance: number } }>('/auth/me');
      set({ user: data.user, balance: data.points.balance, ready: true });
    } catch {
      set({ user: null, ready: true });
    }
  },

  logout() {
    // 后端无状态 JWT 不可吊销；调一下服务端审计，失败也不阻塞本地登出
    void api.post('/auth/logout').catch(() => undefined);
    tokenStore.clear();
    set({ user: null, balance: 0 });
  },

  setBalance(balance) {
    set({ balance });
  },

  setUser(user) {
    set({ user });
  },
}));

export interface ToastItem {
  id: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface ToastState {
  toasts: ToastItem[];
  push: (text: string, kind?: ToastItem['kind']) => void;
  remove: (id: number) => void;
}

let toastSeq = 1;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push(text, kind = 'info') {
    const id = toastSeq++;
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2600);
  },
  remove(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

/** 便捷非 hook 调用 */
export function toast(text: string, kind: ToastItem['kind'] = 'info'): void {
  useToastStore.getState().push(text, kind);
}
