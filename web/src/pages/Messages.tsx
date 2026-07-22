/**
 * 站内消息列表（R48）：复查提醒等消息，"去看看"跳 link，"我知道了"标已读。
 * 接口约定：GET /messages、POST /messages/:id/read（批次B后端，结构按架构文档 2.2.4）。
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

export default function MessagesPage(): JSX.Element {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<MessageItem[] | null>(null);

  const load = (): void => {
    api
      .get<MessageItem[]>('/messages')
      .then(setMessages)
      .catch((err: unknown) => {
        toast(err instanceof ApiError ? err.message : '消息加载失败', 'error');
        setMessages([]);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  return (
    <div className="flex min-h-full flex-1 flex-col pb-6">
      <PageHeader title="消息" onBack={() => navigate('/home')} />
      <div className="flex-1 space-y-3 px-5 pt-2">
        {messages === null ? (
          <Loading />
        ) : messages.length === 0 ? (
          <Empty text="还没有消息" hint="整理完 30 天后，我会在这里提醒你回去看看" />
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-card bg-card p-4 shadow-card ${msg.is_read === 0 ? 'border-l-4 border-primary' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="text-[15px] font-medium text-warm">{msg.title}</div>
                {msg.is_read === 0 && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" />}
              </div>
              <p className="mt-1.5 text-[13px] leading-5 text-warm-light">{msg.content}</p>
              <div className="mt-3 flex gap-2">
                {msg.link && (
                  <button
                    type="button"
                    className="flex-1 rounded-btn bg-primary py-2 text-[13px] font-medium text-white active:bg-primary-dark"
                    onClick={() => void open(msg)}
                  >
                    去看看
                  </button>
                )}
                {msg.is_read === 0 && (
                  <button
                    type="button"
                    className={`rounded-btn border border-soft py-2 text-[13px] text-warm-light active:bg-soft ${
                      msg.link ? 'flex-1' : 'w-full'
                    }`}
                    onClick={() => void markRead(msg)}
                  >
                    我知道了
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
