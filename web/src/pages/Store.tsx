/**
 * 我的点数（R30 商城页改造）：余额卡片 + "联系运营获取点数"说明。
 * 支付暂缓期全站无购买入口；后端 orders/packages/payment 代码保留，恢复收费时可复活。
 */
import { useEffect, useState, type JSX } from 'react';
import { api } from '../api';
import { ContactModal } from '../components/ContactModal';
import { TabBar } from '../components/TabBar';
import { useAuthStore } from '../stores/auth';

export default function StorePage(): JSX.Element {
  const balance = useAuthStore((s) => s.balance);
  const setBalance = useAuthStore((s) => s.setBalance);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    api
      .get<{ balance: number }>('/points/balance')
      .then((data) => setBalance(data.balance))
      .catch(() => undefined);
  }, [setBalance]);

  // PRD 4.1：点数不足一次区域级（10 点）时提示"快用完啦"
  const enough = balance >= 10;

  return (
    <div className="flex min-h-full flex-1 flex-col pb-20">
      <div className="px-5 pt-6">
        <h1 className="text-[22px] font-semibold text-warm">我的点数</h1>
        <p className="mt-1 text-[13px] text-warm-light">点数用于 AI 分析，重生成首次免费</p>
      </div>

      {/* 余额卡片 */}
      <div className="mt-5 px-5">
        <div className="rounded-card bg-gradient-to-r from-primary to-primary-dark p-5 text-white shadow-card">
          <div className="text-[13px] opacity-80">当前点数余额</div>
          <div className="mt-1 text-[32px] font-semibold leading-none">{balance}</div>
          <div className="mt-2 text-[13px] opacity-90">
            你还有 {balance} 点，{enough ? '够做一次完整的整理啦～' : '快用完啦'}
          </div>
        </div>
      </div>

      {/* 联系运营说明 */}
      <div className="mt-6 flex-1 px-5">
        <div className="rounded-card bg-card p-5 text-center shadow-card">
          <div className="text-3xl">🙋</div>
          <h2 className="mt-2 text-[16px] font-semibold text-warm">点数不够了？</h2>
          <p className="mt-1.5 text-[13px] leading-6 text-warm-light">
            现在点数由小助手人工发放，联系我们就能补上～
          </p>
          <button
            type="button"
            className="mt-4 w-full rounded-btn bg-primary py-3 text-[15px] font-medium text-white active:bg-primary-dark"
            onClick={() => setContactOpen(true)}
          >
            联系运营获取点数
          </button>
        </div>

        <p className="mt-6 text-center text-[12px] leading-5 text-warm-light">
          区域级分析 10 点 / 物品级 25 点（以后台配置为准）。
        </p>
      </div>

      <TabBar />
      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
