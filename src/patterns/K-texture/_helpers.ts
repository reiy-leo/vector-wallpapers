/**
 * K-texture 共用小工具（纯函数，无副作用）。
 *
 * 约定：材质类母题多数在「短边 = V」的虚拟坐标里作画，再整体 `scale(q)` 放大，
 * 这样产物体积与输出分辨率解耦；坐标一律取整，路径用相对指令压缩字节。
 */

/** 虚拟坐标的短边长度。 */
export const V = 1000;

export type Pt = [number, number];

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** 读数值控件（容错：非数时回落到 lo）。 */
export function num(params: Readonly<Record<string, unknown>>, key: string, lo: number, hi: number): number {
  const v = Number(params[key]);
  return Number.isFinite(v) ? clamp(v, lo, hi) : lo;
}

/** 虚拟坐标缩放系数 q：短边 / V，保留 4 位小数。 */
export function scaleOf(W: number, H: number): number {
  return Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
}

/** 0~1 不透明度格式化。 */
export function op(v: number): string {
  const r = Math.round(clamp(v, 0, 1) * 100) / 100;
  return String(r);
}

/** 拉一个整数增量：正数前补空格，负数直接接（负号即分隔符）。 */
function pushNum(out: string, v: number, first: boolean): string {
  if (first) return out + String(v);
  return out + (v < 0 ? String(v) : ` ${v}`);
}

/**
 * 折线 → 相对坐标 path 数据（整数精度）。
 * 首点绝对 `M`，其余 `l` 相对；`closed` 时追加 `z`。
 * 返回值可直接拼进同一条 path 的 d（多段折线共用一个元素）。
 */
export function polyD(pts: ReadonlyArray<Pt>, closed = false): string {
  if (pts.length === 0) return '';
  let x = Math.round(pts[0][0]);
  let y = Math.round(pts[0][1]);
  let d = `M${x}`;
  d = pushNum(d, y, false);
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const nx = Math.round(pts[i][0]);
    const ny = Math.round(pts[i][1]);
    const dx = nx - x;
    const dy = ny - y;
    if (dx === 0 && dy === 0) continue;
    if (first) {
      d += 'l';
      d = pushNum(d, dx, true);
      first = false;
    } else {
      d = pushNum(d, dx, false);
    }
    d = pushNum(d, dy, false);
    x = nx;
    y = ny;
  }
  return closed ? `${d}z` : d;
}

/** Ramer–Douglas–Peucker 折线化简（tol 为虚拟坐标单位）。 */
export function simplify(pts: ReadonlyArray<Pt>, tol: number): Pt[] {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  const t2 = tol * tol;
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a];
    const [bx, by] = pts[b];
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    let best = -1;
    let bestD = t2;
    for (let i = a + 1; i < b; i++) {
      const px = pts[i][0] - ax;
      const py = pts[i][1] - ay;
      const cr = px * dy - py * dx;
      const d2 = (cr * cr) / L2;
      if (d2 > bestD) {
        bestD = d2;
        best = i;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out: Pt[] = [];
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
