/**
 * 隐私政策页（v3.2 §4.5 布局修复）：
 * 与 Home.tsx 首次进入弹窗的口径一致，作为常驻查阅入口。
 * 注册页也可未登录访问（协议勾选处的链接）。
 * 正文包在卡片里：标题/正文/更新时间层级分明，列表项用统一样式渲染完整。
 */
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';
import { SiteFooter } from '../components/Footer';

/** 政策要点（与首页弹窗口径一致） */
const POLICY_POINTS: string[] = [
  '照片仅用于 AI 整理分析，不会用于其他任何用途；',
  '照片通过加密传输与签名链接访问，只有你自己看得到；',
  '你可以在账号页选择「分析完即删」——方案生成后照片立刻删除，不留副本；',
  '任何时候都可以在「我的空间」里删除历史照片与记录；',
  '我们不会把你的照片、整理记录卖给任何第三方；',
  '你注册的邮箱、手机号仅用于登录与找回账号，不会收到任何营销推送。',
];

export default function PrivacyPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <>
    <div className="w-full max-w-3xl">
      <PageHeader title="隐私政策" subtitle="你的东西你说了算，照片也一样" onBack={() => navigate(-1)} back />
      <div className="px-5 pb-10 pt-4 md:px-0">
        <div className="rounded-card bg-card p-5 shadow-card md:p-6">
          <p className="text-[14px] leading-7 text-warm">
            在你使用「整明白」之前，我们想坦诚说明一下照片的去向：
          </p>
          <ul className="mt-4 space-y-3">
            {POLICY_POINTS.map((point) => (
              <li key={point} className="flex items-start gap-2.5 text-[14px] leading-7 text-warm">
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-5 border-t border-soft pt-4 text-[14px] leading-7 text-warm-light">
            你的东西你说了算，照片也一样。
          </p>
          <p className="mt-3 text-[12px] text-warm-light">最后更新：2026-07-24</p>
        </div>
      </div>
      <SiteFooter />
    </div>
    </>
  );
}
