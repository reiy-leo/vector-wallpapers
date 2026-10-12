/**
 * I-optical 共享小工具（纯函数，无副作用）。
 */
import type { PaintStop, RenderApi, ResolvedElement } from '../types';

/** 读取数值控件并夹紧（防御 URL 里的脏值）。 */
export function numParam(params: Readonly<Record<string, unknown>>, key: string, lo: number, hi: number): number {
  const v = Number(params[key]);
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : lo;
}

/** 线宽 / 尺寸基准：短边 / 1080，夹到 [0.5, 4]（铁律 6）。 */
export function unitOf(w: number, h: number): number {
  return Math.max(0.5, Math.min(4, Math.min(w, h) / 1080));
}

/** FNV-1a → base36：给 body 内 `<defs>` 里的 id 去碰撞（同页多张缩略图共存）。 */
export function hashStr(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * 「辉光层」填充：纯色元件 → 以该色为中心、向外淡出的径向渐变（层，不是面）；
 * 用户若把它改成了渐变，就直接用其渐变 + 元件透明度。
 */
export function glowFill(
  api: RenderApi,
  el: ResolvedElement,
  at: { cx: number; cy: number; r: number },
  key: string,
): { fill: string; opacity: number } {
  if (!el.paintValue.startsWith('#')) return { fill: el.paintValue, opacity: el.opacity };
  const stops: PaintStop[] = [
    { offset: 0, color: el.paintValue, opacity: el.opacity },
    { offset: 0.55, color: el.paintValue, opacity: el.opacity * 0.35 },
    { offset: 1, color: el.paintValue, opacity: 0 },
  ];
  return { fill: api.radial({ cx: at.cx, cy: at.cy, r: at.r, stops, key }), opacity: 1 };
}
