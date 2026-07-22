/**
 * 知识库维护（R35）：10 类空间 Tab + 条目表格（行内编辑 / 删除二次确认 / 新增弹层），保存即时生效。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { toast } from '../../stores/auth';
import { SPACE_TYPE_LABELS } from '../../types';
import type { KnowledgeRow } from '../api';
import { AdminEmpty, AdminModal, btnGhostCls, btnPrimaryCls, cardCls, inputCls, tableCls, tdCls, thCls } from '../ui';

const SPACE_TYPES = Object.keys(SPACE_TYPE_LABELS);

function parseItems(row: KnowledgeRow): string[] {
  try {
    return JSON.parse(row.items_json) as string[];
  } catch {
    return [];
  }
}

/** 编辑状态：分类名 + 物品项（逗号分隔文本） */
interface EditState {
  category: string;
  itemsText: string;
}

/** 新增条目弹层 */
function CreateModal({
  spaceType,
  onClose,
  onDone,
}: {
  spaceType: string;
  onClose: () => void;
  onDone: () => void;
}): JSX.Element {
  const [category, setCategory] = useState('');
  const [itemsText, setItemsText] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (): Promise<void> => {
    const items = itemsText.split(/[,，\n]/).map((s) => s.trim()).filter(Boolean);
    if (!category.trim() || items.length === 0) {
      toast('分类名和物品项都要填哦', 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post('/admin/knowledge', { space_type: spaceType, category: category.trim(), items });
      toast('已生效', 'success');
      onDone();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '新增失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminModal open onClose={onClose} title={`新增条目 · ${SPACE_TYPE_LABELS[spaceType] ?? spaceType}`}>
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">分类名</div>
          <input
            className={`${inputCls} w-full`}
            placeholder="比如：台面即时区"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-warm">物品项（逗号或换行分隔）</div>
          <textarea
            className={`${inputCls} w-full`}
            rows={4}
            placeholder="常用调料、刀具砧板、洗洁精、抹布"
            value={itemsText}
            onChange={(e) => setItemsText(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <button type="button" className={`${btnGhostCls} flex-1`} onClick={onClose}>
            取消
          </button>
          <button type="button" disabled={busy} className={`${btnPrimaryCls} flex-1`} onClick={() => void submit()}>
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </AdminModal>
  );
}

export default function AdminKnowledge(): JSX.Element {
  const [spaceType, setSpaceType] = useState(SPACE_TYPES[0] ?? 'kitchen');
  const [rows, setRows] = useState<KnowledgeRow[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editState, setEditState] = useState<EditState>({ category: '', itemsText: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback((): void => {
    api
      .get<KnowledgeRow[]>('/admin/knowledge', { space_type: spaceType })
      .then(setRows)
      .catch((err: unknown) => toast(err instanceof ApiError ? err.message : '知识库加载失败', 'error'));
  }, [spaceType]);

  useEffect(() => {
    setEditingId(null);
    load();
  }, [load]);

  const startEdit = (row: KnowledgeRow): void => {
    setEditingId(row.id);
    setEditState({ category: row.category, itemsText: parseItems(row).join('、') });
  };

  const saveEdit = async (row: KnowledgeRow): Promise<void> => {
    const items = editState.itemsText.split(/[,，、\n]/).map((s) => s.trim()).filter(Boolean);
    if (!editState.category.trim() || items.length === 0) {
      toast('分类名和物品项都要填哦', 'error');
      return;
    }
    try {
      await api.put(`/admin/knowledge/${row.id}`, { category: editState.category.trim(), items });
      toast('已生效', 'success');
      setEditingId(null);
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '保存失败', 'error');
    }
  };

  const remove = async (row: KnowledgeRow): Promise<void> => {
    if (!window.confirm(`确定删除「${row.category}」这个分类吗？`)) return;
    try {
      await api.delete(`/admin/knowledge/${row.id}`);
      toast('已生效', 'success');
      load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : '删除失败', 'error');
    }
  };

  return (
    <div className="space-y-4">
      {/* 10 类空间 Tab */}
      <div className="flex flex-wrap gap-2">
        {SPACE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-btn px-3.5 py-2 text-[13px] ${
              spaceType === t ? 'bg-primary font-medium text-white' : 'bg-card text-warm-light shadow-card'
            }`}
            onClick={() => setSpaceType(t)}
          >
            {SPACE_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between border-b border-soft px-4 py-3">
          <h2 className="text-[15px] font-semibold text-warm">
            {SPACE_TYPE_LABELS[spaceType] ?? spaceType} · 分类与物品
          </h2>
          <button type="button" className={btnPrimaryCls} onClick={() => setCreating(true)}>
            ＋ 新增条目
          </button>
        </div>
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <AdminEmpty text="这个空间还没有知识库条目，点右上角新增一条吧" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-soft bg-soft/30">
              <tr>
                <th className={`${thCls} w-56`}>分类</th>
                <th className={thCls}>物品项</th>
                <th className={`${thCls} w-20`}>状态</th>
                <th className={`${thCls} w-40`}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const editing = editingId === row.id;
                return (
                  <tr key={row.id} className="border-b border-soft/50 align-top last:border-0">
                    <td className={tdCls}>
                      {editing ? (
                        <input
                          className={`${inputCls} w-full`}
                          value={editState.category}
                          onChange={(e) => setEditState((s) => ({ ...s, category: e.target.value }))}
                        />
                      ) : (
                        <span className="font-medium">{row.category}</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {editing ? (
                        <textarea
                          className={`${inputCls} w-full`}
                          rows={3}
                          value={editState.itemsText}
                          onChange={(e) => setEditState((s) => ({ ...s, itemsText: e.target.value }))}
                        />
                      ) : (
                        <span className="text-warm-light">{parseItems(row).join('、')}</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {row.is_active === 1 ? (
                        <span className="rounded-tag bg-sage/30 px-2 py-0.5 text-[11px] text-sage-dark">生效中</span>
                      ) : (
                        <span className="rounded-tag bg-soft px-2 py-0.5 text-[11px] text-warm-light">停用</span>
                      )}
                    </td>
                    <td className={tdCls}>
                      {editing ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-btn bg-primary px-3 py-1.5 text-[12px] text-white"
                            onClick={() => void saveEdit(row)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="rounded-btn border border-soft px-3 py-1.5 text-[12px] text-warm-light"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-btn border border-soft px-3 py-1.5 text-[12px] text-warm active:bg-soft"
                            onClick={() => startEdit(row)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="rounded-btn border border-red-200 px-3 py-1.5 text-[12px] text-red-600 active:bg-red-50"
                            onClick={() => void remove(row)}
                          >
                            删除
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <CreateModal
          spaceType={spaceType}
          onClose={() => setCreating(false)}
          onDone={() => {
            setCreating(false);
            load();
          }}
        />
      )}
    </div>
  );
}
