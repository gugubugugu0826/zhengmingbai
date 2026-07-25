/** 居中加载态 */
export function Loading({ text = '加载中…' }: { text?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-warm-light">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-primary" />
      <div className="text-sm">{text}</div>
    </div>
  );
}

/** 空状态插画位（v3.2.1：emoji → SVG） */
export function Empty({ text, hint }: { text: string; hint?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card bg-card px-6 py-12 text-center shadow-card">
      <div className="flex h-16 w-16 items-center justify-center rounded-pill bg-tint">
        <svg
          width="36"
          height="36"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#B08968"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 9h16l-1.4 9.3a2.2 2.2 0 0 1-2.2 1.9H7.6a2.2 2.2 0 0 1-2.2-1.9L4 9z" fill="#D4A574" stroke="none"/>
          <path d="M4 9h16l-1.4 9.3a2.2 2.2 0 0 1-2.2 1.9H7.6a2.2 2.2 0 0 1-2.2-1.9L4 9z"/>
          <path d="M8 9V7.5a4 4 0 0 1 8 0V9"/>
          <path d="M3.5 9h17" />
          <path d="M9 13v3.5M12 13v3.5M15 13v3.5" />
        </svg>
      </div>
      <div className="text-[15px] font-medium text-warm">{text}</div>
      {hint ? <div className="text-[13px] text-warm-light">{hint}</div> : null}
    </div>
  );
}
