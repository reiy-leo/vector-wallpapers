/**
 * 颜色工具 —— 自研约 120 行，刻意不引入 chroma-js / colorjs（架构 §1.6）。
 *
 * ⭐ 本文件最重要的契约是 `normalizeHex`：渲染产物一旦脱离页面（下载、`<img>`、
 * canvas 光栅化）就再也拿不到 CSS 变量上下文，因此**只允许字面量 hex**
 * 进入 SVG 属性；`var(--x)` / `currentColor` 会被静默替换为兜底色，
 * 杜绝「预览好看、导出变黑」这类不一致。
 */
import type { PaintSpec, PaintStop } from '../patterns/types';

/** 十六进制色值字面量（3 位或 6 位）。 */
const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** 兜底色：任何非法输入都退化为它，绝不让非法字符串进入 SVG。 */
export const FALLBACK_HEX = '#000000';

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value);
}

/**
 * 归一化为小写 6 位 hex。
 * - 3 位展开为 6 位
 * - 剥离空白
 * - 任何非 hex 输入（含 `var()` / `currentColor` / `url()`）→ `fallback`
 */
export function normalizeHex(value: unknown, fallback: string = FALLBACK_HEX): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\s+/g, '').toLowerCase();
  if (!HEX_RE.test(trimmed)) return fallback;
  const body = trimmed.slice(1);
  return `#${body.length === 3 ? body[0] + body[0] + body[1] + body[1] + body[2] + body[2] : body}`;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Hsl {
  /** 0~360 */
  h: number;
  /** 0~1 */
  s: number;
  /** 0~1 */
  l: number;
}

function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

function toHex2(v: number): string {
  return clamp255(v).toString(16).padStart(2, '0');
}

export function hexToRgb(hex: string): Rgb {
  const h = normalizeHex(hex);
  return {
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
  else if (max === gn) h = ((bn - rn) / d + 2) * 60;
  else h = ((rn - gn) / d + 4) * 60;
  return { h, s, l };
}

function hueToRgb(p: number, q: number, tRaw: number): number {
  let t = tRaw;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hn = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hueToRgb(p, q, hn + 1 / 3) * 255,
    g: hueToRgb(p, q, hn) * 255,
    b: hueToRgb(p, q, hn - 1 / 3) * 255,
  };
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHsl(r, g, b);
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/** 两色线性插值，t∈[0,1]。 */
export function mixHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return rgbToHex(ca.r + (cb.r - ca.r) * k, ca.g + (cb.g - ca.g) * k, ca.b + (cb.b - ca.b) * k);
}

/** 在 HSL 空间提亮，amount∈[0,1]。 */
export function lighten(hex: string, amount: number): string {
  const c = hexToHsl(hex);
  return hslToHex(c.h, c.s, Math.min(1, c.l + amount));
}

/** 在 HSL 空间压暗，amount∈[0,1]。 */
export function darken(hex: string, amount: number): string {
  const c = hexToHsl(hex);
  return hslToHex(c.h, c.s, Math.max(0, c.l - amount));
}

/** WCAG 相对亮度。 */
export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const f = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 对比度，1~21。 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 该色是否属于「暗色」（UI 决定用白字还是黑字）。 */
export function isDark(hex: string): boolean {
  return relativeLuminance(hex) < 0.4;
}

/** 规范化色标：offset clamp 到 [0,1]、颜色转字面量 hex、按 offset 升序。 */
export function normalizeStops(stops: readonly PaintStop[]): PaintStop[] {
  const cleaned = stops
    .map((s) => {
      const out: PaintStop = {
        offset: s.offset < 0 ? 0 : s.offset > 1 ? 1 : s.offset,
        color: normalizeHex(s.color),
      };
      // stop-opacity 可选：只在显式给出时透传，省略时引擎不输出该属性
      if (s.opacity !== undefined) out.opacity = s.opacity < 0 ? 0 : s.opacity > 1 ? 1 : s.opacity;
      return out;
    })
    .sort((a, b) => a.offset - b.offset);
  if (cleaned.length === 0) return [];
  if (cleaned.length === 1) {
  // 单色标无法表达渐变：复制为 0/1 两端，语义上等价于纯色且视觉稳定。
    return [
      { offset: 0, color: cleaned[0].color, opacity: cleaned[0].opacity },
      { offset: 1, color: cleaned[0].color, opacity: cleaned[0].opacity },
    ];
  }
  return cleaned;
}

/**
 * 提取 PaintSpec 的所有字面量颜色（供 UI 的取色器 / 随机配色使用）。
 * `none` 返回空数组。
 */
