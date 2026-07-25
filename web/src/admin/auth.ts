/**
 * /admin 独立登录态（v2.2 T04，与 C 端 zmb_token 完全隔离）。
 * C 端 401 拦截只清 zmb_token；/admin 接口 2001/2003 由 AdminLogin 页自行清 ADMIN_TOKEN 并跳回 /admin。
 */

const ADMIN_TOKEN_KEY = 'zmb_admin_token';

export const adminTokenStore = {
  get(): string {
    return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
  },
  set(token: string): void {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  },
  clear(): void {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  },
};
