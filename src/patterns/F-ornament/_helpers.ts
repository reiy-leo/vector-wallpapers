/**
 * F-ornament（传统纹样）共用小工具。纯函数，无副作用。
 */

/** 线宽缩放基准：按短边，clamp 到 [0.5, 4]（铁律 6）。 */
export function unitOf(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

export function clamp(v: unknown, lo: number, hi: number, fallback = lo): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(hi, Math.max(lo, x));
}

/** 坐标取 2 位小数并去尾零（与 api.n 一致，局部用于拼 path 字符串）。 */
export function f(v: number): string {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? '0' : String(r);
}

/** 不透明度：1 时返回 undefined（builder 会省略该属性）。 */
export function op(v: number): number | undefined {
  return v >= 1 ? undefined : Math.round(v * 100) / 100;
}
