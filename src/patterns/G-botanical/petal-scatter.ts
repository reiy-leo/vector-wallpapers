/**
 * 碎花散落 —— G 植物花卉 / 无缝散布（ditsy print）。
 *
 * 与 E-scene/sakura-fall 的区别：sakura-fall 是单幅构图（一枝樱花 + 景深花瓣），
 * 本母题是**无方向的碎花布纹**：三种小花（圆瓣五瓣、细瓣雏菊、凹口四瓣）+ 小叶 + 散落花瓣，
 * 在一个环面平铺单元里做最小间距散点（近似泊松盘），平铺后疏密均匀、看不出接缝。
 *
 * ⭐ 体积：花形各在 `<defs>` 定义一次（无填色，颜色由外层 <g> 继承 → id 可固定、与配色无关），
 * 每朵一个 <use>，散落花瓣每片两段相对二次曲线；全部散点都在 <pattern> 单元内，跨边界的补对侧副本。
 * 动画（仅预览）：散落花瓣分远 / 近两个独立平铺层，各自整层下移一个单元高度无缝循环 + 左右摆动，
 * 远层慢、近层快 → 视差。花朵本身静止。导出时动画被引擎剥离，画面不变。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { LEAF_SHAPES, clampN, fo, fx, leafPath, scatterTorus, tight, torusCopies } from './_helpers';

/** 把一枚朝上的花瓣（-y 方向）绕原点复制 k 份。 */
function radial(petal: Array<[string, number[]]>, k: number, rot0 = 0): string {
  let d = '';
  for (let i = 0; i < k; i++) {
    const a = ((rot0 + (i * 360) / k) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [cmd, xs] of petal) {
      const o: string[] = [];
      for (let j = 0; j < xs.length; j += 2) o.push(`${fx(xs[j] * c - xs[j + 1] * s)} ${fx(xs[j] * s + xs[j + 1] * c)}`);
      d += cmd + o.join(' ');
    }
    d += 'z';
  }
  return tight(d);
}

/** 单位花，半径 10。 */
const F5 = radial(
  [
    ['M', [0, 0]],
    ['C', [-5.6, -2.6, -6.4, -9.4, 0, -10]],
    ['C', [6.4, -9.4, 5.6, -2.6, 0, 0]],
  ],
  5,
);
const F8 = radial(
  [
    ['M', [0, -1.5]],
    ['C', [-2.2, -3.6, -2, -9.2, 0, -10]],
    ['C', [2, -9.2, 2.2, -3.6, 0, -1.5]],
  ],
  8,
);
const F4 = radial(
  [
    ['M', [0, 0]],
    ['C', [-5.4, -1.8, -7.6, -8.2, -3.2, -10]],
    ['L', [0, -8.3]],
    ['L', [3.2, -10]],
    ['C', [7.6, -8.2, 5.4, -1.8, 0, 0]],
  ],
  4,
  45,
);

const MIXES: Record<string, Array<'f5' | 'f8' | 'f4'>> = {
  meadow: ['f5', 'f8', 'f4', 'f5'],
  blossom: ['f5', 'f5', 'f4'],
  daisy: ['f8', 'f8', 'f5'],
};

