/**
 * N 动物形象 · 共享工具。
 *
 * 坐标约定（与 sakura-fall 一致）：所有几何画在「短边 = 1000」的虚拟坐标里，
 * 外层 `<g transform="scale(q)">` 放大到实际像素 → 体积与分辨率解耦，线宽自动随短边缩放（铁律 6）。
 *
 * 形状复用：同一个动物轮廓只在 `<defs>` 里定义一次（`<g id>`），每个实例一个 `<use>`；
 * id 由内容哈希得到 → 同内容同 id，页面上多张缩略图并存时也不会互相串色。
 */
import { hashSeed, mulberry32 } from '../../engine/rng';
import type { ParamValue } from '../types';

export const V = 1000;

/** 1 位小数、去 -0。 */
export const f1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

/** 整数（去 -0）。 */
export const i0 = (v: number): string => {
  const r = Math.round(v);
  return Object.is(r, -0) ? '0' : String(r);
};

/** 0~1 透明度，2 位小数。 */
export const op = (v: number): string => {
  const r = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
  return String(r);
};

export function num(params: Readonly<Record<string, ParamValue>>, k: string, lo: number, hi: number): number {
  const v = Number(params[k]);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

/** 虚拟坐标框架：q = 实际像素 / 虚拟单位。 */
export function frame(W: number, H: number): { q: number; Wv: number; Hv: number } {
  const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
  return { q, Wv: W / q, Hv: H / q };
}

/** 内容哈希 id（同内容 → 同 id）。 */
export function hid(prefix: string, content: string): string {
  return prefix + hashSeed(content).toString(36);
}

/** 由 seed + 盐派生一个独立随机源（避免「重算一遍」时打乱主 rng 的消耗序列）。 */
export function subRng(seed: number, salt: string): () => number {
  return mulberry32(hashSeed(`${seed}|${salt}`));
}

/** 近似高斯（3 个均匀数之和），均值 0、范围 ±1.5。 */
export function gauss(rng: () => number): number {
  return rng() + rng() + rng() - 1.5;
}

/** `<use>` 的 transform：translate + rotate（+ 可选 scale），整数/1 位小数。 */
export function placeT(x: number, y: number, deg: number, s = 1): string {
  const r = Math.round(((deg % 360) + 360) % 360);
  let t = `translate(${i0(x)} ${i0(y)})`;
  if (r !== 0) t += `rotate(${r})`;
  if (Math.abs(s - 1) > 0.005) t += `scale(${String(Math.round(s * 100) / 100)})`;
  return t;
}

/**
 * 平铺单元内的无缝复制：返回中心 (x,y)、半径 r 的图形在 w×h 单元内需要画的所有平移副本。
 */
export function wrapOffsets(x: number, y: number, r: number, w: number, h: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const dx of [-w, 0, w]) {
    for (const dy of [-h, 0, h]) {
      const cx = x + dx;
      const cy = y + dy;
      if (cx + r < 0 || cx - r > w || cy + r < 0 || cy - r > h) continue;
      out.push([cx, cy]);
    }
  }
  return out;
}
