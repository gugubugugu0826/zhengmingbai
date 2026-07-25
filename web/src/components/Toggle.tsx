interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
}

export function Toggle({ checked, onChange, disabled = false, label }: ToggleProps): JSX.Element {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}
          ${checked ? 'bg-primary' : 'bg-border-strong'}`}
      >
        <span
          className={`inline-block h-[18px] w-[18px] rounded-full bg-white shadow transition-transform
            ${checked ? 'translate-x-[22px]' : 'translate-x-[3px]'}`}
        />
      </button>
      {label ? <span className="text-sm text-warm">{label}</span> : null}
    </label>
  );
}
