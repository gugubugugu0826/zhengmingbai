import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  pill?: boolean;
  full?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const BASE = 'inline-flex items-center justify-center font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50';

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark active:bg-primary-dark',
  secondary:
    'border border-border-subtle bg-white text-warm hover:bg-tint active:bg-tint',
  ghost: 'text-primary hover:bg-tint active:bg-tint',
  danger: 'bg-danger text-white hover:opacity-90 active:opacity-90',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'rounded-btn px-3 py-1.5 text-[13px]',
  md: 'rounded-btn px-5 py-2.5 text-[14px]',
  lg: 'rounded-btn px-6 py-3 text-[15px]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  pill = false,
  full = false,
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={[
        BASE,
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        pill ? 'rounded-pill' : '',
        full ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <span className="mr-1.5 inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
      ) : null}
      {children}
    </button>
  );
}
