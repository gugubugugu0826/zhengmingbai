/**
 * 我的点数子页（v3 按设计稿改造）：
 * 余额卡片 + 点数用途说明 + 获取点数入口（联系运营，支付挂起期无购买入口）。
 */
import { useEffect, useState, type JSX } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    <div className="w-full max-w-3xl">
      <PageHeader title="我的点数" subtitle="点数用于 AI 分析，重生成首次免费" back />

      {/* 余额卡片 */}
      <div className="mx-5 mt-3 rounded-card bg-gradient-to-r from-primary to-primary-dark p-5 text-white shadow-card md:mx-0">
        <div className="text-[13px] opacity-80">当前点数余额</div>
        <div className="mt-1 text-[32px] font-semibold leading-none">{balance}</div>
        <div className="mt-2 text-[13px] opacity-90">
          你还有 {balance} 点，{enough ? '够做一次完整的整理啦～' : '快用完啦'}
        </div>
      </div>

      {/* 点数用途 */}
      <div className="mx-5 mt-5 grid gap-3 md:mx-0 md:grid-cols-2">
        <div className="rounded-card bg-card p-4 shadow-card">
          <div className="text-[14px] font-medium text-warm">🔍 区域级分析 · 10 点/次</div>
          <p className="mt-1 text-[12px] leading-5 text-warm-light">按区域出整理方案，够用好上手</p>
        </div>
        <div className="rounded-card bg-card p-4 shadow-card">
          <div className="text-[14px] font-medium text-warm">🔬 物品级分析 · 25 点/次</div>
          <p className="mt-1 text-[12px] leading-5 text-warm-light">细到每件物品，方案更精准</p>
        </div>
      </div>

      {/* 获取点数 */}
      <div className="mx-5 mt-5 rounded-card bg-card p-5 text-center shadow-card md:mx-0">
        <div className="text-3xl">🙋</div>
        <h2 className="mt-2 text-[16px] font-semibold text-warm">点数不够了？</h2>
        <p className="mt-1.5 text-[13px] leading-6 text-warm-light">
          现在点数由小助手人工发放，联系我们就能补上～
        </p>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:justify-center">
          <button
            type="button"
            className="rounded-btn bg-primary px-6 py-3 text-[15px] font-medium text-white active:bg-primary-dark"
            onClick={() => setContactOpen(true)}
          >
            联系运营获取点数
          </button>
          <Link
            to="/store"
            className="rounded-btn border border-primary px-6 py-3 text-center text-[15px] font-medium text-primary active:bg-tint"
          >
            去商城看看套餐
          </Link>
        </div>
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
