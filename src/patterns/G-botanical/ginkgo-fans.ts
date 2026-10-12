/**
 * 银杏扇叶 —— G 植物花卉 / 平铺 or 散布。
 *
 * 叶形：扇面外缘带细微波浪、顶端中裂成两瓣，叶柄细长微弯；放射状叶脉从扇心发散。
 * 两种排布：
 *  - scatter 散落：环面最小间距散点，任意朝向 → 像秋天铺了一地的落叶；
 *  - rows    扇纹：错行排布、叶尖朝上并左右微倾，上一行压下一行 → 类似青海波的和风纹样。
 * 三色叶（主 / 次 / 点缀）按比例混合，叶脉独立一色（默认取近底色的半透明，读作刻线）。
 *
 * ⭐ 体积：叶形与叶脉各在 `<defs>` 定义一次（无填色 → id 固定），每片叶子 = 叶 <use> + 叶脉 <use>；
 * 全部在一个 <pattern> 单元内，跨单元的补副本。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampN, fo, fx, scatterTorus, tight, torusCopies } from './_helpers';

const DEG = Math.PI / 180;
const HALF = 66; // 扇面半开角（度）

/** 单位银杏叶：扇心在原点，扇面朝 -y，半径 10；叶柄朝 +y。 */
const LEAF_D: string = (() => {
  const P = (deg: number, r: number): [number, number] => [Math.cos(deg * DEG) * r, Math.sin(deg * DEG) * r];
  const outer = (from: number, to: number): Array<[number, number]> => {
    const pts: Array<[number, number]> = [];
    const steps = Math.round(Math.abs(to - from) / 5);
    for (let i = 0; i <= steps; i++) {
      const a = from + ((to - from) * i) / steps;
      const wav = 0.28 * Math.sin(i * 2.1) + 0.2 * Math.sin(i * 0.9 + 1);
      pts.push(P(a, 10 + wav - 0.6 * Math.pow(Math.abs(a + 90) / HALF, 3)));
    }
    return pts;
  };
  const L = outer(-90 - HALF, -94);
  const R = outer(-86, -90 + HALF);
  // 平滑：二次 B 样条（控制点 = 采样点，端点 = 相邻中点）
  const smooth = (pts: Array<[number, number]>): string => {
    let d = '';
    for (let i = 1; i < pts.length - 1; i++) {
      const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
      d += `Q${fx(pts[i][0])} ${fx(pts[i][1])} ${fx(m[0])} ${fx(m[1])}`;
    }
    const e = pts[pts.length - 1];
    return `${d}L${fx(e[0])} ${fx(e[1])}`;
  };
  const sideL = P(-90 - HALF + 8, 4.2);
  const sideR = P(-90 + HALF - 8, 4.2);
  let d = `M0 0Q${fx(sideL[0])} ${fx(sideL[1])} ${fx(L[0][0])} ${fx(L[0][1])}`;
  d += `L${fx((L[0][0] + L[1][0]) / 2)} ${fx((L[0][1] + L[1][1]) / 2)}`;
  d += smooth(L);
  d += `L0 -5.4L${fx(R[0][0])} ${fx(R[0][1])}`;
  d += `L${fx((R[0][0] + R[1][0]) / 2)} ${fx((R[0][1] + R[1][1]) / 2)}`;
  d += smooth(R);
  d += `Q${fx(sideR[0])} ${fx(sideR[1])} 0 0z`;
  // 叶柄
  d += 'M-0.5 -0.4Q-0.3 4 0.7 8.6L1.4 8.4Q0.5 4 0.5 -0.4z';
  return tight(d);
})();

/** 叶脉：放射线，避开中裂。 */
const VEIN_D: string = (() => {
  let d = '';
  const n = 15;
  for (let i = 0; i < n; i++) {
    const a = -90 - HALF + 5 + ((2 * HALF - 10) * i) / (n - 1);
    if (Math.abs(a + 90) < 3) continue;
    const r1 = Math.abs(a + 90) < 10 ? 4.6 : 9.1 - 0.6 * Math.pow(Math.abs(a + 90) / HALF, 3);
    const c = Math.cos(a * DEG);
    const s = Math.sin(a * DEG);
    d += `M${fx(c * 1.4)} ${fx(s * 1.4)}L${fx(c * r1)} ${fx(s * r1)}`;
  }
  return tight(d);
})();

