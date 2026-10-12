/**
 * 龟背竹 —— G 植物花卉 / 大叶散布。
 *
 * 叶形：心形基部（叶柄插在心形凹口）、宽卵形叶身；两侧边缘有一排深入主脉的羽状裂口（沿侧脉方向、
 * 由外向内略朝叶基倾斜，裂口两边平行、内端收窄），裂口之间靠主脉一侧还有一列椭圆孔洞（evenodd 挖空）。
 * 两种叶形：成熟叶（裂口多而深、两列孔）/ 半成熟叶（裂口少而浅、一列孔），随机左右镜像。
 * 叶子在画面上做最小间距散布（近似泊松盘），分深 / 中 / 浅三层绿交叠，浅层叶下垫一层错位投影 → 有进深。
 *
 * ⭐ 体积：叶形（带孔 / 不带孔）与叶脉各在 `<defs>` 定义一次（无填色 → id 固定），每片叶子 = 一个 <use>；
 * 全部几何在「短边 = 1000」的虚拟坐标里，外层 scale(q) 放大 → 体积与分辨率无关。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampN, fo, fx, scatterTorus, shortHash, tight } from './_helpers';

const V = 1000;
/** 叶片视觉中心相对叶基（心形凹口）的偏移（单位叶坐标，叶尖在 (0,-100)）。 */
const CENTER_Y = -38;
/** 叶片数上限（每片 1~3 个 <use>，约 75B/个）。 */
const MAX_LEAVES = 64;

type Pt = [number, number];
type Seg = [Pt, Pt, Pt, Pt];

function bez(s: Seg, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return [a * s[0][0] + b * s[1][0] + c * s[2][0] + d * s[3][0], a * s[0][1] + b * s[1][1] + c * s[2][1] + d * s[3][1]];
}

/** 左半轮廓：心形凹口 (0,0) → 基部圆裂片 → 最宽处 → 叶尖 (0,-100)。 */
const OUTLINE: Seg[] = [
  [[0, 0], [-3, 12], [-15, 21], [-30, 20]],
  [[-30, 20], [-50, 18], [-60, -8], [-56, -38]],
  [[-56, -38], [-51, -76], [-25, -99], [0, -100]],
];
const half = (t: number): Pt => {
  const k = Math.min(OUTLINE.length - 1, Math.floor(t * OUTLINE.length));
  return bez(OUTLINE[k], t * OUTLINE.length - k);
};

interface LeafSpec {
  /** 左侧裂口位置（轮廓参数 t） */
  slitsL: number[];
  slitsR: number[];
  /** 裂口深入比例（外缘 → 主脉） */
  depth: number;
  /** 孔洞：[外缘参数 t, 距主脉比例, 尺寸] */
  holes: Array<[number, number, number]>;
}

const SPECS: Record<'a' | 'b', LeafSpec> = {
  a: {
    slitsL: [0.2, 0.33, 0.44, 0.54, 0.64, 0.74, 0.84],
    slitsR: [0.18, 0.3, 0.42, 0.52, 0.62, 0.72, 0.83],
    depth: 0.66,
    holes: [],
  },
  b: {
    slitsL: [0.36, 0.52, 0.68, 0.82],
    slitsR: [0.3, 0.46, 0.62, 0.78],
    depth: 0.5,
    holes: [],
  },
};
// 孔洞：与裂口同一条侧脉间隙、位于裂口内端与主脉之间（像裂口向内延伸出的孤立椭圆孔）
(() => {
  const mid = (v: number): boolean => v > 0.4 && v < 0.8;
  for (const v of SPECS.a.slitsL.filter(mid)) SPECS.a.holes.push([v, 0.2, 1]);
  for (const v of SPECS.a.slitsR.filter(mid)) SPECS.a.holes.push([-v, 0.2, 0.95]);
  for (const v of SPECS.b.slitsL.filter(mid)) SPECS.b.holes.push([v, 0.26, 0.9]);
  for (const v of SPECS.b.slitsR.filter(mid)) SPECS.b.holes.push([-v, 0.26, 0.85]);
})();

