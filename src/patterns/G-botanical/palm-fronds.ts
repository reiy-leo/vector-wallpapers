/**
 * 热带叶影 —— G 植物花卉 / 大叶交叠剪影。
 *
 * 三种叶形：龟背竹（心形叶 + 羽状裂口 + 近主脉的椭圆孔洞）、棕榈（弓形叶轴 + 两侧细长小叶）、
 * 芭蕉（长椭圆叶 + 不规则横向撕裂）。叶子分远 / 中 / 近三层，近层下方再垫一层错位投影 → 有前后进深。
 * 两种构图：
 *  - frame 环绕：叶柄从画面四周伸入，叶尖朝画心，中央留出呼吸空间（适合放桌面图标）；
 *  - cover 满铺：叶子随机散布、方向任意，铺满整个画面。
 *
 * ⭐ 体积：三种叶形（及其叶脉）各在 `<defs>` 定义一次（无填色 → id 固定），每片叶子 = 一个 <use>；
 * 全部几何在「短边 = 1000」的虚拟坐标里，外层 scale(q) 放大 → 体积与分辨率无关。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampN, fo, fx, tight } from './_helpers';

const V = 1000;

type Pt = [number, number];

function bez(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return [
    u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
    u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
  ];
}

/** 左半轮廓（两段贝塞尔）采样，t ∈ [0,1] 从叶基到叶尖。 */
function halfOutline(segs: Array<[Pt, Pt, Pt, Pt]>, t: number): Pt {
  const k = Math.min(segs.length - 1, Math.floor(t * segs.length));
  const lt = t * segs.length - k;
  return bez(...segs[k], lt);
}

/**
 * 带裂口的叶形：左半轮廓采样 → 在 slits 处插入楔形切口（朝主脉、略向叶基倾斜）→ 右半镜像。
 * depth：切口深入到「外缘 → 主脉」距离的比例。
 */
function slitLeaf(segs: Array<[Pt, Pt, Pt, Pt]>, slitsL: number[], slitsR: number[], depth: number, tilt: number, wid: number): string {
  const half = (slits: number[], sign: number): Pt[] => {
    const pts: Pt[] = [];
    const N = 44;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const hit = slits.find((s) => Math.abs(t - s) < wid);
      if (hit !== undefined) {
        if (Math.abs(t - hit) < 0.5 / N) {
          const a = halfOutline(segs, hit - wid);
          const b = halfOutline(segs, hit + wid);
          const o = halfOutline(segs, hit);
          const inner: Pt = [o[0] * (1 - depth), o[1] + tilt];
          pts.push([a[0] * sign, a[1]], [inner[0] * sign, inner[1]], [b[0] * sign, b[1]]);
        }
        continue;
      }
      const p = halfOutline(segs, t);
      pts.push([p[0] * sign, p[1]]);
    }
    return pts;
  };
  const L = half(slitsL, 1);
  const R = half(slitsR, -1).reverse();
  const all = [...L, ...R.slice(1)];
  let d = '';
  all.forEach(([x, y], i) => {
    d += `${i === 0 ? 'M' : 'L'}${fx(x)} ${fx(y)}`;
  });
  return `${d}z`;
}

/** 叶柄：细长楔形，从叶基向 +y 伸出（伸出画外即可）。 */
const STALK = (w: number, len: number): string => `M${-w} 0L${fx(-w * 0.6)} ${len}L${fx(w * 0.6)} ${len}L${w} 0z`;

/** 龟背竹（长 100，叶基原点，叶尖 (0,-100)）。 */
const MONSTERA: string = (() => {
  const segs: Array<[Pt, Pt, Pt, Pt]> = [
    [[0, 0], [-16, 12], [-50, 8], [-57, -28]],
    [[-57, -28], [-63, -64], [-30, -97], [0, -100]],
  ];
  let d = slitLeaf(segs, [0.3, 0.44, 0.57, 0.7, 0.82], [0.27, 0.41, 0.55, 0.68, 0.81], 0.62, 9, 0.016);
  // 近主脉的椭圆孔（evenodd 挖空）
  const holes: Array<[number, number, number]> = [
    [0.37, 1, 1],
    [0.5, 1, -1],
    [0.63, 0.85, 1],
    [0.5, 0.9, 1],
    [0.36, 0.8, -1],
  ];
  for (const [t, k, sign] of holes) {
    const o = halfOutline(segs, t);
    const cx = o[0] * 0.24 * sign;
    const cy = o[1] + 5;
    const rx = 5.2 * k;
    const ry = 2 * k;
    const a = -0.5 * sign;
    const pts: Pt[] = [];
    for (let i = 0; i < 8; i++) {
      const u = (i / 8) * Math.PI * 2;
      const x = Math.cos(u) * rx;
      const y = Math.sin(u) * ry;
      pts.push([cx + x * Math.cos(a) - y * Math.sin(a), cy + x * Math.sin(a) + y * Math.cos(a)]);
    }
    pts.forEach(([x, y], i) => {
      d += `${i === 0 ? 'M' : 'L'}${fx(x)} ${fx(y)}`;
    });
    d += 'z';
  }
  return tight(d + STALK(1.8, 46));
})();

