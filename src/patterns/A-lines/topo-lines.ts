/**
 * 流动等高线 —— A 极简线条。（id 保持 'topo-lines'）
 *
 * 2026-10-12 v2 重做。用户反馈：「线条上不丝滑，磕磕绊绊的，也不应当是等高线，
 * 而是用类似等高线的形式占满整个空间」。v1 病根：
 *  ❶ 双线性值噪声只有 C0 连续 + marching squares 粗网格 + 中点二次贝塞尔
 *     → 线上满是细小折角与台阶；
 *  ❷ 真·地形高度场有大片平地：等值面稀疏的地方整块留白，陡的地方挤成一团，还有小岛噪点。
 *
 * v2 做法：
 *  - **近似等梯度的标量场**：若干 seeded 中心的距离场做 smooth-min（log-sum-exp），
 *    距离场梯度恒为 1 → 等值线天然**等间距**铺满全画面；中心附近形成嵌套的涡旋圈，
 *    远处中心（画布外）贡献大段平行流动的带状线；smooth-min 把 Voronoi 交界的尖角揉圆。
 *  - **平滑域扭曲**：采样坐标先经过几组低频正弦（C∞）位移，位移梯度 ≤ ~0.45，
 *    线条有机流动但线距只在 ±50% 内「呼吸」，不会出现空洞或挤压。
 *  - **丝滑曲线**：marching squares 细网格（格 ≈ 线距/3）→ 线段串成长折线（闭环或出界）
 *    → 按弧长均匀重采样 → 均匀 Catmull-Rom → 三次贝塞尔，用 `s` 指令输出：
 *    s 的首控制点由上一段末控制点镜像而来，取整后**仍严格 C1 连续**，节点处零折角。
 *  - 周长 < 4.5 倍线距的小圈剔除（无小岛噪点）。
 *
 * 坐标系：内部统一用「短边 = 2160」的归一化空间（1 单位 ≈ 1080p 下 0.5px，取整误差不可见），整数相对坐标；非 1080 画布用
 * path 的 transform="scale(q)" 缩放 → 体积与分辨率解耦。BYTE_CAP 兜底：超限时
 * **整体加大线距重算**（而不是截断层级留下空白）。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';

const BYTE_CAP = 17000;
const SHORT = 2160;

type Pt = [number, number];

/** 三组随机方向的正弦叠加，值域约 [-1,1]，处处 C∞、梯度有界（≈ 1/L）。 */
function sineField(rng: () => number, L: number) {
  const ks: Array<[number, number, number]> = [];
  const base = rng() * Math.PI * 2;
  for (let m = 0; m < 3; m++) {
    const a = base + (m * Math.PI * 2) / 3 + (rng() - 0.5) * 0.9;
    const f = (0.8 + rng() * 0.5) / L;
    ks.push([Math.cos(a) * f, Math.sin(a) * f, rng() * Math.PI * 2]);
  }
  return (x: number, y: number) => (Math.sin(ks[0][0] * x + ks[0][1] * y + ks[0][2]) + Math.sin(ks[1][0] * x + ks[1][1] * y + ks[1][2]) + Math.sin(ks[2][0] * x + ks[2][1] * y + ks[2][2])) / 3;
}

/** 数字串联：负号本身可作分隔符，省掉空格。 */
function joinNums(nums: number[]): string {
  let s = '';
  for (let i = 0; i < nums.length; i++) {
    const v = Object.is(nums[i], -0) ? 0 : nums[i];
    if (i > 0 && v >= 0) s += ' ';
    s += v;
  }
  return s;
}

