/**
 * 路由装配 + 登录守卫。
 * v2.2：新增 /register /force-reset-password /account /points /privacy；
 * need_reset 用户访问受保护路由一律被拽去 /force-reset-password。
 * v3 T02：C 端路由统一挂 AppShell 三档响应式布局壳（桌面侧栏/平板折叠+汉堡/手机底部 3Tab），
 * 维护模式由 AppShell 全屏接管；商城 /store 与消息 /messages 已纳入 6 导航。
 */
import { useEffect, type JSX } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { tokenStore } from './api';
import { ToastHost } from './components/Toast';
import { Loading } from './components/Loading';
import { AppShell } from './components/layout/AppShell';
import { useAuthStore } from './stores/auth';
import LoginPage from './pages/Login';
import RegisterPage from './pages/Register';
import ForgotPasswordPage from './pages/ForgotPassword';
import ForceResetPasswordPage from './pages/ForceResetPassword';
import HomePage from './pages/Home';
import CapturePage from './pages/Capture';
import ConfirmPage from './pages/Confirm';
import PlanPage from './pages/Plan';
import TodoListPage from './pages/TodoList';
import SpacesPage from './pages/Spaces';
import SpaceDetailPage from './pages/SpaceDetail';
import StorePage from './pages/Store';
import MessagesPage from './pages/Messages';
import AccountPage from './pages/Account';
import PointsPage from './pages/Points';
import PrivacyPage from './pages/Privacy';
import { RequireAdmin } from './admin/RequireAdmin';
import { AdminLayout } from './admin/AdminLayout';
import AdminLogin from './admin/pages/Login';
import AdminDashboard from './admin/pages/Dashboard';
import AdminUsers from './admin/pages/Users';
import AdminLegacyUsers from './admin/pages/LegacyUsers';
import AdminKnowledge from './admin/pages/Knowledge';
import AdminPointsPackages from './admin/pages/PointsPackages';
import AdminSwitches from './admin/pages/Switches';
import AdminLogs from './admin/pages/Logs';
import AdminAccount from './admin/pages/Account';

/** 登录 + 强制改密守卫：need_reset 用户除 /force-reset-password 外一律拦截 */
function RequireAuth({ children }: { children: JSX.Element }): JSX.Element {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  if (!tokenStore.get()) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  // user 还没拉回来前不做二次判定（首屏 Loading 由外层处理）
  if (user && user.force_password_reset === 1 && location.pathname !== '/force-reset-password') {
    return <Navigate to="/force-reset-password" replace />;
  }
  return children;
}

export default function App(): JSX.Element {
  const ready = useAuthStore((s) => s.ready);
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const location = useLocation();

  useEffect(() => {
    if (tokenStore.get()) {
      void fetchMe();
    } else {
      useAuthStore.setState({ ready: true });
    }
    // 仅在登录态/路径变化时刷新用户信息
  }, [fetchMe, location.pathname]);

  return (
    <>
      <Routes>
      {/* admin 后台（v2.2 T04）：/admin 与 /admin/login 为三段式登录页（公开，独立 admin 会话）；
          其余 /admin/* 需 scope=admin 票据（RequireAdmin 校验 zmb_admin_token），不套 C 端手机容器 */}
      <Route path="/admin" element={<AdminLogin />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route element={<RequireAdmin />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/legacy-users" element={<AdminLegacyUsers />} />
          <Route path="/admin/knowledge" element={<AdminKnowledge />} />
          <Route path="/admin/points" element={<AdminPointsPackages />} />
          <Route path="/admin/switches" element={<AdminSwitches />} />
          <Route path="/admin/logs" element={<AdminLogs />} />
          <Route path="/admin/account" element={<AdminAccount />} />
        </Route>
      </Route>

      {/* C 端：AppShell 三档响应式布局壳（v3 T02） */}
      <Route
        path="*"
        element={
          !ready && tokenStore.get() ? (
            <div className="flex min-h-screen w-full flex-col bg-cream">
              <Loading text="正在打开整明白…" />
            </div>
          ) : (
            <Routes>
              <Route element={<AppShell />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route
                  path="/force-reset-password"
                  element={
                    <RequireAuth>
                      <ForceResetPasswordPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/home"
                  element={
                    <RequireAuth>
                      <HomePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/capture"
                  element={
                    <RequireAuth>
                      <CapturePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/confirm/:sessionId"
                  element={
                    <RequireAuth>
                      <ConfirmPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/plan/:sessionId"
                  element={
                    <RequireAuth>
                      <PlanPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/todo/:sessionId"
                  element={
                    <RequireAuth>
                      <TodoListPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/spaces"
                  element={
                    <RequireAuth>
                      <SpacesPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/spaces/:spaceId"
                  element={
                    <RequireAuth>
                      <SpaceDetailPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/store"
                  element={
                    <RequireAuth>
                      <StorePage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/messages"
                  element={
                    <RequireAuth>
                      <MessagesPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/account"
                  element={
                    <RequireAuth>
                      <AccountPage />
                    </RequireAuth>
                  }
                />
                <Route
                  path="/points"
                  element={
                    <RequireAuth>
                      <PointsPage />
                    </RequireAuth>
                  }
                />
                {/* 隐私政策公开可访问（注册页协议勾选链接） */}
                <Route path="/privacy" element={<PrivacyPage />} />
                <Route path="*" element={<Navigate to={tokenStore.get() ? '/home' : '/login'} replace />} />
              </Route>
            </Routes>
          )
        }
      />
    </Routes>
      <ToastHost />
    </>
  );
}