/** 芭蕉：长椭圆 + 横向撕裂。 */
const BANANA: string = (() => {
  const segs: Array<[Pt, Pt, Pt, Pt]> = [
    [[0, 0], [-10, -2], [-21, -14], [-22, -40]],
    [[-22, -40], [-23, -72], [-12, -94], [0, -100]],
  ];
  return tight(slitLeaf(segs, [0.33, 0.47, 0.71], [0.25, 0.56, 0.62, 0.84], 0.9, 3, 0.006) + STALK(1.5, 46));
})();

/** 棕榈：弓形叶轴 + 两侧细长下垂小叶。 */
const PALM: string = (() => {
  const axis = (t: number): Pt => [16 * t * t, -100 * t];
  const tan = (t: number): number => Math.atan2(-100, 32 * t);
  let d = '';
  const N = 24;
  for (const side of [-1, 1]) {
    for (let i = 0; i < N; i++) {
      const t = 0.06 + (i / (N - 1)) * 0.9;
      const [x, y] = axis(t);
      const len = 46 * Math.pow(Math.sin(Math.PI * (0.12 + t * 0.85)), 0.75) + 6;
      // 方向：与叶轴夹角从基部 62° 收到叶尖 28°，并向叶基方向下垂
      const a = tan(t) + side * (1.08 - t * 0.6);
      const droop = side * 0.25 * (1 - t);
      const a2 = a + droop;
      const tx = x + Math.cos(a2) * len;
      const ty = y + Math.sin(a2) * len;
      const mx = x + Math.cos(a) * len * 0.5;
      const my = y + Math.sin(a) * len * 0.5;
      const w = 2.6 * (1 - t * 0.4);
      const nx = -Math.sin(a) * w;
      const ny = Math.cos(a) * w;
      d += `M${fx(x)} ${fx(y)}Q${fx(mx + nx)} ${fx(my + ny)} ${fx(tx)} ${fx(ty)}Q${fx(mx - nx)} ${fx(my - ny)} ${fx(x)} ${fx(y)}z`;
    }
  }
  // 叶轴（细楔形）+ 叶柄
  const tip = axis(1);
  d += `M-2 0Q4 -50 ${fx(tip[0])} ${fx(tip[1])}Q6 -50 2 0z`;
  return tight(d + STALK(2, 46));
})();

