/**
 * admin 后台通用小组件：数字卡 / 弹层 / 空态 / 页头。
 * v3 T04：tokens 全面切换到 v3 设计系统（border-subtle/soft、圆角阶梯、阴影），
 * 新增 PageTitle 统一「页标题 + 副标题 + 右侧操作位」；状态徽标统一 sage/danger 色系。
 */
import type { JSX, ReactNode } from 'react';

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }): JSX.Element {
  return (
    <div className="rounded-lg bg-card p-5 shadow-card">
      <div className="text-[13px] text-warm-light">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-none text-warm">{value}</div>
      {hint ? <div className="mt-1.5 text-[12px] text-warm-light">{hint}</div> : null}
    </div>
  );
}

/** 后台页头：大标题 + 副标题 + 右侧操作区（设计稿：左对齐大标题） */
export function PageTitle({ title, desc, extra }: { title: string; desc?: string; extra?: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-[22px] font-bold text-warm">{title}</h1>
        {desc ? <p className="mt-1 text-[13px] text-warm-light">{desc}</p> : null}
      </div>
      {extra ? <div className="flex items-center gap-2">{extra}</div> : null}
    </div>
  );
}

/** 后台弹层（比 C 端宽，适配表格/表单） */
export function AdminModal({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}): JSX.Element | null {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
      <div
        className={`max-h-[85vh] w-full overflow-y-auto rounded-lg bg-card p-5 shadow-float ${
          wide ? 'max-w-2xl' : 'max-w-md'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-semibold text-warm">{title}</h3>
          <button type="button" className="text-[18px] text-warm-light hover:text-warm" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function AdminEmpty({ text }: { text: string }): JSX.Element {
  return <div className="py-10 text-center text-[13px] text-warm-light">{text}</div>;
}

/** 状态徽标（统一 sage 成功 / danger 失败 / soft 弱态色系） */
export function StatusBadge({ kind, text }: { kind: 'success' | 'danger' | 'muted' | 'warning'; text: string }): JSX.Element {
  const cls = {
    success: 'bg-sage/20 text-sage-dark',
    danger: 'bg-danger/10 text-danger',
    muted: 'bg-soft text-warm-light',
    warning: 'bg-warning/15 text-warning',
  }[kind];
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-[11px] ${cls}`}>{text}</span>;
}

/** 表格单元格统一样式 */
export const thCls = 'px-3 py-2 text-left text-[12px] font-medium text-warm-light';
export const tdCls = 'px-3 py-2.5 text-[13px] text-warm';
export const tableCls = 'w-full border-collapse';
export const cardCls = 'rounded-lg bg-card shadow-card';
export const inputCls =
  'rounded-md border border-border-subtle bg-card px-3 py-2 text-[13px] text-warm outline-none transition-colors placeholder:text-warm-light focus:border-primary';
export const btnPrimaryCls =
  'rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-primary-dark active:bg-primary-dark disabled:opacity-50';
export const btnGhostCls =
  'rounded-md border border-border-subtle px-4 py-2 text-[13px] text-warm transition-colors hover:bg-soft active:bg-soft disabled:opacity-50';
