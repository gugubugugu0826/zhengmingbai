/**
 * admin 后台布局：左侧固定导航 + 顶栏（返回前台 / 退出登录）+ 右侧内容区。
 * 独立全宽布局，不套 C 端 max-w-md 手机容器。
 * v2.2 T04：退出登录只清 admin token（zmb_admin_token）并回 /admin 登录页，
 * 不影响 C 端登录态；新增「老用户迁移」导航项。
 */
import type { JSX } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { adminTokenStore } from './auth';

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: '数据看板', icon: '📊' },
  { to: '/admin/users', label: '用户与点数', icon: '👥' },
  { to: '/admin/legacy-users', label: '老用户迁移', icon: '📮' },
  { to: '/admin/knowledge', label: '知识库', icon: '📚' },
  { to: '/admin/points', label: '点数与套餐', icon: '🎁' },
  { to: '/admin/switches', label: 'AI 与支付开关', icon: '🎛️' },
  { to: '/admin/account', label: '账号', icon: '🔑' },
];

export function AdminLayout(): JSX.Element {
  const navigate = useNavigate();

  const onLogout = (): void => {
    adminTokenStore.clear();
    navigate('/admin', { replace: true });
  };

  return (
    <div className="flex min-h-full w-full bg-[#F5F2ED] text-warm">
      {/* 左侧导航 */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-soft bg-card">
        <div className="border-b border-soft px-5 py-4">
          <div className="text-[16px] font-semibold text-warm">整明白 · 总控台</div>
          <div className="mt-0.5 text-[12px] text-warm-light">管理员后台</div>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 rounded-btn px-3 py-2.5 text-[14px] ${
                  isActive
                    ? 'bg-primary/10 font-medium text-primary-dark'
                    : 'text-warm-light hover:bg-soft/60'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* 右侧：顶栏 + 内容 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-soft bg-card px-6 py-3">
          <div className="text-[13px] text-warm-light">阶段 2 · 支付暂缓期</div>
          <div className="flex items-center gap-4 text-[13px]">
            <button
              type="button"
              className="text-warm-light hover:text-primary"
              onClick={() => navigate('/home')}
            >
              返回前台
            </button>
            <span className="text-warm-light">|</span>
            <button
              type="button"
              className="rounded-btn border border-soft px-3 py-1 text-[12px] text-warm-light hover:bg-soft"
              onClick={onLogout}
            >
              退出登录
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
