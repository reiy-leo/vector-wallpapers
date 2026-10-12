/**
 * M-movement（设计流派）共用小工具 —— 纯函数，无副作用。
 */

/** 数值 clamp（NaN → lo）。 */
export function clampNum(v: unknown, lo: number, hi: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

/** 整数格式化（-0 → 0），用于虚拟坐标系里的紧凑路径。 */
export function ri(v: number): string {
  const r = Math.round(v);
  return Object.is(r, -0) ? '0' : String(r);
}

/**
 * 短哈希（FNV-1a 32 位 → base36），给 body 内自建 `<defs>` 的 id 加盐：
 * 同一页面多张缩略图并存时，不同几何不会撞 id。
 */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** 不透明度格式化到 2 位小数。 */
export function op(v: number): string {
  const r = Math.round(Math.max(0, Math.min(1, v)) * 100) / 100;
  return String(r);
}
