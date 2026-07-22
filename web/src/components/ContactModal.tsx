/**
 * 联系运营弹窗（S2X-T07）：展示运营微信号 + 二维码，供"点数不足"等入口复用。
 * 微信号点击复制到剪贴板，复制成功 toast 提示。
 */
import type { JSX } from 'react';
import { Modal } from './Modal';
import { toast } from '../stores/auth';
import qrUrl from '../assets/contact-wechat-qr.jpg';

export const OPERATOR_WECHAT = 'Lzp0826Gu';

export function ContactModal({ open, onClose }: { open: boolean; onClose: () => void }): JSX.Element | null {
  return (
    <Modal open={open} onClose={onClose}>
      <h3 className="text-center text-[17px] font-semibold text-warm">联系运营获取点数</h3>
      <img src={qrUrl} alt="运营微信二维码" className="mx-auto mt-4 w-48 rounded-card" />
      <p className="mt-3 text-center text-[14px] text-warm">
        微信号：
        <button
          type="button"
          className="font-semibold text-primary-dark underline"
          onClick={() => {
            void navigator.clipboard?.writeText(OPERATOR_WECHAT).catch(() => undefined);
            toast('微信号已复制');
          }}
        >
          {OPERATOR_WECHAT}
        </button>
      </p>
      <p className="mt-1 text-center text-[12px] text-warm-light">
        扫码或复制微信号添加，说一声"整明白补点数"就好～
      </p>
    </Modal>
  );
}
