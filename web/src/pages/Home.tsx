/**
 * 首页：问候语 + 新用户礼包标签 + "我的家"空间卡片流 + "开始整理"大按钮。
 * 首次进入（privacy_agreed=false）弹隐私政策，不同意不能继续。
 */
import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { Empty, Loading } from '../components/Loading';
import { Modal } from '../components/Modal';
import { TabBar } from '../components/TabBar';
import { toast, useAuthStore } from '../stores/auth';
import { SPACE_TYPE_LABELS, type PublicUser, type Space } from '../types';

function formatLastTime(iso: string | null): string {
  if (!iso) return '还没整理过';
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return '今天整理过';
  if (days === 1) return '昨天整理过';
  if (days < 30) return `${days} 天前整理过`;
  return `${Math.floor(days / 30)} 个月前整理过`;
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
  const setUser = useAuthStore((s) => s.setUser);
  const balance = useAuthStore((s) => s.balance);
  const navigate = useNavigate();
  const [spaces, setSpaces] = useState<Space[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [showSettings, setShowSettings] = useState(false);

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
    // 站内消息未读数（R48 铃铛红点；接口未就绪时静默失败）
    api
      .get<{ count: number }>('/messages/unread-count')
      .then((d) => setUnread(d.count))
      .catch(() => undefined);
  }, []);

  /** 设置开关：保存失败回滚 */
  const toggleSetting = (key: 'reminder_enabled' | 'delete_after_analysis', value: 0 | 1): void => {
    if (!user) return;
    const prev = user;
    setUser({ ...user, [key]: value });
    api
      .patch<PublicUser>('/auth/settings', { [key]: value })
      .then((fresh) => setUser(fresh))
      .catch((err: unknown) => {
        setUser(prev);
        toast(err instanceof ApiError ? err.message : '设置保存失败', 'error');
      });
  };

  if (!user) return <Loading />;

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div className="flex min-h-full flex-1 flex-col pb-20">
      <PrivacyModal user={user} />

      <div className="px-5 pt-6">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-[22px] font-semibold text-warm">
              {greeting}，{user.nickname || '朋友'}
            </h1>
            <p className="mt-1 text-[13px] text-warm-light">今天想把哪个角落整明白？</p>
          </div>
          <div className="flex items-start gap-3">
            {/* 站内消息铃铛（R48） */}
            <button
              type="button"
              aria-label="站内消息"
              className="relative mt-0.5 text-[20px]"
              onClick={() => navigate('/messages')}
            >
              🔔
              {unread > 0 && (
                <span className="absolute -right-1.5 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-medium leading-none text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            <button
              type="button"
              aria-label="设置"
              className="mt-0.5 text-[20px]"
              onClick={() => setShowSettings(true)}
            >
              ⚙️
            </button>
            <Link
              to="/store"
              className="rounded-tag bg-soft px-3 py-1.5 text-[13px] text-warm active:bg-sage/40"
            >
              {balance} 点
            </Link>
          </div>
        </div>
      </div>

      <div className="mt-6 flex-1 px-5">
        <h2 className="mb-3 text-[16px] font-semibold text-warm">我的家</h2>
        {spaces === null ? (
          <Loading />
        ) : spaces.length === 0 ? (
          <Empty text="还没有空间档案" hint="点下方按钮，从第一个房间开始吧" />
        ) : (
          <div className="space-y-4">
            {spaces.map((space) => (
              <button
                key={space.id}
                type="button"
                className="flex w-full items-center gap-4 rounded-card bg-card p-4 text-left shadow-card active:bg-soft/60"
                onClick={() => navigate('/spaces')}
              >
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
                    {SPACE_TYPE_LABELS[space.space_type] ?? '空间'} · {formatLastTime(space.last_session_at)}
                  </div>
                </div>
                <div className="text-[12px] text-warm-light">{space.session_count} 次 ›</div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="px-5 pt-6">
        <button
          type="button"
          className="w-full rounded-btn bg-primary py-4 text-[17px] font-semibold text-white shadow-card active:bg-primary-dark"
          onClick={() => navigate('/capture')}
        >
          开始整理
        </button>
      </div>

      <TabBar />

      {/* 设置弹层：默认保留整理记录（delete_after_analysis 反值）+ 30 天复查提醒（PRD 4.2/4.3） */}
      {showSettings && (
        <Modal open onClose={() => setShowSettings(false)}>
          <h2 className="mb-4 text-[17px] font-semibold text-warm">设置</h2>
          <div className="space-y-4">
            <SettingRow
              label="默认保留整理记录"
              desc="改变新一次整理的默认选择，单次上传时仍可临时改。"
              checked={user.delete_after_analysis === 0}
              onChange={(on) => toggleSetting('delete_after_analysis', on ? 0 : 1)}
            />
            <SettingRow
              label="30 天复查提醒"
              desc="整理完 30 天后提醒你回去看看，保持战果。"
              checked={user.reminder_enabled === 1}
              onChange={(on) => toggleSetting('reminder_enabled', on ? 1 : 0)}
            />
          </div>
          <button
            type="button"
            className="mt-5 w-full rounded-btn bg-primary py-3 text-[14px] font-medium text-white active:bg-primary-dark"
            onClick={() => setShowSettings(false)}
          >
            好了
          </button>
        </Modal>
      )}
    </div>
  );
}

/** 设置开关行 */
function SettingRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-[14px] font-medium text-warm">{label}</div>
        <div className="mt-0.5 text-[12px] leading-5 text-warm-light">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-soft'}`}
        onClick={() => onChange(!checked)}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-[22px]' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}
