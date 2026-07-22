/** 居中加载态 */
export function Loading({ text = '加载中…' }: { text?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-warm-light">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-sage border-t-primary" />
      <div className="text-sm">{text}</div>
    </div>
  );
}

/** 空状态插画位 */
export function Empty({ text, hint }: { text: string; hint?: string }): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-card bg-card px-6 py-12 text-center shadow-card">
      <div className="text-4xl">🧺</div>
      <div className="text-[15px] font-medium text-warm">{text}</div>
      {hint ? <div className="text-[13px] text-warm-light">{hint}</div> : null}
    </div>
  );
}