/** 叶脉：主脉（+ 龟背竹侧脉）。 */
const VEINS: Record<string, string> = {
  m: tight(
    'M0 -2Q-3 -50 0 -96' +
      [0.22, 0.36, 0.5, 0.63, 0.76, 0.88]
        .map((t) => {
          const y = -100 * t;
          const ex = 30 * Math.sin(Math.PI * (t * 0.85 + 0.12));
          return `M0 ${fx(y + 4)}Q${fx(-ex * 0.5)} ${fx(y - 2)} ${fx(-ex)} ${fx(y - 12)}M0 ${fx(y + 4)}Q${fx(ex * 0.5)} ${fx(y - 2)} ${fx(ex)} ${fx(y - 12)}`;
        })
        .join(''),
  ),
  b: tight(
    'M0 -2L0 -97' +
      [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
        .map((t) => {
          const y = -100 * t;
          const ex = 19 * Math.sin(Math.PI * (t * 0.85 + 0.1));
          return `M0 ${fx(y)}L${fx(-ex)} ${fx(y - 8)}M0 ${fx(y)}L${fx(ex)} ${fx(y - 8)}`;
        })
        .join(''),
  ),
  p: 'M0 0Q5-50 16-100',
};

const TYPES: Record<string, Array<'m' | 'p' | 'b'>> = {
  mixed: ['m', 'p', 'm', 'b', 'p'],
  monstera: ['m'],
  palm: ['p'],
  banana: ['b', 'b', 'm'],
};

const def: PatternDef = {
  id: 'palm-fronds',
  name: '热带叶影',
  category: 'G-botanical',
  description: '龟背竹、棕榈、芭蕉大叶分远中近三层交叠成剪影，带错位投影；可环绕画面留白或满铺。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#14261f' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_far', label: '叶 · 远', role: 'detail', paint: { type: 'solid', color: '#1f3a2f' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_mid', label: '叶 · 中', role: 'secondary', paint: { type: 'solid', color: '#2c5241' }, opacity: 1, visible: true, configurable: true },
    { id: 'shade', label: '投影', role: 'detail', paint: { type: 'solid', color: '#0b1712' }, opacity: 0.45, visible: true, configurable: true },
    { id: 'leaf_near', label: '叶 · 近', role: 'primary', paint: { type: 'solid', color: '#3f7458' }, opacity: 1, visible: true, configurable: true },
    { id: 'vein', label: '叶脉', role: 'accent', paint: { type: 'solid', color: '#7fae8e' }, opacity: 0.6, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'leafType',
      label: '叶种',
      type: 'select',
      default: 'mixed',
      options: [
        { value: 'mixed', label: '混合' },
        { value: 'monstera', label: '龟背竹' },
        { value: 'palm', label: '棕榈' },
        { value: 'banana', label: '芭蕉' },
      ],
    },
    {
      key: 'layout',
      label: '构图',
      type: 'select',
      default: 'frame',
      options: [
        { value: 'frame', label: '环绕留白' },
        { value: 'cover', label: '满铺' },
      ],
    },
    { key: 'density', label: '叶量', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, heavy: true },
    { key: 'leafSize', label: '叶片大小', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: 'veins', label: '叶脉', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'jungle',
      label: '雨林',
      elements: {
        bg: { paint: { type: 'solid', color: '#14261f' } },
        leaf_far: { paint: { type: 'solid', color: '#1f3a2f' } },
        leaf_mid: { paint: { type: 'solid', color: '#2c5241' } },
        shade: { paint: { type: 'solid', color: '#0b1712' }, opacity: 0.45 },
        leaf_near: { paint: { type: 'solid', color: '#3f7458' } },
        vein: { paint: { type: 'solid', color: '#7fae8e' }, opacity: 0.6 },
      },
    },
    {
      id: 'riviera',
      label: '里维埃拉',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2ebdc' } },
        leaf_far: { paint: { type: 'solid', color: '#dfe0c9' } },
        leaf_mid: { paint: { type: 'solid', color: '#b9c8a6' } },
        shade: { paint: { type: 'solid', color: '#8a8f72' }, opacity: 0.25 },
        leaf_near: { paint: { type: 'solid', color: '#6e8f6a' } },
        vein: { paint: { type: 'solid', color: '#e9ead6' }, opacity: 0.55 },
      },
    },
    {
      id: 'terracotta',
      label: '赤陶',
      elements: {
        bg: { paint: { type: 'solid', color: '#d9a07e' } },
        leaf_far: { paint: { type: 'solid', color: '#c98d6c' } },
        leaf_mid: { paint: { type: 'solid', color: '#9fae8a' } },
        shade: { paint: { type: 'solid', color: '#6e3f2b' }, opacity: 0.3 },
        leaf_near: { paint: { type: 'solid', color: '#4f6b4f' } },
        vein: { paint: { type: 'solid', color: '#c9d3b5' }, opacity: 0.5 },
      },
      params: { leafType: 'banana', layout: 'cover', density: 0.3, leafSize: 0.75 },
    },
    {
      id: 'noir',
      label: '夜影',
      elements: {
        bg: { paint: { type: 'solid', color: '#202326' } },
        leaf_far: { paint: { type: 'solid', color: '#2a2e31' } },
        leaf_mid: { paint: { type: 'solid', color: '#363b3e' } },
        shade: { paint: { type: 'solid', color: '#121416' }, opacity: 0.5 },
        leaf_near: { paint: { type: 'solid', color: '#4a5155' } },
        vein: { paint: { type: 'solid', color: '#6c757a' }, opacity: 0.6 },
      },
      params: { leafType: 'mixed', density: 0.75, leafSize: 0.9 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['leaf_near'], secondary: ['leaf_mid'], accent: ['vein'], detail: ['leaf_far', 'shade'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const types = TYPES[String(params.leafType)] ?? TYPES.mixed;
    const cover = params.layout === 'cover';
    const density = clampN(params.density, 0, 1, 0.5);
    const sizeK = clampN(params.leafSize, 0.6, 1.5, 1);
    const veinsOn = params.veins === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const cx = Wv / 2;
    const cy = Hv / 2;
    const per = 2 * (Wv + Hv);
    const area = (Wv * Hv) / (V * V); // 横屏 16:9 ≈ 1.78

    interface Leaf {
      t: 'm' | 'p' | 'b';
      x: number;
      y: number;
      rot: number;
      s: number;
      flip: number;
    }
    const LAYERS = [
      { n: 5 + 8 * density, len: 0.62 },
      { n: 4 + 6 * density, len: 0.7 },
      { n: 3 + 4 * density, len: 0.78 },
    ];
    const layers: Leaf[][] = LAYERS.map((L, li) => {
      const count = Math.round(L.n * Math.sqrt(area / 1.78) * (cover ? 1.25 : 1));
      const out: Leaf[] = [];
      for (let i = 0; i < count; i++) {
        const t = types[Math.floor(rng() * types.length) % types.length];
        const u = (i + rng() * 0.8 + li * 0.37) / count; // 分层错开 + 沿周长分布
        const j1 = rng();
        const j2 = rng();
        const j3 = rng();
        const flip = rng() < 0.5 ? -1 : 1;
        let x: number;
        let y: number;
        let ang: number;
        let len = V * L.len * sizeK * (0.75 + j3 * 0.45) * (t === 'p' ? 1.12 : t === 'b' ? 1.05 : 0.85);
        if (cover) {
          x = -0.05 * Wv + (u + (j1 - 0.5) * 0.25) * Wv * 1.1;
          x = ((x % (Wv * 1.1)) + Wv * 1.1) % (Wv * 1.1) - Wv * 0.05;
          y = -0.1 * Hv + j2 * Hv * 1.25;
          ang = j1 * Math.PI * 2;
          len *= 0.82;
        } else {
          // 周长参数 → 画框外缘一点，略向外推
          let p = (u * per + per * 0.1) % per;
          const out2 = V * 0.04;
          if (p < Wv) {
            x = p;
            y = -out2;
          } else if ((p -= Wv) < Hv) {
            x = Wv + out2;
            y = p;
          } else if ((p -= Hv) < Wv) {
            x = Wv - p;
            y = Hv + out2;
          } else {
            p -= Wv;
            x = -out2;
            y = Hv - p;
          }
          // 指向画心，抖动 ±0.55rad；离角越近越偏向对角线
          ang = Math.atan2(cy - y, cx - x) + (j1 - 0.5) * 1.1;
          // 叶尖不超过画心太多：限制长度到与中心距离的 ~0.85
          const dist = Math.hypot(cx - x, cy - y);
          len = Math.min(len, dist * (0.72 + j2 * 0.25));
        }
        out.push({ t, x, y, rot: (ang * 180) / Math.PI + 90, s: len / 100, flip });
      }
      return out;
    });

    const tf = (L: Leaf): string => `translate(${Math.round(L.x)} ${Math.round(L.y)})rotate(${Math.round(L.rot)})scale(${api.n(L.s * L.flip)} ${api.n(L.s)})`;
    const useL = (L: Leaf, pre = 'vwpf-'): string => `<use href="#${pre}${L.t}" transform="${tf(L)}"/>`;

    const bg = elements.get('bg')!;
    const far = elements.get('leaf_far')!;
    const mid = elements.get('leaf_mid')!;
    const shade = elements.get('shade')!;
    const near = elements.get('leaf_near')!;
    const vein = elements.get('vein')!;

    const used = new Set(layers.flat().map((l) => l.t));
    let defs = '';
    for (const t of used) defs += `<path id="vwpf-${t}" d="${t === 'm' ? MONSTERA : t === 'p' ? PALM : BANANA}" fill-rule="evenodd"/>`;
    const nearUsed = new Set(layers[2].map((l) => l.t));
    if (veinsOn && vein.visible) for (const t of nearUsed) defs += `<path id="vwpf-v${t}" d="${VEINS[t]}"/>`;

    let inner = `<defs>${defs}</defs>`;
    const grp = (e: typeof far, list: Leaf[], extra = ''): string =>
      e.visible && list.length > 0 ? `<g fill="${e.paintValue}" fill-opacity="${fo(e.opacity)}"${extra}>${list.map((l) => useL(l)).join('')}</g>` : '';
    inner += grp(far, layers[0]);
    inner += grp(mid, layers[1]);
    inner += grp(shade, layers[2], ` transform="translate(${fx(V * 0.014)} ${fx(V * 0.02)})"`);
    inner += grp(near, layers[2]);
    if (veinsOn && vein.visible && near.visible && layers[2].length > 0) {
      // 叶脉线宽在单位叶坐标里设定 → 随叶片缩放（大叶粗、小叶细）
      inner += `<g fill="none" stroke="${vein.paintValue}" stroke-opacity="${fo(vein.opacity)}" stroke-width="0.9" stroke-linecap="round">${layers[2]
        .map((l) => useL(l, 'vwpf-v'))
        .join('')}</g>`;
    }

    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
