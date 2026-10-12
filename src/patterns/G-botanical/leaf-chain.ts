/**
 * 藤叶链 —— G 植物花卉 / 平铺带。
 *
 * 结构：一条正弦藤蔓横穿平铺单元（单元宽 = 一个波长 λ），叶片沿藤蔓左右互生，
 * 叶尖顺着生长方向斜向外伸；上侧叶 / 下侧叶分别取「叶 · 主」「叶 · 次」，形成双色节律。
 * 单元高 = 两条藤带，第二条相位错开半个波长 → 上下两带的波峰波谷互相咬合，读作连续的织物纹样。
 * 波谷内侧可点缀三粒浆果。整体可旋转（横 / 斜 / 竖）——走 patternTransform，依旧无缝。
 *
 * ⭐ 体积：全部几何在一个 <pattern> 单元内；跨单元边界的叶片在对侧补副本（torusCopies），
 * DOM 与画布尺寸无关。线宽全部按 λ 比例推导（λ 本身按短边缩放）。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { LEAF_SHAPES, clampN, fo, fx, leafPath, midribPath, tight, torusCopies } from './_helpers';

const def: PatternDef = {
  id: 'leaf-chain',
  name: '藤叶链',
  category: 'G-botanical',
  description: '叶片沿波浪藤蔓左右互生，一带带交错平铺；可换叶形、密度与走向，浆果点缀波谷。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f2ede2' }, opacity: 1, visible: true, configurable: true },
    { id: 'vine', label: '藤蔓', role: 'detail', paint: { type: 'solid', color: '#6b6a4e' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_a', label: '叶 · 主', role: 'primary', paint: { type: 'solid', color: '#7f9a72' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_b', label: '叶 · 次', role: 'secondary', paint: { type: 'solid', color: '#a9b88f' }, opacity: 1, visible: true, configurable: true },
    { id: 'vein', label: '叶脉', role: 'detail', paint: { type: 'solid', color: '#f2ede2' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'berry', label: '浆果', role: 'accent', paint: { type: 'solid', color: '#c0714f' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'scale', label: '尺度', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, heavy: true },
    { key: 'amplitude', label: '波幅', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'leafSize', label: '叶片大小', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: 'leaves', label: '每波叶数', type: 'range', min: 2, max: 8, step: 1, default: 4 },
    {
      key: 'shape',
      label: '叶形',
      type: 'select',
      default: 'laurel',
      options: [
        { value: 'laurel', label: '月桂' },
        { value: 'willow', label: '柳叶' },
        { value: 'round', label: '圆叶' },
      ],
    },
    {
      key: 'direction',
      label: '走向',
      type: 'select',
      default: 'h',
      options: [
        { value: 'h', label: '横向' },
        { value: 'd', label: '斜向' },
        { value: 'v', label: '竖向' },
      ],
    },
    { key: 'berries', label: '浆果', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'linen-olive',
      label: '亚麻橄榄',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2ede2' } },
        vine: { paint: { type: 'solid', color: '#6b6a4e' } },
        leaf_a: { paint: { type: 'solid', color: '#7f9a72' } },
        leaf_b: { paint: { type: 'solid', color: '#a9b88f' } },
        vein: { paint: { type: 'solid', color: '#f2ede2' }, opacity: 0.55 },
        berry: { paint: { type: 'solid', color: '#c0714f' } },
      },
    },
    {
      id: 'forest-night',
      label: '林夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#172420' } },
        vine: { paint: { type: 'solid', color: '#4c6a58' } },
        leaf_a: { paint: { type: 'solid', color: '#3f6b55' } },
        leaf_b: { paint: { type: 'solid', color: '#6f9a7c' } },
        vein: { paint: { type: 'solid', color: '#172420' }, opacity: 0.5 },
        berry: { paint: { type: 'solid', color: '#d6a85c' } },
      },
      params: { shape: 'willow', leaves: 6, amplitude: 0.65 },
    },
    {
      id: 'terracotta',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#c98a68' } },
        vine: { paint: { type: 'solid', color: '#8a4f37' } },
        leaf_a: { paint: { type: 'solid', color: '#f1dcc4' } },
        leaf_b: { paint: { type: 'solid', color: '#e2b796' } },
        vein: { paint: { type: 'solid', color: '#c98a68' }, opacity: 0.6 },
        berry: { paint: { type: 'solid', color: '#7a3b2a' } },
      },
      params: { shape: 'round', leaves: 3, direction: 'd', scale: 0.85 },
    },
    {
      id: 'indigo',
      label: '靛染',
      elements: {
        bg: { paint: { type: 'solid', color: '#26324a' } },
        vine: { paint: { type: 'solid', color: '#c9d2e3' } },
        leaf_a: { paint: { type: 'solid', color: '#c9d2e3' } },
        leaf_b: { paint: { type: 'solid', color: '#8796b3' } },
        vein: { paint: { type: 'solid', color: '#26324a' }, opacity: 0.45 },
        berry: { paint: { type: 'solid', color: '#e6c78d' } },
      },
      params: { leaves: 5, direction: 'v', amplitude: 0.35, berries: false },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['leaf_a'], secondary: ['leaf_b'], accent: ['berry'], detail: ['vine', 'vein'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const scale = clampN(params.scale, 0.5, 2, 1);
    const ampK = clampN(params.amplitude, 0, 1, 0.5);
    const sizeK = clampN(params.leafSize, 0.6, 1.5, 1);
    const nLeaves = Math.round(clampN(params.leaves, 2, 8, 4));
    const sh = LEAF_SHAPES[String(params.shape)] ?? LEAF_SHAPES.laurel;
    const dir = String(params.direction);
    const berries = params.berries === true;

    const lam = Math.min(W, H) * 0.2 * scale; // 波长 = 单元宽
    const A = lam * 0.16 * ampK; // 波幅
    const leafLen = (lam / nLeaves) * 1.55 * sizeK * (sh.w > 0.5 ? 0.82 : 1);
    const reach = leafLen * (0.55 + sh.w * 0.6); // 叶片垂直于藤蔓的伸展
    const rowGap = 2 * A + 2 * reach + lam * 0.06;
    const tw = lam;
    const th = rowGap * 2;

    const bg = elements.get('bg')!;
    const vine = elements.get('vine')!;
    const la = elements.get('leaf_a')!;
    const lb = elements.get('leaf_b')!;
    const vein = elements.get('vein')!;
    const berry = elements.get('berry')!;

    const k = (2 * Math.PI) / lam;
    // 行 r：中轴 y0，相位 ph（第二行错半波）
    const rows = [
      { y0: rowGap * 0.5, ph: 0 },
      { y0: rowGap * 1.5, ph: Math.PI },
    ];

    let vineD = '';
    const leafA: string[] = [];
    const leafB: string[] = [];
    let veinD = '';
    let berryD = '';
    const sw = lam * 0.018 * Math.max(0.7, sizeK);

    rows.forEach((row, ri) => {
      const yOf = (x: number): number => row.y0 + A * Math.sin(k * x + row.ph);
      const slope = (x: number): number => A * k * Math.cos(k * x + row.ph);
      // 藤蔓：Hermite → 三次贝塞尔，覆盖 [-λ/8, λ + λ/8]，越界部分由 pattern 裁掉
      const seg = 8;
      const xs: number[] = [];
      for (let i = -1; i <= seg + 1; i++) xs.push((i / seg) * lam);
      let d = `M${fx(xs[0])} ${fx(yOf(xs[0]))}`;
      for (let i = 1; i < xs.length; i++) {
        const x0 = xs[i - 1];
        const x1 = xs[i];
        const dx = (x1 - x0) / 3;
        d += `C${fx(x0 + dx)} ${fx(yOf(x0) + slope(x0) * dx)} ${fx(x1 - dx)} ${fx(yOf(x1) - slope(x1) * dx)} ${fx(x1)} ${fx(yOf(x1))}`;
      }
      vineD += d;

      // 叶片：沿 x 等距、左右互生；叶尖朝 +x 并外倾
      for (let i = 0; i < nLeaves; i++) {
        const x = ((i + 0.5) / nLeaves) * lam;
        const y = yOf(x);
        const side = i % 2 === 0 ? -1 : 1; // -1 = 上侧
        const tan = Math.atan(slope(x));
        const a = tan + side * 0.78;
        const target = (side === -1) !== (ri === 1) ? leafA : leafB;
        for (const [cx, cy] of torusCopies(x, y, leafLen * 1.02, tw, th)) {
          target.push(leafPath(cx, cy, a, leafLen, sh));
          veinD += midribPath(cx, cy, a, leafLen);
        }
      }

      // 浆果：每个波谷（行内 sin 取最小处的「内侧」，即波峰下方空档）放三粒
      if (berries) {
        const xb = (((1.5 * Math.PI - row.ph) / k) % lam + lam) % lam; // sin = -1 → 曲线最高点（y 最小）
        const yb = yOf(xb) + A * 0.35 + reach * 0.15;
        const br = lam * 0.024 * Math.max(0.8, sizeK);
        const pts: Array<[number, number]> = [
          [xb - br * 1.6, yb + br * 1.1],
          [xb + br * 1.6, yb + br * 1.1],
          [xb, yb + br * 2.7],
        ];
        for (const [px, py] of pts) {
          for (const [cx, cy] of torusCopies(px, py, br, tw, th)) berryD += `M${fx(cx)} ${fx(cy)}h0`;
        }
      }
    });

    const n = api.n;
    let content = '';
    if (vine.visible && vineD !== '')
      content += `<path d="${tight(vineD)}" fill="none" stroke="${vine.paintValue}" stroke-opacity="${fo(vine.opacity)}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
    if (lb.visible && leafB.length > 0) content += `<path d="${tight(leafB.join(''))}" fill="${lb.paintValue}" fill-opacity="${fo(lb.opacity)}"/>`;
    if (la.visible && leafA.length > 0) content += `<path d="${tight(leafA.join(''))}" fill="${la.paintValue}" fill-opacity="${fo(la.opacity)}"/>`;
    if (vein.visible && veinD !== '')
      content += `<path d="${tight(veinD)}" fill="none" stroke="${vein.paintValue}" stroke-opacity="${fo(vein.opacity)}" stroke-width="${n(sw * 0.55)}" stroke-linecap="round"/>`;
    if (berry.visible && berryD !== '')
      content += `<path d="${tight(berryD)}" fill="none" stroke="${berry.paintValue}" stroke-opacity="${fo(berry.opacity)}" stroke-width="${n(lam * 0.05 * Math.max(0.8, sizeK))}" stroke-linecap="round"/>`;

    const rot = dir === 'd' ? 'rotate(-30)' : dir === 'v' ? 'rotate(90)' : undefined;
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (content !== '') {
      const ref = api.tile({ key: `leaf-chain-${n(tw)}-${n(th)}`, w: tw, h: th, content, transform: rot });
      parts.push(rect(0, 0, W, H, { fill: ref }));
    }
    return { body: parts.join('') };
  },
};

export default def;
