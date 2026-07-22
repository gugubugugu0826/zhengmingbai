import { useToastStore } from '../stores/auth';

const KIND_STYLES: Record<string, string> = {
  info: 'bg-warm text-white',
  success: 'bg-sage-dark text-white',
  error: 'bg-[#B66A5A] text-white',
};

/** 全局 toast（手机容器内居中靠下） */
export function ToastHost(): JSX.Element {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`max-w-xs rounded-btn px-4 py-2.5 text-sm shadow-card ${KIND_STYLES[t.kind]}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
