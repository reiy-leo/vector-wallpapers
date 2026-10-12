/**
 * 流动等高线 —— A 极简线条。（id 保持 'topo-lines'）
 *
 * 2026-10-12 v2 重做。用户反馈：「线条上不丝滑，磕磕绊绊的，也不应当是等高线，
 * 而是用类似等高线的形式占满整个空间」。v1 病根：
 *  ❶ 双线性值噪声只有 C0 连续 + marching squares 粗网格 + 中点二次贝塞尔
 *     → 线上满是细小折角与台阶；
 *  ❷ 真·地形高度场有大片平地：等值面稀疏的地方整块留白，陡的地方挤成一团，还有小岛噪点。
 *
 * v3（2026-10-12 同日二改）。用户反馈：「右边有很多平行的线，去掉这个，都用类等高线，
 * 而且很多线转角都很尖，更圆润一点」。病根：v2 有 65% 的种子在画布外远处放一个中心
 * → 画面一侧大段平行直带；log-sum-exp 半径只有 ~1 线距 → 交界折痕处等值线起尖。
 *
 * v3 做法：
 *  - **只用画内/画边的中心**：抖动网格（格距 = 纹理尺度 L，外沿多一圈）→ 覆盖均匀，
 *    每个中心带随机深度偏移、梯度尺度、椭圆度；没有任何远中心，也就没有平行直带。
 *  - **三次多项式 smooth-min（C2）**，半径 0.3·L（≈3 线距）：折痕揉成圆弧；
 *    距离场梯度 ≈ 1 → 线距近似均匀。半径再大会在 Voronoi 顶点摊出平顶空洞（实测 0.55·L 时
 *    空洞直径 5+ 线距），所以剩余的急弯交给下面的圆角兜底。
 *  - **更强的低频域扭曲**：两组正弦位移，大尺度位移梯度上限 ~0.75（×flow），形状更有机。
 *  - **丝滑曲线**：marching squares（格 = 线距/3）→ 串链 → 按弧长细采样（线距/4）→ 牛顿投影回
 *    解析等值线 → **圆角兜底**：离散曲率半径 < 0.9 线距的点连同邻域做局部拉普拉斯平滑并周期性
 *    按弧长重新均布，直到全线达标（鞍点附近的等值线理论上曲率半径 → 0，必须兜底）；
 *    仍不达标的扁小圈/短线头整条丢弃，周长 < 2π·0.97 线距的小圈也丢弃（无小岛噪点）。
 *  - **自适应节点**：累计转角 ≥ 0.42rad 或弧长 ≥ 1.1 线距落一个节点，相邻弦长比 ≤ 2；
 *    切线取细采样中心差分，两侧等长手柄 → `s` 指令（镜像控制点，取整后仍 C1）。
 *  - 网格外沿留 ≈1.7 线距让线头也能被揉圆，输出前裁掉画外首尾省字节。
 *  验收量化：对输出贝塞尔按 0.15 线距重采样测曲率半径，画内最小值 ≈ 0.6–0.75 线距。
 *
 * 坐标系：内部统一用「短边 = 2160」的归一化空间（1 单位 ≈ 1080p 下 0.5px，取整误差不可见），整数相对坐标；非 1080 画布用
 * path 的 transform="scale(q)" 缩放 → 体积与分辨率解耦。BYTE_CAP 兜底：超限时
 * **整体加大线距重算**（而不是截断层级留下空白）。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';

const BYTE_CAP = 17000;
/** 圆角平滑的最大轮数（窄舌头要多轮才能缩回去） */
const MAX_PASS_DEFAULT = 400;
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
  description: '近似等间距的类等高线铺满整幅画面，一组组嵌套的圆润闭环与有机的轮廓相互交融，没有尖角，每个种子都不同。',
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

    // ── seeded 场：抖动网格中心（铺满画布及其外沿一圈）+ 低频域扭曲 ──
    // v3：去掉 v2 的「画布外远中心」（会在画面一侧拉出大段平行直带）。
    const gap0 = SHORT / density;
    // 纹理尺度（中心间距）至少 4 倍线距：否则一圈涡旋装不下几条线
    const L = Math.max(520 * (SHORT / 1080) * terrain, gap0 * 4);
    // 每个中心：位置、梯度尺度 s、深度偏移 o、椭圆度（单位方向 c/sn + 长短轴比 e）
    type Src = { x: number; y: number; s: number; o: number; c: number; sn: number; e: number };
    const srcs: Src[] = [];
    {
      const cols = Math.max(1, Math.round(NW / L));
      const rows = Math.max(1, Math.round(NH / L));
      const cw = NW / cols;
      const chh = NH / rows;
      // 外沿多放一圈（-1..cols），画布边缘也是嵌套圈的一部分而不是被拉直的带
      for (let r = -1; r <= rows; r++) {
        for (let c = -1; c <= cols; c++) {
          const edge = r < 0 || r >= rows || c < 0 || c >= cols;
          const jx = (rng() - 0.5) * 0.7;
          const jy = (rng() - 0.5) * 0.7;
          const x = (c + 0.5 + jx) * cw;
          const y = (r + 0.5 + jy) * chh;
          const a = rng() * Math.PI;
          srcs.push({ x, y, s: 0.92 + rng() * 0.16, o: (edge ? 0.15 : 0) * L + rng() * L * 0.3, c: Math.cos(a), sn: Math.sin(a), e: 0.86 + rng() * 0.28 });
        }
      }
    }
    const wx1 = sineField(rng, L * 1.1);
    const wy1 = sineField(rng, L * 1.1);
    const wx2 = sineField(rng, L * 0.5);
    const wy2 = sineField(rng, L * 0.5);
    // 位移梯度上限 ≈ D·f：大尺度 ≤ 0.81、小尺度 ≤ 0.16（×flow），合计 < 1 → 雅可比恒正，不折叠
    const D1 = 0.62 * L * 1.1 * flow;
    const D2 = 0.12 * L * 0.5 * flow;
    // 三次多项式 smooth-min 半径 ≈ 0.3 倍中心间距（≈3 线距）：交界的折痕揉成圆弧；
    // 再大会在 Voronoi 顶点处摊出平顶留白（实测 0.55 时空洞直径 5+ 线距），剩下的急弯交给下面的圆角兜底
    const K = L * 0.3;

    const phase = rng();

    const contourEl = elements.get('contour')!;
    const majorEl = elements.get('major')!;

    // 解析标量场（以线距为单位）：域扭曲 → 加权距离 → 三次 smooth-min 逐个折叠（C2 连续，曲率连续）
    const rawF = (px: number, py: number): number => {
      const x = px + D1 * wx1(px, py) + D2 * wx2(px, py);
      const y = py + D1 * wy1(px, py) + D2 * wy2(px, py);
      let m = Infinity;
      for (let s = 0; s < srcs.length; s++) {
        const S = srcs[s];
        const dx = x - S.x;
        const dy = y - S.y;
        const d = Math.hypot((dx * S.c + dy * S.sn) * S.e, (dy * S.c - dx * S.sn) / S.e) * S.s + S.o;
        if (m === Infinity) {
          m = d;
          continue;
        }
        const h = K - Math.abs(m - d);
        m = Math.min(m, d);
        if (h > 0) {
          const u = h / K;
          m -= (u * u * u * K) / 6;
        }
      }
      return m;
    };
    const evalF = (px: number, py: number, gap: number): number => rawF(px, py) / gap;

    const build = (gap: number): { minor: string; major: string } => {
      const cell = gap / 3;
      const x0 = -cell * 5;
      const y0 = -cell * 5;
      const nx = Math.ceil((NW + cell * 10) / cell) + 1;
      const ny = Math.ceil((NH + cell * 10) / cell) + 1;
      const field = new Float64Array(nx * ny);
      let lo = Infinity;
      let hi = -Infinity;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const v = evalF(x0 + i * cell, y0 + j * cell, gap);
          field[j * nx + i] = v;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
      const F = (i: number, j: number) => field[j * nx + i];
      const BIG = nx * ny;

      let minor = '';
      let major = '';
      // 曲率半径下限 0.9 线距：低于它的局部急弯要被揉圆
      const MAX_PASS = MAX_PASS_DEFAULT;
      const RMIN = gap * 0.9;
      // 周长 < 2π·1.08·RMIN 的小圈本身就是个急弯（平滑只会让它越缩越小）→ 剔除
      const minLoop = Math.PI * 2 * RMIN * 1.08;

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
          if (!closed) {
            if (len < gap) continue;
            // 两端都落在画布内部的短开链 = 没闭合上的小圈碎片
            const inside = (p: Pt) => p[0] > 0 && p[1] > 0 && p[0] < NW && p[1] < NH;
            if (len < minLoop && inside(raw[0]) && inside(raw[n0 - 1])) continue;
          }
          // ① 细采样：步长 ≈ 线距/4
          const nSeg = Math.max(closed ? 24 : 2, Math.round(len / (gap * 0.25)));
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
          // ② 牛顿投影：把采样点精确拉回解析等值线上（消除线性插值带来的细小波纹）
          const hst = cell * 0.1;
          for (const pt of P) {
            for (let it = 0; it < 2; it++) {
              const fc = evalF(pt[0], pt[1], gap);
              const f0 = fc - t;
              if (Math.abs(f0) < 2e-4) break;
              const gx = (evalF(pt[0] + hst, pt[1], gap) - fc) / hst;
              const gy = (evalF(pt[0], pt[1] + hst, gap) - fc) / hst;
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
              if (dl < 0.05) break;
            }
          }
          let N = P.length;
          const idx = (i: number) => (closed ? ((i % N) + N) % N : Math.max(0, Math.min(N - 1, i)));
          // ③ 圆角兜底：鞍点附近的等值线可能有局部急弯（理论上曲率半径 → 0）。
          // 对离散曲率半径 R = 弦长 / (2·sin(θ/2)) < RMIN 的点连同 ±4 邻域做拉普拉斯平滑，
          // 迭代直到全部达标。急弯只出现在鞍点附近，那里线距本来就宽，挪一点不会撞线。
          const turnLen = (i: number): [number, number] => {
            const a = P[idx(i - 1)];
            const b = P[i];
            const c = P[idx(i + 1)];
            const ux = b[0] - a[0], uy = b[1] - a[1];
            const vx = c[0] - b[0], vy = c[1] - b[1];
            const lu = Math.hypot(ux, uy) || 1e-9, lv = Math.hypot(vx, vy) || 1e-9;
            return [Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (lu * lv)))), (lu + lv) / 2];
          };
          const turn = (i: number): number => turnLen(i)[0];
          // 离散曲率半径：平均弦长 / (2·sin(θ/2))
          const radius = (i: number): number => {
            const [th, l] = turnLen(i);
            return th < 1e-9 ? Infinity : l / (2 * Math.sin(th / 2));
          };
          {
            const lo = closed ? 0 : 1;
            const hiI = closed ? N : N - 1;
            // 首轮全查；之后只复查上一轮动过的点 ±6 的窗口（急弯是局部的）。用时间戳数组代替 Set。
            const markStamp = new Int32Array(N);
            const winStamp = new Int32Array(N);
            let check: number[] | null = null;
            let doomed = false;
            const nx2 = new Float64Array(N);
            const ny2 = new Float64Array(N);
            for (let pass = 1; pass <= MAX_PASS; pass++) {
              const mark: number[] = [];
              const test = (i: number) => {
                if (radius(i) >= RMIN) return;
                for (let o = -4; o <= 4; o++) {
                  const j = closed ? idx(i + o) : i + o;
                  if (j >= lo && j < hiI && markStamp[j] !== pass) {
                    markStamp[j] = pass;
                    mark.push(j);
                  }
                }
              };
              if (!check) for (let i = lo; i < hiI; i++) test(i);
              else for (const i of check) test(i);
              if (!mark.length) break;
              const nextCheck: number[] = [];
              for (const i of mark) for (let o = -6; o <= 6; o++) {
                const j = closed ? idx(i + o) : i + o;
                if (j >= lo && j < hiI && winStamp[j] !== pass) {
                  winStamp[j] = pass;
                  nextCheck.push(j);
                }
              }
              check = nextCheck;
              // 两次 Jacobi 拉普拉斯（λ = 0.5）
              for (let sweep = 0; sweep < 2; sweep++) {
                for (const i of mark) {
                  const a = P[idx(i - 1)];
                  const c = P[idx(i + 1)];
                  nx2[i] = P[i][0] * 0.5 + (a[0] + c[0]) * 0.25;
                  ny2[i] = P[i][1] * 0.5 + (a[1] + c[1]) * 0.25;
                }
                for (const i of mark) P[i] = [nx2[i], ny2[i]];
              }
              // 拉普拉斯会把点沿切向挤成一团（急弯处越挤越「尖」）→ 每 4 轮按弧长重新均布
              if (pass % 4 === 0) {
                const ns = closed ? N : N - 1;
                const ca = new Float64Array(ns + 1);
                for (let i = 0; i < ns; i++) {
                  const a = P[i];
                  const b = P[(i + 1) % N];
                  ca[i + 1] = ca[i] + Math.hypot(b[0] - a[0], b[1] - a[1]);
                }
                const tl = ca[ns];
                if (closed && tl < minLoop * 0.9) {
                  doomed = true;
                  break;
                }
                const R2: Pt[] = [];
                let k = 0;
                for (let r = 0; r < N; r++) {
                  const target = (r / ns) * tl;
                  while (k < ns - 1 && ca[k + 1] < target) k++;
                  const a = P[k];
                  const b = P[(k + 1) % N];
                  const u = Math.min(1, Math.max(0, (target - ca[k]) / (ca[k + 1] - ca[k] || 1)));
                  R2.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
                }
                for (let i = 0; i < N; i++) P[i] = R2[i];
              }
            }
            if (doomed) continue;
          }
          {
            // 平滑仍压不下去的急弯只会出现在扁小圈 / 贴边短线头上 → 整条丢弃（长开链不丢，免得留白）
            let rMin = Infinity;
            // 只看画布内（画外的急弯看不见，不该连累整条线被丢）
            for (let i = closed ? 0 : 1; i < (closed ? N : N - 1); i++) {
              const [x, y] = P[i];
              if (x > -gap * 0.3 && y > -gap * 0.3 && x < NW + gap * 0.3 && y < NH + gap * 0.3) rMin = Math.min(rMin, radius(i));
            }
            if (rMin < RMIN * 0.9 && len < minLoop * (closed ? 4 : 1.5)) continue;
          }
          if (!closed) {
            // 网格外沿留得宽（≈1.7 线距，让线头的急弯也能被揉圆），输出前把画外的首尾裁掉省字节
            const m = gap * 0.15;
            const vis = (p: Pt) => p[0] > -m && p[1] > -m && p[0] < NW + m && p[1] < NH + m;
            let a = 0;
            while (a < P.length && !vis(P[a])) a++;
            let b = P.length - 1;
            while (b > a && !vis(P[b])) b--;
            if (a >= b) continue;
            const cut = P.slice(Math.max(0, a - 1), Math.min(P.length, b + 2));
            P.length = 0;
            P.push(...cut);
            if (P.length < 3) continue;
            N = P.length;
          }
          if (closed) {
            // 平滑会让急弯小圈收缩：收缩后不够大的圈直接丢弃
            let l2 = 0;
            for (let i = 0; i < N; i++) l2 += Math.hypot(P[(i + 1) % N][0] - P[i][0], P[(i + 1) % N][1] - P[i][1]);
            if (l2 < minLoop * 0.9) continue;
          }
          // ④ 自适应抽稀：累计转角 ≥ 0.42rad 或弧长 ≥ 1.1 线距就落一个节点；
          // 再细分相邻弦长比 > 2 的段 → 两侧等长手柄（s 指令）不会在长短段交界处过冲出尖角
          let keep: number[] = [0];
          {
            const arcAt = [0];
            for (let i = 1; i <= N; i++) {
              if (!closed && i === N) break;
              const a = P[i - 1];
              const b = P[i % N];
              arcAt.push(arcAt[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
            }
            let acc = 0;
            let arc = 0;
            const last = closed ? N : N - 1;
            for (let i = 1; i < last; i++) {
              acc += turn(i);
              arc += arcAt[i] - arcAt[i - 1];
              if (acc >= 0.42 || arc >= gap * 1.1) {
                keep.push(i);
                acc = 0;
                arc = 0;
              }
            }
            if (!closed) keep.push(N - 1);
            if (closed && keep.length < 6) {
              keep = [];
              for (let r = 0; r < 6; r++) keep.push(Math.round((r * N) / 6) % N);
            }
            const span = (r: number): number => {
              const k = keep.length;
              if (closed) {
                const i0 = keep[((r % k) + k) % k];
                const i1 = keep[(((r + 1) % k) + k) % k];
                return i1 > i0 ? arcAt[i1] - arcAt[i0] : arcAt[N] - arcAt[i0] + arcAt[i1];
              }
              return arcAt[keep[r + 1]] - arcAt[keep[r]];
            };
            const RATIO = 2;
            for (let it = 0; it < 6; it++) {
              const k = keep.length;
              const nseg = closed ? k : k - 1;
              const next: number[] = [];
              let changed = false;
              for (let r = 0; r < nseg; r++) {
                next.push(keep[r]);
                const me = span(r);
                const nbMin = Math.min(closed || r > 0 ? span(r - 1) : Infinity, closed || r < nseg - 1 ? span(r + 1) : Infinity);
                const i0 = keep[r];
                const i1 = closed ? keep[(r + 1) % k] : keep[r + 1];
                const gapIdx = i1 > i0 ? i1 - i0 : i1 + N - i0;
                if (me > nbMin * RATIO && gapIdx > 1) {
                  next.push((i0 + Math.floor(gapIdx / 2)) % N);
                  changed = true;
                }
              }
              if (!closed) next.push(keep[k - 1]);
              keep = next;
              if (!changed) break;
            }
          }
          const K2 = keep.length;
          // ⑤ 每个节点的切线取细采样的中心差分；手柄长 = 相邻弦长几何平均 / 3（两侧相等 → 可用 s 指令）
          const node = (r: number): Pt => P[keep[closed ? ((r % K2) + K2) % K2 : r]];
          const tang = (r: number): Pt => {
            const i = keep[closed ? ((r % K2) + K2) % K2 : r];
            const a = P[idx(i - 1)];
            const c = P[idx(i + 1)];
            const tx = c[0] - a[0], ty = c[1] - a[1];
            const tl = Math.hypot(tx, ty) || 1;
            return [tx / tl, ty / tl];
          };
          const chord = (r: number): number => {
            // 节点 r → r+1 的弦长
            const a = node(r);
            const b = node(r + 1);
            return Math.hypot(b[0] - a[0], b[1] - a[1]);
          };
          const handle = (r: number): number => {
            const cn = closed || r < K2 - 1 ? chord(r) : chord(r - 1);
            const cp = closed || r > 0 ? chord(r - 1) : cn;
            return Math.min(Math.sqrt(cp * cn) / 3, 0.45 * Math.min(cp, cn));
          };
          let cx = Math.round(node(0)[0]);
          let cy = Math.round(node(0)[1]);
          d += `M${cx} ${cy}`;
          const nOut = closed ? K2 : K2 - 1;
          const sNums: number[] = [];
          for (let s = 0; s < nOut; s++) {
            const p2 = node(s + 1);
            const t2 = tang(s + 1);
            const h2 = handle(closed ? s + 1 : s + 1);
            const c2x = Math.round(p2[0] - t2[0] * h2);
            const c2y = Math.round(p2[1] - t2[1] * h2);
            const ex = Math.round(p2[0]);
            const ey = Math.round(p2[1]);
            if (s === 0) {
              const p1 = node(0);
              const t1 = tang(0);
              const h1 = handle(0);
              const c1x = Math.round(p1[0] + t1[0] * h1);
              const c1y = Math.round(p1[1] + t1[1] * h1);
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