const def: PatternDef = {
  id: 'topo-lines',
  name: '流动等高线',
  category: 'A-lines',
  description: '等间距的流动曲线铺满整幅画面，嵌套的涡旋与平行的流带交织，像等高线却没有空白，丝滑圆润，每个种子都不同。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#10231c' }, opacity: 1, visible: true, configurable: true },
    { id: 'contour', label: '等高线', role: 'primary', paint: { type: 'solid', color: '#3fd99a' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'major', label: '计曲线', role: 'accent', paint: { type: 'solid', color: '#d4ff7a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'terrain', label: '纹理尺度', type: 'range', min: 0.4, max: 2, step: 0.05, default: 1, heavy: true },
    { key: 'levels', label: '线条密度', type: 'range', min: 10, max: 40, step: 1, default: 22, heavy: true },
    { key: 'flow', label: '流动扭曲', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.5, max: 8, step: 0.1, default: 2.4, unit: 'px' },
    { key: 'majorEvery', label: '计曲线间隔', type: 'range', min: 2, max: 8, step: 1, default: 5 },
  ],

  presets: [
    {
      id: 'neon',
      label: '霓虹绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#10231c' } },
        contour: { paint: { type: 'solid', color: '#3fd99a' }, opacity: 0.8 },
        major: { paint: { type: 'solid', color: '#d4ff7a' }, opacity: 1 },
      },
    },
    {
      id: 'map',
      label: '地图',
      elements: {
        bg: { paint: { type: 'solid', color: '#f4ede0' } },
        contour: { paint: { type: 'solid', color: '#c08a5b' }, opacity: 0.8 },
        major: { paint: { type: 'solid', color: '#7a4526' }, opacity: 1 },
      },
      params: { weight: 1.8, levels: 30 },
    },
    {
      id: 'ocean',
      label: '深海',
      elements: {
        bg: { paint: { type: 'solid', color: '#0a1838' } },
        contour: { paint: { type: 'solid', color: '#3ab7ff' }, opacity: 0.75 },
        major: { paint: { type: 'solid', color: '#ff8ae2' }, opacity: 1 },
      },
      params: { terrain: 1.3, flow: 0.75 },
    },
    {
      id: 'sunset',
      label: '橘子汽水',
      elements: {
        bg: { paint: { type: 'solid', color: '#ff5e3a' } },
        contour: { paint: { type: 'solid', color: '#ffd36e' }, opacity: 0.9 },
        major: { paint: { type: 'solid', color: '#ffffff' }, opacity: 1 },
      },
      params: { terrain: 1.5, levels: 18, weight: 3.4 },
    },
    {
      id: 'lilac',
      label: '丁香',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe8ff' } },
        contour: { paint: { type: 'solid', color: '#7b5cff' }, opacity: 0.7 },
        major: { paint: { type: 'solid', color: '#ff3d8b' }, opacity: 1 },
      },
      params: { weight: 2 },
    },
    {
      id: 'ink',
      label: '墨线',
      elements: {
        bg: { paint: { type: 'solid', color: '#111114' } },
        contour: { paint: { type: 'solid', color: '#e8e6df' }, opacity: 0.55 },
        major: { paint: { type: 'solid', color: '#ffc94a' }, opacity: 0.95 },
      },
      params: { levels: 32, weight: 1.6, majorEvery: 6, terrain: 0.8 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['contour'], accent: ['major'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const terrain = Math.max(0.2, Number(params.terrain));
    const density = Math.max(4, Math.min(60, Number(params.levels)));
    const flow = Math.max(0, Math.min(1, Number(params.flow ?? 0.6)));
    const weight = Math.max(0.2, Number(params.weight));
    const majorEvery = Math.max(2, Math.round(Number(params.majorEvery)));

    // ── 归一化空间：短边 = SHORT ──
    const q = Math.min(W, H) / SHORT;
    const NW = W / q;
    const NH = H / q;
    const diag = Math.hypot(NW, NH);

    // ── seeded 场：中心（best-candidate 散布）+ 画布外远中心（流带）+ 域扭曲 ──
    const gap0 = SHORT / density;
    // 纹理尺度（中心间距）至少 3.5 倍线距：否则一圈涡旋装不下几条线，等值线会被相邻中心挤得疙疙瘩瘩
    const L = Math.max(520 * (SHORT / 1080) * terrain, gap0 * 3.5);
    const nLocal = Math.max(2, Math.min(28, Math.round((NW * NH) / (L * L))));
    type Src = { x: number; y: number; s: number; o: number };
    const srcs: Src[] = [];
    const pad = L * 0.25;
    for (let i = 0; i < nLocal; i++) {
      let best: Pt = [0, 0];
      let bestD = -1;
      for (let c = 0; c < 8; c++) {
        const x = -pad + rng() * (NW + 2 * pad);
        const y = -pad + rng() * (NH + 2 * pad);
        let dmin = Infinity;
        for (const s of srcs) dmin = Math.min(dmin, Math.hypot(s.x - x, s.y - y));
        if (dmin > bestD) {
          bestD = dmin;
          best = [x, y];
        }
      }
      srcs.push({ x: best[0], y: best[1], s: 0.85 + rng() * 0.3, o: rng() * L * 0.35 });
    }
    // 1~2 个远中心：画布外很远处，在画面里表现为大段近乎平行的流带
    const nFar = rng() < 0.65 ? 1 : 0;
    for (let i = 0; i < nFar; i++) {
      const a = rng() * Math.PI * 2;
      const R = diag * (1.6 + rng());
      const x = NW / 2 + Math.cos(a) * R;
      const y = NH / 2 + Math.sin(a) * R;
      // 偏移使其在画布中心的取值与局部中心的典型取值相当 → 与涡旋分庭抗礼
      srcs.push({ x, y, s: 1, o: -R + L * (0.45 + rng() * 0.4) });
    }
    const wx1 = sineField(rng, L * 0.9);
    const wy1 = sineField(rng, L * 0.9);
    const wx2 = sineField(rng, L * 0.45);
    const wy2 = sineField(rng, L * 0.45);
    // 位移梯度 ≈ D/L：大尺度 0.5，小尺度 0.12（×flow）
    const D1 = 0.5 * L * 0.9 * flow;
    const D2 = 0.12 * L * 0.45 * flow;

    const phase = rng();

    const contourEl = elements.get('contour')!;
    const majorEl = elements.get('major')!;

    // 解析标量场（以线距为单位）：域扭曲 → 加权距离 → smooth-min
    const ds = new Float64Array(srcs.length);
    const evalF = (px: number, py: number, gap: number, k: number): number => {
      const x = px + D1 * wx1(px, py) + D2 * wx2(px, py);
      const y = py + D1 * wy1(px, py) + D2 * wy2(px, py);
      let m = Infinity;
      for (let s = 0; s < srcs.length; s++) {
        const S = srcs[s];
        const d = Math.hypot(x - S.x, y - S.y) * S.s + S.o;
        ds[s] = d;
        if (d < m) m = d;
      }
      let sum = 0;
      for (let s = 0; s < srcs.length; s++) sum += Math.exp(-(ds[s] - m) / k);
      return (m - k * Math.log(sum)) / gap;
    };

    const build = (gap: number): { minor: string; major: string } => {
      // smooth-min 半径 ≈ 0.95 线距：交界尖角揉成圆弧，又不至于在鞍部摊出大片低梯度空白
      const k = gap * 0.95;
      const cell = gap / 3;
      const x0 = -cell * 2;
      const y0 = -cell * 2;
      const nx = Math.ceil((NW + cell * 4) / cell) + 1;
      const ny = Math.ceil((NH + cell * 4) / cell) + 1;
      const field = new Float64Array(nx * ny);
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = evalF(x0 + i * cell, y0 + j * cell, gap, k);
          field[j * nx + i] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      const F = (i: number, j: number) => field[j * nx + i];
      const BIG = nx * ny;

      let minor = '';
      let major = '';
      const minLoop = gap * 4.5;

      for (let lv = Math.ceil(lo - phase); lv + phase < hi; lv++) {
        const t = lv + phase;
        const isMajor = ((lv % majorEvery) + majorEvery) % majorEvery === 0;
        const el = isMajor ? majorEl : contourEl;
        if (!el.visible) continue;

        // marching squares：横边 id = j*nx+i；竖边 id = BIG + j*nx+i
        const nb = new Map<number, number[]>();
        const link = (a: number, b: number) => {
          const na = nb.get(a);
          if (na) na.push(b);
          else nb.set(a, [b]);
          const nbb = nb.get(b);
          if (nbb) nbb.push(a);
          else nb.set(b, [a]);
        };
        for (let j = 0; j < ny - 1; j++) {
          for (let i = 0; i < nx - 1; i++) {
            const fa = F(i, j);
            const fb = F(i + 1, j);
            const fc = F(i + 1, j + 1);
            const fd = F(i, j + 1);
            const idx = (fa > t ? 8 : 0) + (fb > t ? 4 : 0) + (fc > t ? 2 : 0) + (fd > t ? 1 : 0);
            if (idx === 0 || idx === 15) continue;
            const top = j * nx + i;
            const bottom = (j + 1) * nx + i;
            const left = BIG + j * nx + i;
            const right = BIG + j * nx + i + 1;
            switch (idx) {
              case 1: case 14: link(left, bottom); break;
              case 2: case 13: link(bottom, right); break;
              case 3: case 12: link(left, right); break;
              case 4: case 11: link(top, right); break;
              case 6: case 9: link(top, bottom); break;
              case 7: case 8: link(left, top); break;
              case 5: case 10: {
                const center = (fa + fb + fc + fd) / 4 > t;
                if ((idx === 5) === center) {
                  link(left, top);
                  link(bottom, right);
                } else {
                  link(top, right);
                  link(left, bottom);
                }
                break;
              }
            }
          }
        }
        const edgePt = (id: number): Pt => {
          if (id < BIG) {
            const i = id % nx;
            const j = (id - i) / nx;
            const a = F(i, j);
            const b = F(i + 1, j);
            return [x0 + (i + (t - a) / (b - a)) * cell, y0 + j * cell];
          }
          const e = id - BIG;
          const i = e % nx;
          const j = (e - i) / nx;
          const a = F(i, j);
          const b = F(i, j + 1);
          return [x0 + i * cell, y0 + (j + (t - a) / (b - a)) * cell];
        };

        // 串链：每个节点度 ≤ 2；先从度 1 端点走开放链，再走闭环
        const seen = new Set<number>();
        const walk = (start: number): number[] => {
          const chain = [start];
          seen.add(start);
          let prev = -1;
          let cur = start;
          for (;;) {
            const ns = nb.get(cur)!;
            let next = -1;
            for (const n of ns) {
              if (n !== prev && !seen.has(n)) {
                next = n;
                break;
              }
            }
            if (next < 0) {
              // 闭环回到起点
              if (ns.length === 2 && chain.length > 2 && ns.includes(start)) chain.push(start);
              break;
            }
            seen.add(next);
            chain.push(next);
            prev = cur;
            cur = next;
          }
          return chain;
        };
        const chains: number[][] = [];
        for (const [id, ns] of nb) if (ns.length === 1 && !seen.has(id)) chains.push(walk(id));
        for (const id of nb.keys()) if (!seen.has(id)) chains.push(walk(id));

        let d = '';
        for (const ch of chains) {
          if (ch.length < 3) continue;
          const closed = ch[0] === ch[ch.length - 1];
          const raw = ch.map(edgePt);
          if (closed) raw.pop();
          // 弧长
          const n0 = raw.length;
          const cum = [0];
          const segs = closed ? n0 : n0 - 1;
          for (let s = 0; s < segs; s++) {
            const a = raw[s];
            const b = raw[(s + 1) % n0];
            cum.push(cum[s] + Math.hypot(b[0] - a[0], b[1] - a[1]));
          }
          const len = cum[segs];
          if (closed && len < minLoop) continue;
          if (!closed && len < gap) continue;
          // 均匀重采样：段长 ≈ 0.9 线距，闭环至少 8 段
          const nSeg = Math.max(closed ? 8 : 1, Math.round(len / (gap * 0.9)));
          const P: Pt[] = [];
          let si = 0;
          const nPts = closed ? nSeg : nSeg + 1;
          for (let r = 0; r < nPts; r++) {
            const target = (r / nSeg) * len;
            while (si < segs - 1 && cum[si + 1] < target) si++;
            const a = raw[si];
            const b = raw[(si + 1) % n0];
            const sl = cum[si + 1] - cum[si] || 1;
            const u = Math.min(1, Math.max(0, (target - cum[si]) / sl));
            P.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
          }
          // 牛顿投影：把重采样点精确拉回解析等值线上（消除线性插值带来的细小波纹）
          const hst = cell * 0.25;
          for (const pt of P) {
            for (let it = 0; it < 3; it++) {
              const f0 = evalF(pt[0], pt[1], gap, k) - t;
              const gx = (evalF(pt[0] + hst, pt[1], gap, k) - evalF(pt[0] - hst, pt[1], gap, k)) / (2 * hst);
              const gy = (evalF(pt[0], pt[1] + hst, gap, k) - evalF(pt[0], pt[1] - hst, gap, k)) / (2 * hst);
              const g2 = gx * gx + gy * gy;
              if (g2 < 1e-12) break;
              let dx = (f0 * gx) / g2;
              let dy = (f0 * gy) / g2;
              const dl = Math.hypot(dx, dy);
              if (dl > cell) {
                dx *= cell / dl;
                dy *= cell / dl;
              }
              pt[0] -= dx;
              pt[1] -= dy;
              if (dl < 0.02) break;
            }
          }
          const N = P.length;
          const at = (i: number): Pt => {
            if (closed) return P[((i % N) + N) % N];
            if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
            if (i >= N) return [2 * P[N - 1][0] - P[N - 2][0], 2 * P[N - 1][1] - P[N - 2][1]];
            return P[i];
          };
          // 均匀 Catmull-Rom → 三次贝塞尔；首段 c，其余 s（镜像控制点 → 取整后仍 C1）
          let cx = Math.round(P[0][0]);
          let cy = Math.round(P[0][1]);
          d += `M${cx} ${cy}`;
          const nOut = closed ? N : N - 1;
          const sNums: number[] = [];
          for (let s = 0; s < nOut; s++) {
            const p0 = at(s - 1);
            const p1 = at(s);
            const p2 = at(s + 1);
            const p3 = at(s + 2);
            const c2x = Math.round(p2[0] - (p3[0] - p1[0]) / 6);
            const c2y = Math.round(p2[1] - (p3[1] - p1[1]) / 6);
            const ex = Math.round(p2[0]);
            const ey = Math.round(p2[1]);
            if (s === 0) {
              const c1x = Math.round(p1[0] + (p2[0] - p0[0]) / 6);
              const c1y = Math.round(p1[1] + (p2[1] - p0[1]) / 6);
              d += `c${joinNums([c1x - cx, c1y - cy, c2x - cx, c2y - cy, ex - cx, ey - cy])}`;
            } else {
              sNums.push(c2x - cx, c2y - cy, ex - cx, ey - cy);
            }
            cx = ex;
            cy = ey;
          }
          if (sNums.length) d += `s${joinNums(sNums)}`;
          if (closed) d += 'z';
        }
        if (isMajor) major += d;
        else minor += d;
      }
      return { minor, major };
    };

    // BYTE_CAP 兜底：超限时整体放大线距重算（不截断层级 → 不留空白）
    let gap = gap0;
    let out = build(gap);
    for (let tries = 0; tries < 4; tries++) {
      const bytes = out.minor.length + out.major.length;
      if (bytes <= BYTE_CAP) break;
      gap *= Math.sqrt(bytes / BYTE_CAP) * 1.04;
      out = build(gap);
    }

    const bg = elements.get('bg')!;
    const swPx = Math.max(0.5, weight * unitPx);
    const sw = swPx / q; // 归一化空间里的线宽
    const tf = Math.abs(q - 1) < 1e-9 ? undefined : `scale(${Math.round(q * 1e5) / 1e5})`;
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const stroke = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', transform: tf };
    if (out.minor) parts.push(path(out.minor, { ...stroke, stroke: contourEl.paintValue, 'stroke-opacity': contourEl.opacity, 'stroke-width': sw }));
    if (out.major) parts.push(path(out.major, { ...stroke, stroke: majorEl.paintValue, 'stroke-opacity': majorEl.opacity, 'stroke-width': sw * 1.7 }));
    return { body: parts.join('') };
  },
};

export default def;
