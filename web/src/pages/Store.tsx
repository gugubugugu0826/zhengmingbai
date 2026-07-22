/**
 * 商城页（v3 §5-G，按设计稿改造）：
 * 三档套餐卡片（体验包¥6/20点、家庭包⭐推荐¥25/100点、囤货包¥60/300点）
 * + 推荐角标；支付挂起——按钮统一"暂未开放，联系管理员充点"，点击弹 ContactModal，不拉起支付。
 * 数据优先取 GET /points/packages（后台新三档种子），失败/为空回退前端静态定价表。
 */
import { useEffect, useState, type JSX } from 'react';
import { api } from '../api';
import { ContactModal } from '../components/ContactModal';
import { PageHeader } from '../components/PageHeader';
import { useAuthStore } from '../stores/auth';
import type { Package } from '../types';

/** 前端静态定价表（§5-G 新定价；接口兜底，与后台种子数据一致） */
const FALLBACK_PACKAGES: Package[] = [
  { id: -1, name: '体验包', price_fen: 600, points: 20, tag: '新客尝鲜', sort: 1, is_active: 1 },
  { id: -2, name: '家庭包', price_fen: 2500, points: 100, tag: '推荐', sort: 2, is_active: 1 },
  { id: -3, name: '囤货包', price_fen: 6000, points: 300, tag: '深度用户', sort: 3, is_active: 1 },
];

const PACKAGE_META: Record<string, { emoji: string; unit: string; usage: string }> = {
  体验包: { emoji: '🌱', unit: '¥0.30/点', usage: '约 2 次区域级整理' },
  家庭包: { emoji: '🏠', unit: '¥0.25/点', usage: '约 10 次区域级 / 4 次物品级' },
  囤货包: { emoji: '📦', unit: '¥0.20/点', usage: '约 30 次区域级 / 12 次物品级' },
};

function formatPrice(fen: number): string {
  return (fen / 100).toFixed(fen % 100 === 0 ? 0 : 2);
}

export default function StorePage(): JSX.Element {
  const balance = useAuthStore((s) => s.balance);
  const setBalance = useAuthStore((s) => s.setBalance);
  const [contactOpen, setContactOpen] = useState(false);
  const [packages, setPackages] = useState<Package[]>(FALLBACK_PACKAGES);

  useEffect(() => {
    api
      .get<{ balance: number }>('/points/balance')
      .then((data) => setBalance(data.balance))
      .catch(() => undefined);
    // 套餐列表：GET /packages（orders 路由挂载于 /api/v1 根），失败保留静态定价表
    api
      .get<Package[]>('/packages')
      .then((list) => {
        const active = list.filter((p) => p.is_active === 1).sort((a, b) => a.sort - b.sort);
        if (active.length > 0) setPackages(active);
      })
      .catch(() => undefined);
  }, [setBalance]);

  return (
    <div className="w-full">
      <PageHeader title="商城" subtitle="点数套餐 · 用于 AI 分析" />

      {/* 余额条 */}
      <div className="mx-5 mt-2 flex items-center justify-between rounded-card bg-card px-5 py-4 shadow-card md:mx-0">
        <div className="text-[14px] text-warm">
          当前余额 <span className="text-[20px] font-semibold text-primary-dark">{balance}</span> 点
        </div>
        <span className="text-[12px] text-warm-light">区域级 10 点/次 · 物品级 25 点/次</span>
      </div>

      {/* 三档套餐卡片 */}
      <div className="mx-5 mt-5 grid gap-4 md:mx-0 md:grid-cols-3">
        {packages.map((pkg) => {
          const meta = PACKAGE_META[pkg.name] ?? { emoji: '🎁', unit: '', usage: '' };
          const recommended = pkg.tag === '推荐' || pkg.tag === '⭐推荐' || /推荐/.test(pkg.tag ?? '');
          return (
            <div
              key={pkg.id}
              className={`relative flex flex-col rounded-card bg-card p-5 shadow-card ${
                recommended ? 'border-2 border-primary' : 'border border-border-subtle'
              }`}
            >
              {/* 推荐角标 */}
              {recommended && (
                <span className="absolute -top-3 left-4 rounded-pill bg-primary px-3 py-1 text-[12px] font-medium text-white shadow-card">
                  ⭐ 推荐
                </span>
              )}
              <div className="flex items-center gap-2">
                <span className="text-[24px]">{meta.emoji}</span>
                <div className="text-[16px] font-semibold text-warm">{pkg.name}</div>
                {pkg.tag && !recommended && (
                  <span className="rounded-tag bg-soft px-2 py-0.5 text-[11px] text-warm-light">{pkg.tag}</span>
                )}
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-[14px] text-warm-light">¥</span>
                <span className="text-[32px] font-semibold leading-none text-primary-dark">
                  {formatPrice(pkg.price_fen)}
                </span>
                <span className="ml-1 text-[13px] text-warm-light">/ {pkg.points} 点</span>
              </div>
              <div className="mt-2 text-[12px] text-warm-light">
                {meta.unit && <span className="mr-2">{meta.unit}</span>}
                {meta.usage}
              </div>
              <button
                type="button"
                className={`mt-4 w-full rounded-btn py-3 text-[14px] font-medium ${
                  recommended
                    ? 'bg-primary text-white active:bg-primary-dark'
                    : 'border border-primary text-primary active:bg-tint'
                }`}
                onClick={() => setContactOpen(true)}
              >
                暂未开放，联系管理员充点
              </button>
            </div>
          );
        })}
      </div>

      {/* 说明 */}
      <div className="mx-5 mt-6 rounded-card bg-card p-5 text-center shadow-card md:mx-0">
        <p className="text-[13px] leading-6 text-warm-light">
          支付功能暂未开放，点数由小助手人工发放。
          <br />
          注册送 20 点；1 点约 ¥0.3，区域级整理 10 点/次 ≈ ¥3，物品级 25 点/次 ≈ ¥5-7.5。
        </p>
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </div>
  );
}
