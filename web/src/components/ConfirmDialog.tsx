/**
 * v3 删除确认弹窗（设计稿 p34 扩展组件）：
 * 「确认删除？删除后不可恢复，确定要继续吗？」取消 / 确认删除（danger 色）。
 * 通用化：title/desc/confirmText 可覆盖，也适用于其他危险操作确认。
 */
import { useState } from 'react';
import { Modal } from './Modal';

interface ConfirmDialogProps {
  open: boolean;
  /** 取消回调（点遮罩/取消按钮） */
  onCancel: () => void;
  /** 确认回调；返回 Promise 时按钮进入 loading，resolve 后自动关闭由父级控制 open */
  onConfirm: () => void | Promise<void>;
  title?: string;
  desc?: string;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title = '确认删除？',
  desc = '删除后不可恢复，确定要继续吗？',
  confirmText = '确认删除',
  cancelText = '取消',
}: ConfirmDialogProps): JSX.Element {
  const [busy, setBusy] = useState(false);

  const handleConfirm = (): void => {
    const r = onConfirm();
    if (r instanceof Promise) {
      setBusy(true);
      r.finally(() => setBusy(false));
    }
  };

  return (
    <Modal open={open} onClose={onCancel}>
      <h2 className="mb-1.5 text-[17px] font-semibold text-warm">{title}</h2>
      <p className="mb-5 text-[13px] leading-6 text-warm-light">{desc}</p>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          className="flex-1 rounded-md border border-border-subtle py-3 text-[14px] text-warm-light active:bg-tint disabled:opacity-60"
          onClick={onCancel}
        >
          {cancelText}
        </button>
        <button
          type="button"
          disabled={busy}
          className="flex-1 rounded-md bg-danger py-3 text-[14px] font-medium text-white active:opacity-90 disabled:opacity-60"
          onClick={handleConfirm}
        >
          {busy ? '处理中…' : confirmText}
        </button>
      </div>
    </Modal>
  );
}
