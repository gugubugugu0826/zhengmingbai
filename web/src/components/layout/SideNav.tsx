/**
 * v3 桌面/平板左侧导航（6 项，设计稿 D1）：
 * - 桌面（≥1280px）：240px 常显文字导航
 * - 平板（768–1279px）：折叠为 64px 图标栏
 * - 当前页高亮（原木棕左侧指示条 + 浅棕底），消息项带未读红点
 */
import { NavLink } from 'react-router-dom';

export interface NavItem {
  to: string;
  label: string;
  icon: string;
  /** 未读消息红点（仅消息项使用） */
  badge?: number;
}

interface SideNavProps {
  /** 平板档折叠为纯图标栏 */
  collapsed?: boolean;
  unreadCount?: number;
}

/** 6 项导航（任务书 §三 D1）：首页/开始整理/我的空间/消息/商城/账号 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/home', label: '首页', icon: '🏠' },
  { to: '/capture', label: '开始整理', icon: '📸' },
  { to: '/spaces', label: '我的空间', icon: '🗂️' },
  { to: '/messages', label: '消息', icon: '🔔' },
  { to: '/store', label: '商城', icon: '🛍️' },
  { to: '/account', label: '账号', icon: '👤' },
];

export function SideNav({ collapsed = false, unreadCount = 0 }: SideNavProps): JSX.Element {
  const items: NavItem[] = NAV_ITEMS.map((item) =>
    item.to === '/messages' ? { ...item, badge: unreadCount } : item,
  );

  return (
    <nav
      aria-label="主导航"
      className={`flex h-full flex-col border-r border-border-subtle bg-card py-6 ${
        collapsed ? 'w-16 items-center px-2' : 'w-60 px-4'
      }`}
    >
      {/* 品牌区 */}
      <div
        className={`mb-8 flex items-center gap-2 ${collapsed ? 'justify-center' : 'px-2'}`}
        title="整明白"
      >
        <span className="text-[24px] leading-none">🧺</span>
        {!collapsed && (
          <span className="text-[18px] font-semibold tracking-wide text-warm">整明白</span>
        )}
      </div>

      <ul className="flex w-full flex-1 flex-col gap-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-md py-2.5 text-[14px] transition-colors ${
                  collapsed ? 'justify-center px-0' : 'px-3'
                } ${
                  isActive
                    ? 'bg-tint font-medium text-primary-dark'
                    : 'text-warm-secondary hover:bg-tint/60 hover:text-warm'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* 当前页左侧指示条 */}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-pill bg-primary" />
                  )}
                  <span className="relative text-[20px] leading-none">
                    {item.icon}
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium leading-none text-white">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </span>
                  {!collapsed && <span>{item.label}</span>}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      {!collapsed && (
        <p className="px-3 text-[12px] leading-5 text-warm-light">
          把每个空间
          <br />
          整明白
        </p>
      )}
    </nav>
  );
}
