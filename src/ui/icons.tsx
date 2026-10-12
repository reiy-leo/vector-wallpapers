/**
 * 图标集 —— 内联 SVG，零依赖。
 *
 * 为什么不引图标库：一个 12 图标的库打包后 8~15KB gzip，
 * 而本项目首屏预算只有 300KB 且已花在引擎上。
 * 内联 SVG 让「图标」这件事零成本，且天然支持 `currentColor`。
 *
 * 规格统一：24×24 viewBox、stroke 1.75（比默认 2 更轻，
 * 在 14px 字号下不会显糊）、`stroke-linecap/linejoin: round`。
 * 渲染尺寸由 props.size 决定，默认 16px —— 与 14px 正文的 x-height 视觉匹配。
 *
 * ⭐ Kumo 规则 `icon-alignment`：图标必须与文字**首行**垂直居中。
 * 配合 `h-lh` 类使用（见 theme.css），不要用 `items-center` 配多行文本。
 */
import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'width' | 'height'> {
  size?: number;
}

function Svg({ size = 16, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 元件显隐：眼睛 / 斜线眼（隐藏态）。 */
export function IconEye({ off = false, ...p }: IconProps & { off?: boolean }) {
  return (
    <Svg {...p}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
      {!off && <path d="M4 20 20 4" strokeWidth={1.5} opacity={0.55} />}
    </Svg>
  );
}

/** 锁定：锁扣闭合表示锁定，锁定后该元件不再参与随机配色。 */
export function IconLock({ open = false, ...p }: IconProps & { open?: boolean }) {
  return (
    <Svg {...p}>
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      {!open && <path d="M8 10V7a4 4 0 0 1 8 0v3" />}
    </Svg>
  );
}

/** 换一版：循环箭头 —— 「用新 seed 再渲染一次」。 */
export function IconShuffle({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 11a8 8 0 0 0-14.3-4.9M4 13a8 8 0 0 0 14.3 4.9" />
      <path d="M20 4v4h-4M4 20v-4h4" />
    </Svg>
  );
}

/** 下载 */
export function IconDownload({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 20h16" />
    </Svg>
  );
}

/** 分享：节点连线（对应「复制链接」）。 */
export function IconShare({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </Svg>
  );
}

/** 聚焦全屏 */
export function IconFocus({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    </Svg>
  );
}

/** 栅格叠加 */
export function IconGrid({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 4h16v16H4z" />
      <path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" />
    </Svg>
  );
}

/** 太阳（浅色主题） */
export function IconSun({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.4M12 19.6V22M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7M2 12h2.4M19.6 12H22M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7" />
    </Svg>
  );
}

/** 月亮（深色主题） */
export function IconMoon({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
    </Svg>
  );
}

/** 跟随系统 */
export function IconAuto({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="4.5" width="19" height="13" rx="2" />
      <path d="M8.5 20.5h7M12 17.5v3" />
      <path d="M12 7.5v7M9 10.5a4.2 4.2 0 0 0 6 0" />
    </Svg>
  );
}

/** 搜索 */
export function IconSearch({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </Svg>
  );
}

/** 关闭 */
export function IconClose({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

/** 收藏（实心态与空心态用 fill 区分）。 */
export function IconStar({ filled = false, ...p }: IconProps & { filled?: boolean }) {
  return (
    <Svg {...p} fill={filled ? 'currentColor' : 'none'}>
      <path d="m12 3.6 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />
    </Svg>
  );
}

/** 撤销 / 重置 */
export function IconReset({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3 4v5h5" />
    </Svg>
  );
}

/** 复制 */
export function IconCopy({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <rect x="9" y="9" width="12" height="12" rx="2.5" />
      <path d="M5.5 15H5a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 5 3.5h8.5A1.5 1.5 0 0 1 15 5v.5" />
    </Svg>
  );
}

/** 代码 / 源码 */
export function IconCode({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4" />
    </Svg>
  );
}

/** 骰子（随机 seed） */
export function IconDice({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** 提示 / 信息 */
export function IconInfo({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5M12 7.8v.4" />
    </Svg>
  );
}

/** 警告 */
export function IconWarn({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 4.5 21 19.5H3Z" />
      <path d="M12 10v4M12 16.8v.4" />
    </Svg>
  );
}

/** 成功 */
export function IconCheck({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <path d="m4.5 12.5 5 5 10-11" />
    </Svg>
  );
}

/** 展开 / 收起（面板折叠） */
export function IconChevron({ dir = 'down', ...p }: IconProps & { dir?: 'up' | 'down' | 'left' | 'right' }) {
  const rot = { down: 0, up: 180, left: 90, right: -90 }[dir];
  return (
    <Svg {...p} style={{ transform: `rotate(${rot}deg)`, ...p.style }}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  );
}

/** 左侧栏开关 */
export function IconPanel({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
    </Svg>
  );
}

/** 胶片（画廊） */
export function IconGallery({ ...p }: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3 15.5 4.5-4 4 3.5" />
      <circle cx="15" cy="9.5" r="1.5" />
    </Svg>
  );
}
