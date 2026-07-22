import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  right?: JSX.Element;
  onBack?: () => void;
}

/** 页面顶部栏（返回 + 标题） */
export function PageHeader({ title, right, onBack }: PageHeaderProps): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 bg-cream/95 px-5 py-3 backdrop-blur">
      <button
        type="button"
        aria-label="返回"
        className="flex h-8 w-8 items-center justify-center rounded-full text-warm active:bg-soft"
        onClick={() => (onBack ? onBack() : navigate(-1))}
      >
        ‹
      </button>
      <div className="flex-1 text-center text-[17px] font-semibold text-warm">{title}</div>
      <div className="flex h-8 w-8 items-center justify-center">{right}</div>
    </div>
  );
}
