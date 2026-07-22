/**
 * 我的点数子页（v2.2 A-10 第 1 项）：
 * 余额卡片 + 点数说明 + 联系运营弹窗。复用 v2.1 商城页要点，去掉购买入口。
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ContactModal } from '../components/ContactModal';
import { PageHeader } from '../components/PageHeader';
import { useAuthStore } from '../stores/auth';

export default function PointsPage(): JSX.Element {
  const navigate = useNavigate();
  const balance = useAuthStore((s) => s.balance);
  const setBalance = useAuthStore((s) => s.setBalance);
  const [contactOpen, setContactOpen] = useState(false);

  useEffect(() => {
    api
      .get<{ balance: number }>('/points/balance')
      .then((data) => setBalance(data.balance))
      .catch(() => undefined);
  }, [setBalance]);

  const enough = balance >= 10;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <PageHeader title="我的点数" onBack={() => navigate('/account')} />

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

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
