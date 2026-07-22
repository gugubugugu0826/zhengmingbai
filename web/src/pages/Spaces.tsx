/**
 * 我的空间：空间列表 + 每空间历次整理记录时间线（可点进方案/清单）。
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Empty, Loading } from '../components/Loading';
import { TabBar } from '../components/TabBar';
import { toast } from '../stores/auth';
import {
  SESSION_STATUS_LABELS,
  SPACE_TYPE_LABELS,
  type Space,
  type SpaceHistoryItem,
} from '../types';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 单个空间卡片（展开历史时间线） */
function SpaceCard({ space }: { space: Space }): JSX.Element {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<SpaceHistoryItem[] | null>(null);

  const toggle = (): void => {
    const next = !expanded;
    setExpanded(next);
    if (next && history === null) {
      api
        .get<SpaceHistoryItem[]>(`/spaces/${space.id}/history`)
        .then(setHistory)
        .catch((err: unknown) => {
          toast(err instanceof ApiError ? err.message : '记录加载失败', 'error');
          setHistory([]);
        });
    }
  };

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
    <div className="rounded-card bg-card shadow-card">
      <button type="button" className="flex w-full items-center gap-4 p-4 text-left" onClick={toggle}>
        <div className="flex h-14 w-14 items-center justify-center rounded-btn bg-soft text-2xl">
          {space.space_type === 'kitchen'
            ? '🍳'
            : space.space_type === 'wardrobe'
              ? '👗'
              : space.space_type === 'bedroom'
                ? '🛏️'
                : space.space_type === 'study'
                  ? '📚'
                  : space.space_type === 'bathroom'
                    ? '🛁'
                    : space.space_type === 'living'
                      ? '🛋️'
                      : '🏠'}
        </div>
        <div className="flex-1">
          <div className="text-[15px] font-medium text-warm">{space.name}</div>
          <div className="mt-0.5 text-[12px] text-warm-light">
            {SPACE_TYPE_LABELS[space.space_type] ?? '空间'} · 整理过 {space.session_count} 次
          </div>
        </div>
        <span className={`text-warm-light transition-transform ${expanded ? 'rotate-90' : ''}`}>›</span>
      </button>

      {expanded && (
        <div className="border-t border-soft px-4 pb-4 pt-3">
          {history === null ? (
            <Loading text="正在翻记录…" />
          ) : history.length === 0 ? (
            <div className="py-3 text-center text-[13px] text-warm-light">还没有整理记录</div>
          ) : (
            <div className="space-y-2">
              {history.map((record) => (
                <button
                  key={record.id}
                  type="button"
                  className="flex w-full items-center gap-3 rounded-btn bg-cream p-3 text-left active:bg-soft"
                  onClick={() => openRecord(record)}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-tag bg-soft text-[13px] font-medium text-warm">
                    {formatDate(record.created_at)}
                  </div>
                  <div className="flex-1">
                    <div className="text-[13px] text-warm">
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
      )}
    </div>
  );
}

export default function SpacesPage(): JSX.Element {
  const [spaces, setSpaces] = useState<Space[] | null>(null);

  useEffect(() => {
    api
      .get<Space[]>('/spaces')
      .then(setSpaces)
      .catch((err: unknown) => {
        toast(err instanceof ApiError ? err.message : '空间列表加载失败', 'error');
        setSpaces([]);
      });
  }, []);

  return (
    <div className="flex min-h-full flex-1 flex-col pb-20">
      <div className="px-5 pt-6">
        <h1 className="text-[22px] font-semibold text-warm">我的空间</h1>
        <p className="mt-1 text-[13px] text-warm-light">每个空间的整理历史都在这儿</p>
      </div>

      <div className="mt-5 flex-1 space-y-4 px-5">
        {spaces === null ? (
          <Loading />
        ) : spaces.length === 0 ? (
          <Empty text="还没有空间档案" hint="去首页点「开始整理」，建第一个空间吧" />
        ) : (
          spaces.map((space) => <SpaceCard key={space.id} space={space} />)
        )}
      </div>

      <TabBar />
    </div>
  );
}
