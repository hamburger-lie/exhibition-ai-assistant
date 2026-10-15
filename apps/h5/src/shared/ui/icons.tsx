/**
 * 统一线性 SVG 图标集（规格 §8.4：同一套 SVG 线性图标，不使用 Emoji 作为
 * 结构性图标；视觉尺寸 20/24px，笔画粗细统一 1.75）。
 *
 * 图标本身是装饰性的，语义由外层按钮的可访问名称承担，因此统一
 * aria-hidden，避免屏幕阅读器重复播报。
 */

export interface IconProps {
  size?: number;
  className?: string;
}

const STROKE = 1.75;

function base(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: STROKE,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...(className ? { className } : {}),
  };
}

export function IconSend({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 12 20 4l-3.2 8L20 20 4 12Z" />
    </svg>
  );
}

/** 规格 §5.1：生成期间发送按钮变为明确的方形停止图标。 */
export function IconStop({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
    </svg>
  );
}

export function IconBack({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function IconChevronDown({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 9.5l6 6 6-6" />
    </svg>
  );
}

export function IconArrowDown({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function IconNewChat({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 6.5h9M4 12h6" />
      <path d="M17.5 4.5l2 2-6 6-2.5.5.5-2.5 6-6Z" />
      <path d="M4 17.5h12" />
    </svg>
  );
}

export function IconExhibitor({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 20V9.5L12 4l8 5.5V20" />
      <path d="M9.5 20v-5.5h5V20" />
    </svg>
  );
}

export function IconProduct({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4 8.5 12 4l8 4.5v7L12 20l-8-4.5v-7Z" />
      <path d="M4 8.5 12 13l8-4.5M12 13v7" />
    </svg>
  );
}

export function IconBooth({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21Z" />
      <circle cx="12" cy="10.5" r="2.4" />
    </svg>
  );
}

export function IconEvent({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
    </svg>
  );
}

export function IconThumbUp({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 10.5 10.8 3a2 2 0 0 1 2.7 2.6L12.3 9.5H18a2 2 0 0 1 2 2.4l-1.3 6A2 2 0 0 1 16.7 20H7" />
      <rect x="3" y="10" width="4" height="10" rx="1" />
    </svg>
  );
}

export function IconThumbDown({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M7 13.5 10.8 21a2 2 0 0 0 2.7-2.6l-1.2-3.9H18a2 2 0 0 0 2-2.4l-1.3-6A2 2 0 0 0 16.7 4H7" />
      <rect x="3" y="4" width="4" height="10" rx="1" />
    </svg>
  );
}

export function IconAlert({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v5M12 16h.01" />
    </svg>
  );
}

export function IconClose({ size = 22, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function IconPlus({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconMinus({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M5 12h14" />
    </svg>
  );
}

/** 复位视图：环形箭头。 */
export function IconReset({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size, className)}>
      <path d="M4.5 12a7.5 7.5 0 1 1 2.4 5.5" />
      <path d="M4.5 17v-4.5H9" />
    </svg>
  );
}
