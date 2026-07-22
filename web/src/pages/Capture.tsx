/**
 * 拍照页：选空间类型 → 拍照/相册上传（1-20 张）→ 创建会话并上传 → 进确认页。
 * 流程：POST /spaces（如无同名空间）→ POST /sessions → POST /sessions/:id/photos。
 */
import { useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { fileToDataUrl } from '../api';
import { Modal } from '../components/Modal';
import { PageHeader } from '../components/PageHeader';
import { toast, useAuthStore } from '../stores/auth';
import { useDraftStore } from '../stores/draft';
import { SPACE_CHOICES, SPACE_TYPE_LABELS } from '../types';

const MAX_PHOTOS = 20;

/** 压缩参数（R51）：长边 ≤2000px、JPEG quality 0.8 */
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.8;

/**
 * 上传前压缩（R51）：canvas 重采样，长边 >2000px 等比缩小，统一转 JPEG 0.8。
 * HEIC：浏览器 canvas 不支持解码时抛错，由调用方提示 PRD 4.4 文案。
 */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  // HEIC/HEIF：多数浏览器 canvas 无法解码，尝试加载失败后给友好提示
  const isHeic = /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('decode-failed'));
    el.src = dataUrl;
  }).catch((err: Error) => {
    if (isHeic) throw new Error('heic');
    throw err;
  });
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  // 已经足够小且不是 HEIC：直接用原图（省一次重编码）
  if (scale >= 1 && !isHeic) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

interface LocalPhoto {
  id: number;
  dataUrl: string;
  name: string;
}

let photoSeq = 1;

const TIPS = [
  { title: '把柜门抽屉都打开', desc: '光线亮一点，AI 看得更清楚～' },
  { title: '全景 + 特写都来几张', desc: '先拍整体，再拍最乱的角落。' },
  { title: '一次最多 20 张', desc: '拍得全一点，方案会更准哦。' },
];

