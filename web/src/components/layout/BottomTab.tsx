/**
 * v3 手机端底部 3 Tab（<768px）：首页/我的空间/账号，沿用 v2.2 TabBar 行为。
 * 固定底部、毛玻璃底、当前项主色高亮。
 */
import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/home', label: '首页', icon: '🏠' },
  { to: '/spaces', label: '我的空间', icon: '🗂️' },
  { to: '/account', label: '账号', icon: '👤' },
];

export function BottomTab(): JSX.Element {
  return (
    <nav
      aria-label="底部导航"
      className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-border-subtle bg-card/95 backdrop-blur"
    >
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[12px] ${
              isActive ? 'font-medium text-primary' : 'text-warm-light'
            }`
          }
        >
          <span className="text-lg leading-none">{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
