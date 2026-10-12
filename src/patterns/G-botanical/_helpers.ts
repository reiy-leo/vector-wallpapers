/**
 * G-botanical 共用小工具（纯函数，无副作用）。
 *
 *  - `unitOf`：线宽 / 尺寸的分辨率缩放单位（铁律 6）。
 *  - `fx`：1 位小数格式化（植物几何在百像素量级，1 位足够且省体积）。
 *  - `leafPath`：把「单位叶形」（基部在原点、指向 +x、长度 1）变换到画布坐标，直接产出 path 片段。
 *  - `torusCopies`：无缝平铺单元里，跨越单元边界的图形需要在对侧补副本。
 *  - `scatterTorus`：环面上的最小间距随机散点（近似泊松盘），保证平铺后疏密均匀。
 */

export const clampN = (v: unknown, lo: number, hi: number, dflt: number): number => {
  const x = Number(v);
  return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : dflt;
};

export const unitOf = (W: number, H: number): number => Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));

/** 1 位小数、去 -0。 */
export const fx = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) || r === 0 ? '0' : String(r);
};

/** 不透明度格式化。 */
export const fo = (v: number): string => String(Math.round(Math.max(0, Math.min(1, v)) * 100) / 100);

/**
 * 单位叶形：控制点序列（M + 两段三次贝塞尔），基部 (0,0) → 尖端 (1,0)。
 * w = 半宽系数；shoulder = 最宽处位置（0~1）。
 */
export interface LeafShape {
  w: number;
  s1: number;
  s2: number;
}

export const LEAF_SHAPES: Record<string, LeafShape> = {
  willow: { w: 0.2, s1: 0.3, s2: 0.72 },
  laurel: { w: 0.34, s1: 0.22, s2: 0.68 },
  round: { w: 0.56, s1: 0.12, s2: 0.78 },
};

/** 叶片 path 片段：基部 (x,y)、方向角 a（弧度）、长度 len。 */
export function leafPath(x: number, y: number, a: number, len: number, sh: LeafShape): string {
  const c = Math.cos(a) * len;
  const s = Math.sin(a) * len;
  const P = (u: number, v: number): string => `${fx(x + u * c - v * s)} ${fx(y + u * s + v * c)}`;
  return (
    `M${P(0, 0)}C${P(sh.s1, -sh.w)} ${P(sh.s2, -sh.w * 0.9)} ${P(1, 0)}` +
    `C${P(sh.s2, sh.w * 0.9)} ${P(sh.s1, sh.w)} ${P(0, 0)}z`
  );
}

/** 叶脉（主脉）线段片段。 */
export function midribPath(x: number, y: number, a: number, len: number): string {
  const c = Math.cos(a) * len;
  const s = Math.sin(a) * len;
  return `M${fx(x + 0.06 * c)} ${fx(y + 0.06 * s)}L${fx(x + 0.82 * c)} ${fx(y + 0.82 * s)}`;
}

/** 以 r 为包围半径，返回在 w×h 平铺单元内需要绘制的全部平移副本。 */
export function torusCopies(x: number, y: number, r: number, w: number, h: number): Array<[number, number]> {
  const xs = [x];
  const ys = [y];
  if (x - r < 0) xs.push(x + w);
  if (x + r > w) xs.push(x - w);
  if (y - r < 0) ys.push(y + h);
  if (y + r > h) ys.push(y - h);
  const out: Array<[number, number]> = [];
  for (const a of xs) for (const b of ys) out.push([a, b]);
  return out;
}

/** 环面距离平方。 */
function torusD2(ax: number, ay: number, bx: number, by: number, w: number, h: number): number {
  let dx = Math.abs(ax - bx);
  let dy = Math.abs(ay - by);
  if (dx > w / 2) dx = w - dx;
  if (dy > h / 2) dy = h - dy;
  return dx * dx + dy * dy;
}

export interface Dot {
  x: number;
  y: number;
  r: number;
}

/**
 * 环面散点：依次尝试放入半径为 radii[i] 的圆，与已有点保持 (ri + rj) × gap 的间距。
 * 每个点固定消耗 tries×2 个随机数 → 结果只依赖 seed 与输入。
 */
export function scatterTorus(
  rng: () => number,
  radii: number[],
  w: number,
  h: number,
  gap: number,
  tries = 24,
  placed: Dot[] = [],
): Dot[] {
  const out: Dot[] = [];
  const all = placed.slice();
  for (const r of radii) {
    let best: Dot | null = null;
    let bestScore = -Infinity;
    for (let t = 0; t < tries; t++) {
      const x = rng() * w;
      const y = rng() * h;
      let score = Infinity;
      for (const p of all) {
        const need = (r + p.r) * gap;
        score = Math.min(score, Math.sqrt(torusD2(x, y, p.x, p.y, w, h)) - need);
      }
      if (score >= 0) {
        best = { x, y, r };
        bestScore = score;
        // 继续消耗随机数以保持确定的消耗量，但不再替换
        for (let k = t + 1; k < tries; k++) {
          rng();
          rng();
        }
        break;
      }
      if (score > bestScore) {
        bestScore = score;
        best = { x, y, r };
      }
    }
    // 放不下（间距被挤占）且严重重叠时跳过
    if (best && bestScore > -r * 0.9) {
      out.push(best);
      all.push(best);
    }
  }
  return out;
}

/** 小型 FNV-1a，用于把配置折成稳定的短 id 后缀。 */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** 把 [[x,y],...] 点列转成 path（绝对坐标，1 位小数）。 */
export function polyD(pts: ReadonlyArray<readonly [number, number]>, close = true): string {
  let d = '';
  pts.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${fx(x)} ${fx(y)}`;
  });
  return close ? `${d}z` : d;
}

/** 紧凑 path：压缩 " -" → "-"。 */
export const tight = (d: string): string => d.replace(/ -/g, '-');
