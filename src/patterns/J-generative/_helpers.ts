/**
 * J-generative 共用小工具（纯函数，无副作用）。
 *
 * 约定：单幅构图的几何画在「短边 = V(1000)」的虚拟坐标里，整体 `<g transform="scale(q)">`
 * 放大 → 坐标可取整数，体积与分辨率解耦（同 sakura-fall）。
 */

/** 虚拟坐标短边。 */
export const V = 1000;

export type P2 = readonly [number, number];

/** 读取数值控件并夹紧（防御 URL 注入的越界值）。 */
export function num(params: Readonly<Record<string, unknown>>, key: string, lo: number, hi: number): number {
  const v = Number(params[key]);
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/** 线宽单位：短边 / 1080，夹到 [0.5, 4]（铁律 6）。 */
export function unitOf(W: number, H: number): number {
  return Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
}

/** 虚拟坐标缩放系数 q（像素 = 虚拟 × q），保留 4 位小数。 */
export function scaleOf(W: number, H: number): number {
  return Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
}

/** 0~1 不透明度格式化。 */
export function op(v: number): string {
  const c = Math.max(0, Math.min(1, v));
  return String(Math.round(c * 100) / 100);
}

/** 紧凑地拼接一对相对坐标：省掉负号前的空格。 */
export function pair(dx: number, dy: number): string {
  return `${dx}${dy < 0 ? '' : ' '}${dy}`;
}

/** 闭合多边形 → 整数相对路径 `M x y l … z`（零位移顶点被省略）。 */
export function polyD(pts: ReadonlyArray<P2>): string {
  if (pts.length < 3) return '';
  let cx = Math.round(pts[0][0]);
  let cy = Math.round(pts[0][1]);
  let d = `M${pair(cx, cy)}l`;
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round(pts[i][0]);
    const y = Math.round(pts[i][1]);
    const dx = x - cx;
    const dy = y - cy;
    if (dx === 0 && dy === 0) continue;
    d += (first || dx < 0 ? '' : ' ') + pair(dx, dy);
    first = false;
    cx = x;
    cy = y;
  }
  return first ? '' : `${d}z`;
}

/**
 * 用半平面 `a·x + b·y ≤ c` 裁剪凸多边形（Sutherland–Hodgman 单边）。
 * 沃罗诺伊细胞与「凸多边形内缩」都复用它。
 */
export function clipHalf(poly: ReadonlyArray<P2>, a: number, b: number, c: number): P2[] {
  const out: P2[] = [];
  const m = poly.length;
  for (let i = 0; i < m; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % m];
    const fp = a * p[0] + b * p[1] - c;
    const fq = a * q[0] + b * q[1] - c;
    if (fp <= 0) out.push(p);
    if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) {
      const t = fp / (fp - fq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** 多边形有向面积（屏幕坐标下顺时针为正）。 */
export function area(poly: ReadonlyArray<P2>): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

/** 多边形质心（面积加权）。 */
export function centroid(poly: ReadonlyArray<P2>): P2 {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cr = p[0] * q[1] - q[0] * p[1];
    a += cr;
    cx += (p[0] + q[0]) * cr;
    cy += (p[1] + q[1]) * cr;
  }
  if (Math.abs(a) < 1e-9) return poly[0];
  return [cx / (3 * a), cy / (3 * a)];
}

/** 凸多边形整体内缩 d（每条边向内平移 d 后求交）；退化时返回空数组。 */
export function insetConvex(poly: ReadonlyArray<P2>, d: number): P2[] {
  if (d <= 0) return poly.slice();
  const sgn = area(poly) >= 0 ? 1 : -1;
  let out: P2[] = poly.slice();
  for (let i = 0; i < poly.length && out.length >= 3; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const ex = q[0] - p[0];
    const ey = q[1] - p[1];
    const len = Math.hypot(ex, ey);
    if (len < 1e-9) continue;
    // 外法线（顺时针多边形：(ey, -ex)）
    const nx = (sgn * ey) / len;
    const ny = (sgn * -ex) / len;
    // 保留 n·x ≤ n·p − d
    out = clipHalf(out, nx, ny, nx * p[0] + ny * p[1] - d);
  }
  return out.length >= 3 && Math.abs(area(out)) > 1 ? out : [];
}

/**
 * 低频平滑场（几组随机相位正弦叠加），值域约 [-1, 1]。
 * 用于把「颜色分组」做成成片的色域而不是满屏白噪声。
 */
export function smoothField(rng: () => number, scale: number): (x: number, y: number) => number {
  const waves = [0, 1, 2, 3].map(() => {
    const a = rng() * Math.PI * 2;
    const f = (0.6 + rng() * 0.9) / scale;
    return { kx: Math.cos(a) * f, ky: Math.sin(a) * f, ph: rng() * Math.PI * 2 };
  });
  return (x, y) => {
    let s = 0;
    for (const w of waves) s += Math.sin(x * w.kx + y * w.ky + w.ph);
    return s / 2;
  };
}
