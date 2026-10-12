/**
 * 风景母题共享工具（E-scene）—— 纯函数，随机数只来自调用方传入的 rng。
 *
 * 约定：所有几何画在「短边 = V」的虚拟坐标里，整层用 `transform="scale(q)"` 放大到真实像素，
 * 坐标与分辨率解耦（铁律 6：不硬编码像素，尺寸按短边推导），路径用整数相对坐标压体积。
 */

/** 数值参数读取 + clamp（容错：非数字回落到下限）。 */
export function num(params: Readonly<Record<string, unknown>>, k: string, lo: number, hi: number): number {
  const v = Number(params[k]);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

export interface Virt {
  /** 真实像素 / 虚拟单位 */
  q: number;
  /** 虚拟坐标下的画面宽高 */
  Wv: number;
  Hv: number;
  /** 放大变换 */
  tf: string;
}

/** 虚拟坐标系：短边 = V。 */
export function virt(W: number, H: number, V: number): Virt {
  const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
  return { q, Wv: W / q, Hv: H / q, tf: `scale(${q})` };
}

/** 1 位小数格式化（去 -0）。 */
export function f1(v: number): string {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
}

/**
 * 一维值噪声（多倍频，余弦插值），返回 f(t) ∈ 约 [-1, 1]，t 为任意实数（通常 0~1）。
 * 每个倍频固定消耗 `cells + 2` 个随机数 → 调用顺序固定即确定性。
 */
export function noise1D(rng: () => number, cells: number, octaves: number, gain = 0.5): (t: number) => number {
  const tables: number[][] = [];
  for (let o = 0; o < octaves; o++) {
    const c = cells * 2 ** o;
    const t: number[] = [];
    for (let i = 0; i < c + 2; i++) t.push(rng() * 2 - 1);
    tables.push(t);
  }
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += gain ** o;
  return (x: number): number => {
    let s = 0;
    for (let o = 0; o < octaves; o++) {
      const tb = tables[o];
      const c = cells * 2 ** o;
      const u = Math.max(0, Math.min(c, x * c));
      const i = Math.min(c, Math.floor(u));
      const fr = u - i;
      const w = (1 - Math.cos(fr * Math.PI)) / 2;
      s += (tb[i] * (1 - w) + tb[i + 1] * w) * gain ** o;
    }
    return s / norm;
  };
}

type Pt = readonly [number, number];

/** 折线 → `M x y l dx dy …`（整数相对坐标，连续零位移点省略）。不闭合。 */
export function encLine(pts: ReadonlyArray<Pt>): string {
  if (pts.length === 0) return '';
  let px = Math.round(pts[0][0]);
  let py = Math.round(pts[0][1]);
  let d = `M${px} ${py}`;
  let body = '';
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round(pts[i][0]);
    const y = Math.round(pts[i][1]);
    const dx = x - px;
    const dy = y - py;
    if (dx === 0 && dy === 0) continue;
    body += `${body === '' || dx < 0 ? '' : ' '}${dx}${dy < 0 ? '' : ' '}${dy}`;
    px = x;
    py = y;
  }
  if (body !== '') d += `l${body}`;
  return d;
}

/**
 * 平滑曲线：二次贝塞尔「中点法」—— 控制点取原始点、端点取相邻中点，曲线过首尾点。
 * 输出 `M … q cx cy ex ey …`（整数相对坐标）。不闭合。
 */
export function encSmooth(pts: ReadonlyArray<Pt>): string {
  if (pts.length < 3) return encLine(pts);
  const r = (v: number): number => Math.round(v);
  let px = r(pts[0][0]);
  let py = r(pts[0][1]);
  let d = `M${px} ${py}`;
  const seg = (cx: number, cy: number, ex: number, ey: number): void => {
    const a = [r(cx) - px, r(cy) - py, r(ex) - px, r(ey) - py];
    let s = '';
    a.forEach((v, i) => {
      s += i === 0 || v < 0 ? String(v) : ` ${v}`;
    });
    d += `q${s}`;
    px = r(ex);
    py = r(ey);
  };
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const nx = i === pts.length - 2 ? pts[i + 1][0] : (x + pts[i + 1][0]) / 2;
    const ny = i === pts.length - 2 ? pts[i + 1][1] : (y + pts[i + 1][1]) / 2;
    seg(x, y, nx, ny);
  }
  return d;
}

/** 当前笔位置之后追加「到 (x,y) 的绝对 L」再闭合（用于把曲线封到画面底部）。 */
export function closeDown(d: string, xr: number, xl: number, yb: number): string {
  return `${d}L${Math.round(xr)} ${Math.round(yb)}L${Math.round(xl)} ${Math.round(yb)}z`;
}

const HEX = /^#([0-9a-f]{6})$/i;