export function paintColors(paint: PaintSpec): string[] {
  if (paint.type === 'solid') return [normalizeHex(paint.color)];
  if (paint.type === 'none') return [];
  return normalizeStops(paint.stops).map((s) => s.color);
}

/** 该 PaintSpec 是否含渐变（UI 据此决定是否展开渐变编辑器）。 */
export function isGradient(paint: PaintSpec): boolean {
  return paint.type === 'linear' || paint.type === 'radial';
}

// ────────────────────────────────────────────────────────────────
// 随机配色（PRD Q3 决策：策略 C 智能邻近色 HSL 规则）
// ────────────────────────────────────────────────────────────────

/** 三档取色模式（PRD Q3：默认 `analogous`，另提供 `palette` / `full`）。 */
export type ColorStrategy = 'palette' | 'analogous' | 'full';

/**
 * 色相轮上的黄金角（137.508°）。
 *
 * 为什么是它：黄金角与「相邻的黄金角倍数」构成一组三维空间低差异序列，
 * 因此无论取第几个点，与前若干个点的色相距离都不至于过近——
 * 这正是「智能邻近色」需要的性质，比简单 ±30° 抖动更耐看。
 */
export const GOLDEN_ANGLE = 137.508;

/** 全色域模式下的饱和度 / 亮度区间 —— 避开刺眼的纯色。 */
const FULL_S_RANGE: readonly [number, number] = [0.35, 0.78];
const FULL_L_RANGE: readonly [number, number] = [0.32, 0.74];

/**
 * 生成一组邻近色（PRD Q3 的默认策略）。
 *
 * @param base 基准色（通常是当前底色），由此推导整组和谐色
 * @param count 需要几个颜色
 * @param rng 确定性随机源 —— 同一 seed 必须产出同一组色
 * @returns 长度 = count 的hex 数组，按「由浅到深」排序，便于直接映射到元件 role
 */
export function analogousPalette(base: string, count: number, rng: () => number): string[] {
  const anchor = hexToHsl(base);
  const out: string[] = [];
  // 以黄金角在色相环上取点：每一步都保证与已有色的色相距离足够
  let h = anchor.h + rng() * 20 - 10;
  for (let i = 0; i < count; i++) {
    const s = Math.min(1, Math.max(0.12, anchor.s * (0.72 + rng() * 0.55)));
    const l = Math.min(0.92, Math.max(0.1, anchor.l + (i - (count - 1) / 2) * 0.09 + (rng() - 0.5) * 0.06));
    out.push(hslToHex((h % 360 + 360) % 360, s, l));
    h += GOLDEN_ANGLE * (0.32 + rng() * 0.28);
  }
  // 按**感知亮度**排序而非 HSL 明度：黄色 l=0.6 但相对亮度远高于蓝色 l=0.5，
  // 只看 l 会排出「看起来忽明忽暗」的一组色。相对亮度才对应人眼感受。
  return out.sort((a, b) => relativeLuminance(b) - relativeLuminance(a));
}

/**
 * 全色域 HSL 取色（PRD Q3 的「跳脱」模式）。
 * 亮度沿「亮 → 中 → 暗」分布，保证一组色里有可用的底色与前景色。
 */
export function fullRangePalette(count: number, rng: () => number): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = count <= 1 ? 0.5 : i / (count - 1);
    const s = FULL_S_RANGE[0] + rng() * (FULL_S_RANGE[1] - FULL_S_RANGE[0]);
    // 明度按角色递减：第0 个最亮（当底色），最后一个最暗（当前景/文字色）
    const l = FULL_L_RANGE[1] - t * (FULL_L_RANGE[1] - FULL_L_RANGE[0]);
    out.push(hslToHex(rng() * 360, s, l));
  }
  return out;
}

/**
 * 从既有色板中按 rng 取色（PRD Q3 的「和谐」模式）。
 * 不引入新颜色，只在已有色板内重新分配 → 保证整体调性不漂移。
 */
export function pickFromPalette(palette: readonly string[], count: number, rng: () => number): string[] {
  if (palette.length === 0) return fullRangePalette(count, rng);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const color = normalizeHex(palette[Math.floor(rng() * palette.length) % palette.length]);
    out.push(color);
  }
  return out;
}

/** 三档模式的统一入口 —— UI 只需传 strategy。 */
export function generateColors(
  strategy: ColorStrategy,
  opts: { base: string; count: number; palette: readonly string[]; rng: () => number },
): string[] {
  const { base, count, palette, rng } = opts;
  switch (strategy) {
    case 'palette':
      return pickFromPalette(palette, count, rng);
    case 'full':
      return fullRangePalette(count, rng);
    case 'analogous':
    default:
      return analogousPalette(base, count, rng);
  }
}