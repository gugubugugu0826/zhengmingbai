/**
 * 空间详情页（v3 §5-F 前后对比，新页面）：
 * GET /spaces/:id 返回 photos（整理前）+ after_photos（整理后）签名 URL 数组，
 * 两栏并排展示；下方为该空间历次整理记录时间线。
 * "AI 帮你对比"本轮不做（留口子），引导文案：拍张整理后的照片就能对比。
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Empty, Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { toast } from '../stores/auth';
import {
  SESSION_STATUS_LABELS,
  SPACE_TYPE_LABELS,
  type SpaceHistoryItem,
} from '../types';

interface SpaceDetailResp {
  id: number;
  name: string;
  space_type: string;
  created_at: string;
  session_count: number;
  last_session_at: string | null;
  photos: string[];
  after_photos: string[];
  status: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 照片横滑条 */
function PhotoStrip({ photos, alt }: { photos: string[]; alt: string }): JSX.Element {
  if (photos.length === 0) {
    return (
      <div className="flex h-28 items-center justify-center rounded-btn bg-cream text-[12px] text-warm-light">
        还没有照片
      </div>
    );
  }
  return (
    <div className="scrollbar-hide -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {photos.map((url, i) => (
        <img
          key={`${url.slice(-16)}-${i}`}
          src={url}
          alt={`${alt} ${i + 1}`}
          loading="lazy"
          className="h-28 w-28 shrink-0 rounded-btn border border-soft object-cover"
        />
      ))}
    </div>
  );
}

export default function SpaceDetailPage(): JSX.Element {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SpaceDetailResp | null>(null);
  const [history, setHistory] = useState<SpaceHistoryItem[] | null>(null);

  useEffect(() => {
    api
      .get<SpaceDetailResp>(`/spaces/${spaceId}`)
      .then(setDetail)
      .catch((err: unknown) => {
        toast(err instanceof ApiError ? err.message : '空间加载失败', 'error');
        navigate('/spaces', { replace: true });
      });
    api
      .get<SpaceHistoryItem[]>(`/spaces/${spaceId}/history`)
      .then(setHistory)
      .catch(() => setHistory([]));
  }, [spaceId, navigate]);

  if (!detail) return <Loading text="正在打开空间…" />;

  const openRecord = (record: SpaceHistoryItem): void => {
    if (record.status === 'done' || record.status === 'executing') {
      navigate(`/todo/${record.id}`);
    } else if (record.status === 'planned') {
      navigate(`/plan/${record.id}`);
    } else {
      navigate(`/confirm/${record.id}`);
    }
  };

  return (
    <div className="w-full max-w-4xl">
      <PageHeader
        title={detail.name}
        subtitle={`${SPACE_TYPE_LABELS[detail.space_type] ?? '空间'} · 整理过 ${detail.session_count} 次`}
        back
      />

      {/* 前后对比 */}
      <div className="mx-5 mt-2 rounded-card bg-card p-5 shadow-card md:mx-0">
        <h2 className="text-[16px] font-semibold text-warm">整理前 vs 整理后</h2>
        <p className="mt-1 text-[12px] text-warm-light">
          {detail.after_photos.length > 0
            ? '看看变化，给自己点个赞～'
            : '还没有整理后的照片。执行清单收尾时拍一张，就能在这里看到对比啦。'}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-tag bg-soft px-2 py-0.5 text-[12px] text-warm-light">整理前</span>
              <span className="text-[12px] text-warm-light">{detail.photos.length} 张</span>
            </div>
            <PhotoStrip photos={detail.photos} alt="整理前照片" />
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-tag bg-sage/30 px-2 py-0.5 text-[12px] text-sage-dark">整理后</span>
              <span className="text-[12px] text-warm-light">{detail.after_photos.length} 张</span>
            </div>
            <PhotoStrip photos={detail.after_photos} alt="整理后照片" />
          </div>
        </div>
      </div>

      {/* 整理记录时间线 */}
      <div className="mx-5 mt-5 md:mx-0">
        <h2 className="mb-3 text-[16px] font-semibold text-warm">整理记录</h2>
        {history === null ? (
          <Loading text="正在翻记录…" />
        ) : history.length === 0 ? (
          <Empty text="还没有整理记录" hint="去首页点「开始整理」来一次吧" />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {history.map((record) => (
              <button
                key={record.id}
                type="button"
                className="flex items-center gap-3 rounded-card bg-card p-4 text-left shadow-card transition-shadow hover:shadow-float"
                onClick={() => openRecord(record)}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-tag bg-soft text-[12px] font-medium text-warm">
                  {formatDate(record.created_at)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] text-warm">
                    {record.granularity === 'item' ? '物品级' : '区域级'}整理 · {record.photo_count} 张照片
                  </div>
                  <div className="text-[12px] text-warm-light">
                    {SESSION_STATUS_LABELS[record.status] ?? record.status}
                    {record.points_charged > 0 ? ` · 花了 ${record.points_charged} 点` : ''}
                  </div>
                </div>
                <span className="text-warm-light">›</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