/** 侧脉在主脉上的着生点 y（按轮廓参数 t 插值）：下部侧脉从叶基放射，上部侧脉斜向叶尖。 */
const RIB: Array<[number, number]> = [
  [0, -3],
  [0.2, -5],
  [0.33, -9],
  [0.44, -16],
  [0.54, -25],
  [0.64, -39],
  [0.74, -57],
  [0.84, -75],
  [0.93, -90],
  [1, -100],
];
function ribY(t: number): number {
  for (let i = 1; i < RIB.length; i++) {
    if (t <= RIB[i][0]) {
      const [t0, y0] = RIB[i - 1];
      const [t1, y1] = RIB[i];
      return y0 + ((t - t0) / (t1 - t0)) * (y1 - y0);
    }
  }
  return -100;
}

/** 沿侧脉方向，从外缘点（轮廓参数 t）朝主脉走 depth。 */
function slitInner(t: number, depth: number): Pt {
  const o = half(t);
  const m: Pt = [0, ribY(t)];
  return [o[0] + (m[0] - o[0]) * depth, o[1] + (m[1] - o[1]) * depth];
}

function leafPath(spec: LeafSpec, holes: boolean): string {
  const W = 0.012; // 裂口在外缘处的半宽（轮廓参数）
  const side = (slits: number[], sign: number): Pt[] => {
    const pts: Pt[] = [];
    const N = 60;
    let si = 0;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const s = slits[si];
      if (s !== undefined && t > s - W) {
        // 插入裂口：外缘 a → 内端（两点，平行窄缝）→ 外缘 b
        const a = half(s - W);
        const b = half(s + W);
        const o = half(s);
        const inn = slitInner(s, spec.depth);
        const g = 1.3; // 内端缝宽
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const m = Math.hypot(dx, dy) || 1;
        pts.push(a, [inn[0] - (dx / m) * g, inn[1] - (dy / m) * g], [inn[0] + (dx / m) * g * 0.7, inn[1] + (dy / m) * g * 0.7], b);
        si++;
        while (i < N && (i + 1) / N < s + W) i++;
        continue;
      }
      pts.push(half(t));
    }
    return pts.map(([x, y]) => [x * sign, y] as Pt);
  };
  const L = side(spec.slitsL, 1);
  const R = side(spec.slitsR, -1).reverse();
  const all = [...L, ...R.slice(1, -1)];
  let d = '';
  all.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${fx(x)} ${fx(y)}`;
  });
  d += 'z';
  if (holes) {
    for (const [tt, k, sz] of spec.holes) {
      const sign = tt < 0 ? -1 : 1;
      const o = half(Math.abs(tt));
      const inn = slitInner(Math.abs(tt), 1);
      // 孔中心：主脉 → 外缘方向上距主脉 k（按侧脉方向）
      const kk = k;
      const cx = (inn[0] + (o[0] - inn[0]) * kk) * sign;
      const cy = inn[1] + (o[1] - inn[1]) * kk;
      const ang = (Math.atan2(o[1] - inn[1], (o[0] - inn[0]) * sign) * 180) / Math.PI;
      const rx = 4.6 * sz;
      const ry = 1.8 * sz;
      const a = (ang * Math.PI) / 180;
      const ex = Math.cos(a) * rx;
      const ey = Math.sin(a) * rx;
      d += `M${fx(cx - ex)} ${fx(cy - ey)}a${fx(rx)} ${fx(ry)} ${Math.round(ang)} 1 0 ${fx(2 * ex)} ${fx(2 * ey)}a${fx(rx)} ${fx(ry)} ${Math.round(ang)} 1 0 ${fx(-2 * ex)} ${fx(-2 * ey)}z`;
    }
  }
  return tight(d);
}

/** 叶脉：主脉（细长楔形，靠 fill）+ 侧脉（直线，靠 stroke）。 */
function veinPath(spec: LeafSpec): string {
  let d = 'M-1.6 4L0 -95L1.6 4z';
  const mids = (s: number[]): number[] => [s[0] - 0.08, ...s.slice(0, -1).map((v, i) => (v + s[i + 1]) / 2), s[s.length - 1] + 0.07];
  for (const [slits, sign] of [
    [spec.slitsL, 1],
    [spec.slitsR, -1],
  ] as Array<[number[], number]>) {
    for (const t of mids(slits)) {
      if (t <= 0.26 || t >= 0.93) continue;
      const o = half(t);
      const inn = slitInner(t, 0.97);
      const e: Pt = [inn[0] + (o[0] - inn[0]) * 0.86, inn[1] + (o[1] - inn[1]) * 0.86];
      d += `M${fx(inn[0] * sign)} ${fx(inn[1])}L${fx(e[0] * sign)} ${fx(e[1])}`;
    }
  }
  return tight(d);
}

/** 叶柄：独立子路径（与叶身分开定义，避免 evenodd 把重叠处挖空）。 */
const STALK = 'M-2 -4L-1.3 40L1.3 40L2 -4z';

const GEO = {
  a: leafPath(SPECS.a, false),
  ah: leafPath(SPECS.a, true),
  b: leafPath(SPECS.b, false),
  bh: leafPath(SPECS.b, true),
  va: veinPath(SPECS.a),
  vb: veinPath(SPECS.b),
};

const def: PatternDef = {
  id: 'monstera',
  name: '龟背竹',
  category: 'G-botanical',
  description: '心形深裂、叶面带椭圆孔洞的龟背竹大叶散布满画，深中浅三层绿交叠并带错位投影，热带植物壁纸感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#13261e' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_deep', label: '叶 · 深', role: 'detail', paint: { type: 'solid', color: '#1d3f30' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_mid', label: '叶 · 中', role: 'secondary', paint: { type: 'solid', color: '#2e6047' }, opacity: 1, visible: true, configurable: true },
    { id: 'shade', label: '投影', role: 'detail', paint: { type: 'solid', color: '#07120d' }, opacity: 0.45, visible: true, configurable: true },
    { id: 'leaf_light', label: '叶 · 浅', role: 'primary', paint: { type: 'solid', color: '#4f8b63' }, opacity: 1, visible: true, configurable: true },
    { id: 'vein', label: '叶脉', role: 'accent', paint: { type: 'solid', color: '#9cc5a3' }, opacity: 0.5, visible: true, configurable: true },
  ],

  controls: [
    { key: 'leafSize', label: '叶片大小', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'density', label: '密度', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.6, heavy: true },
    { key: 'spin', label: '旋转随机', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'holes', label: '叶面孔洞', type: 'toggle', default: true },
    { key: 'veins', label: '叶脉', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'jungle',
      label: '雨林',
      elements: {
        bg: { paint: { type: 'solid', color: '#13261e' } },
        leaf_deep: { paint: { type: 'solid', color: '#1d3f30' } },
        leaf_mid: { paint: { type: 'solid', color: '#2e6047' } },
        shade: { paint: { type: 'solid', color: '#07120d' }, opacity: 0.45 },
        leaf_light: { paint: { type: 'solid', color: '#4f8b63' } },
        vein: { paint: { type: 'solid', color: '#9cc5a3' }, opacity: 0.5 },
      },
    },
    {
      id: 'linen',
      label: '亚麻',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe9dc' } },
        leaf_deep: { paint: { type: 'solid', color: '#b9c7ae' } },
        leaf_mid: { paint: { type: 'solid', color: '#7fa284' } },
        shade: { paint: { type: 'solid', color: '#7c7a62' }, opacity: 0.22 },
        leaf_light: { paint: { type: 'solid', color: '#40705a' } },
        vein: { paint: { type: 'solid', color: '#e4ead8' }, opacity: 0.55 },
      },
      params: { density: 0.45, spin: 0.8 },
    },
    {
      id: 'clay',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#dcb7a0' } },
        leaf_deep: { paint: { type: 'solid', color: '#a7b294' } },
        leaf_mid: { paint: { type: 'solid', color: '#6b8a6c' } },
        shade: { paint: { type: 'solid', color: '#7a4a36' }, opacity: 0.25 },
        leaf_light: { paint: { type: 'solid', color: '#35594a' } },
        vein: { paint: { type: 'solid', color: '#d6dfc8' }, opacity: 0.5 },
      },
      params: { leafSize: 1.3, density: 0.5 },
    },
    {
      id: 'graphite',
      label: '墨叶',
      elements: {
        bg: { paint: { type: 'solid', color: '#1e2220' } },
        leaf_deep: { paint: { type: 'solid', color: '#2b322e' } },
        leaf_mid: { paint: { type: 'solid', color: '#3c4740' } },
        shade: { paint: { type: 'solid', color: '#0e100f' }, opacity: 0.5 },
        leaf_light: { paint: { type: 'solid', color: '#566659' } },
        vein: { paint: { type: 'solid', color: '#8c9b8f' }, opacity: 0.5 },
      },
      params: { leafSize: 0.85, density: 0.85, spin: 1 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['leaf_light'], secondary: ['leaf_mid'], accent: ['vein'], detail: ['leaf_deep', 'shade'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const sizeK = clampN(params.leafSize, 0.6, 1.6, 1);
    const density = clampN(params.density, 0.2, 1, 0.6);
    const spin = clampN(params.spin, 0, 1, 0.6);
    const holesOn = params.holes === true;
    const veinsOn = params.veins === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const area = (Wv * Hv) / (V * V);

    // ── 叶位：固定随机消耗（每片 5 个随机数）→ 环面最小间距散布 ──────
    const baseLen = V * 0.4 * sizeK;
    const want = Math.min(MAX_LEAVES, Math.max(4, Math.round((area * (4 + 16 * density)) / (sizeK * sizeK))));
    interface Meta {
      len: number;
      kind: 'a' | 'b';
      flip: number;
      rot: number;
      layer: number;
    }
    const meta: Meta[] = [];
    const baseRot = -24 + (rng() - 0.5) * 20;
    for (let i = 0; i < want; i++) {
      const u = rng();
      const layer = u < 0.36 ? 0 : u < 0.7 ? 1 : 2;
      const len = baseLen * (0.78 + rng() * 0.42) * (layer === 0 ? 1.12 : layer === 2 ? 0.92 : 1);
      const kind = rng() < 0.68 ? 'a' : 'b';
      const flip = rng() < 0.5 ? -1 : 1;
      const j = rng() - 0.5;
      // spin=0：统一朝向（叶尖朝左上 / 右上交替的微小抖动）；spin=1：任意方向
      const rot = baseRot * (flip > 0 ? 1 : -1) * (1 - spin) + j * (24 + spin * 336);
      meta.push({ len, kind, flip, rot, layer });
    }
    // 先放深层（大叶打底），再放中、浅层 → 浅层叶落在空隙与交叠处
    const order = meta.map((_, i) => i).sort((a, b) => meta[a].layer - meta[b].layer || a - b);
    const gap = 1.12 - 0.5 * density;
    const radii = order.map((i) => meta[i].len * 0.42);
    const spots = scatterTorus(rng, radii, Wv, Hv, gap, 20);

    interface Leaf extends Meta {
      x: number;
      y: number;
    }
    const leaves: Leaf[] = [];
    let sIdx = 0;
    // scatterTorus 会跳过放不下的点：按半径匹配回元数据
    for (const i of order) {
      const s = spots[sIdx];
      if (!s) break;
      if (Math.abs(s.r - meta[i].len * 0.42) > 1e-6) continue;
      sIdx++;
      leaves.push({ ...meta[i], x: s.x, y: s.y });
    }

    const tf = (L: Leaf, dx = 0, dy = 0): string => {
      const s = L.len / 100;
      const a = (L.rot * Math.PI) / 180;
      // 叶片视觉中心落在散点上：原点 = 中心 − R·(0, CENTER_Y·s)
      const ox = L.x + Math.sin(a) * CENTER_Y * s + dx;
      const oy = L.y - Math.cos(a) * CENTER_Y * s + dy;
      const sc = L.flip < 0 ? `${api.n(-s)} ${api.n(s)}` : api.n(s);
      return `translate(${Math.round(ox)} ${Math.round(oy)})rotate(${Math.round(L.rot)})scale(${sc})`;
    };
    const geoId = (L: Leaf): string => `vwms-${L.kind}${holesOn ? 'h' : ''}`;

    const bg = elements.get('bg')!;
    const deep = elements.get('leaf_deep')!;
    const mid = elements.get('leaf_mid')!;
    const shade = elements.get('shade')!;
    const light = elements.get('leaf_light')!;
    const vein = elements.get('vein')!;
    const byLayer = [0, 1, 2].map((l) => leaves.filter((L) => L.layer === l));
    const layerEl = [deep, mid, light];

    // 只定义实际用到的几何
    const usedGeo = new Set<string>();
    const usedVein = new Set<string>();
    byLayer.forEach((list, li) => {
      if (!layerEl[li].visible && !(li === 2 && shade.visible)) return;
      for (const L of list) usedGeo.add(geoId(L));
    });
    const veinLayers = veinsOn && vein.visible ? [1, 2].filter((li) => layerEl[li].visible) : [];
    for (const li of veinLayers) for (const L of byLayer[li]) usedVein.add(`v${L.kind}`);

    let defs = '';
    for (const id of usedGeo) defs += `<g id="${id}"><path d="${STALK}"/><path d="${GEO[id.slice(5) as keyof typeof GEO]}" fill-rule="evenodd"/></g>`;
    for (const id of usedVein) defs += `<path id="vwms-${id}" d="${GEO[id as keyof typeof GEO]}"/>`;
    // 带叶脉的叶 = 叶形（继承外层填色）+ 叶脉（自带颜色）组成一个组合 → 每片叶的叶脉紧跟在自己叶片之后，
    // 不会浮到压在上面的另一片叶子上。id 带叶脉配色哈希，避免多张缩略图串色。
    const vk = [0, 0, 0.6, 1];
    const combo = (L: Leaf, li: number): string => `vwms-${L.kind}${holesOn ? 'h' : ''}${li}${shortHash(vein.paintValue + vein.opacity)}`;
    const usedCombo = new Map<string, [Leaf, number]>();
    for (const li of veinLayers) for (const L of byLayer[li]) usedCombo.set(combo(L, li), [L, li]);
    for (const [id, [L, li]] of usedCombo) {
      const o = fo(vein.opacity * vk[li + 1]);
      defs +=
        `<g id="${id}"><use href="#${geoId(L)}"/>` +
        `<use href="#vwms-v${L.kind}" fill="${vein.paintValue}" stroke="${vein.paintValue}" fill-opacity="${o}" stroke-opacity="${o}" stroke-width="0.7" stroke-linecap="round"/></g>`;
    }

    let inner = defs !== '' ? `<defs>${defs}</defs>` : '';
    const grp = (e: typeof deep, li: number, dx = 0, dy = 0, plain = false): string => {
      const list = byLayer[li];
      if (!e.visible || list.length === 0) return '';
      const withVein = !plain && veinLayers.includes(li);
      return `<g fill="${e.paintValue}" fill-opacity="${fo(e.opacity)}">${list
        .map((L) => `<use href="#${withVein ? combo(L, li) : geoId(L)}" transform="${tf(L, dx, dy)}"/>`)
        .join('')}</g>`;
    };

    inner += grp(deep, 0);
    inner += grp(mid, 1);
    inner += grp(shade, 2, V * 0.016, V * 0.022, true);
    inner += grp(light, 2);

    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
