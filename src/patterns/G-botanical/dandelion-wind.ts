/**
 * 蒲公英 · 风吹 —— G 植物 / 单幅场景。
 *
 * 构图：柔和渐变天空 + 太阳光晕；远处缓坡草甸、中景草带、前景草叶剪影（叶尖顺风倾斜）。
 * 前景两株高挑的蒲公英（球状绒毛头 = 大量放射细丝 + 末端小伞），中景若干株更小更淡，
 * 远坡上点缀一排微小绒球。风从上风侧吹秃绒球的一侧，被吹下的种子（带冠毛小伞）
 * 从秃头处沿弧线顺风飘散：离开越远越小、越淡；另有零星种子散在整片天空。
 *
 * ⭐ 体积 / 节点策略（短边 = 1000 的虚拟坐标，整体 scale(q)）：
 *   - 绒球：只定义 2 个「60° 扇区」细丝 path（整数相对坐标），全球 = 6 个扇区拼成的 `<g>`（一次 `<use>`）；
 *     被吹秃的球只拼剩下的扇区 → 秃的一侧永远朝上风。
 *   - 种子：4 个倾角变体各定义一次，种子按「深度层 × 远近段」分组，组上 scale(s)，
 *     组内每颗只是 `<use x y>`（≈ 32B）。
 *   - 风向「向左」= 整个场景水平镜像（一个 matrix）。
 * 动画（仅预览）：各深度层种子顺风平移 + 上下浮动（层间视差），种子小伞轻微摆转；导出静态。
 */
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampN, fo } from './_helpers';
import { closeDown, encSmooth, mix, noise1D } from '../E-scene/_scene';

const V = 1000;
const DEG = Math.PI / 180;
const R0 = 60; // 单位绒球半径
const SECT_RAYS = 17;
const MAX_SEEDS = 170;

const ri = Math.round;
/** 整数相对坐标拼接（负号自带分隔）。 */
const rel = (...v: number[]): string => {
  let s = '';
  v.forEach((x, i) => {
    const r = ri(x);
    s += i === 0 || r < 0 ? String(r) : ` ${r}`;
  });
  return s;
};

/** 扇区细丝：模块级确定性伪随机（与 seed 无关，几何恒定）。 */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function sectorPath(seed: number): string {
  const r = lcg(seed);
  let d = '';
  for (let i = 0; i < SECT_RAYS; i++) {
    const a = ((i + 0.15 + r() * 0.7) / SECT_RAYS) * 60 * DEG;
    // 球面投影：z 均匀 → 投影长度 sqrt(1-z²)，大量长丝贴近轮廓，少量短丝朝向观者
    const z = r() * 2 - 1;
    const L = R0 * Math.max(0.38, Math.sqrt(1 - z * z)) * (0.93 + r() * 0.07);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x0 = c * 5;
    const y0 = s * 5;
    const tx = c * L - x0;
    const ty = s * L - y0;
    d += `M${rel(x0, y0)}l${rel(tx, ty)}`;
    // 小伞：三根短丝从尖端外张
    const k = 5.5 * (0.55 + 0.45 * (L / R0));
    const f = (da: number): [number, number] => [Math.cos(a + da) * k, Math.sin(a + da) * k];
    const [ax, ay] = f(-0.62);
    const [bx, by] = f(0);
    const [cx, cy] = f(0.62);
    d += `l${rel(ax, ay)}m${rel(-ax, -ay)}l${rel(bx, by)}m${rel(-bx, -by)}l${rel(cx, cy)}`;
  }
  return d;
}

const SECT = [sectorPath(11), sectorPath(29)];

/** 单颗种子（小伞朝上）：冠毛中心在原点。 */
const SEED_RAYS: string = (() => {
  let d = '';
  for (let i = 0; i < 9; i++) {
    const a = (-165 + (150 * i) / 8) * DEG;
    const L = 9 * (i % 2 === 0 ? 1 : 0.86);
    d += `M0 0l${rel(Math.cos(a) * L, Math.sin(a) * L)}`;
  }
  return `${d}M0 0v12`;
})();
const SEED_TILT = [-38, -12, 14, 40];

