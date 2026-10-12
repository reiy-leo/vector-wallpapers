/**
 * 地形等高线 —— A 极简线条。
 *
 * 像地形图 / 霓虹等高线：一张 seeded 平滑噪声高度场，用 marching squares 在若干等值面
 * 上提取等高线，再把线段串成连续折线，用「中点二次贝塞尔」平滑成圆润曲线。
 * 线条不交叉、自然闭合成大小不一的「岛」与「湖」，每个 seed 地形都不同。
 *
 * 体积：所有普通等高线合成一条 path，计曲线（每 N 条一条加粗线）另一条 path；
 * 坐标用相对指令 + 大画布取整，BYTE_CAP 兜底。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';

const BYTE_CAP = 17000;

/** seeded 值噪声：G×G 循环格点随机值 + smoothstep 双线性插值（任意坐标含负数可用）。 */
const G = 64;
function valueNoise(rng: () => number) {
  const vals: number[] = [];
  for (let i = 0; i < G * G; i++) vals.push(rng());
  const wrap = (v: number) => ((v % G) + G) % G;
  const at = (i: number, j: number) => vals[wrap(j) * G + wrap(i)];
  return (x: number, y: number): number => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

const def: PatternDef = {
  id: 'topo-lines',
  name: '地形等高线',
  category: 'A-lines',
  description: '随机地形的等高线，自然闭合成大小不一的岛与湖，像霓虹地形图，每个种子都不同。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#13210f' }, opacity: 1, visible: true, configurable: true },
    { id: 'contour', label: '等高线', role: 'primary', paint: { type: 'solid', color: '#5ee26a' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'major', label: '计曲线', role: 'accent', paint: { type: 'solid', color: '#b6ff9e' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'terrain', label: '地形尺度', type: 'range', min: 0.4, max: 2, step: 0.05, default: 1, heavy: true },
    { key: 'levels', label: '等高线数', type: 'range', min: 3, max: 16, step: 1, default: 8, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.5, max: 8, step: 0.1, default: 3.2, unit: 'px' },
    { key: 'majorEvery', label: '计曲线间隔', type: 'range', min: 2, max: 6, step: 1, default: 4 },
  ],

  presets: [
    {
      id: 'neon',
      label: '霓虹绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#13210f' } },
        contour: { paint: { type: 'solid', color: '#5ee26a' }, opacity: 0.9 },
        major: { paint: { type: 'solid', color: '#b6ff9e' }, opacity: 1 },
      },
    },
    {
      id: 'map',
      label: '地图',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3ecdc' } },
        contour: { paint: { type: 'solid', color: '#b5835a' }, opacity: 0.85 },
        major: { paint: { type: 'solid', color: '#7a4a2a' }, opacity: 1 },
      },
      params: { weight: 2.2, levels: 12 },
    },
    {
      id: 'ocean',
      label: '深海',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b1d3a' } },
        contour: { paint: { type: 'solid', color: '#38bdf8' }, opacity: 0.85 },
        major: { paint: { type: 'solid', color: '#f0abfc' }, opacity: 1 },
      },
    },
    {
      id: 'sunset',
      label: '橘子汽水',
      elements: {
        bg: { paint: { type: 'solid', color: '#ff6b3d' } },
        contour: { paint: { type: 'solid', color: '#ffe08a' }, opacity: 0.9 },
        major: { paint: { type: 'solid', color: '#ffffff' }, opacity: 1 },
      },
      params: { terrain: 1.3, levels: 7 },
    },
    {
      id: 'lilac',
      label: '丁香',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe9ff' } },
        contour: { paint: { type: 'solid', color: '#7c5cff' }, opacity: 0.75 },
        major: { paint: { type: 'solid', color: '#ff4f9a' }, opacity: 1 },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['contour'], accent: ['major'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const terrain = Math.max(0.2, Number(params.terrain));
    const levels = Math.max(2, Math.min(20, Math.round(Number(params.levels))));
    const weight = Math.max(0.2, Number(params.weight));
    const majorEvery = Math.max(2, Math.round(Number(params.majorEvery)));

    // 采样网格：每格约 24 设计像素；格数封顶，体积与分辨率解耦
    const cellPx = Math.max(W, H) / Math.min(90, Math.max(30, Math.round(Math.max(W, H) / (24 * unitPx))));
    const nx = Math.ceil(W / cellPx) + 1;
    const ny = Math.ceil(H / cellPx) + 1;

    // 两个八度的值噪声：大地形 + 细节起伏
    const feat = 380 * unitPx * terrain;
    const n1 = valueNoise(rng);
    const n2 = valueNoise(rng);
    // 采样坐标各自旋转一个角度：值噪声的格点方向不再与画布轴对齐，消除「横平竖直」的走线
    const c1 = Math.cos(0.62);
    const s1 = Math.sin(0.62);
    const c2 = Math.cos(-1.1);
    const s2 = Math.sin(-1.1);
    const field: number[] = new Array(nx * ny);
    let lo = Infinity;
    let hi = -Infinity;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const x = (i * cellPx) / feat;
        const y = (j * cellPx) / feat;
        const v = n1(x * c1 - y * s1, x * s1 + y * c1) * 0.75 + n2((x * c2 - y * s2) * 2.1, (x * s2 + y * c2) * 2.1) * 0.25;
        field[j * nx + i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    const F = (i: number, j: number) => field[j * nx + i];

    const q = unitPx >= 1 ? 1 : 10;
    const R = (v: number): number => Math.round(v * q) / q;

    let minorD = '';
    let majorD = '';
    const contourEl = elements.get('contour')!;
    const majorEl = elements.get('major')!;

    for (let k = 0; k < levels; k++) {
      const t = lo + ((k + 0.5) / levels) * (hi - lo);
      const isMajor = k % majorEvery === majorEvery - 1;
      const el = isMajor ? majorEl : contourEl;
      if (!el.visible) continue;

      // ── marching squares：每条线段 = 两个边 id；边上交点线性插值 ──
      // 横边 id = j*nx+i（(i,j)-(i+1,j)）；竖边 id = BIG + j*nx+i（(i,j)-(i,j+1)）
      const BIG = nx * ny;
      const pt = new Map<number, [number, number]>();
      const edgePt = (id: number): [number, number] => {
        const c = pt.get(id);
        if (c) return c;
        let p: [number, number];
        if (id < BIG) {
          const i = id % nx;
          const j = Math.floor(id / nx);
          const a = F(i, j);
          const b = F(i + 1, j);
          p = [(i + (t - a) / (b - a)) * cellPx, j * cellPx];
        } else {
          const e = id - BIG;
          const i = e % nx;
          const j = Math.floor(e / nx);
          const a = F(i, j);
          const b = F(i, j + 1);
          p = [i * cellPx, (j + (t - a) / (b - a)) * cellPx];
        }
        pt.set(id, p);
        return p;
      };
      const adj = new Map<number, number[]>();
      const link = (a: number, b: number) => {
        (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
        (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
      };
      for (let j = 0; j < ny - 1; j++) {
        for (let i = 0; i < nx - 1; i++) {
          const a = F(i, j) > t ? 1 : 0;
          const b = F(i + 1, j) > t ? 1 : 0;
          const c = F(i + 1, j + 1) > t ? 1 : 0;
          const d = F(i, j + 1) > t ? 1 : 0;
          const idx = a * 8 + b * 4 + c * 2 + d;
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
              // 鞍点：按格心均值消歧
              const center = (F(i, j) + F(i + 1, j) + F(i + 1, j + 1) + F(i, j + 1)) / 4 > t ? 1 : 0;
              if ((idx === 5) === (center === 1)) {
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

      // ── 串链：先从开放端点（度 1）出发，再处理闭环 ──
      const used = new Set<string>();
      const key = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);
      const walk = (start: number): number[] => {
        const chain = [start];
        let cur = start;
        for (;;) {
          const next = (adj.get(cur) ?? []).find((n) => !used.has(key(cur, n)));
          if (next === undefined) break;
          used.add(key(cur, next));
          chain.push(next);
          cur = next;
          if (cur === start) break;
        }
        return chain;
      };
      const chains: number[][] = [];
      for (const [id, ns] of adj) if (ns.length === 1 && ns.some((n) => !used.has(key(id, n)))) chains.push(walk(id));
      for (const [id, ns] of adj) if (ns.some((n) => !used.has(key(id, n)))) chains.push(walk(id));

      // ── 平滑：中点二次贝塞尔（控制点 = 原顶点），相对坐标 ──
      let d = '';
      for (const ch of chains) {
        if (ch.length < 3) continue;
        const closed = ch[0] === ch[ch.length - 1];
        const p = ch.map(edgePt);
        if (closed) p.pop();
        // 丢掉过小的闭合圈（噪点）
        if (closed) {
          const xs = p.map((v) => v[0]);
          const ys = p.map((v) => v[1]);
          if (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys) < cellPx * 3) continue;
        }
        const m = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
        let cur: [number, number] = closed ? m(p[p.length - 1], p[0]) : p[0];
        let cx = R(cur[0]);
        let cy = R(cur[1]);
        d += `M${cx} ${cy}`;
        const end = closed ? p.length : p.length - 1;
        for (let s = closed ? 0 : 1; s < end; s++) {
          const ctrl = p[s];
          const to = closed ? m(p[s], p[(s + 1) % p.length]) : s === p.length - 2 ? p[p.length - 1] : m(p[s], p[s + 1]);
          const qx = R(ctrl[0]);
          const qy = R(ctrl[1]);
          const tx = R(to[0]);
          const ty = R(to[1]);
          d += `q${R(qx - cx)} ${R(qy - cy)} ${R(tx - cx)} ${R(ty - cy)}`;
          cx = tx;
          cy = ty;
          cur = to;
        }
        if (closed) d += 'z';
      }
      if (minorD.length + majorD.length + d.length > BYTE_CAP) break;
      if (isMajor) majorD += d;
      else minorD += d;
    }

    const bg = elements.get('bg')!;
    const sw = Math.max(0.5, weight * unitPx);
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const stroke = { fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    if (minorD) parts.push(path(minorD, { ...stroke, stroke: contourEl.paintValue, 'stroke-opacity': contourEl.opacity, 'stroke-width': sw }));
    if (majorD) parts.push(path(majorD, { ...stroke, stroke: majorEl.paintValue, 'stroke-opacity': majorEl.opacity, 'stroke-width': sw * 1.6 }));
    return { body: parts.join('') };
  },
};

export default def;