/** 首次进入贴士浮层（localStorage 记忆） */
function TipsOverlay({ onClose }: { onClose: () => void }): JSX.Element {
  const [index, setIndex] = useState(0);
  const tip = TIPS[index];
  const last = index === TIPS.length - 1;
  return (
    <Modal open onClose={onClose}>
      <div className="text-center">
        <div className="mb-2 text-4xl">📸</div>
        <h3 className="text-[17px] font-semibold text-warm">{tip.title}</h3>
        <p className="mt-2 text-[13px] text-warm-light">{tip.desc}</p>
        <div className="mt-4 flex items-center justify-center gap-1.5">
          {TIPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full ${i === index ? 'w-4 bg-primary' : 'w-1.5 bg-soft'}`}
            />
          ))}
        </div>
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            className="flex-1 rounded-btn border border-soft py-2.5 text-[13px] text-warm-light"
            onClick={onClose}
          >
            跳过
          </button>
          <button
            type="button"
            className="flex-1 rounded-btn bg-primary py-2.5 text-[13px] font-medium text-white active:bg-primary-dark"
            onClick={() => (last ? onClose() : setIndex(index + 1))}
          >
            {last ? '知道啦' : '下一条'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function CapturePage(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const [spaceType, setSpaceType] = useState('');
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  // R49/PRD 4.2：默认勾选保留；全局偏好 delete_after_analysis=1 时默认不勾选
  const [keepPhotos, setKeepPhotos] = useState(() => user?.delete_after_analysis !== 1);
  const [showTips, setShowTips] = useState(
    () => localStorage.getItem('zmb_capture_tips_seen') !== '1',
  );
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const albumInputRef = useRef<HTMLInputElement>(null);

  const closeTips = (): void => {
    localStorage.setItem('zmb_capture_tips_seen', '1');
    setShowTips(false);
  };

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    const remain = MAX_PHOTOS - photos.length;
    if (remain <= 0) {
      toast(`最多 ${MAX_PHOTOS} 张哦`, 'error');
      return;
    }
    const picked = Array.from(files).slice(0, remain);
    try {
      const loaded = await Promise.all(
        picked.map(async (file) => ({
          id: photoSeq++,
          dataUrl: await compressImage(file),
          name: file.name,
        })),
      );
      setPhotos((prev) => [...prev, ...loaded]);
      if (files.length > remain) toast(`最多 ${MAX_PHOTOS} 张，多出来的没加上`, 'info');
    } catch (err) {
      // PRD 4.4：HEIC 格式友好提示
      if (err instanceof Error && err.message === 'heic') {
        toast('这张是 HEIC 格式，我帮你转一下；转不了的话，麻烦在相册里改成 JPG 再传。', 'error');
      } else {
        toast('照片读取失败，换一张试试', 'error');
      }
    }
  };

  const removePhoto = (id: number): void => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
  };

  const submit = (): void => {
    if (!spaceType) {
      toast('先选一个空间类型吧', 'error');
      return;
    }
    if (photos.length === 0) {
      toast('先拍至少 1 张照片哦', 'error');
      return;
    }
    // 存草稿进确认页：偏好在确认页选定后才创建会话并上传照片（R49 勾选值一并传递）
    useDraftStore.getState().setDraft({
      spaceType,
      photos: photos.map((p) => p.dataUrl),
      keepPhotos: keepPhotos ? 1 : 0,
    });
    navigate('/confirm/new');
  };

  return (
    <div className="w-full max-w-4xl">
      <PageHeader title="开始整理" subtitle="选空间、拍照片，AI 帮你出方案" />
      {showTips && <TipsOverlay onClose={closeTips} />}

      {/* 空间类型选择 */}
      <div className="px-5 pt-2 md:px-0">
        <h2 className="mb-1 text-[16px] font-semibold text-warm">要整理哪里？</h2>
        <p className="mb-3 text-[13px] text-warm-light">选一个空间类型，AI 会按它的习惯出方案</p>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
          {SPACE_CHOICES.map((choice) => (
            <button
              key={choice.type}
              type="button"
              className={`flex flex-col items-center gap-1 rounded-card border-2 bg-card py-3.5 text-[14px] shadow-card ${
                spaceType === choice.type ? 'border-primary text-primary-dark' : 'border-transparent text-warm'
              }`}
              onClick={() => setSpaceType(choice.type)}
            >
              <span className="text-xl">{choice.emoji}</span>
              {choice.label}
            </button>
          ))}
        </div>
      </div>

      {/* 拍照 / 相册 */}
      <div className="mt-6 px-5 md:px-0">
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h2 className="text-[16px] font-semibold text-warm">拍几张照片</h2>
            <p className="mt-0.5 text-[13px] text-warm-light">
              把柜门抽屉都打开，光线亮一点，AI 看得更清楚～
            </p>
          </div>
          <span className="rounded-tag bg-soft px-2 py-1 text-[12px] text-warm">
            {photos.length}/{MAX_PHOTOS}
          </span>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-btn bg-primary py-3.5 text-[15px] font-medium text-white active:bg-primary-dark"
            onClick={() => cameraInputRef.current?.click()}
          >
            📷 拍照
          </button>
          <button
            type="button"
            className="flex flex-1 items-center justify-center gap-2 rounded-btn border border-primary bg-card py-3.5 text-[15px] font-medium text-primary active:bg-soft"
            onClick={() => albumInputRef.current?.click()}
          >
            🖼️ 相册选择
          </button>
        </div>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={albumInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic"
          multiple
          className="hidden"
          onChange={(e) => {
            void addFiles(e.target.files);
            e.target.value = '';
          }}
        />

        {/* 缩略图横排 */}
        {photos.length > 0 && (
          <div className="scrollbar-hide mt-4 flex gap-3 overflow-x-auto pb-1">
            {photos.map((photo) => (
              <div key={photo.id} className="relative shrink-0">
                <img
                  src={photo.dataUrl}
                  alt={photo.name}
                  className="h-20 w-20 rounded-btn border border-soft object-cover"
                />
                <button
                  type="button"
                  aria-label="删除照片"
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-warm text-[11px] text-white"
                  onClick={() => removePhoto(photo.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 常驻隐私提示 */}
        <div className="mt-4 rounded-card bg-soft/70 px-4 py-3 text-[12px] leading-5 text-warm-light">
          🔒 避免拍到证件、银行卡、他人面部。照片只用于本次整理分析，你可以随时删除。
        </div>
      </div>

      {/* R49 保留到我的家勾选（PRD 4.2：默认勾选、正向文案） */}
      <div className="mt-6 px-5 md:px-0">
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-card bg-card p-4 text-left shadow-card"
          onClick={() => setKeepPhotos((v) => !v)}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[12px] ${
              keepPhotos ? 'border-primary bg-primary text-white' : 'border-soft bg-cream'
            }`}
          >
            {keepPhotos ? '✓' : ''}
          </span>
          <span>
            <span className="block text-[14px] font-medium text-warm">
              把这次整理保留到「我的家」，方便以后回看
            </span>
            <span className="mt-0.5 block text-[13px] leading-5 text-warm-light">
              不勾选的话，分析完成后照片就会删掉，不会留在服务器上。
            </span>
          </span>
        </button>
      </div>

      {/* 提交 */}
      <div className="mt-8 px-5 md:px-0">
        <button
          type="button"
          disabled={photos.length === 0 || !spaceType}
          className="w-full rounded-btn bg-primary py-4 text-[16px] font-semibold text-white shadow-card active:bg-primary-dark disabled:opacity-50 md:mx-auto md:block md:max-w-md"
          onClick={submit}
        >
          好了，下一步（{photos.length} 张）
        </button>
      </div>
    </div>
  );
}
