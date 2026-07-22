import { useNavigate } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  /** 副标题（桌面档标题下方一行说明文字） */
  subtitle?: string;
  right?: JSX.Element;
  onBack?: () => void;
  /**
   * 是否显示返回按钮：
   * - undefined（默认）：手机档显示返回按钮，桌面档（≥768px 有侧导航）隐藏
   * - true：三档都显示
   * - false：三档都隐藏
   */
  back?: boolean;
}

/** 页面顶部栏（返回 + 标题；桌面档隐藏返回、标题左对齐加大） */
export function PageHeader({ title, subtitle, right, onBack, back }: PageHeaderProps): JSX.Element {
  const navigate = useNavigate();
  const showBack = back === true;
  return (
    <div className="sticky top-0 z-20 flex items-center gap-2 bg-cream/95 px-5 py-3 backdrop-blur md:bg-transparent md:px-0 md:py-0 md:backdrop-blur-none">
      <button
        type="button"
        aria-label="返回"
        className={`h-8 w-8 items-center justify-center rounded-full text-warm active:bg-soft ${
          showBack ? 'flex' : back === false ? 'hidden' : 'flex md:hidden'
        }`}
        onClick={() => (onBack ? onBack() : navigate(-1))}
      >
        ‹
      </button>
      <div className="flex-1 md:pb-5 md:pt-1">
        <div
          className={`text-[17px] font-semibold text-warm md:text-[24px] ${
            showBack || back !== false ? 'text-center md:text-left' : 'text-left'
          }`}
        >
          {title}
        </div>
        {subtitle ? (
          <p
            className={`mt-0.5 text-[12px] text-warm-light md:text-[13px] ${
              showBack || back !== false ? 'text-center md:text-left' : 'text-left'
            }`}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
      <div className="flex h-8 w-8 items-center justify-center md:hidden">{right}</div>
      {right ? <div className="hidden items-center md:flex">{right}</div> : null}
    </div>
  );
}
