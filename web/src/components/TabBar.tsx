import { NavLink } from 'react-router-dom';

const TABS = [
  { to: '/home', label: '首页', icon: '🏠' },
  { to: '/spaces', label: '我的空间', icon: '🗂️' },
  { to: '/account', label: '账号', icon: '👤' },
];

/** 底部导航栏（手机容器内） */
export function TabBar(): JSX.Element {
  return (
    <nav className="fixed bottom-0 left-1/2 z-30 flex w-full max-w-md -translate-x-1/2 border-t border-soft bg-card/95 backdrop-blur">
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
