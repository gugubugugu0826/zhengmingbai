/**
 * v3 三档响应式布局壳（设计稿 p34 断点规范）：
 * - 桌面（≥1280px）：左侧导航 240px 常显 + 主内容区 max-w 1200px、页面边距 40–48px
 * - 平板（768–1279px）：左侧导航折叠为图标栏 + 汉堡菜单（抽屉式）
 * - 手机（<768px）：单列 + 底部 3 Tab（BottomTab，固定底部，页面统一 pb-24 避让）
 *
 * 同时承载维护模式全屏切换：maintenanceStore.enabled 时渲染 MaintenancePage。
 *
 * T03：主内容容器三档统一为 w-full + max-w-content，页面最外层一律 w-full
 * 继承容器宽度（不再出现"手机页放大居中"）；登录/注册/忘记密码走全屏
 * 双栏桌面布局（AuthCard），不套手机居中容器。
 */
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { maintenanceStore, type MaintenanceInfo } from '../../maintenance';
import { MaintenancePage } from '../MaintenancePage';
import { BottomTab } from './BottomTab';
import { SideNav } from './SideNav';

/** 公开路由（无壳，自己铺满全屏）：登录/注册/忘记密码等 */
const SHELL_FREE_PREFIXES = ['/login', '/register', '/forgot-password'];

interface PublicConfigs {
  subscribe_template_id: string;
  maintenance: { enabled: boolean; notice: string };
}

export function AppShell(): JSX.Element {
  const location = useLocation();
  const [maintenance, setMaintenance] = useState<MaintenanceInfo>(maintenanceStore.snapshot());
  const [unread, setUnread] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 订阅维护模式状态（api.ts 拦截 3001 时 enter）
  useEffect(() => maintenanceStore.subscribe(setMaintenance), []);

  // 未读消息红点（SideNav 消息项；未登录/接口异常时静默）
  useEffect(() => {
    api
      .get<{ count: number }>('/messages/unread-count')
      .then((d) => setUnread(d.count))
      .catch(() => undefined);
  }, [location.pathname]);

  // 维护模式轮询恢复：30s 拉一次公开配置，关闭后自动回到应用
  useEffect(() => {
    if (!maintenance.enabled) return;
    const timer = window.setInterval(() => {
      api
        .get<PublicConfigs>('/configs/public')
        .then((d) => {
          if (!d.maintenance.enabled) maintenanceStore.exit();
        })
        .catch(() => undefined);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [maintenance.enabled]);

  // 路由变化时收起平板抽屉
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  if (maintenance.enabled) {
    return <MaintenancePage notice={maintenance.notice} />;
  }

  // 登录/注册/忘记密码不套壳（AuthCard 双栏全屏布局，自己负责响应式）
  const shellFree = SHELL_FREE_PREFIXES.some((p) => location.pathname.startsWith(p));
  if (shellFree) {
    return <Outlet />;
  }

  return (
    <div className="flex min-h-full bg-cream">
      {/* 桌面档（≥1280px）：240px 常显侧栏 */}
      <aside className="sticky top-0 hidden h-screen shrink-0 desktop:block">
        <SideNav unreadCount={unread} />
      </aside>

      {/* 平板档（768–1279px）：折叠图标栏 + 汉堡抽屉 */}
      <aside className="sticky top-0 hidden h-screen shrink-0 md:block desktop:hidden">
        <SideNav collapsed unreadCount={unread} />
      </aside>

      {/* 平板档汉堡按钮（抽屉式展开完整导航） */}
      <button
        type="button"
        aria-label="打开导航菜单"
        className="fixed left-[72px] top-4 z-30 hidden h-10 w-10 items-center justify-center rounded-md border border-border-subtle bg-card shadow-card md:flex desktop:hidden"
        onClick={() => setDrawerOpen(true)}
      >
        <span className="flex flex-col gap-1">
          <span className="h-0.5 w-4 rounded bg-warm-secondary" />
          <span className="h-0.5 w-4 rounded bg-warm-secondary" />
          <span className="h-0.5 w-4 rounded bg-warm-secondary" />
        </span>
      </button>

      {/* 平板抽屉 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 hidden bg-black/40 md:block desktop:hidden"
          onClick={() => setDrawerOpen(false)}
        >
          <div
            className="h-full w-64 shadow-float"
            onClick={(e) => {
              e.stopPropagation();
            }}
          >
            <SideNav unreadCount={unread} />
          </div>
        </div>
      )}

      {/* 主内容区：桌面 max-w 1200px 边距 40–48；平板 px-6；手机单列 + 底部 Tab 避让 */}
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-content px-4 pb-24 md:px-6 md:pb-10 md:pt-8 desktop:px-12 desktop:py-10">
          <Outlet />
        </div>
      </main>

      {/* 手机档（<768px）：底部 3 Tab */}
      <div className="md:hidden">
        <BottomTab />
      </div>
    </div>
  );
}
