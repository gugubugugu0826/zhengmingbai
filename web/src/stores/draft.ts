/**
 * 拍照草稿：Capture → Confirm 之间传递未落库的空间类型与照片（base64 dataURL）。
 * 会话在确认页选定偏好后才创建（后端 granularity/discard_mode/output_forms 仅在建会话时可写）。
 */
import { create } from 'zustand';

export interface CaptureDraft {
  spaceType: string;
  photos: string[]; // data:image/...;base64,...
  /** R49：1=保留到我的家 0=分析完即删（缺省由后端按用户全局偏好决定） */
  keepPhotos?: 0 | 1;
}

interface DraftState {
  draft: CaptureDraft | null;
  setDraft: (draft: CaptureDraft) => void;
  clearDraft: () => void;
}

export const useDraftStore = create<DraftState>((set) => ({
  draft: null,
  setDraft(draft) {
    set({ draft });
  },
  clearDraft() {
    set({ draft: null });
  },
}));
