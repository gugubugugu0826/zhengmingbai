/**
 * 执行清单页（v3 §5-F 前后对比）：
 * 步骤勾选（进度云端保存）、顶部进度条、重进恢复、全部完成提示 + 会话完成回写。
 * 收尾项「拍张整理后的照片，存到我的家」：清单末尾常驻引导卡，支持拍照/相册上传
 * （POST /sessions/:id/after-photos，base64 数组，≤9 张），上传后存档到空间档案，
 * 前后对比在空间详情页并排展示。
 */
import { useCallback, useEffect, useRef, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, fileToDataUrl } from '../api';
import { Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { toast } from '../stores/auth';
import type { PlanDetail, PlanItem, SessionDetail } from '../types';

const MAX_AFTER_PHOTOS = 9;
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.8;

/** 上传前压缩（与 Capture 页同一口径）：长边 ≤2000px、JPEG 0.8 */
async function compressImage(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
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
  if (scale >= 1 && !isHeic) return dataUrl;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}

/** 收尾项：拍张整理后的照片，存到「我的家」（after-photos ≤9 张） */
function AfterPhotoCard({ sessionId }: { sessionId: number }): JSX.Element {
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState<string[]>([]);

  const addFiles = async (files: FileList | null): Promise<void> => {
    if (!files || files.length === 0) return;
    const remain = MAX_AFTER_PHOTOS - picked.length - uploaded.length;
    if (remain <= 0) {
      toast(`最多存 ${MAX_AFTER_PHOTOS} 张哦`, 'error');
      return;
    }
    const chosen = Array.from(files).slice(0, remain);
    try {
      const loaded = await Promise.all(chosen.map((f) => compressImage(f)));
      setPicked((prev) => [...prev, ...loaded]);
      if (files.length > remain) toast(`最多 ${MAX_AFTER_PHOTOS} 张，多出来的没加上`, 'info');
    } catch (err) {
      if (err instanceof Error && err.message === 'heic') {
        toast('这张是 HEIC 格式，麻烦在相册里改成 JPG 再传', 'error');
      } else {
        toast('照片读取失败，换一张试试', 'error');
      }
    }
  };

  const removePicked = (index: number): void => {
    setPicked((prev) => prev.filter((_, i) => i !== index));
  };

  const upload = async (): Promise<void> => {
    if (picked.length === 0) return;
    setUploading(true);
    try {
      const result = await api.post<{ photos: Array<{ id: number; url: string }> }>(
        `/sessions/${sessionId}/after-photos`,
        { photos: picked },
      );
      setUploaded((prev) => [...prev, ...result.photos.map((p) => p.url)]);
      setPicked([]);
      toast('整理后的照片已存到我的家，前后对比去空间详情看～', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '上传失败，请稍后再试', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-card border-2 border-dashed border-primary/50 bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="text-[22px]">📷</span>
        <div className="flex-1">
          <div className="text-[15px] font-semibold text-warm">拍张整理后的照片，存到我的家</div>
          <p className="mt-0.5 text-[12px] leading-5 text-warm-light">
            和整理前的照片并排对比，看看自己的战果（最多 {MAX_AFTER_PHOTOS} 张）
          </p>
        </div>
      </div>

      {/* 已上传 + 待上传缩略图 */}
      {(picked.length > 0 || uploaded.length > 0) && (
        <div className="scrollbar-hide mt-3 flex gap-2 overflow-x-auto pb-1">
          {uploaded.map((url, i) => (
            <div key={`up-${i}`} className="relative shrink-0">
              <img
                src={url}
                alt={`已存照片 ${i + 1}`}
                className="h-20 w-20 rounded-btn border border-sage/50 object-cover"
              />
              <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-sage text-[11px] text-white">
                ✓
              </span>
            </div>
          ))}
          {picked.map((url, i) => (
            <div key={`pick-${i}`} className="relative shrink-0">
              <img
                src={url}
                alt={`待上传照片 ${i + 1}`}
                className="h-20 w-20 rounded-btn border border-soft object-cover"
              />
              <button
                type="button"
                aria-label="移除照片"
                className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-warm text-[11px] text-white"
                onClick={() => removePicked(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-3">
        <button
          type="button"
          className="flex-1 rounded-btn bg-primary py-2.5 text-[13px] font-medium text-white active:bg-primary-dark"
          onClick={() => cameraRef.current?.click()}
        >
          📷 拍照
        </button>
        <button
          type="button"
          className="flex-1 rounded-btn border border-primary bg-card py-2.5 text-[13px] font-medium text-primary active:bg-soft"
          onClick={() => albumRef.current?.click()}
        >
          🖼️ 相册选择
        </button>
      </div>
      {picked.length > 0 && (
        <button
          type="button"
          disabled={uploading}
          className="mt-3 w-full rounded-btn bg-sage py-2.5 text-[13px] font-medium text-white active:bg-sage-dark disabled:opacity-60"
          onClick={() => void upload()}
        >
          {uploading ? '正在存档…' : `存到我的家（${picked.length} 张）`}
        </button>
      )}
      <input
        ref={cameraRef}
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
        ref={albumRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        multiple
        className="hidden"
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

export default function TodoListPage(): JSX.Element {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [progress, setProgress] = useState({ total: 0, checked: 0 });
  const [completed, setCompleted] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      const detail = await api.get<SessionDetail>(`/sessions/${sessionId}`);
      setSession(detail);
      if (!detail.plan) {
        navigate(`/confirm/${sessionId}`, { replace: true });
        return;
      }
      setPlan(detail.plan);
      setProgress(detail.plan.todo_progress);
      setCompleted(detail.status === 'done');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '清单加载失败', 'error');
      navigate('/home', { replace: true });
    }
  }, [sessionId, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!session || !plan) return <Loading text="正在打开清单…" />;

  const steps = plan.items
    .filter((i) => i.item_type === 'step' && i.status !== 'rejected')
    .sort((a, b) => a.sort - b.sort);

  const toggle = async (item: PlanItem): Promise<void> => {
    const nextChecked = item.checked !== 1;
    // 乐观更新
    setPlan((prev) =>
      prev
        ? {
            ...prev,
            items: prev.items.map((i) => (i.id === item.id ? { ...i, checked: nextChecked ? 1 : 0 } : i)),
          }
        : prev,
    );
    setProgress((prev) => ({
      total: prev.total,
      checked: prev.checked + (nextChecked ? 1 : -1),
    }));
    try {
      const result = await api.patch<{ total: number; checked: number }>(
        `/plans/items/${item.id}/check`,
        { checked: nextChecked },
      );
      setProgress(result);
      if (nextChecked) toast('又搞定一步，继续保持～', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败，请稍后再试', 'error');
      void load(); // 失败回滚：重新拉取
    }
  };

  const allDone = progress.total > 0 && progress.checked >= progress.total;

  const finishSession = async (): Promise<void> => {
    try {
      await api.post(`/sessions/${session.id}/complete`);
      setCompleted(true);
      toast('太棒了！这个空间整明白了', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败', 'error');
    }
  };

  const percent = progress.total === 0 ? 0 : Math.round((progress.checked / progress.total) * 100);

  return (
    <div className="w-full max-w-3xl">
      <PageHeader title="执行清单" onBack={() => navigate(`/plan/${session.id}`)} back />

      {/* 顶部进度 */}
      <div className="mx-5 mt-2 rounded-card bg-card p-4 shadow-card md:mx-0">
        <div className="mb-2 flex items-end justify-between">
          <div className="text-[15px] font-semibold text-warm">
            已完成 {progress.checked}/{progress.total}
          </div>
          {progress.checked > 0 && !allDone && (
            <div className="text-[12px] text-warm-light">上次收拾到第 {progress.checked} 步，继续加油</div>
          )}
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-soft">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* 步骤清单（桌面两列） */}
      <div className="mx-5 mt-5 grid gap-3 md:mx-0 md:grid-cols-2">
        {steps.map((item) => {
          const content = item.content as { no?: number; action?: string; est_minutes?: number };
          const checked = item.checked === 1;
          return (
            <button
              key={item.id}
              type="button"
              className={`flex w-full items-center gap-3 rounded-card p-4 text-left shadow-card transition-colors ${
                checked ? 'bg-sage/15' : 'bg-card'
              }`}
              onClick={() => void toggle(item)}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[13px] ${
                  checked ? 'pop-check border-primary bg-primary text-white' : 'border-soft bg-cream'
                }`}
              >
                {checked ? '✓' : ''}
              </span>
              <span className="flex-1">
                <span className={`block text-[14px] ${checked ? 'text-warm-light line-through' : 'text-warm'}`}>
                  {content.no}. {content.action}
                </span>
                <span className="mt-0.5 block text-[12px] text-warm-light">
                  约 {content.est_minutes ?? 10} 分钟
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 收尾项：拍张整理后的照片，存到我的家（前后对比存档） */}
      <div className="mx-5 mt-5 md:mx-0">
        <AfterPhotoCard sessionId={session.id} />
      </div>

      {/* 全部完成提示 */}
      {allDone && (
        <div className="mx-5 mt-6 md:mx-0">
          {completed ? (
            <div className="rounded-card border border-sage/40 bg-sage/15 p-5 text-center">
              <div className="mb-1 text-3xl">🎉</div>
              <div className="text-[16px] font-semibold text-warm">搞定！给自己点个赞</div>
              <div className="mt-1 text-[13px] text-warm-light">30 天后我再来看看你。</div>
              <button
                type="button"
                className="mt-4 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white active:bg-primary-dark md:mx-auto md:max-w-xs"
                onClick={() => navigate(`/spaces/${session.space_id}`)}
              >
                去看看前后对比
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="w-full rounded-btn bg-primary py-4 text-[16px] font-semibold text-white shadow-card active:bg-primary-dark md:mx-auto md:block md:max-w-md"
              onClick={() => void finishSession()}
            >
              全部搞定，标记完成 🎉
            </button>
          )}
        </div>
      )}
    </div>
  );
}
