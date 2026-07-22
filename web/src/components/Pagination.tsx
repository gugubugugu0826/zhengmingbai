/**
 * v3 分页器（设计稿 p34 扩展组件）：
 * ‹上一页  1  2  …  8  下一页›  跳转到 [n] 页
 * 当前页主色实心；页码窗口 7 格（首尾 + 当前 ±1 + 省略号）。
 */
import { useState, type FormEvent } from 'react';

interface PaginationProps {
  /** 当前页（1 起） */
  page: number;
  /** 总条数 */
  total: number;
  /** 每页条数（默认 20） */
  pageSize?: number;
  onChange: (page: number) => void;
  /** 是否展示「跳转到 n 页」（默认 true，设计稿含跳转框） */
  showJumper?: boolean;
}

/** 生成页码序列：[1, '…', 4, 5, 6, '…', 20] 形式，窗口 7 格 */
function buildPages(current: number, totalPages: number): Array<number | '…'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages: Array<number | '…'> = [1];
  const lo = Math.max(2, current - 1);
  const hi = Math.min(totalPages - 1, current + 1);
  if (lo > 2) pages.push('…');
  for (let p = lo; p <= hi; p += 1) pages.push(p);
  if (hi < totalPages - 1) pages.push('…');
  pages.push(totalPages);
  return pages;
}

export function Pagination({
  page,
  total,
  pageSize = 20,
  onChange,
  showJumper = true,
}: PaginationProps): JSX.Element | null {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const [jump, setJump] = useState('');

  if (totalPages <= 1) return null;

  const go = (p: number): void => {
    const target = Math.min(totalPages, Math.max(1, p));
    if (target !== page) onChange(target);
  };

  const handleJump = (e: FormEvent): void => {
    e.preventDefault();
    const n = Number.parseInt(jump, 10);
    if (Number.isFinite(n)) {
      go(n);
      setJump('');
    }
  };

  const btnBase =
    'flex h-9 min-w-9 items-center justify-center rounded-md border border-border-subtle bg-card px-2.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-label="上一页"
        disabled={page <= 1}
        className={`${btnBase} text-warm-secondary hover:border-primary`}
        onClick={() => go(page - 1)}
      >
        ‹ 上一页
      </button>

      {buildPages(page, totalPages).map((p, i) =>
        p === '…' ? (
          <span key={`ellipsis-${i}`} className="px-1 text-[13px] text-warm-light">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            aria-current={p === page ? 'page' : undefined}
            className={`${btnBase} ${
              p === page
                ? 'border-primary bg-primary font-medium text-white'
                : 'text-warm-secondary hover:border-primary'
            }`}
            onClick={() => go(p)}
          >
            {p}
          </button>
        ),
      )}

      <button
        type="button"
        aria-label="下一页"
        disabled={page >= totalPages}
        className={`${btnBase} text-warm-secondary hover:border-primary`}
        onClick={() => go(page + 1)}
      >
        下一页 ›
      </button>

      {showJumper && (
        <form onSubmit={handleJump} className="ml-1 flex items-center gap-1.5 text-[13px] text-warm-light">
          跳转到
          <input
            type="number"
            min={1}
            max={totalPages}
            value={jump}
            onChange={(e) => setJump(e.target.value)}
            className="h-9 w-14 rounded-md border border-border-subtle bg-card px-2 text-center text-[13px] text-warm outline-none focus:border-primary"
            aria-label="跳转到指定页"
          />
          页
        </form>
      )}
    </div>
  );
}
