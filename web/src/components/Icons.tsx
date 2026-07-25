/** 整明白 v3.2.1 图标集 — SVG 描边图标，16px 基准，颜色通过 currentColor 继承 */
import type { SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size?: number };

function mkIcon(d: string, size = 16, props?: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={d} />
    </svg>
  );
}

export function IconBasket({ size = 16, ...p }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...p}>
      <path d="M4 9h16l-1.4 9.3a2.2 2.2 0 0 1-2.2 1.9H7.6a2.2 2.2 0 0 1-2.2-1.9L4 9z" fill="#D4A574" stroke="none" />
      <path d="M4 9h16l-1.4 9.3a2.2 2.2 0 0 1-2.2 1.9H7.6a2.2 2.2 0 0 1-2.2-1.9L4 9z" stroke="#B08968" strokeWidth="1.8" />
      <path d="M8 9V7.5a4 4 0 0 1 8 0V9" stroke="#B08968" strokeWidth="1.8" />
      <path d="M3.5 9h17" stroke="#B08968" strokeWidth="1.8" />
      <path d="M9 13v3.5M12 13v3.5M15 13v3.5" stroke="#B08968" strokeWidth="1.8" />
    </svg>
  );
}

export const IconHome = (p: IconProps) =>
  mkIcon('M3 11.2 12 4l9 7.2M5.5 9.8V20h13V9.8', p.size ?? 16, p);

export const IconCamera = (p: IconProps) =>
  mkIcon(
    'M3 7a3 3 0 0 1 3-3h1.5L9 2.5h6L16.5 4H18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7z M12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    p.size ?? 16,
    p,
  );

export const IconFolder = (p: IconProps) =>
  mkIcon('M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7z', p.size ?? 16, p);

export const IconBell = (p: IconProps) =>
  mkIcon(
    'M12 4a6 6 0 0 0-6 6v3l-1.5 2.6a.6.6 0 0 0 .5.9h14a.6.6 0 0 0 .5-.9L18 13v-3a6 6 0 0 0-6-6z M10 19a2 2 0 0 0 4 0',
    p.size ?? 16,
    p,
  );

export const IconBag = (p: IconProps) =>
  mkIcon(
    'M5.5 8h13l-1 11.5a2 2 0 0 1-2 1.5h-7a2 2 0 0 1-2-1.5L5.5 8z M9 8V6.5a3 3 0 0 1 6 0V8',
    p.size ?? 16,
    p,
  );

export const IconUser = (p: IconProps) =>
  mkIcon(
    'M12 8a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z M5 20c1.4-3.4 3.9-5 7-5s5.6 1.6 7 5',
    p.size ?? 16,
    p,
  );

export const IconCoin = (p: IconProps) =>
  mkIcon(
    'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M12 6v12 M8 10h8 M8 14h8',
    p.size ?? 16,
    p,
  );

export const IconPicture = (p: IconProps) =>
  mkIcon(
    'M3 4a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v16a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V4z M4 16l4.5-4.5 3.5 3.5 3-3L20 17 M9 9a1.8 1.8 0 1 0 0-3.6',
    p.size ?? 16,
    p,
  );

export const IconChecklist = (p: IconProps) =>
  mkIcon(
    'M3.5 7a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V7z M8.5 12.5l2 2 4.5-5',
    p.size ?? 16,
    p,
  );

export const IconWarning = (p: IconProps) =>
  mkIcon('M12 3l9.5 17H2.5L12 3z M12 10v4 M12 16.5', p.size ?? 16, p);
