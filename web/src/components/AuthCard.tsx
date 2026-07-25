/**
 * v3 登录/注册/忘记密码共享布局（T03，桌面化）：
 * - 桌面（≥768px）：左侧品牌区（emoji + slogan + 特性点）+ 右侧白卡片，卡片 max-w-md
 * - 手机（<768px）：沿用 v2.2 竖排居中
 */
import type { ReactNode } from 'react';

const FEATURES: Array<{ icon: string; text: string }> = [
  { icon: '📸', text: '拍几张照片，AI 帮你看清哪里乱' },
  { icon: '🧠', text: '按你的习惯出一份可执行方案' },
  { icon: '🏡', text: '前后对比，看着家一点点变清爽' },
];

interface AuthCardProps {
  /** 卡片上方的小标题（如「注册整明白」「找回密码」） */
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function AuthCard({ title, subtitle, children }: AuthCardProps): JSX.Element {
  return (
    <div className="flex min-h-screen w-full bg-cream">
      {/* 左侧品牌区（md 及以上显示） */}
      <aside className="hidden w-1/2 flex-col justify-center gap-8 bg-gradient-to-br from-primary to-primary-dark px-16 text-white md:flex lg:px-24">
        <div>
          <div className="mb-3 text-6xl">🧺</div>
          <h1 className="text-[32px] font-semibold tracking-wide">整明白</h1>
          <p className="mt-2 text-[15px] leading-7 opacity-90">
            AI 整理收纳助手
            <br />
            把家一点一点整明白
          </p>
        </div>
        <ul className="space-y-4">
          {FEATURES.map((f) => (
            <li key={f.text} className="flex items-center gap-3 text-[14px] leading-6 opacity-95">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white/15 text-[18px]">
                {f.icon}
              </span>
              {f.text}
            </li>
          ))}
        </ul>
      </aside>

      {/* 右侧表单卡片 */}
      <main className="flex min-h-screen flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          {/* 手机档品牌头 */}
          <div className="mb-6 text-center md:hidden">
            <div className="mb-2 text-5xl">🧺</div>
            <h1 className="text-[24px] font-semibold text-warm">整明白</h1>
            <p className="mt-1 text-[13px] text-warm-light">AI 整理收纳助手 · 把家一点一点整明白</p>
          </div>
          <div className="rounded-card bg-card p-6 shadow-card md:p-8">
            <h2 className="text-[20px] font-semibold text-warm">{title}</h2>
            {subtitle ? <p className="mt-1 text-[13px] text-warm-light">{subtitle}</p> : null}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