const def: PatternDef = {
  id: 'ginkgo-fans',
  name: '银杏扇叶',
  category: 'G-botanical',
  description: '扇形银杏叶带中裂与放射叶脉，可散落成满地秋叶，或错行排成和风扇纹；三色叶按比例混合。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f3ecdc' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_a', label: '叶 · 主', role: 'primary', paint: { type: 'solid', color: '#e2b34f' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_b', label: '叶 · 次', role: 'secondary', paint: { type: 'solid', color: '#c9a35e' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_c', label: '叶 · 点缀', role: 'accent', paint: { type: 'solid', color: '#9fae6e' }, opacity: 1, visible: true, configurable: true },
    { id: 'vein', label: '叶脉', role: 'detail', paint: { type: 'solid', color: '#f3ecdc' }, opacity: 0.45, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'layout',
      label: '排布',
      type: 'select',
      default: 'scatter',
      options: [
        { value: 'scatter', label: '散落' },
        { value: 'rows', label: '扇纹' },
      ],
    },
    { key: 'scale', label: '尺度', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, heavy: true },
    { key: 'density', label: '密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55, heavy: true },
    { key: 'mixB', label: '次色比例', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'accentShare', label: '点缀比例', type: 'range', min: 0, max: 0.5, step: 0.05, default: 0.15 },
    { key: 'veins', label: '叶脉', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'autumn',
      label: '深秋',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3ecdc' } },
        leaf_a: { paint: { type: 'solid', color: '#e2b34f' } },
        leaf_b: { paint: { type: 'solid', color: '#c9a35e' } },
        leaf_c: { paint: { type: 'solid', color: '#9fae6e' } },
        vein: { paint: { type: 'solid', color: '#f3ecdc' }, opacity: 0.45 },
      },
    },
    {
      id: 'ink-gold',
      label: '墨金',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1c1a' } },
        leaf_a: { paint: { type: 'solid', color: '#d7ad5a' } },
        leaf_b: { paint: { type: 'solid', color: '#8f7442' } },
        leaf_c: { paint: { type: 'solid', color: '#efdcae' } },
        vein: { paint: { type: 'solid', color: '#1d1c1a' }, opacity: 0.4 },
      },
      params: { layout: 'rows', density: 0.6 },
    },
    {
      id: 'celadon',
      label: '青瓷',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe7df' } },
        leaf_a: { paint: { type: 'solid', color: '#8fb3a0' } },
        leaf_b: { paint: { type: 'solid', color: '#b5cdbd' } },
        leaf_c: { paint: { type: 'solid', color: '#e2c27a' } },
        vein: { paint: { type: 'solid', color: '#f4f7f2' }, opacity: 0.55 },
      },
      params: { layout: 'rows', mixB: 0.5, accentShare: 0.1 },
    },
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#3a3346' } },
        leaf_a: { paint: { type: 'solid', color: '#e7a95c' } },
        leaf_b: { paint: { type: 'solid', color: '#c97a58' } },
        leaf_c: { paint: { type: 'solid', color: '#f1d79a' } },
        vein: { paint: { type: 'solid', color: '#3a3346' }, opacity: 0.35 },
      },
      params: { density: 0.4, scale: 1.3 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['leaf_a'], secondary: ['leaf_b'], accent: ['leaf_c'], detail: ['vein'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const rows = params.layout === 'rows';
    const scale = clampN(params.scale, 0.5, 2, 1);
    const density = clampN(params.density, 0, 1, 0.55);
    const mixB = clampN(params.mixB, 0, 1, 0.4);
    const accent = clampN(params.accentShare, 0, 0.5, 0.15);
    const veinsOn = params.veins === true;
    const n = api.n;

    const bg = elements.get('bg')!;
    const els = [elements.get('leaf_a')!, elements.get('leaf_b')!, elements.get('leaf_c')!];
    const vein = elements.get('vein')!;

    interface Leaf {
      x: number;
      y: number;
      a: number;
      s: number;
      c: number;
    }
    const pickColor = (): number => {
      const u = rng();
      return u < accent ? 2 : u < accent + (1 - accent) * mixB ? 1 : 0;
    };

    let tw: number;
    let th: number;
    const leaves: Leaf[] = [];
    const base = Math.min(W, H) * scale;

    if (rows) {
      // 错行扇纹：单元 = 4 列 × 4 行；行距 < 叶高 → 下一行压住上一行的叶柄
      const cell = base * (0.11 - density * 0.04);
      const cols = 4;
      const nRows = 4;
      const rowH = cell * 0.78;
      tw = cell * cols;
      th = rowH * nRows;
      const s = (cell * 0.56) / 10;
      for (let r = 0; r < nRows; r++) {
        for (let c = 0; c < cols; c++) {
          const tilt = ((r + c) % 2 === 0 ? -1 : 1) * (8 + rng() * 8);
          leaves.push({ x: (c + (r % 2) * 0.5) * cell, y: r * rowH, a: tilt, s: s * (0.94 + rng() * 0.12), c: pickColor() });
        }
      }
      // 自上而下绘制：y 小的先画（被下一行覆盖）
    } else {
      tw = th = base * 0.9;
      const nL = Math.round(14 + density * 56);
      const meta: Array<{ s: number; a: number; c: number }> = [];
      for (let i = 0; i < nL; i++) meta.push({ s: (Math.min(W, H) * 0.046 * scale * (0.75 + rng() * 0.55)) / 10, a: Math.round(rng() * 360), c: pickColor() });
      const spots = scatterTorus(rng, meta.map((m) => m.s * 10 * 1.05), tw, th, 0.78);
      spots.forEach((p, i) => leaves.push({ x: p.x, y: p.y, a: meta[i].a, s: meta[i].s, c: meta[i].c }));
    }

    // 叶片按 y 排序（扇纹需要；散落同样无害）
    const placed: Array<Leaf & { cx: number; cy: number }> = [];
    for (const L of leaves) {
      const reach = L.s * 10 * 1.15;
      for (const [cx, cy] of torusCopies(L.x, L.y, reach, tw, th)) placed.push({ ...L, cx, cy });
    }
    if (rows) placed.sort((p, q) => p.cy - q.cy);

    const tf = (p: Leaf & { cx: number; cy: number }): string =>
      `translate(${fx(p.cx)} ${fx(p.cy)})rotate(${Math.round(p.a)})scale(${n(p.s)})`;

    // 扇纹模式下层叠顺序必须严格按 y → 颜色按「连续同色段」分组，叶脉逐片紧随其后
    let content = '';
    let runC = -1;
    let run = '';
    const flush = (): void => {
      if (run === '' || runC < 0) return;
      const e = els[runC];
      content += `<g fill="${e.paintValue}" fill-opacity="${fo(e.opacity)}">${run}</g>`;
      run = '';
    };
    const veinG = (inner: string): string =>
      `<g fill="none" stroke="${vein.paintValue}" stroke-opacity="${fo(vein.opacity)}" stroke-width="0.24" stroke-linecap="round">${inner}</g>`;
    if (rows) {
      // 每一行：先画全行叶片，再画全行叶脉（同行不互相遮挡），再下一行
      const byRow = new Map<number, typeof placed>();
      for (const p of placed) {
        const k = Math.round(p.cy * 10);
        if (!byRow.has(k)) byRow.set(k, []);
        byRow.get(k)!.push(p);
      }
      for (const row of [...byRow.keys()].sort((a, b) => a - b).map((k) => byRow.get(k)!)) {
        for (const p of row) {
          if (!els[p.c].visible) continue;
          if (p.c !== runC) {
            flush();
            runC = p.c;
          }
          run += `<use href="#vwgk-l" transform="${tf(p)}"/>`;
        }
        flush();
        runC = -1;
        if (veinsOn && vein.visible) content += veinG(row.filter((p) => els[p.c].visible).map((p) => `<use href="#vwgk-v" transform="${tf(p)}"/>`).join(''));
      }
    } else {
      for (let c = 0; c < 3; c++) {
        const e = els[c];
        const list = placed.filter((p) => p.c === c);
        if (!e.visible || list.length === 0) continue;
        content += `<g fill="${e.paintValue}" fill-opacity="${fo(e.opacity)}">${list.map((p) => `<use href="#vwgk-l" transform="${tf(p)}"/>`).join('')}</g>`;
      }
      if (veinsOn && vein.visible) {
        const list = placed.filter((p) => els[p.c].visible);
        if (list.length > 0) content += veinG(list.map((p) => `<use href="#vwgk-v" transform="${tf(p)}"/>`).join(''));
      }
    }
    content = content.replace(/<g [^>]*><\/g>/g, '');

    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (content !== '') {
      parts.push(`<defs><path id="vwgk-l" d="${LEAF_D}"/><path id="vwgk-v" d="${VEIN_D}"/></defs>`);
      const ref = api.tile({ key: `ginkgo-${rows ? 'r' : 's'}-${n(tw)}-${n(th)}`, w: tw, h: th, content });
      parts.push(rect(0, 0, W, H, { fill: ref }));
    }
    return { body: parts.join('') };
  },
};

export default def;