/** 是否为 6 位字面量 hex（渐变 paintValue 为 url(#…)，不能参与混色）。 */
export function isHex(v: string): boolean {
  return HEX.test(v);
}

function rgb(h: string): [number, number, number] {
  const m = HEX.exec(h);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 两色线性混合（t=0 → a，t=1 → b）。任一非 hex 时直接返回 a（保持用户的渐变引用）。 */
export function mix(a: string, b: string, t: number): string {
  if (!isHex(a) || !isHex(b)) return a;
  const A = rgb(a);
  const B = rgb(b);
  const c = A.map((v, i) => Math.round(v + (B[i] - v) * Math.max(0, Math.min(1, t))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 零长度圆点子路径（配合 stroke-linecap=round），按 x 排序以缩短相对位移。 */
export function encDots(pts: Array<[number, number]>): string {
  const list = pts.map(([x, y]) => [Math.round(x), Math.round(y)] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let d = '';
  let px = 0;
  let py = 0;
  list.forEach(([x, y], i) => {
    d += i === 0 ? `M${x} ${y}h0` : `m${x - px} ${y - py}h0`;
    px = x;
    py = y;
  });
  return d;
}

/** 横向短线段（圆头描边）：每段 [x, y, len]。按 y、x 排序。 */
export function encDashes(segs: Array<[number, number, number]>): string {
  const list = segs
    .map(([x, y, l]) => [Math.round(x), Math.round(y), Math.max(1, Math.round(l))] as [number, number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  let d = '';
  let px = 0;
  let py = 0;
  list.forEach(([x, y, l], i) => {
    d += i === 0 ? `M${x} ${y}h${l}` : `m${x - px} ${y - py}h${l}`;
    px = x + l;
    py = y;
  });
  return d;
}

/**
 * 分形山脊（中点位移）：返回 f(t)，t∈[0,1] → 约 [-1, 1]。
 * `rough` 越大越崎岖（每级振幅衰减 = 2^-(1-rough)·…）。固定消耗 2^levels + 1 个随机数。
 */
export function fractal1D(rng: () => number, levels: number, rough: number, skip = 0): (t: number) => number {
  const n = 2 ** levels;
  const a: number[] = new Array(n + 1).fill(0);
  a[0] = rng() * 2 - 1;
  a[n] = rng() * 2 - 1;
  let amp = 1;
  const decay = 0.42 + rough * 0.2;
  if (skip > 0) {
    a[0] *= 0.1;
    a[n] *= 0.1;
  }
  let lv = 0;
  for (let step = n; step > 1; step /= 2) {
    const k = lv++ < skip ? 0.1 : 1;
    for (let i = 0; i < n; i += step) {
      a[i + step / 2] = (a[i] + a[i + step]) / 2 + (rng() * 2 - 1) * amp * k;
    }
    amp *= decay;
  }
  let mx = 0;
  for (const v of a) mx = Math.max(mx, Math.abs(v));
  const k = mx > 0 ? 1 / mx : 1;
  return (t: number): number => {
    const u = Math.max(0, Math.min(n, t * n));
    const i = Math.min(n - 1, Math.floor(u));
    const fr = u - i;
    return (a[i] * (1 - fr) + a[i + 1] * fr) * k;
  };
}

/**
 * 山峰剪影高度场：若干「锥形山峰」取上包络（相邻山峰相交处自然形成 V 形山谷），
 * 再叠一层分形细节让山脊线有碎石感。返回 h(x) ≥ 0（虚拟单位，向上为正）。
 * 固定消耗：count×3 + 2^8+1 个随机数。
 */
export function peakRange(
  rng: () => number,
  o: { x0: number; x1: number; count: number; height: number; slope: [number, number]; detail: number },
): (x: number) => number {
  const peaks: Array<[number, number, number]> = [];
  const span = o.x1 - o.x0;
  for (let i = 0; i < o.count; i++) {
    const px = o.x0 + ((i + 0.15 + rng() * 0.7) / o.count) * span;
    const ph = o.height * (0.45 + rng() * 0.55);
    const s = o.slope[0] + rng() * (o.slope[1] - o.slope[0]);
    peaks.push([px, ph, s]);
  }
  const fr = fractal1D(rng, 8, 0.9, 3);
  return (x: number): number => {
    let h = 0;
    for (const [px, ph, s] of peaks) {
      const d = Math.abs(x - px);
      // 山顶略圆、山腰略凹：|d|^0.9
      const v = ph - s * Math.pow(d, 0.92) * 1.4;
      if (v > h) h = v;
    }
    return Math.max(0, h + fr((x - o.x0) / span) * o.detail * (0.3 + 0.7 * Math.min(1, h / (o.height * 0.6))));
  };
}
