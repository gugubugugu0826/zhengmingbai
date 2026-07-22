/**
 * 我的空间（v3 按设计稿改造）：
 * 空间卡片网格（md:2 desktop:3），点击进入空间详情页（/spaces/:id，
 * 含前后对比 + 整理记录时间线）。
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Empty, Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { toast } from '../stores/auth';
import { SPACE_TYPE_LABELS, type Space } from '../types';

function formatLastTime(iso: string | null): string {
  if (!iso) return '还没整理过';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return '今天整理过';
  if (days === 1) return '昨天整理过';
  if (days < 30) return `${days} 天前整理过`;
  return `${Math.floor(days / 30)} 个月前整理过`;
}

function spaceEmoji(spaceType: string): string {
  const map: Record<string, string> = {
    kitchen: '🍳',
    wardrobe: '👗',
    bedroom: '🛏️',
    study: '📚',
    bathroom: '🛁',
    living: '🛋️',
    office: '💼',
    shop: '🏪',
    warehouse: '📦',
  };
  return map[spaceType] ?? '🏠';
}

export default function SpacesPage(): JSX.Element {
  const navigate = useNavigate();
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
    <div className="w-full">
      <PageHeader title="我的空间" subtitle="每个空间的整理历史和前后对比都在这儿" />

      <div className="mt-2 px-5 md:px-0">
        {spaces === null ? (
          <Loading />
        ) : spaces.length === 0 ? (
          <Empty text="还没有空间档案" hint="去首页点「开始整理」，建第一个空间吧" />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 desktop:grid-cols-3">
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className="rounded-card bg-card p-5 text-left shadow-card transition-shadow hover:shadow-float"
                onClick={() => navigate(`/spaces/${space.id}`)}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-btn bg-soft text-2xl">
                    {spaceEmoji(space.space_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-medium text-warm">{space.name}</div>
                    <div className="mt-0.5 text-[12px] text-warm-light">
                      {SPACE_TYPE_LABELS[space.space_type] ?? '空间'}
                    </div>
                  </div>
                  <span className="text-warm-light">›</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-soft/60 pt-3 text-[12px] text-warm-light">
                  <span>整理过 {space.session_count} 次</span>
                  <span>{formatLastTime(space.last_session_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
