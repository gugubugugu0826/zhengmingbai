/**
 * 管理员路由守卫（v2.2 T04）：/admin 会话独立于 C 端。
 * 只认 zmb_admin_token（scope='admin' 的正式票据，由 /admin 三段式登录签发）；
 * 无票据一律跳回 /admin（三段式登录页），不渲染任何后台内容。
 * C 端 role=admin 的用户态 token（scope='user'）天然无后台入口（后端 2003 兜底）。
 */
import type { JSX } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { adminTokenStore } from './auth';

export function RequireAdmin(): JSX.Element {
  const location = useLocation();
  if (!adminTokenStore.get()) {
    return <Navigate to="/admin" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
