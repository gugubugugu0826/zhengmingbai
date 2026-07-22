/**
 * 站内消息（v3 按设计稿改造）：
 * 四个筛选 Tab：全部 / 复查提醒 / 点数变动 / 系统通知（§5-I-3，前端按 type 过滤）。
 * "去看看"跳 link，"我知道了"标已读；未读左侧主色条 + 红点。
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Empty, Loading } from '../components/Loading';
import { PageHeader } from '../components/PageHeader';
import { toast } from '../stores/auth';

interface MessageItem {
  id: number;
  type: string;
  title: string;
  content: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

type FilterTab = 'all' | 'reminder' | 'points' | 'system';

const FILTER_TABS: Array<{ key: FilterTab; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'reminder', label: '复查提醒' },
  { key: 'points', label: '点数变动' },
  { key: 'system', label: '系统通知' },
];

/** 消息 type → 筛选 Tab（宽松匹配，覆盖 reminder_30d / points_* / system 等） */
function matchTab(msg: MessageItem, tab: FilterTab): boolean {
  if (tab === 'all') return true;
  const t = msg.type.toLowerCase();
  if (tab === 'reminder') return t.includes('reminder') || t.includes('review');
  if (tab === 'points') return t.includes('point');
  return t.includes('system') || t === 'notice' || t === 'announcement';
}

const TYPE_ICONS: Record<FilterTab, string> = {
  all: '📮',
  reminder: '🔁',
  points: '🪙',
  system: '📢',
};

function iconOf(msg: MessageItem): string {
  if (matchTab(msg, 'reminder')) return TYPE_ICONS.reminder;
  if (matchTab(msg, 'points')) return TYPE_ICONS.points;
  return TYPE_ICONS.system;
}

export default function MessagesPage(): JSX.Element {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MessageItem[] | null>(null);
  const [tab, setTab] = useState<FilterTab>('all');

  useEffect(() => {
    api
      .get<MessageItem[]>('/messages')
      .then(setMessages)
      .catch((err: unknown) => {
        toast(err instanceof ApiError ? err.message : '消息加载失败', 'error');
        setMessages([]);
      });
  }, []);

  const markRead = async (msg: MessageItem): Promise<void> => {
    if (msg.is_read === 1) return;
    try {
      await api.post(`/messages/${msg.id}/read`);
      setMessages((prev) => prev?.map((m) => (m.id === msg.id ? { ...m, is_read: 1 } : m)) ?? null);
    } catch {
      // 已读失败不打扰用户
    }
  };

  const open = async (msg: MessageItem): Promise<void> => {
    await markRead(msg);
    if (msg.link) {
      navigate(msg.link);
    }
  };

  const filtered = (messages ?? []).filter((m) => matchTab(m, tab));

  return (
    <div className="w-full max-w-3xl">
      <PageHeader title="消息" subtitle="复查提醒、点数变动都在这儿" />

      {/* 筛选 Tab（全部/复查提醒/点数变动/系统通知） */}
      <div className="mx-5 mb-4 flex gap-2 overflow-x-auto md:mx-0">
        {FILTER_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`shrink-0 rounded-pill px-4 py-2 text-[13px] transition-colors ${
              tab === t.key ? 'bg-primary font-medium text-white' : 'bg-card text-warm-light shadow-card'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3 px-5 md:px-0">
        {messages === null ? (
          <Loading />
        ) : filtered.length === 0 ? (
          <Empty
            text={tab === 'all' ? '还没有消息' : `没有${FILTER_TABS.find((t) => t.key === tab)?.label ?? ''}消息`}
            hint="整理完 30 天后，我会在这里提醒你回去看看"
          />
        ) : (
          filtered.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 rounded-card bg-card p-4 shadow-card ${
                msg.is_read === 0 ? 'border-l-4 border-primary' : ''
              }`}
            >
              <span className="mt-0.5 text-[20px]">{iconOf(msg)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[15px] font-medium text-warm">{msg.title}</div>
                  {msg.is_read === 0 && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-danger" />}
                </div>
                <p className="mt-1.5 text-[13px] leading-5 text-warm-light">{msg.content}</p>
                <div className="mt-3 flex gap-2">
                  {msg.link && (
                    <button
                      type="button"
                      className="flex-1 rounded-btn bg-primary py-2 text-[13px] font-medium text-white active:bg-primary-dark md:max-w-40"
                      onClick={() => void open(msg)}
                    >
                      去看看
                    </button>
                  )}
                  {msg.is_read === 0 && (
                    <button
                      type="button"
                      className={`rounded-btn border border-soft py-2 text-[13px] text-warm-light active:bg-soft ${
                        msg.link ? 'flex-1 md:max-w-40' : 'w-full md:max-w-40'
                      }`}
                      onClick={() => void markRead(msg)}
                    >
                      我知道了
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
