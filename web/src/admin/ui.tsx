/**
 * admin 后台通用小组件：数字卡 / 弹层 / 空态。
 */
import type { JSX, ReactNode } from 'react';

export function StatCard({ label, value, hint }: { label: string; value: string | number; hint?: string }): JSX.Element {
  return (
    <div className="rounded-card bg-card p-5 shadow-card">
      <div className="text-[13px] text-warm-light">{label}</div>
      <div className="mt-1 text-[28px] font-semibold leading-none text-warm">{value}</div>
      {hint ? <div className="mt-1.5 text-[12px] text-warm-light">{hint}</div> : null}
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
        className={`max-h-[85vh] w-full overflow-y-auto rounded-card bg-card p-5 shadow-card ${
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

/** 表格单元格统一样式 */
export const thCls = 'px-3 py-2 text-left text-[12px] font-medium text-warm-light';
export const tdCls = 'px-3 py-2.5 text-[13px] text-warm';
export const tableCls = 'w-full border-collapse';
export const cardCls = 'rounded-card bg-card shadow-card';
export const inputCls =
  'rounded-btn border border-soft bg-cream px-3 py-2 text-[13px] text-warm outline-none focus:border-primary';
export const btnPrimaryCls =
  'rounded-btn bg-primary px-4 py-2 text-[13px] font-medium text-white active:bg-primary-dark disabled:opacity-50';
export const btnGhostCls =
  'rounded-btn border border-soft px-4 py-2 text-[13px] text-warm active:bg-soft disabled:opacity-50';
