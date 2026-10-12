/**
 * 蕨叶 —— G 植物 / 平铺 or 交错散布。
 *
 * 叶形：披针形的羽状复叶 —— 叶轴两侧互生羽片，羽片自基部向上先长后短；
 * 细致度 1 = 一回羽状（羽片为完整的披针小叶），2~3 = 二回羽裂（每枚羽片再裂成一串圆钝小裂片）。
 * 叶脉清晰：叶轴一条粗脉，每枚羽片一条中脉，二回时每个裂片再分出一条侧脉。
 * 层次：后层叶（次色，略小）铺底，前层叶（主色 / 点缀嫩叶色）压在上面，叶脉逐片紧随叶片 → 遮挡正确；
 * 可选卷曲的幼芽（fiddlehead：对数螺旋 + 下垂的叶柄）。
 *
 * ⭐ 体积：叶片只画「右半边」（含半条叶轴），左半边 = 镜像 + 半个羽片间距的错位 → 互生且省一半字节；
 * 叶片 / 叶脉 / 幼芽各在 `<defs>` 定义一次，每片叶 = 1 个 `<use>`（叶脉作为叶片 `<g>` 的一部分）；
 * 全部放进一个 <pattern> 单元，跨边界的补副本。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampN, fo, fx, scatterTorus, torusCopies } from './_helpers';

const DEG = Math.PI / 180;
const HL = 200; // 叶轴半长：叶片从 (0,200) 基部到 (0,-200) 叶尖
const ri = Math.round;

const rel = (...v: number[]): string => {
  let s = '';
  v.forEach((x, i) => {
    const r = ri(x);
    s += i === 0 || r < 0 ? String(r) : ` ${r}`;
  });
  return s;
};

interface Frond {
  half: string;
  veins: string;
  rib: string;
  step: number;
}

/** 生成半片蕨叶（右侧羽片 + 半条叶轴）及其叶脉。lobes = 0 → 一回羽状。 */
function buildFrond(pairs: number, lobes: number): Frond {
  let half = '';
  let veins = '';
  const span = HL * 2 - 40;
  const step = span / pairs;
  const prof = (t: number): number => Math.pow(1 - t, 0.95) * Math.pow(t + 0.05, 0.38);
  let pmax = 0;
  for (let i = 0; i <= 100; i++) pmax = Math.max(pmax, prof(i / 100));
  for (let i = 0; i < pairs; i++) {
    const t = (i + 0.5) / pairs; // 0 = 基部，1 = 叶尖
    const by = HL - 10 - t * span;
    const L = HL * 0.48 * (prof(t) / pmax) + 4;
    const phi = (14 + 30 * t) * DEG; // 与水平夹角：越往上越斜
    const ux = Math.cos(phi);
    const uy = -Math.sin(phi);
    const nx = -uy; // 法向（朝基部一侧为 +）
    const ny = ux;
    const W = Math.min(step * 0.44, L * 0.2);
    // 羽片轴微微上弯
    const P = (u: number, v: number): [number, number] => {
      const vv = v - L * 0.07 * u * u;
      return [1.5 + ux * u * L + nx * vv, by + uy * u * L + ny * vv];
    };
    const wAt = (u: number): number => W * Math.pow(1 - u, 0.7) * Math.min(1, (u + 0.1) * 3);
    const p0 = P(0, -W * 0.3);
    let px = ri(p0[0]);
    let py = ri(p0[1]);
    half += `M${px} ${py}`;
    const q = (c: [number, number], e: [number, number]): void => {
      half += `q${rel(c[0] - px, c[1] - py, e[0] - px, e[1] - py)}`;
      px = ri(e[0]);
      py = ri(e[1]);
    };
    const cu = (c1: [number, number], c2: [number, number], e: [number, number]): void => {
      half += `c${rel(c1[0] - px, c1[1] - py, c2[0] - px, c2[1] - py, e[0] - px, e[1] - py)}`;
      px = ri(e[0]);
      py = ri(e[1]);
    };
    if (lobes === 0) {
      q(P(0.35, -W * 1.25), P(1, 0));
      q(P(0.35, W * 1.25), P(0, W * 0.3));
    } else {
      const k = Math.max(2, Math.round(lobes * Math.min(1, 0.3 + L / (HL * 0.5))));
      const d = 1 / k;
      // 每个裂片 = 一段三次曲线：从裂口鼓出成圆钝的长圆形，略向羽片尖端前倾
      for (let j = 0; j < k; j++) {
        const u0 = j * d;
        const u1 = u0 + d;
        const last = j === k - 1;
        cu(P(u0 + d * 0.1, -wAt(u0 + d * 0.3) * 1.4 - 0.6), P(u1 + d * 0.15, -wAt(u1) * 1.5 - 0.6), last ? P(1, 0) : P(u1, -wAt(u1) * 0.2));
      }
      for (let j = k - 1; j >= 0; j--) {
        const u0 = j * d;
        const u1 = u0 + d;
        cu(P(u1 + d * 0.15, wAt(u1) * 1.5 + 0.6), P(u0 + d * 0.1, wAt(u0 + d * 0.3) * 1.4 + 0.6), j === 0 ? P(0, W * 0.3) : P(u0, wAt(u0) * 0.2));
      }
      // 裂片侧脉
      if (L > 40) {
        for (let j = 0; j < k - 1; j++) {
          const u = (j + 0.3) * d;
          const uc = (j + 0.75) * d;
          for (const sg of [-1, 1]) {
            const [ax, ay] = P(u, 0);
            const [bx, by2] = P(uc, sg * wAt(uc) * 0.95);
            veins += `M${rel(ax, ay)}l${rel(bx - ax, by2 - ay)}`;
          }
        }
      }
    }
    half += 'z';
    // 中脉（沿弯曲的羽片轴，二次曲线）
    const [m0x, m0y] = P(0.02, 0);
    const [mcx, mcy] = P(0.45, L * 0.035);
    const [m1x, m1y] = P(0.88, 0);
    veins += `M${rel(m0x, m0y)}q${rel(mcx - m0x, mcy - m0y, m1x - m0x, m1y - m0y)}`;
  }
  // 半条叶轴（含叶柄），自叶尖到基部变粗
  half += `M0 ${-HL + 18}L1 ${-HL + 18}L4 ${HL + 56}L0 ${HL + 56}z`;
  const rib = `M0 ${HL - 4}L0 ${-HL + 34}`;
  return { half: half.replace(/ -/g, '-'), veins: veins.replace(/ -/g, '-'), rib, step };
}