interface Head {
  x: number;
  y: number;
  bx: number;
  by: number;
  s: number;
  off: number;
  drop: number[];
}

/** 深度层：种子缩放、基础不透明度、漂移周期（s）、浮动幅度。 */
const SL = [
  { s: 1, op: 0.55, dur: 64, bob: 10 },
  { s: 1.7, op: 0.82, dur: 44, bob: 16 },
  { s: 2.7, op: 0.96, dur: 30, bob: 24 },
];

const def: PatternDef = {
  id: 'dandelion-wind',
  name: '蒲公英 · 风吹',
  category: 'G-botanical',
  description: '黄昏或清晨的草地上几株蒲公英，绒球被风吹秃一侧，带小伞的种子沿弧线顺风飘散、近大远小、越远越淡。',
  seedable: true,
  animatable: true,

  elements: [
    {
      id: 'sky',
      label: '天空',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#8a7f9f' },
          { offset: 0.55, color: '#d6a6a2' },
          { offset: 1, color: '#f2cfa5' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    {
      id: 'glow',
      label: '光晕',
      role: 'detail',
      paint: {
        type: 'radial',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: '#fff1d6', opacity: 0.85 },
          { offset: 0.35, color: '#fde2bf', opacity: 0.35 },
          { offset: 1, color: '#fde2bf', opacity: 0 },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'sun', label: '太阳', role: 'accent', paint: { type: 'solid', color: '#fff4e0' }, opacity: 0.95, visible: true, configurable: true },
    { id: 'hills', label: '远坡', role: 'secondary', paint: { type: 'solid', color: '#b99a93' }, opacity: 1, visible: true, configurable: true },
    { id: 'grass', label: '草地', role: 'primary', paint: { type: 'solid', color: '#4e4452' }, opacity: 1, visible: true, configurable: true },
    { id: 'stem', label: '花茎', role: 'detail', paint: { type: 'solid', color: '#5f5560' }, opacity: 1, visible: true, configurable: true },
    { id: 'puff', label: '绒球', role: 'accent', paint: { type: 'solid', color: '#fffaf2' }, opacity: 1, visible: true, configurable: true },
    { id: 'seed', label: '飞絮', role: 'accent', paint: { type: 'solid', color: '#fff8ee' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'wind', label: '风力', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    {
      key: 'windDir',
      label: '风向',
      type: 'select',
      options: [
        { value: 'right', label: '向右吹' },
        { value: 'left', label: '向左吹' },
      ],
      default: 'right',
    },
    { key: 'seeds', label: '种子数量', type: 'range', min: 20, max: 170, step: 5, default: 95, heavy: true },
    { key: 'plants', label: '株数', type: 'range', min: 1, max: 9, step: 1, default: 5, heavy: true },
    { key: 'sunOn', label: '太阳光晕', type: 'toggle', default: true },
    { key: 'drift', label: '种子飘飞', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'dusk',
      label: '黄昏',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#8a7f9f' },
              { offset: 0.55, color: '#d6a6a2' },
              { offset: 1, color: '#f2cfa5' },
            ],
          },
        },
        sun: { paint: { type: 'solid', color: '#fff4e0' }, opacity: 0.95 },
        hills: { paint: { type: 'solid', color: '#b99a93' } },
        grass: { paint: { type: 'solid', color: '#4e4452' } },
        stem: { paint: { type: 'solid', color: '#5f5560' } },
        puff: { paint: { type: 'solid', color: '#fffaf2' } },
        seed: { paint: { type: 'solid', color: '#fff8ee' } },
      },
    },
    {
      id: 'morning',
      label: '清晨',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#86aecb' },
              { offset: 0.6, color: '#bcd6e2' },
              { offset: 1, color: '#eef0e8' },
            ],
          },
        },
        glow: {
          paint: {
            type: 'radial',
            cx: 0.5,
            cy: 0.5,
            r: 0.5,
            stops: [
              { offset: 0, color: '#ffffff', opacity: 0.8 },
              { offset: 0.35, color: '#f4f8fa', opacity: 0.3 },
              { offset: 1, color: '#f4f8fa', opacity: 0 },
            ],
          },
        },
        sun: { paint: { type: 'solid', color: '#fffdf6' }, opacity: 0.9 },
        hills: { paint: { type: 'solid', color: '#9fbcb0' } },
        grass: { paint: { type: 'solid', color: '#3f5f52' } },
        stem: { paint: { type: 'solid', color: '#557565' } },
        puff: { paint: { type: 'solid', color: '#ffffff' } },
        seed: { paint: { type: 'solid', color: '#ffffff' } },
      },
      params: { wind: 0.45 },
    },
    {
      id: 'moonlit',
      label: '月夜',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#121a30' },
              { offset: 0.6, color: '#27345a' },
              { offset: 1, color: '#46527a' },
            ],
          },
        },
        glow: {
          paint: {
            type: 'radial',
            cx: 0.5,
            cy: 0.5,
            r: 0.5,
            stops: [
              { offset: 0, color: '#dfe6ff', opacity: 0.55 },
              { offset: 0.35, color: '#9fb0e0', opacity: 0.18 },
              { offset: 1, color: '#9fb0e0', opacity: 0 },
            ],
          },
        },
        sun: { paint: { type: 'solid', color: '#eef1ff' }, opacity: 0.95 },
        hills: { paint: { type: 'solid', color: '#2c3758' } },
        grass: { paint: { type: 'solid', color: '#0e1325' } },
        stem: { paint: { type: 'solid', color: '#3d4869' } },
        puff: { paint: { type: 'solid', color: '#e6ebff' } },
        seed: { paint: { type: 'solid', color: '#dbe2ff' } },
      },
      params: { wind: 0.7, seeds: 120 },
    },
    {
      id: 'mist',
      label: '雾野',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#b3bbb6' },
              { offset: 0.6, color: '#d3d6cd' },
              { offset: 1, color: '#ebe8de' },
            ],
          },
        },
        glow: {
          paint: {
            type: 'radial',
            cx: 0.5,
            cy: 0.5,
            r: 0.5,
            stops: [
              { offset: 0, color: '#ffffff', opacity: 0.6 },
              { offset: 1, color: '#ffffff', opacity: 0 },
            ],
          },
        },
        sun: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.7 },
        hills: { paint: { type: 'solid', color: '#b9bdaf' } },
        grass: { paint: { type: 'solid', color: '#6c7262' } },
        stem: { paint: { type: 'solid', color: '#7c8172' } },
        puff: { paint: { type: 'solid', color: '#ffffff' } },
        seed: { paint: { type: 'solid', color: '#ffffff' } },
      },
      params: { wind: 0.35, sunOn: false, plants: 7 },
    },
  ],

  paletteSlots: { bg: ['sky'], primary: ['grass'], secondary: ['hills'], accent: ['puff', 'seed', 'sun'], detail: ['stem', 'glow'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const wind = clampN(params.wind, 0, 1, 0.6);
    const nSeeds = Math.round(clampN(params.seeds, 0, MAX_SEEDS, 95));
    const nPlants = Math.round(clampN(params.plants, 1, 9, 5));
    const sunOn = params.sunOn !== false;
    const mirror = params.windDir === 'left';
    const drift = animate && params.drift === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const portrait = Hv > Wv;
    const E = (id: string) => elements.get(id)!;
    const sky = E('sky');
    const glow = E('glow');
    const sun = E('sun');
    const hills = E('hills');
    const grass = E('grass');
    const stem = E('stem');
    const puff = E('puff');
    const seed = E('seed');

    let inner = '';

    // ── 太阳 + 光晕（下风侧上方）──────────────────────────────
    const sx = Wv * (portrait ? 0.68 : 0.7);
    const sy = Hv * (portrait ? 0.3 : 0.33);
    const glowR = V * 0.62;
    if (sunOn && glow.visible) inner += `<circle cx="${ri(sx)}" cy="${ri(sy)}" r="${ri(glowR)}" fill="${glow.paintValue}" fill-opacity="${fo(glow.opacity)}"/>`;
    if (sunOn && sun.visible) inner += `<circle cx="${ri(sx)}" cy="${ri(sy)}" r="${ri(V * 0.055)}" fill="${sun.paintValue}" fill-opacity="${fo(sun.opacity)}"/>`;

    // ── 地形 ────────────────────────────────────────────────
    const farY = Hv * (portrait ? 0.79 : 0.74);
    const midY = Hv * (portrait ? 0.85 : 0.83);
    const nearY = Hv * (portrait ? 0.92 : 0.91);
    const nf = noise1D(rng, 3, 2);
    const nm = noise1D(rng, 4, 2);
    const ridge = (f: (t: number) => number, y0: number, amp: number): Array<[number, number]> => {
      const pts: Array<[number, number]> = [];
      const steps = Math.ceil(Wv / 60);
      for (let i = 0; i <= steps + 1; i++) {
        const x = -30 + (i * (Wv + 60)) / (steps + 1);
        pts.push([x, y0 + f(x / Wv) * amp]);
      }
      return pts;
    };
    const farPts = ridge(nf, farY, V * 0.05);
    const midPts = ridge(nm, midY, V * 0.03);
    const farAt = (x: number): number => farY + nf(x / Wv) * V * 0.05;

    // ── 蒲公英布局 ──────────────────────────────────────────
    const heads: Head[] = [];
    const mkHead = (x: number, y: number, bx: number, by: number, s: number, blow: number): Head => {
      const off = rng() * 60;
      const k = Math.max(0, Math.min(5, Math.round(blow)));
      const order = [0, 1, 2, 3, 4, 5]
        .map((j) => {
          const c = (((off + j * 60 + 30) % 360) + 360) % 360;
          return { j, d: Math.abs(c - 180) };
        })
        .sort((a, b) => a.d - b.d);
      return { x, y, bx, by, s, off, drop: order.slice(0, k).map((o) => o.j) };
    };
    const lean = wind * 0.16;
    // 前景主角
    const heroS = portrait ? 1.9 : 1.75;
    {
      const x = Wv * (portrait ? 0.3 : 0.24) + (rng() - 0.5) * V * 0.04;
      const y = Hv * (portrait ? 0.42 : 0.38) + (rng() - 0.5) * V * 0.04;
      const by = Hv + 20;
      heads.push(mkHead(x, y, x - (by - y) * lean * 0.8, by, heroS, 0.6 + wind * 3.2 + rng() * 0.4));
    }
    if (nPlants >= 2) {
      const x = Wv * (portrait ? 0.62 : 0.42) + (rng() - 0.5) * V * 0.05;
      const y = Hv * (portrait ? 0.56 : 0.54) + (rng() - 0.5) * V * 0.04;
      const by = Hv + 20;
      heads.push(mkHead(x, y, x - (by - y) * lean * 0.7, by, heroS * 0.72, wind * 2.4 + rng() * 0.6));
    }
    const midHeads: Head[] = [];
    for (let i = 2; i < nPlants; i++) {
      const slot = (i - 2 + 0.2 + rng() * 0.6) / Math.max(1, nPlants - 2);
      let x = Wv * (0.08 + slot * 0.88);
      for (const h of heads) if (Math.abs(x - h.x) < V * 0.09) x = h.x + V * 0.09 * (x < h.x ? -1 : 1) * 1.4;
      const s = 0.62 + rng() * 0.3;
      const y = midY - V * (0.17 + rng() * 0.12) * (s / 0.6);
      const by = midY + V * 0.04;
      midHeads.push(mkHead(x, y, x - (by - y) * lean * 0.6, by, s, rng() * wind * 3.5));
    }
    // 远坡微小绒球
    const farHeads: Head[] = [];
    const nFar = 3 + nPlants;
    for (let i = 0; i < nFar; i++) {
      const x = Wv * ((i + 0.2 + rng() * 0.6) / nFar);
      const base = farAt(x) + V * (0.01 + rng() * 0.03);
      const s = 0.17 + rng() * 0.1;
      farHeads.push(mkHead(x, base - V * (0.05 + rng() * 0.04), x, base, s, 0));
    }

    // ── 种子 ────────────────────────────────────────────────
    interface Sd {
      x: number;
      y: number;
      z: number;
      far: number;
      v: number;
    }
    const seeds: Sd[] = [];
    const emitters = [...heads, ...midHeads].filter((h) => h.drop.length > 0);
    const weights = emitters.map((h) => h.drop.length * h.s * h.s);
    const wsum = weights.reduce((a, b) => a + b, 0);
    const reach = Math.max(Wv, V) * (0.55 + wind * 0.6);
    for (let i = 0; i < MAX_SEEDS; i++) {
      // 每颗固定消耗 7 个随机数 → 数量控件只取前缀，不影响其余布局
      const u0 = rng();
      const u1 = rng();
      const u2 = rng();
      const u3 = rng();
      const u4 = rng();
      const u5 = rng();
      const u6 = rng();
      if (i >= nSeeds) continue;
      const ambient = u0 < (wsum > 0 ? 0.2 : 1);
      if (ambient) {
        seeds.push({ x: u1 * Wv, y: u2 * Hv * 0.72, z: u3 < 0.75 ? 0 : 1, far: 1, v: Math.floor(u4 * 4) });
        continue;
      }
      let pick = u1 * wsum;
      let e = emitters[0];
      for (let k = 0; k < emitters.length; k++) {
        pick -= weights[k];
        if (pick <= 0) {
          e = emitters[k];
          break;
        }
      }
      const t = Math.pow(u2, 1.35);
      const L = reach * Math.min(1, e.s / 1.5) * (e.s > 1.2 ? 1 : 0.6);
      const x = e.x + t * L;
      // 先上扬后放平的弧线；扩散随距离增大
      const lift = L * (0.1 + wind * 0.1);
      const y = e.y - lift * Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.62) + L * 0.06 * t * t;
      const spread = V * (0.012 + 0.2 * t * t + 0.05 * t) * Math.min(1.2, 0.4 + e.s * 0.45);
      const g = (u3 + u4 - 1) * 1.6;
      const zr = u5;
      const z = t < 0.25 ? (zr < 0.45 ? 2 : 1) : t < 0.6 ? (zr < 0.15 ? 2 : zr < 0.7 ? 1 : 0) : zr < 0.35 ? 1 : 0;
      seeds.push({ x: x + g * spread * 0.35, y: y + g * spread, z: e.s < 1.2 ? Math.min(z, 1) : z, far: t > 0.55 ? 1 : 0, v: Math.floor(u6 * 4) });
    }

    // ── defs ────────────────────────────────────────────────
    const sw = 0.55;
    let defs =
      `<path id="vwdw-a" d="${SECT[0]}"/><path id="vwdw-b" d="${SECT[1]}"/>` +
      `<g id="vwdw-h">${[0, 1, 2, 3, 4, 5].map((j) => `<use href="#vwdw-${j % 2 ? 'b' : 'a'}"${j ? ` transform="rotate(${j * 60})"` : ''}/>`).join('')}</g>`;
    const spin = drift ? api.keyframes('vw-dwspin', 'from{transform:rotate(-9deg)}to{transform:rotate(9deg)}') : '';
    SEED_TILT.forEach((a, i) => {
      const st = drift ? ` style="animation:${spin} ${2.2 + i * 0.5}s ease-in-out -${i * 0.7}s infinite alternate"` : '';
      defs += `<g id="vwdw-s${i}" transform="rotate(${a})"><g${st}><path d="${SEED_RAYS}"/><path d="M0 12v4" stroke-width="1.5"/></g></g>`;
    });

    const headMarkup = (h: Head): string => {
      const tf = `translate(${ri(h.x)} ${ri(h.y)})rotate(${ri(h.off)})scale(${api.n(h.s)})`;
      if (h.drop.length === 0) return `<use href="#vwdw-h" transform="${tf}"/>`;
      let s = '';
      for (let j = 0; j < 6; j++) {
        if (h.drop.includes(j)) continue;
        s += `<use href="#vwdw-${j % 2 ? 'b' : 'a'}"${j ? ` transform="rotate(${j * 60})"` : ''}/>`;
      }
      return `<g transform="${tf}">${s}</g>`;
    };
    const stemD = (list: Head[]): string =>
      list
        .map((h) => {
          const mx = (h.x + h.bx) / 2 + (h.by - h.y) * lean * 0.35;
          const my = (h.y + h.by) / 2;
          return `M${ri(h.bx)} ${ri(h.by)}Q${ri(mx)} ${ri(my)} ${ri(h.x)} ${ri(h.y + 4 * h.s)}`;
        })
        .join('');

    const group = (list: Head[], stemW: number, alpha: number): string => {
      if (list.length === 0) return '';
      let s = '';
      if (stem.visible) s += `<path d="${stemD(list)}" fill="none" stroke="${stem.paintValue}" stroke-opacity="${fo(stem.opacity * alpha)}" stroke-width="${api.n(stemW)}" stroke-linecap="round"/>`;
      if (puff.visible) {
        // 柔光：绒球后面一层径向渐隐的光团（取绒球色）
        const hg = api.radial({ cx: 0.5, cy: 0.5, r: 0.5, key: 'dw-halo', stops: [
          { offset: 0, color: puff.paintValue.startsWith('#') ? puff.paintValue : '#ffffff', opacity: 0.32 },
          { offset: 0.55, color: puff.paintValue.startsWith('#') ? puff.paintValue : '#ffffff', opacity: 0.1 },
          { offset: 1, color: puff.paintValue.startsWith('#') ? puff.paintValue : '#ffffff', opacity: 0 },
        ] });
        s += `<g fill="${hg}" fill-opacity="${fo(puff.opacity * alpha)}">${list.map((h) => `<circle cx="${ri(h.x)}" cy="${ri(h.y)}" r="${ri(R0 * 1.25 * h.s * (h.drop.length > 2 ? 0.8 : 1))}"/>`).join('')}</g>`;
        s += `<g fill="none" stroke="${puff.paintValue}" stroke-opacity="${fo(puff.opacity * alpha)}" stroke-width="${sw}" stroke-linecap="round">${list.map(headMarkup).join('')}</g>`;
      }
      if (stem.visible) {
        s += `<path d="${list.map((h) => `M${ri(h.x)} ${ri(h.y)}h0`).join('')}" stroke="${stem.paintValue}" stroke-opacity="${fo(stem.opacity * alpha)}" stroke-width="${api.n(9 * list[0].s)}" stroke-linecap="round"/>`;
      }
      return s;
    };

    // 种子分组：深度层 × 远近段
    const seedLayer = (z: number, farBin: number): string => {
      const L = SL[z];
      const list = seeds.filter((s) => s.z === z && s.far === farBin).sort((a, b) => a.x - b.x);
      if (list.length === 0 || !seed.visible) return '';
      const k = L.s;
      const uses = list.map((s) => `<use href="#vwdw-s${s.v}" x="${ri(s.x / k)}" y="${ri(s.y / k)}"/>`).join('');
      const op = fo(seed.opacity * L.op * (farBin ? 0.62 : 1));
      if (!drift) return `<g transform="scale(${k})" stroke-opacity="${op}">${uses}</g>`;
      const id = `vwdw-l${z}${farBin}`;
      const dx = ri(Wv / k);
      const mv = api.keyframes(`vw-dwmv${z}-${dx}`, `to{transform:translateX(${dx}px)}`);
      const bob = api.keyframes(`vw-dwbob${z}`, `from{transform:translateY(-${L.bob}px)}to{transform:translateY(${L.bob}px)}`);
      const dur = L.dur * (farBin ? 1.25 : 1);
      return (
        `<g transform="scale(${k})" stroke-opacity="${op}"><g style="animation:${bob} ${7 + z * 2}s ease-in-out -${z * 3}s infinite alternate">` +
        `<g style="animation:${mv} ${dur}s linear -${ri(dur * 0.37 * (farBin + 1))}s infinite"><g id="${id}">${uses}</g><use href="#${id}" x="${-dx}"/></g></g></g>`
      );
    };
    const seedG = (inner2: string): string =>
      inner2 === '' ? '' : `<g fill="none" stroke="${seed.paintValue}" stroke-width="${sw * 1.4}" stroke-linecap="round">${inner2}</g>`;

    // ── 组装 ────────────────────────────────────────────────
    if (hills.visible) {
      inner += `<path d="${closeDown(encSmooth(farPts), Wv + 30, -30, Hv + 10)}" fill="${hills.paintValue}" fill-opacity="${fo(hills.opacity)}"/>`;
    }
    inner += group(farHeads, 1.1, 0.55);
    inner += seedG(seedLayer(0, 1) + seedLayer(0, 0));
    if (grass.visible) {
      const midFill = mix(hills.paintValue, grass.paintValue, 0.5);
      inner += `<path d="${closeDown(encSmooth(midPts), Wv + 30, -30, Hv + 10)}" fill="${midFill}" fill-opacity="${fo(grass.opacity * (midFill === hills.paintValue ? 0.5 : 1))}"/>`;
    }
    inner += group(midHeads, 1.9, 0.82);
    // 前景主角：茎在草后面
    inner += group(heads, 3, 1);
    inner += seedG(seedLayer(1, 1) + seedLayer(1, 0));
    if (grass.visible) {
      // 草叶剪影：叶尖顺风倾斜
      const ng = noise1D(rng, 5, 2);
      let d = `M-20 ${ri(Hv + 10)}L-20 ${ri(nearY)}`;
      let px = -20;
      let py = ri(nearY);
      let x = -20;
      while (x < Wv + 20) {
        const w = 7 + rng() * 9;
        const tall = rng() < 0.14 ? 2.1 : 1;
        const h = V * (0.018 + rng() * 0.04) * tall;
        const by = nearY + ng(x / Wv) * V * 0.022;
        const tx = x + w * 0.4 + h * (0.15 + wind * 0.5) * (0.6 + rng() * 0.6);
        const ty = by - h;
        const ex = x + w;
        const ey = nearY + ng(ex / Wv) * V * 0.022;
        d += `l${rel(tx - px, ty - py)}`;
        px = ri(tx);
        py = ri(ty);
        d += `l${rel(ex - px, ey - py)}`;
        px = ri(ex);
        py = ri(ey);
        x = ex;
      }
      d += `L${ri(Wv + 20)} ${ri(Hv + 10)}z`;
      inner += `<path d="${d}" fill="${grass.paintValue}" fill-opacity="${fo(grass.opacity)}"/>`;
    }
    inner += seedG(seedLayer(2, 1) + seedLayer(2, 0));

    const scene = mirror ? `<g transform="matrix(-1 0 0 1 ${ri(Wv)} 0)">${inner}</g>` : inner;
    const body =
      `<rect width="${W}" height="${H}" fill="${sky.paintValue}" fill-opacity="${fo(sky.opacity)}"/>` +
      `<defs>${defs}</defs><g transform="scale(${q})">${scene}</g>`;
    return { body };
  },
};

export default def;
