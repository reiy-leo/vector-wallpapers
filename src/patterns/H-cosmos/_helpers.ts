/**
 * H 宇宙天文 · 共享工具 —— 纯函数，随机数只来自调用方传入的 rng。
 *
 * 约定：几何画在「短边 = V」的虚拟坐标里，整层 `scale(q)` 放大到真实像素，
 * 体积与分辨率解耦；线宽也在虚拟坐标里定义，因此天然随短边缩放（铁律 6）。
 */
import type { ResolvedElement } from '../types';

export const V = 1000;

export type Pt = [number, number];

/** 数值参数读取 + clamp（非数字回落到下限）。 */
export function num(params: Readonly<Record<string, unknown>>, k: string, lo: number, hi: number): number {
  const v = Number(params[k]);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** 虚拟坐标系：短边 = V。 */
export function virt(W: number, H: number): { q: number; Wv: number; Hv: number } {
  const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
  return { q, Wv: W / q, Hv: H / q };
}

/** 1 位小数（去 -0）。 */
export function f1(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

/** 不透明度格式化（clamp 到 0~1，两位小数）。 */
export function op(v: number): string {
  const r = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
  return String(r);
}

/**
 * 元件的「基准色」—— 渐变层需要用元件色做色标（元件本身仍是纯色）。
 * 纯色取 color；渐变取首个色标（探针测试改的正是首个色标，故改色必然生效）。
 */
export function hexOf(e: ResolvedElement): string {
  // 隐藏元件：不泄露其 paint（引擎契约：隐藏后改色不得影响产物）
  if (!e.visible) return '#000000';
  const p = e.paint;
  if (p.type === 'solid') return p.color;
  if ((p.type === 'linear' || p.type === 'radial') && p.stops.length > 0) return p.stops[0].color;
  return '#000000';
}

/** 标准正态（Box-Muller，固定消耗 2 个随机数）。 */
export function gauss(rng: () => number): number {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 点列 → 零长度子路径（配合 round 线帽画圆点），整数相对坐标，约 9B/点。 */
export function dotPath(pts: ReadonlyArray<Pt>): string {
  let d = '';
  let px = 0;
  let py = 0;
  for (const [X, Y] of pts) {
    const x = Math.round(X);
    const y = Math.round(Y);
    d += d === '' ? `M${x} ${y}h0` : `m${x - px} ${y - py}h0`;
    px = x;
    py = y;
  }
  return d.replace(/ -/g, '-');
}

/** 整圆子路径（两段弧），用于把多个圆合并进一条 path。 */
export function circleSub(cx: number, cy: number, r: number): string {
  const R = f1(r);
  return `M${f1(cx - r)} ${f1(cy)}a${R} ${R} 0 1 0 ${f1(2 * r)} 0a${R} ${R} 0 1 0 ${f1(-2 * r)} 0`;
}

/** 四角星芒（十字细光），中心 (x,y)，臂长 L、腰宽 w。 */
export function sparkle(x: number, y: number, L: number, w: number): string {
  return (
    `M${f1(x)} ${f1(y - L)}L${f1(x + w)} ${f1(y - w)}L${f1(x + L)} ${f1(y)}L${f1(x + w)} ${f1(y + w)}` +
    `L${f1(x)} ${f1(y + L)}L${f1(x - w)} ${f1(y + w)}L${f1(x - L)} ${f1(y)}L${f1(x - w)} ${f1(y - w)}z`
  );
}

/** 按字节上限截断点集：返回能放进 cap 的最大前缀长度（二分）。 */
export function fitCount(n: number, cap: number, sizeOf: (k: number) => number): number {
  if (sizeOf(n) <= cap) return n;
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sizeOf(mid) <= cap) lo = mid;
    else hi = mid;
  }
  return lo;
}
