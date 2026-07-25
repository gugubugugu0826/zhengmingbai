import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './Button';

interface EmptyProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; to?: string; onClick?: () => void };
}

export function EmptyState({ icon, title, description, action }: EmptyProps): JSX.Element {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      {icon ? (
        <div className="mb-2">{icon}</div>
      ) : (
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-pill bg-tint">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#B08968"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M4 9h16l-1.4 9.3a2.2 2.2 0 0 1-2.2 1.9H7.6a2.2 2.2 0 0 1-2.2-1.9L4 9z" />
            <path d="M8 9V7.5a4 4 0 0 1 8 0V9" />
            <path d="M3.5 9h17" />
            <path d="M9 13v3.5M12 13v3.5M15 13v3.5" />
          </svg>
        </div>
      )}
      <p className="text-[15px] font-semibold text-warm">{title}</p>
      {description ? <p className="text-[13px] text-warm-light">{description}</p> : null}
      {action ? (
        <Button
          variant="primary"
          size="sm"
          className="mt-2"
          onClick={() => {
            if (action.to) navigate(action.to);
            else action.onClick?.();
          }}
        >
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}
