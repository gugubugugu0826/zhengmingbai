/**
 * 知识库维护（R35，v3 T04 换皮）：
 * 10 类空间 Tab（胶囊式，设计稿 p18）+ 条目表格（行内编辑 / 删除走 ConfirmDialog 二次确认 / 新增弹层），
 * 保存即时生效。
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { api, ApiError } from '../../api';
import { Loading } from '../../components/Loading';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from '../../stores/auth';
import { SPACE_TYPE_LABELS } from '../../types';
import type { KnowledgeRow } from '../api';
import { AdminEmpty, AdminModal, btnGhostCls, btnPrimaryCls, cardCls, inputCls, PageTitle, StatusBadge, tableCls, tdCls, thCls } from '../ui';

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
  const [removing, setRemoving] = useState<KnowledgeRow | null>(null);

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

  const doRemove = async (row: KnowledgeRow): Promise<void> => {
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
      <PageTitle
        title="知识库"
        desc="AI 分类归组的生活物品知识，改动即时生效"
        extra={
          <button type="button" className={btnPrimaryCls} onClick={() => setCreating(true)}>
            ＋ 新增条目
          </button>
        }
      />

      {/* 10 类空间 Tab（胶囊式） */}
      <div className="flex flex-wrap gap-2">
        {SPACE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className={`rounded-pill px-3.5 py-2 text-[13px] transition-colors ${
              spaceType === t ? 'bg-primary font-medium text-white shadow-card' : 'bg-card text-warm-light shadow-card hover:bg-soft/60'
            }`}
            onClick={() => setSpaceType(t)}
          >
            {SPACE_TYPE_LABELS[t] ?? t}
          </button>
        ))}
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-[15px] font-semibold text-warm">
            {SPACE_TYPE_LABELS[spaceType] ?? spaceType} · 分类与物品
          </h2>
          <span className="text-[12px] text-warm-light">{rows ? `${rows.length} 个分类` : ''}</span>
        </div>
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <AdminEmpty text="这个空间还没有知识库条目，点右上角新增一条吧" />
        ) : (
          <table className={tableCls}>
            <thead className="border-b border-border-subtle bg-soft/40">
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
                  <tr key={row.id} className="border-b border-border-subtle/60 align-top last:border-0">
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
                        <StatusBadge kind="success" text="生效中" />
                      ) : (
                        <StatusBadge kind="muted" text="停用" />
                      )}
                    </td>
                    <td className={tdCls}>
                      {editing ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-md bg-primary px-3 py-1.5 text-[12px] text-white transition-colors hover:bg-primary-dark"
                            onClick={() => void saveEdit(row)}
                          >
                            保存
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-warm-light transition-colors hover:bg-soft"
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            className="rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-warm transition-colors hover:bg-soft"
                            onClick={() => startEdit(row)}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-danger/30 px-3 py-1.5 text-[12px] text-danger transition-colors hover:bg-danger/5"
                            onClick={() => setRemoving(row)}
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

      <ConfirmDialog
        open={removing !== null}
        onCancel={() => setRemoving(null)}
        onConfirm={async () => {
          const row = removing;
          setRemoving(null);
          if (row) await doRemove(row);
        }}
        title="确认删除？"
        desc={removing ? `确定删除「${removing.category}」这个分类吗？删除后不可恢复，AI 归类将不再引用它。` : ''}
        confirmText="确认删除"
      />
    </div>
  );
}
