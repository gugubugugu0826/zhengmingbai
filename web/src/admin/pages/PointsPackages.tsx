/**
 * 点数套餐管理（R36/R32，v3 T04）：
 * 上半区点数规则表单（保存即时生效）；
 * 下半区套餐管理表格，按 v3 设计稿 p20 呈现新定价表数据：
 *   体验包 ¥6/20点、家庭包 ⭐推荐 ¥25/100点、囤货包 ¥60/300点（上架中）；
 *   装修包 ¥98/500点 is_active=0（已下架置灰行）。
 * 数据由后端 v3 种子订正脚本幂等写入 packages 表，本页如实展示（推荐标徽、上下架状态徽标、
 * 下架行整行置灰），编辑仅允许改名/改价/改点。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import type { PackageRow } from '../api';
import { AdminEmpty, btnPrimaryCls, cardCls, inputCls, PageTitle, StatusBadge, tableCls, tdCls, thCls } from '../ui';

interface RulesForm {
  region: string;
  item: string;
  regenRegion: string;
  regenItem: string;
  gift: string;
}

function formatPrice(fen: number): string {
  return (fen / 100).toFixed(fen % 100 === 0 ? 0 : 1);
}

/** 套餐一句话描述（设计稿 p20 描述列口径） */
function pkgDesc(pkg: PackageRow): string {
  if (pkg.name.includes('体验')) return '约 2 次区域级方案，新客尝鲜';
  if (pkg.name.includes('家庭')) return '约 10 次区域级 / 4 次物品级，主力套餐';
  if (pkg.name.includes('囤货')) return '全屋多空间慢慢整，深度用户';
  if (pkg.name.includes('装修')) return '适合刚搬家的重度整理';
  return `${pkg.points} 点随心用`;
}

