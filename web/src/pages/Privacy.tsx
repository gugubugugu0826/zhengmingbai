/**
 * 隐私政策页（v3）：
 * 与 Home.tsx 首次进入弹窗的口径一致，作为常驻查阅入口。
 * 注册页也可未登录访问（协议勾选处的链接）。
 */
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/PageHeader';

export default function PrivacyPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="w-full max-w-3xl">
      <PageHeader title="隐私政策" onBack={() => navigate(-1)} back />
      <div className="space-y-3 px-5 pb-8 pt-4 text-[14px] leading-7 text-warm md:px-0">
        <p>在你使用「整明白」之前，我们想坦诚说明一下照片的去向：</p>
        <p>· 照片仅用于 AI 整理分析，不会用于其他任何用途；</p>
        <p>· 照片通过加密传输与签名链接访问，只有你自己看得到；</p>
        <p>· 你可以在账号页开启「默认保留整理记录」的反面 —— 分析完即删，方案生成后照片立刻删除；</p>
        <p>· 任何时候都可以在「我的空间」里删除历史照片与记录；</p>
        <p>· 我们不会把你的照片、整理记录卖给任何第三方；</p>
        <p>· 你注册的邮箱、手机号仅用于登录与找回账号，不会收到任何营销推送。</p>
        <p className="text-warm-light">你的东西你说了算，照片也一样。</p>
        <p className="text-[12px] text-warm-light">最后更新：2026-07-22</p>
      </div>
    </div>
  );
}