/** 幼芽：对数螺旋卷 + 向下的叶柄。中心在原点，尺寸约 ±20、柄长 60。 */
const FIDDLE_D: string = (() => {
  const pts: Array<[number, number]> = [];
  const turns = 2.04;
  const N = 40;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * turns * 2 * Math.PI;
    const r = 1.3 * Math.exp(0.24 * th);
    pts.push([Math.cos(th) * r, Math.sin(th) * r]);
  }
  const e = pts[pts.length - 1];
  const p = pts[pts.length - 2];
  const m = Math.hypot(e[0] - p[0], e[1] - p[1]) || 1;
  const tx = (e[0] - p[0]) / m;
  const ty = (e[1] - p[1]) / m;
  let d = `M${fx(pts[0][0])} ${fx(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `L${fx(pts[i][0])} ${fx(pts[i][1])}`;
  d += `Q${fx(e[0] + tx * 30)} ${fx(e[1] + ty * 30)} ${fx(e[0] + tx * 14 - 8)} ${fx(e[1] + 66)}`;
  return d.replace(/ -/g, '-');
})();

const def: PatternDef = {
  id: 'fern-fronds',
  name: '蕨叶',
  category: 'G-botanical',
  description: '羽状复叶的蕨叶平铺或交错散布，羽片可细裂成二回羽状，叶脉清晰，可点缀卷曲的幼芽。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#e9ede2' }, opacity: 1, visible: true, configurable: true },
    { id: 'frond_back', label: '后层叶', role: 'secondary', paint: { type: 'solid', color: '#a9bf9f' }, opacity: 1, visible: true, configurable: true },
    { id: 'frond', label: '前层叶', role: 'primary', paint: { type: 'solid', color: '#4f7a58' }, opacity: 1, visible: true, configurable: true },
    { id: 'frond_young', label: '嫩叶', role: 'accent', paint: { type: 'solid', color: '#8fb069' }, opacity: 1, visible: true, configurable: true },
    { id: 'vein', label: '叶脉', role: 'detail', paint: { type: 'solid', color: '#e9ede2' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'fiddle', label: '幼芽', role: 'accent', paint: { type: 'solid', color: '#6d8a4a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'layout',
      label: '排布',
      type: 'select',
      default: 'scatter',
      options: [
        { value: 'scatter', label: '交错散布' },
        { value: 'rows', label: '平铺' },
      ],
    },
    { key: 'density', label: '叶片密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, heavy: true },
    { key: 'detail', label: '羽裂细致度', type: 'range', min: 1, max: 3, step: 1, default: 2, heavy: true },
    { key: 'jitter', label: '角度随机', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'scale', label: '尺度', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1, heavy: true },
    { key: 'fiddleheads', label: '卷曲幼芽', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'forest-floor',
      label: '林下',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9ede2' } },
        frond_back: { paint: { type: 'solid', color: '#a9bf9f' } },
        frond: { paint: { type: 'solid', color: '#4f7a58' } },
        frond_young: { paint: { type: 'solid', color: '#8fb069' } },
        vein: { paint: { type: 'solid', color: '#e9ede2' }, opacity: 0.55 },
        fiddle: { paint: { type: 'solid', color: '#6d8a4a' } },
      },
    },
    {
      id: 'deep-green',
      label: '墨绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#16231d' } },
        frond_back: { paint: { type: 'solid', color: '#26402f' } },
        frond: { paint: { type: 'solid', color: '#5f8f68' } },
        frond_young: { paint: { type: 'solid', color: '#a7c47e' } },
        vein: { paint: { type: 'solid', color: '#16231d' }, opacity: 0.5 },
        fiddle: { paint: { type: 'solid', color: '#c9d99a' } },
      },
      params: { density: 0.65 },
    },
    {
      id: 'blueprint',
      label: '标本',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1ebdd' } },
        frond_back: { paint: { type: 'solid', color: '#e2d8c2' } },
        frond: { paint: { type: 'solid', color: '#6b7a5a' } },
        frond_young: { paint: { type: 'solid', color: '#a8916a' } },
        vein: { paint: { type: 'solid', color: '#f1ebdd' }, opacity: 0.6 },
        fiddle: { paint: { type: 'solid', color: '#8b6f4e' } },
      },
      params: { layout: 'rows', jitter: 0.2, density: 0.2, detail: 3, fiddleheads: false },
    },
    {
      id: 'mist-blue',
      label: '雾青',
      elements: {
        bg: { paint: { type: 'solid', color: '#d9e3e3' } },
        frond_back: { paint: { type: 'solid', color: '#b6c9c8' } },
        frond: { paint: { type: 'solid', color: '#5d8584' } },
        frond_young: { paint: { type: 'solid', color: '#88aaa4' } },
        vein: { paint: { type: 'solid', color: '#eef3f2' }, opacity: 0.5 },
        fiddle: { paint: { type: 'solid', color: '#4c6e6c' } },
      },
      params: { detail: 1, scale: 1.25, jitter: 0.8 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['frond'], secondary: ['frond_back'], accent: ['frond_young', 'fiddle'], detail: ['vein'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const rows = params.layout === 'rows';
    const density = clampN(params.density, 0, 1, 0.5);
    const detail = Math.round(clampN(params.detail, 1, 3, 2));
    const jitter = clampN(params.jitter, 0, 1, 0.6);
    const scale = clampN(params.scale, 0.6, 1.6, 1);
    const fiddleOn = params.fiddleheads === true;

    const bg = elements.get('bg')!;
    const back = elements.get('frond_back')!;
    const front = elements.get('frond')!;
    const young = elements.get('frond_young')!;
    const vein = elements.get('vein')!;
    const fiddle = elements.get('fiddle')!;

    const pairs = detail === 1 ? 20 : detail === 2 ? 22 : 25;
    const lobes = detail === 1 ? 0 : detail === 2 ? 8 : 11;
    const F = buildFrond(pairs, lobes);

    const m = Math.min(W, H);
    const fl = m * 0.4 * scale; // 叶片总长（像素）
    const s = fl / (HL * 2 + 56);

    interface Item {
      x: number;
      y: number;
      a: number;
      s: number;
      layer: 0 | 1 | 2; // 0 后层，1 前层主色，2 嫩叶
      fid?: boolean;
    }
    const items: Item[] = [];
    let tw: number;
    let th: number;

    if (rows) {
      // 错行平铺：单元 2 列 × 2 行，奇数行错半格；后层叶落在空隙里
      const cell = fl * (0.78 - density * 0.26);
      tw = cell * 2;
      th = cell * 2 * 0.86;
      const rowH = th / 2;
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 2; c++) {
          const base = (c + r) % 2 === 0 ? -28 : 28;
          const a = base + (rng() - 0.5) * jitter * 120;
          items.push({ x: (c + (r % 2) * 0.5) * cell, y: r * rowH, a, s: s * (0.92 + rng() * 0.12), layer: rng() < 0.25 ? 2 : 1 });
          items.push({ x: (c + 0.5 + (r % 2) * 0.5) * cell, y: (r + 0.5) * rowH, a: -base * 0.6 + (rng() - 0.5) * jitter * 120, s: s * 0.8, layer: 0 });
        }
      }
    } else {
      tw = th = m * 1.05 * scale;
      const nF = Math.round(4 + density * 8);
      const nB = Math.round(3 + density * 7);
      const baseA = -32;
      const spotsF = scatterTorus(rng, new Array(nF).fill(fl * 0.3), tw, th, 0.85);
      const spotsB = scatterTorus(rng, new Array(nB).fill(fl * 0.24), tw, th, 0.6, 24, spotsF);
      spotsB.forEach((p) => items.push({ x: p.x, y: p.y, a: baseA + 40 + (rng() - 0.5) * jitter * 300, s: s * (0.72 + rng() * 0.15), layer: 0 }));
      spotsF.forEach((p) => items.push({ x: p.x, y: p.y, a: baseA + (rng() - 0.5) * jitter * 300, s: s * (0.9 + rng() * 0.2), layer: rng() < 0.25 ? 2 : 1 }));
    }
    // 保证至少一片嫩叶（否则「嫩叶」元件在部分 seed 下改色无效）
    if (!items.some((p) => p.layer === 2)) {
      const fr = items.filter((p) => p.layer === 1);
      if (fr.length > 0) fr[Math.floor(rng() * fr.length)].layer = 2;
    }
    // 幼芽：放在若干空隙
    const fids: Item[] = [];
    if (fiddleOn) {
      const nK = rows ? 2 : 2 + Math.round(density * 2);
      for (let i = 0; i < nK; i++) fids.push({ x: rng() * tw, y: rng() * th, a: (rng() - 0.5) * 50, s: (fl / 230) * (0.8 + rng() * 0.4), layer: 1, fid: true });
    }

    const n = api.n;
    const tf = (p: Item, cx: number, cy: number): string => `translate(${fx(cx)} ${fx(cy)})rotate(${ri(p.a)})scale(${n(p.s)})`;
    const reach = (fl / 2) * 1.08;
    const els = [back, front, young];

    let content = '';
    // 后层：只画叶片，不画叶脉（读作虚化的远叶）
    let run = '';
    let runL = -1;
    const flush = (): void => {
      if (run === '' || runL < 0) return;
      const e = els[runL];
      const veinAttr = runL > 0 && vein.visible ? ` stroke="${vein.paintValue}" stroke-opacity="${fo(vein.opacity)}"` : '';
      content += `<g fill="${e.paintValue}" fill-opacity="${fo(e.opacity)}"${veinAttr}>${run}</g>`;
      run = '';
    };
    const order = [...items.filter((p) => p.layer === 0), ...items.filter((p) => p.layer > 0)];
    for (const p of order) {
      if (!els[p.layer].visible) continue;
      if (p.layer !== runL) {
        flush();
        runL = p.layer;
      }
      const ref = p.layer === 0 || !vein.visible ? '#vwff-f' : '#vwff-fv';
      for (const [cx, cy] of torusCopies(p.x, p.y, reach * (p.s / s), tw, th)) run += `<use href="${ref}" transform="${tf(p, cx, cy)}"/>`;
    }
    flush();
    if (fids.length > 0 && fiddle.visible) {
      let fm = '';
      for (const p of fids) for (const [cx, cy] of torusCopies(p.x, p.y, 70 * p.s, tw, th)) fm += `<use href="#vwff-k" transform="${tf(p, cx, cy)}"/>`;
      content += `<g fill="none" stroke="${fiddle.paintValue}" stroke-opacity="${fo(fiddle.opacity)}" stroke-width="3.2" stroke-linecap="round">${fm}</g>`;
    }

    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (content !== '') {
      const off = fx(F.step / 2);
      parts.push(
        `<defs><path id="vwff-h" d="${F.half}" stroke="none"/>` +
          `<g id="vwff-f"><use href="#vwff-h"/><use href="#vwff-h" transform="matrix(-1 0 0 1 0 ${off})"/></g>` +
          `<g id="vwff-fv"><use href="#vwff-f"/><g fill="none" stroke-linecap="round"><path id="vwff-v" d="${F.veins}" stroke-width="0.95"/>` +
          `<use href="#vwff-v" transform="matrix(-1 0 0 1 0 ${off})"/><path d="${F.rib}" stroke-width="2.6"/></g></g>` +
          (fids.length > 0 ? `<path id="vwff-k" d="${FIDDLE_D}"/>` : '') +
          `</defs>`,
      );
      const ref = api.tile({ key: `fern-${rows ? 'r' : 's'}-${n(tw)}-${n(th)}-${detail}`, w: tw, h: th, content });
      parts.push(rect(0, 0, W, H, { fill: ref }));
    }
    return { body: parts.join('') };
  },
};

export default def;
