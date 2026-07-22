/**
 * v3 批量选择操作栏（设计稿 p34 扩展组件）：
 * ☑ 全选 · 已选 n 项  [操作按钮…]  [退出]
 * 置于列表顶部（或 sticky），批量删除等危险操作建议配合 ConfirmDialog 使用。
 */
export interface BatchAction {
  /** 按钮文案，如「删除选中」 */
  label: string;
  onClick: () => void;
  /** danger=红色实心（删除等危险操作）；默认主色描边 */
  kind?: 'primary' | 'danger';
  disabled?: boolean;
}

interface BatchActionBarProps {
  /** 是否全选状态（受控） */
  allSelected: boolean;
  onToggleAll: () => void;
  selectedCount: number;
  actions: BatchAction[];
  /** 退出批量模式（不传则不显示退出按钮） */
  onExit?: () => void;
}

export function BatchActionBar({
  allSelected,
  onToggleAll,
  selectedCount,
  actions,
  onExit,
}: BatchActionBarProps): JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-border-subtle bg-card px-4 py-2.5 shadow-card">
      <label className="flex cursor-pointer items-center gap-2 text-[13px] text-warm-secondary">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={onToggleAll}
          className="h-4 w-4 accent-primary"
        />
        全选
        <span className="text-warm-light">
          · 已选 <span className="font-medium text-warm">{selectedCount}</span> 项
        </span>
      </label>

      <div className="flex items-center gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            disabled={action.disabled ?? selectedCount === 0}
            className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              action.kind === 'danger'
                ? 'bg-danger text-white active:opacity-90'
                : 'border border-primary text-primary active:bg-tint'
            }`}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        ))}
      </div>

      {onExit && (
        <button
          type="button"
          className="ml-auto text-[13px] text-warm-light underline-offset-2 hover:underline"
          onClick={onExit}
        >
          退出
        </button>
      )}
    </div>
  );
}