export default function AdminPointsPackages(): JSX.Element {
  const [rules, setRules] = useState<RulesForm | null>(null);
  const [packages, setPackages] = useState<PackageRow[] | null>(null);
  const [editingPkgId, setEditingPkgId] = useState<number | null>(null);
  const [pkgForm, setPkgForm] = useState<{ name: string; price: string; points: string }>({ name: '', price: '', points: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback((): void => {
    api
      .get<Record<string, unknown>>('/admin/configs')
      .then((configs) => {
        const r = (configs['points.rules'] ?? {}) as {
          analysis?: { region?: number; item?: number };
          regen_after_first?: { region?: number; item?: number };
          new_user_gift_points?: number;
        };
        setRules({
          region: String(r.analysis?.region ?? 10),
          item: String(r.analysis?.item ?? 25),
          regenRegion: String(r.regen_after_first?.region ?? 3),
          regenItem: String(r.regen_after_first?.item ?? 8),
          gift: String(r.new_user_gift_points ?? 20),
        });
      })
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '配置加载失败', 'error'));
    api
      .get<PackageRow[]>('/admin/packages')
      .then(setPackages)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '套餐加载失败', 'error'));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveRules = async (): Promise<void> => {
    if (!rules) return;
    const nums = [rules.region, rules.item, rules.regenRegion, rules.regenItem, rules.gift].map(Number);
    if (nums.some((n) => !Number.isInteger(n) || n < 0)) {
      toast('点数都要是不小于 0 的整数哦', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put('/admin/configs', {
        key: 'points.rules',
        value: {
          analysis: { region: nums[0], item: nums[1] },
          regen_after_first: { region: nums[2], item: nums[3] },
          new_user_gift_points: nums[4],
        },
      });
      toast('点数规则已保存，即时生效', 'success');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const savePackage = async (pkg: PackageRow): Promise<void> => {
    const priceYuan = Number(pkgForm.price);
    const points = Number(pkgForm.points);
    if (!pkgForm.name.trim() || !(priceYuan > 0) || !Number.isInteger(points) || points <= 0) {
      toast('名称、价格、点数都要填对哦', 'error');
      return;
    }
    try {
      await api.put(`/admin/packages/${pkg.id}`, {
        name: pkgForm.name.trim(),
        price_fen: Math.round(priceYuan * 100),
        points,
      });
      toast('套餐已更新', 'success');
      setEditingPkgId(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败', 'error');
    }
  };

  const ruleField = (label: string, key: keyof RulesForm): JSX.Element => (
    <label className="block">
      <span className="mb-1 block text-[13px] text-warm-light">{label}</span>
      <input
        className={`${inputCls} w-28`}
        type="number"
        min={0}
        value={rules?.[key] ?? ''}
        onChange={(e) => rules && setRules({ ...rules, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="space-y-5">
      <PageTitle title="点数套餐" desc="新定价表已同步：体验包 ¥6/20点、家庭包 ⭐ ¥25/100点、囤货包 ¥60/300点" />

      {/* 点数规则 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="mb-1 text-[15px] font-semibold text-warm">点数规则</h2>
        <p className="mb-4 text-[12px] text-warm-light">改了立即生效，新发起的分析按新规则扣点。</p>
        {!rules ? (
          <Loading />
        ) : (
          <div className="flex flex-wrap items-end gap-5">
            {ruleField('区域级分析（点）', 'region')}
            {ruleField('物品级分析（点）', 'item')}
            {ruleField('重生成 · 保守档（点）', 'regenRegion')}
            {ruleField('重生成 · 断舍离档（点）', 'regenItem')}
            {ruleField('新用户赠送（点）', 'gift')}
            <button type="button" disabled={saving} className={btnPrimaryCls} onClick={() => void saveRules()}>
              {saving ? '保存中…' : '保存规则'}
            </button>
          </div>
        )}
      </div>

      {/* 套餐管理 */}
      <div className={cardCls}>
        <div className="border-b border-border-subtle px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-warm">套餐管理</h2>
          <p className="mt-0.5 text-[12px] text-warm-light">
            支付暂缓期，商城购买入口统一显示「暂未开放，联系管理员充点」；装修包建而不上架（is_active=0）。
          </p>
        </div>
        {!packages ? (
          <Loading />
        ) : packages.length === 0 ? (
          <AdminEmpty text="还没有套餐数据" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-border-subtle bg-soft/40">
              <tr>
                <th className={thCls}>套餐名称</th>
                <th className={thCls}>点数</th>
                <th className={thCls}>价格</th>
                <th className={thCls}>描述</th>
                <th className={thCls}>状态</th>
                <th className={`${thCls} w-32`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => {
                const editing = editingPkgId === pkg.id;
                const offShelf = pkg.is_active !== 1;
                const recommended = Boolean(pkg.tag?.includes('推荐'));
                return (
                  <tr
                    key={pkg.id}
                    className={`border-b border-border-subtle/60 last:border-0 ${offShelf ? 'opacity-50' : ''}`}
                  >
                    <td className={tdCls}>
                      {editing ? (
                        <input
                          className={`${inputCls} w-full`}
                          value={pkgForm.name}
                          onChange={(e) => setPkgForm((s) => ({ ...s, name: e.target.value }))}
                        />
                      ) : (
                        <span className="font-medium">
                          {pkg.name}
                          {recommended ? ' ⭐' : ''}
                          {offShelf ? '（已下架）' : ''}
                        </span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {editing ? (
                        <input
                          className={`${inputCls} w-20`}
                          type="number"
                          value={pkgForm.points}
                          onChange={(e) => setPkgForm((s) => ({ ...s, points: e.target.value }))}
                        />
                      ) : (
                        `${pkg.points} 点`
                      )}
                    </td>
                    <td className={tdCls}>
                      {editing ? (
                        <input
                          className={`${inputCls} w-24`}
                          type="number"
                          step="0.1"
                          value={pkgForm.price}
                          onChange={(e) => setPkgForm((s) => ({ ...s, price: e.target.value }))}
                        />
                      ) : (
                        `¥${formatPrice(pkg.price_fen)}`
                      )}
                    </td>
                    <td className={`${tdCls} max-w-[260px] text-warm-light`}>{pkgDesc(pkg)}</td>
                    <td className={tdCls}>
                      {offShelf ? (
                        <StatusBadge kind="danger" text="已下架" />
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <StatusBadge kind="success" text="上架中" />
                          {recommended ? <StatusBadge kind="warning" text="推荐" /> : null}
                        </span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {editing ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-md bg-primary px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-primary-dark"
                            onClick={() => void savePackage(pkg)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-warm-light transition-colors hover:bg-soft"
                            onClick={() => setEditingPkgId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-warm transition-colors hover:bg-soft"
                          onClick={() => {
                            setEditingPkgId(pkg.id);
                            setPkgForm({ name: pkg.name, price: formatPrice(pkg.price_fen), points: String(pkg.points) });
                          }}
                        >
                          编辑
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
