/**
 * admin 后台布局：左侧固定导航 + 顶栏（返回前台 / 退出登录）+ 右侧内容区。
 * 独立全宽桌面布局，不套 C 端 AppShell/SideNav（§5-I-7 保留现有左侧导航）。
 * v3 T04：新增「操作日志」导航项；tokens 换 v3 设计系统（canvas/sage/圆角阶梯）；
 * 退出登录只清 admin token（zmb_admin_token）并回 /admin 登录页，不影响 C 端登录态。
 */
import type { JSX } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminTokenStore } from './auth';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: '数据看板', icon: '📊' },
  { to: '/admin/users', label: '用户管理', icon: '👥' },
  { to: '/admin/legacy-users', label: '老用户迁移', icon: '📮' },
  { to: '/admin/knowledge', label: '知识库', icon: '📚' },
  { to: '/admin/points', label: '点数套餐', icon: '🎁' },
  { to: '/admin/switches', label: '系统开关', icon: '🎛️' },
  { to: '/admin/logs', label: '操作日志', icon: '🧾' },
  { to: '/admin/account', label: '管理员账号', icon: '🔑' },
];

export function AdminLayout(): JSX.Element {
  const navigate = useNavigate();

  const onLogout = (): void => {
    adminTokenStore.clear();
    navigate('/admin', { replace: true });
  };

  return (
    <div className="flex min-h-full w-full bg-canvas text-warm">
      {/* 左侧导航（§5-I-7 保留现有后台左侧导航） */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border-subtle bg-card">
        <div className="border-b border-border-subtle px-5 py-4">
          <div className="text-[16px] font-semibold text-warm">整明白 · 管理后台</div>
          <div className="mt-0.5 text-[12px] text-warm-light">管理员总控台</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-md px-3 py-2.5 text-[14px] transition-colors ${
                  isActive
                    ? 'bg-primary/10 font-medium text-primary-dark'
                    : 'text-warm-light hover:bg-soft/70 hover:text-warm-secondary'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border-subtle px-5 py-3 text-[11px] leading-4 text-warm-light">
          管理员操作全部留痕
          <br />
          可在「操作日志」追溯
        </div>
      </aside>

      {/* 右侧：顶栏 + 内容 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border-subtle bg-card px-6 py-3">
          <div className="text-[13px] text-warm-light">阶段 2 · 支付暂缓期 · 点数只发不收</div>
          <div className="flex items-center gap-4 text-[13px]">
            <button
              type="button"
              className="text-warm-light transition-colors hover:text-primary"
              onClick={() => navigate('/home')}
            >
              返回前台
            </button>
            <span className="text-border-strong">|</span>
            <button
              type="button"
              className="rounded-md border border-border-subtle px-3 py-1 text-[12px] text-warm-light transition-colors hover:bg-soft"
              onClick={onLogout}
            >
              退出登录
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6 desktop:p-8">
          <div className="mx-auto w-full max-w-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