const def: PatternDef = {
  id: 'petal-scatter',
  name: '碎花散落',
  category: 'G-botanical',
  description: '三种小花与嫩叶、零落花瓣均匀散布成碎花布纹，无缝平铺；预览可开启花瓣飘落。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f6efe6' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf', label: '小叶', role: 'detail', paint: { type: 'solid', color: '#9aae8c' }, opacity: 1, visible: true, configurable: true },
    { id: 'flower_a', label: '花 · 主', role: 'primary', paint: { type: 'solid', color: '#e6a5a0' }, opacity: 1, visible: true, configurable: true },
    { id: 'flower_b', label: '花 · 次', role: 'secondary', paint: { type: 'solid', color: '#f3d3b8' }, opacity: 1, visible: true, configurable: true },
    { id: 'center', label: '花心', role: 'accent', paint: { type: 'solid', color: '#b0614f' }, opacity: 1, visible: true, configurable: true },
    { id: 'petal', label: '散落花瓣', role: 'secondary', paint: { type: 'solid', color: '#ecbcb4' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'scale', label: '尺度', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, heavy: true },
    { key: 'density', label: '花朵密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, heavy: true },
    { key: 'petals', label: '散瓣数量', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    {
      key: 'mix',
      label: '花种',
      type: 'select',
      default: 'meadow',
      options: [
        { value: 'meadow', label: '野花混合' },
        { value: 'blossom', label: '圆瓣小花' },
        { value: 'daisy', label: '雏菊' },
      ],
    },
    { key: 'leaves', label: '嫩叶', type: 'toggle', default: true },
    { key: 'falling', label: '花瓣飘落', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'peach',
      label: '蜜桃',
      elements: {
        bg: { paint: { type: 'solid', color: '#f6efe6' } },
        leaf: { paint: { type: 'solid', color: '#9aae8c' } },
        flower_a: { paint: { type: 'solid', color: '#e6a5a0' } },
        flower_b: { paint: { type: 'solid', color: '#f3d3b8' } },
        center: { paint: { type: 'solid', color: '#b0614f' } },
        petal: { paint: { type: 'solid', color: '#ecbcb4' } },
      },
    },
    {
      id: 'navy-ditsy',
      label: '藏青碎花',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f2a44' } },
        leaf: { paint: { type: 'solid', color: '#5f7d74' } },
        flower_a: { paint: { type: 'solid', color: '#f1e6d6' } },
        flower_b: { paint: { type: 'solid', color: '#e9b8a6' } },
        center: { paint: { type: 'solid', color: '#e2b65c' } },
        petal: { paint: { type: 'solid', color: '#c9b7b1' } },
      },
      params: { mix: 'daisy', density: 0.6 },
    },
    {
      id: 'sage-field',
      label: '鼠尾草',
      elements: {
        bg: { paint: { type: 'solid', color: '#c9d2bf' } },
        leaf: { paint: { type: 'solid', color: '#7f9476' } },
        flower_a: { paint: { type: 'solid', color: '#f7f3ea' } },
        flower_b: { paint: { type: 'solid', color: '#e9d48f' } },
        center: { paint: { type: 'solid', color: '#8a6b3c' } },
        petal: { paint: { type: 'solid', color: '#eef0e6' } },
      },
      params: { mix: 'blossom', petals: 0.35 },
    },
    {
      id: 'plum-night',
      label: '梅夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#2c1f2b' } },
        leaf: { paint: { type: 'solid', color: '#4f5e4c' } },
        flower_a: { paint: { type: 'solid', color: '#d98ca2' } },
        flower_b: { paint: { type: 'solid', color: '#a77ca8' } },
        center: { paint: { type: 'solid', color: '#f0d7a1' } },
        petal: { paint: { type: 'solid', color: '#b57a92' } },
      },
      params: { scale: 1.25, petals: 0.7 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['flower_a'], secondary: ['flower_b', 'petal'], accent: ['center'], detail: ['leaf'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const scale = clampN(params.scale, 0.5, 2, 1);
    const density = clampN(params.density, 0, 1, 0.5);
    const petalsK = clampN(params.petals, 0, 1, 0.5);
    const mix = MIXES[String(params.mix)] ?? MIXES.meadow;
    const leavesOn = params.leaves === true;
    const falling = animate && params.falling === true;
    const n = api.n;

    const S = Math.min(W, H) * 0.8 * scale; // 单元边长（够大 → 看不出重复）
    const r0 = S * 0.031;

    const bg = elements.get('bg')!;
    const leafEl = elements.get('leaf')!;
    const fa = elements.get('flower_a')!;
    const fb = elements.get('flower_b')!;
    const ctr = elements.get('center')!;
    const petalEl = elements.get('petal')!;

    // ── 花位（固定随机消耗：先定数量，再逐个取半径/类型/颜色/角度）─────
    const nF = Math.round(12 + density * 30);
    const meta: Array<{ r: number; type: 'f5' | 'f8' | 'f4'; b: boolean; a: number; lv: number[] }> = [];
    for (let i = 0; i < nF; i++) {
      const r = r0 * (0.72 + rng() * 0.6);
      const type = mix[Math.floor(rng() * mix.length) % mix.length];
      const b = rng() < 0.42;
      const a = Math.round(rng() * 72);
      const nl = rng() < 0.75 ? (rng() < 0.45 ? 2 : 1) : (rng(), 0);
      const lv: number[] = [];
      for (let k = 0; k < 2; k++) lv.push(rng() * Math.PI * 2);
      meta.push({ r, type, b, a, lv: lv.slice(0, nl) });
    }
    const spots = scatterTorus(rng, meta.map((m) => m.r * (leavesOn ? 1.55 : 1.15)), S, S, 1.05);

    const usesA: string[] = [];
    const usesB: string[] = [];
    let centers = '';
    const leafD: string[] = [];
    const sh = LEAF_SHAPES.laurel;
    spots.forEach((p, i) => {
      const m = meta[i];
      const r = m.r;
      const s = r / 10;
      const reach = r * (leavesOn ? 2.3 : 1.05);
      for (const [x, y] of torusCopies(p.x, p.y, reach, S, S)) {
        const u = `<use href="#vwps-${m.type}" transform="translate(${fx(x)} ${fx(y)})rotate(${m.a})scale(${n(s)})"/>`;
        (m.b ? usesB : usesA).push(u);
        centers += `<circle cx="${fx(x)}" cy="${fx(y)}" r="${fx(r * (m.type === 'f8' ? 0.34 : 0.26))}"/>`;
        if (leavesOn) for (const la of m.lv) leafD.push(leafPath(x + Math.cos(la) * r * 0.4, y + Math.sin(la) * r * 0.4, la, r * 1.9, sh));
      }
    });

    // ── 散落花瓣：远（小、淡）/ 近（大）两层，避开花位 ─────────────
    const nP = Math.round(petalsK * 70);
    const pr = r0 * 0.5;
    const petalLayers: string[] = ['', ''];
    if (nP > 0) {
      const radii: number[] = [];
      const pm: Array<{ layer: number; a: number; s: number }> = [];
      for (let i = 0; i < nP; i++) {
        const layer = rng() < 0.55 ? 0 : 1;
        const s = (layer === 0 ? 0.7 : 1.1) * (0.8 + rng() * 0.4);
        pm.push({ layer, a: Math.round(rng() * 360), s });
        radii.push(pr * s * 1.1);
      }
      const ps = scatterTorus(rng, radii, S, S, 1.1, 16, falling ? [] : spots.map((d) => ({ ...d })));
      ps.forEach((p, i) => {
        const m = pm[i];
        const len = pr * 2 * m.s;
        const a = (m.a * Math.PI) / 180;
        const c = Math.cos(a);
        const sn = Math.sin(a);
        const wd = len * 0.36;
        // 两段相对二次曲线：基部 → 尖 → 基部（≈30B / 片）
        const tx = len * c;
        const ty = len * sn;
        const seg =
          `q${fx(len * 0.55 * c - wd * sn)} ${fx(len * 0.55 * sn + wd * c)} ${fx(tx)} ${fx(ty)}` +
          `q${fx(len * 0.55 * c + wd * sn - tx)} ${fx(len * 0.55 * sn - wd * c - ty)} ${fx(-tx)} ${fx(-ty)}`;
        for (const [x, y] of torusCopies(p.x, p.y, len, S, S)) petalLayers[m.layer] += `M${fx(x)} ${fx(y)}${seg}`;
      });
    }

    // ── 组装 ───────────────────────────────────────────────
    const usedTypes = new Set(spots.map((_, i) => meta[i].type));
    let defs = '';
    if (fa.visible || fb.visible) for (const t of usedTypes) defs += `<path id="vwps-${t}" d="${t === 'f5' ? F5 : t === 'f8' ? F8 : F4}"/>`;

    let flowers = '';
    if (leafEl.visible && leafD.length > 0) flowers += `<path d="${tight(leafD.join(''))}" fill="${leafEl.paintValue}" fill-opacity="${fo(leafEl.opacity)}"/>`;
    if (fb.visible && usesB.length > 0) flowers += `<g fill="${fb.paintValue}" fill-opacity="${fo(fb.opacity)}">${usesB.join('')}</g>`;
    if (fa.visible && usesA.length > 0) flowers += `<g fill="${fa.paintValue}" fill-opacity="${fo(fa.opacity)}">${usesA.join('')}</g>`;
    if (ctr.visible && centers !== '') flowers += `<g fill="${ctr.paintValue}" fill-opacity="${fo(ctr.opacity)}">${centers}</g>`;

    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (defs !== '') parts.push(`<defs>${defs}</defs>`);

    const petalTile = (li: number): string => {
      const c = petalLayers[li];
      if (!petalEl.visible || c === '') return '';
      const op = fo(petalEl.opacity * (li === 0 ? 0.6 : 0.95));
      const ref = api.tile({ key: `petal-scatter-p${li}-${n(S)}`, w: S, h: S, content: `<path d="${tight(c)}" fill="${petalEl.paintValue}" fill-opacity="${op}"/>` });
      if (!falling) return rect(0, 0, W, H, { fill: ref });
      const dur = li === 0 ? 22 : 13;
      const amp = Math.round(S * (li === 0 ? 0.04 : 0.07));
      const fall = api.keyframes(`vw-psfall-${Math.round(S)}`, `to{transform:translateY(${Math.round(S)}px)}`);
      const sway = api.keyframes(`vw-pssway-${amp}`, `from{transform:translateX(-${amp}px)}to{transform:translateX(${amp}px)}`);
      return (
        `<g style="animation:${sway} ${li === 0 ? 7 : 4.6}s ease-in-out infinite alternate">` +
        `<g style="animation:${fall} ${dur}s linear infinite">` +
        rect(-S, -S, W + 2 * S, H + 2 * S, { fill: ref }) +
        `</g></g>`
      );
    };

    parts.push(petalTile(0));
    if (flowers !== '') {
      const ref = api.tile({ key: `petal-scatter-f-${n(S)}`, w: S, h: S, content: flowers });
      parts.push(rect(0, 0, W, H, { fill: ref }));
    }
    parts.push(petalTile(1));
    return { body: parts.join('') };
  },
};

export default def;
