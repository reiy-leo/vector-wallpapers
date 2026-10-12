/**
 * 不规则色块（blob）共享几何 —— 供 scatter-blobs / pebble-field / terrazzo / blob-contours 使用。
 *
 * 做法：在圆周上等角取 k 个点，每点半径按 seeded 随机伸缩（irregular 控制幅度），
 * 再用 Catmull-Rom → 三次贝塞尔把这些点平滑闭合。所以每块形状都不一样，但永远圆润无尖角。
 *
 * 无缝：压在画布边缘的色块会在对边复制一份（±W / ±H），整幅图首尾相接可直接平铺。
 * 所有坐标保留 1 位小数并用相对指令 —— 色块多时体积是瓶颈。
 */

const f = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

/** 生成单块轮廓的点（不含平移），角度起点随机，避免所有色块朝向一致。 */
export function blobPoints(r: number, k: number, irregular: number, rng: () => number, squash = 1): Array<[number, number]> {
  const a0 = rng() * Math.PI * 2;
  const rot = rng() * Math.PI;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < k; i++) {
    const a = a0 + (i / k) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / k) * 0.6;
    const rr = r * (1 - irregular / 2 + rng() * irregular);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * squash;
    pts.push([x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

/** 把轮廓点平移到 (cx,cy) 后闭合成平滑 path d（相对 c 指令）。 */
export function blobD(pts: ReadonlyArray<readonly [number, number]>, cx: number, cy: number, scale = 1): string {
  const k = pts.length;
  const P = (i: number): [number, number] => {
    const p = pts[((i % k) + k) % k];
    return [cx + p[0] * scale, cy + p[1] * scale];
  };
  let [px, py] = P(0);
  let d = `M${f(px)} ${f(py)}`;
  for (let i = 0; i < k; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `c${f(c1x - px)} ${f(c1y - py)} ${f(c2x - px)} ${f(c2y - py)} ${f(p2[0] - px)} ${f(p2[1] - py)}`;
    // 以四舍五入后的终点为新基准，防止相对坐标累积漂移
    px += Math.round((p2[0] - px) * 10) / 10;
    py += Math.round((p2[1] - py) * 10) / 10;
  }
  return d + 'z';
}

/** 色块压边时返回其在对边的复制位置（含自身）→ 整幅图可无缝平铺。 */
export function wrapCenters(cx: number, cy: number, r: number, W: number, H: number): Array<[number, number]> {
  const xs = [cx];
  const ys = [cy];
  if (cx - r < 0) xs.push(cx + W);
  if (cx + r > W) xs.push(cx - W);
  if (cy - r < 0) ys.push(cy + H);
  if (cy + r > H) ys.push(cy - H);
  const out: Array<[number, number]> = [];
  for (const x of xs) for (const y of ys) out.push([x, y]);
  return out;
}

/**
 * best-candidate（Mitchell）落位：随机但均匀，不扎堆。在 [0,W)×[0,H) 的环面上量距离，
 * 与 wrapCenters 配合保证接缝两侧也不扎堆。
 */
export function scatter(count: number, W: number, H: number, rng: () => number, cand = 8): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    let best: [number, number] = [0, 0];
    let bestD = -1;
    for (let c = 0; c < cand; c++) {
      const x = rng() * W;
      const y = rng() * H;
      let d = Infinity;
      for (const [qx, qy] of pts) {
        const dx = Math.min(Math.abs(qx - x), W - Math.abs(qx - x));
        const dy = Math.min(Math.abs(qy - y), H - Math.abs(qy - y));
        d = Math.min(d, dx * dx + dy * dy);
      }
      if (d > bestD) {
        bestD = d;
        best = [x, y];
      }
    }
    pts.push(best);
  }
  return pts;
}

