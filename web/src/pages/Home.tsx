/**
 * 首页（v3 A4/A5，按设计稿改造）：
 * 欢迎语 + AI 方案 Hero 卡 + 我的家完成度卡片 + 快捷入口 + 消息提醒面板。
 * 桌面：Hero + 侧栏（点数/快捷入口/消息面板）双栏，我的家卡片网格 md:2 desktop:3。
 * 首次进入（privacy_agreed=false）弹隐私政策，不同意不能继续。
 */
import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Empty, Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { toast, useAuthStore } from '../stores/auth';
import { SPACE_TYPE_LABELS, type PublicUser, type Space } from '../types';

interface MessageItem {
  id: number;
  type: string;
  title: string;
  content: string;
  link: string | null;
  is_read: number;
  created_at: string;
}

function formatLastTime(iso: string | null): string {
  if (!iso) return '还没整理过';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return '今天整理过';
  if (days === 1) return '昨天整理过';
  if (days < 30) return `${days} 天前整理过`;
  return `${Math.floor(days / 30)} 个月前整理过`;
}

/** 空间类型 emoji（与 Capture 页一致） */
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

/** 隐私政策弹窗（R19）：同意落 privacy_agreed_at，不同意退出到登录页 */
function PrivacyModal({ user }: { user: PublicUser }): JSX.Element | null {
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const navigate = useNavigate();
  const [agreeing, setAgreeing] = useState(false);

  if (user.privacy_agreed) return null;

  const agree = async (): Promise<void> => {
    setAgreeing(true);
    try {
      await api.post('/auth/privacy/agree');
      setUser({ ...user, privacy_agreed: true });
      toast('感谢信任，我们会好好保护你的照片', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '操作失败，请稍后再试', 'error');
    } finally {
      setAgreeing(false);
    }
  };

  const disagree = (): void => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <Modal open lock>
      <h2 className="mb-3 text-[18px] font-semibold text-warm">隐私政策</h2>
      <div className="mb-5 space-y-2 text-[13px] leading-6 text-warm">
        <p>在你开始使用「整明白」之前，请花一分钟了解我们如何对待你的照片：</p>
        <p>· 照片仅用于 AI 整理分析，不会用于其他任何用途；</p>
        <p>· 照片通过加密传输与签名链接访问，只有你自己看得到；</p>
        <p>· 你可以在设置中开启"分析完即删"，方案生成后照片立刻删除；</p>
        <p>· 任何时候都可以在"我的空间"里删除历史照片与记录。</p>
        <p className="text-warm-light">你的东西你说了算，照片也一样。</p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          className="flex-1 rounded-btn border border-soft py-3 text-[14px] text-warm-light active:bg-soft"
          onClick={disagree}
        >
          暂不使用
        </button>
        <button
          type="button"
          disabled={agreeing}
          className="flex-1 rounded-btn bg-primary py-3 text-[14px] font-medium text-white active:bg-primary-dark disabled:opacity-60"
          onClick={() => void agree()}
        >
          {agreeing ? '请稍等…' : '同意并继续'}
        </button>
      </div>
    </Modal>
  );
}

