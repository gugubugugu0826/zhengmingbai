import type { ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  children: ReactNode;
  /** 是否禁止点遮罩关闭（如隐私政策必须表态） */
  lock?: boolean;
}

/** 居中弹层（锁定时不可点遮罩关闭） */
export function Modal({ open, onClose, children, lock = false }: ModalProps): JSX.Element | null {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-6"
      onClick={() => {
        if (!lock) onClose?.();
      }}
    >
      <div
        className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-card bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
