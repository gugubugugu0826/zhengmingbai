/**
 * 点数与套餐（R36/R32）：上半区点数规则表单（保存即时生效），下半区套餐管理表格（本期全下架置灰）。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import type { PackageRow } from '../api';
import { AdminEmpty, btnPrimaryCls, cardCls, inputCls, tableCls, tdCls, thCls } from '../ui';

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
      {/* 点数规则 */}
      <div className={`${cardCls} p-5`}>
        <h2 className="mb-1 text-[15px] font-semibold text-warm">点数规则</h2>
        <p className="mb-4 text-[12px] text-warm-light">改了立即生效，新发起的分析按新规则扣点。</p>
        {!rules ? (
          <Loading />
        ) : (
          <>
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
          </>
        )}
      </div>

      {/* 套餐管理 */}
      <div className={cardCls}>
        <div className="border-b border-soft px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-warm">套餐管理</h2>
          <p className="mt-0.5 text-[12px] text-warm-light">
            支付暂缓，本期全部套餐下架；恢复收费时可上架。
          </p>
        </div>
        {!packages ? (
          <Loading />
        ) : packages.length === 0 ? (
          <AdminEmpty text="还没有套餐数据" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-soft bg-soft/30">
              <tr>
                <th className={thCls}>套餐名</th>
                <th className={thCls}>点数</th>
                <th className={thCls}>价格</th>
                <th className={thCls}>标签</th>
                <th className={thCls}>上下架</th>
                <th className={`${thCls} w-40`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {packages.map((pkg) => {
                const editing = editingPkgId === pkg.id;
                return (
                  <tr key={pkg.id} className="border-b border-soft/50 last:border-0">
                    <td className={tdCls}>
                      {editing ? (
                        <input
                          className={`${inputCls} w-full`}
                          value={pkgForm.name}
                          onChange={(e) => setPkgForm((s) => ({ ...s, name: e.target.value }))}
                        />
                      ) : (
                        pkg.name
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
                        pkg.points
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
                    <td className={tdCls}>{pkg.tag ?? '-'}</td>
                    <td className={tdCls}>
                      {/* 本期全部下架置灰（R32/PRD 3.2） */}
                      <button
                        type="button"
                        disabled
                        title="支付暂缓，恢复收费时可上架"
                        className="cursor-not-allowed rounded-tag bg-soft px-2.5 py-1 text-[11px] text-warm-light opacity-70"
                      >
                        已下架 · 恢复收费时可上架
                      </button>
                    </td>
                    <td className={tdCls}>
                      {editing ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-btn bg-primary px-3 py-1.5 text-[12px] text-white"
                            onClick={() => void savePackage(pkg)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="rounded-btn border border-soft px-3 py-1.5 text-[12px] text-warm-light"
                            onClick={() => setEditingPkgId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="rounded-btn border border-soft px-3 py-1.5 text-[12px] text-warm active:bg-soft"
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