export default function HomePage(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const balance = useAuthStore((s) => s.balance);
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [messages, setMessages] = useState<MessageItem[]>([]);

  // R31/PRD 4.6：新用户首次进入首页提示注册赠点（只弹一次，localStorage 记忆）
  useEffect(() => {
    if (user && user.is_new_gift_used === 1 && localStorage.getItem('zmb_gift_toast_shown') !== '1') {
      localStorage.setItem('zmb_gift_toast_shown', '1');
      toast('欢迎！已送你 20 点，够做两次区域级整理，先去拍一张试试～', 'success');
    }
  }, [user]);

  useEffect(() => {
    api
      .get<Space[]>('/spaces')
      .then(setSpaces)
      .catch((err: unknown) => {
        toast(err instanceof ApiError ? err.message : '空间列表加载失败', 'error');
        setSpaces([]);
      });
    api
      .get<{ count: number }>('/messages/unread-count')
      .then((d) => setUnread(d.count))
      .catch(() => undefined);
    // 消息提醒面板：最近 3 条
    api
      .get<MessageItem[]>('/messages')
      .then((list) => setMessages(list.slice(0, 3)))
      .catch(() => undefined);
  }, []);

  if (!user) return <Loading />;

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';
  const spaceList = spaces ?? [];
  const totalSessions = spaceList.reduce((sum, s) => sum + s.session_count, 0);

  return (
    <div className="w-full pb-2">
      <PrivacyModal user={user} />

      {/* 欢迎语 */}
      <div className="flex items-end justify-between px-1 pt-4 md:px-0 md:pt-0">
        <div>
          <h1 className="text-[22px] font-semibold text-warm md:text-[26px]">
            {greeting}，{user.nickname || user.username || '朋友'}
          </h1>
          <p className="mt-1 text-[13px] text-warm-light">今天想把哪个角落整明白？</p>
        </div>
        <button
          type="button"
          aria-label="站内消息"
          className="relative text-[22px] md:hidden"
          onClick={() => navigate('/messages')}
        >
          🔔
          {unread > 0 && (
            <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-medium leading-none text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      </div>

      {/* 主区：Hero + 我的家（左）｜ 侧栏（右，桌面档） */}
      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <div className="md:col-span-2">
          {/* AI 方案 Hero 卡 */}
          <div className="rounded-card bg-gradient-to-r from-primary to-primary-dark p-5 text-white shadow-card md:p-6">
            <div className="text-[13px] opacity-85">AI 整理收纳助手</div>
            <h2 className="mt-1 text-[20px] font-semibold leading-8">
              拍几张照片，
              <br className="md:hidden" />
              让 AI 帮你出一份整理方案
            </h2>
            <p className="mt-1 text-[13px] leading-6 opacity-90">
              分好类、标好位置、排好步骤，照着做就行。
            </p>
            <button
              type="button"
              className="mt-4 rounded-btn bg-card px-5 py-2.5 text-[14px] font-semibold text-primary-dark active:bg-tint"
              onClick={() => navigate('/capture')}
            >
              📸 开始整理
            </button>
          </div>

          {/* 我的家完成度卡片 */}
          <div className="mt-5">
            <div className="mb-3 flex items-end justify-between px-1 md:px-0">
              <h2 className="text-[16px] font-semibold text-warm">我的家</h2>
              <Link to="/spaces" className="text-[13px] text-primary">
                全部空间 ›
              </Link>
            </div>
            {spaces === null ? (
              <Loading />
            ) : spaceList.length === 0 ? (
              <Empty text="还没有空间档案" hint="点上方「开始整理」，从第一个房间开始吧" />
            ) : (
              <>
                {/* 完成度总览 */}
                <div className="mb-4 rounded-card bg-card p-4 shadow-card">
                  <div className="flex items-center justify-between">
                    <div className="text-[14px] text-warm">
                      已有 <span className="font-semibold text-primary-dark">{spaceList.length}</span> 个空间
                      · 累计整理 <span className="font-semibold text-primary-dark">{totalSessions}</span> 次
                    </div>
                    <span className="text-[22px]">🏡</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-soft">
                    <div
                      className="h-full rounded-full bg-sage transition-all duration-500"
                      style={{ width: `${Math.min(100, spaceList.length * 12 + totalSessions * 6)}%` }}
                    />
                  </div>
                  <p className="mt-2 text-[12px] text-warm-light">家是一点一点整明白的，继续保持～</p>
                </div>
                {/* 空间卡片网格 */}
                <div className="grid gap-4 md:grid-cols-2 desktop:grid-cols-3">
                  {spaceList.map((space) => (
                    <button
                      key={space.id}
                      type="button"
                      className="flex items-center gap-4 rounded-card bg-card p-4 text-left shadow-card transition-shadow hover:shadow-float"
                      onClick={() => navigate(`/spaces/${space.id}`)}
                    >
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-btn bg-soft text-2xl">
                        {spaceEmoji(space.space_type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[15px] font-medium text-warm">{space.name}</div>
                        <div className="mt-0.5 text-[12px] text-warm-light">
                          {SPACE_TYPE_LABELS[space.space_type] ?? '空间'} · {formatLastTime(space.last_session_at)}
                        </div>
                      </div>
                      <div className="shrink-0 text-[12px] text-warm-light">{space.session_count} 次 ›</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* 侧栏：点数卡 + 快捷入口 + 消息提醒面板 */}
        <aside className="space-y-4">
          {/* 我的点数 */}
          <Link
            to="/store"
            className="block rounded-card bg-card p-4 shadow-card transition-shadow hover:shadow-float"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-warm-light">我的点数</div>
                <div className="mt-0.5 text-[24px] font-semibold text-primary-dark">{balance}</div>
              </div>
              <span className="text-[26px]">🪙</span>
            </div>
            <div className="mt-1 text-[12px] text-warm-light">
              {balance >= 10 ? '够做一次完整的整理啦～' : '快用完啦，去商城看看'}
            </div>
          </Link>

          {/* 快捷入口 */}
          <div className="rounded-card bg-card p-4 shadow-card">
            <h3 className="mb-3 text-[14px] font-semibold text-warm">快捷入口</h3>
            <div className="grid grid-cols-4 gap-2 md:grid-cols-2">
              {[
                { to: '/capture', icon: '📸', label: '开始整理' },
                { to: '/spaces', icon: '🗂️', label: '我的空间' },
                { to: '/store', icon: '🛍️', label: '商城' },
                { to: '/account', icon: '👤', label: '账号' },
              ].map((item) => (
                <button
                  key={item.to}
                  type="button"
                  className="flex flex-col items-center gap-1 rounded-btn bg-cream py-3 text-[12px] text-warm transition-colors hover:bg-tint"
                  onClick={() => navigate(item.to)}
                >
                  <span className="text-[20px]">{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* 消息提醒面板 */}
          <div className="rounded-card bg-card p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-semibold text-warm">
                消息提醒
                {unread > 0 && (
                  <span className="ml-2 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-medium text-white">
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </h3>
              <Link to="/messages" className="text-[12px] text-primary">
                全部 ›
              </Link>
            </div>
            {messages.length === 0 ? (
              <p className="py-3 text-center text-[12px] leading-5 text-warm-light">
                还没有消息
                <br />
                整理完 30 天后，我会提醒你回去看看
              </p>
            ) : (
              <div className="space-y-2">
                {messages.map((msg) => (
                  <button
                    key={msg.id}
                    type="button"
                    className={`w-full rounded-btn bg-cream p-3 text-left transition-colors hover:bg-tint ${
                      msg.is_read === 0 ? 'border-l-2 border-primary' : ''
                    }`}
                    onClick={() => navigate('/messages')}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex-1 truncate text-[13px] font-medium text-warm">{msg.title}</span>
                      {msg.is_read === 0 && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-danger" />}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-warm-light">{msg.content}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
