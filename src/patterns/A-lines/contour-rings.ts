/**
 * 等高线圈 —— A 极简线条 / 几何。
 *
 * 构图要点：同心圆环由内向外分三段色带（内/ 中 / 外），
 * 像地形等高线或声呐图。单元内所有环**完整绘制**，因此三段色带
 * 在每个单元都必然出现 —— 改色命中率恒为 100%。
 *
 * ⭐ 用多档互质单元叠加：单一尺寸的同心圆阵会立刻暴露成规则点阵，
 * 三档尺寸（大/中/小）叠加后，视觉重复周期远大于视野。
 */
import { circle, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'contour-rings',
  name: '等高线圈',
  category: 'A-lines',
  description: '同心圆环由内向外分三段色带，多档尺度叠加成等高线般的秩序。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0c0a09' }, opacity: 1, visible: true, configurable: true },
    { id: 'ring_inner', label: '圈层 · 内', role: 'accent', paint: { type: 'solid', color: '#fbbf24' }, opacity: 0.95, visible: true, configurable: true },
    { id: 'ring_mid', label: '圈层 · 中', role: 'secondary', paint: { type: 'solid', color: '#38bdf8' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'ring_outer', label: '圈层 · 外', role: 'primary', paint: { type: 'solid', color: '#a78bfa' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 60, max: 420, step: 10, default: 190, heavy: true },
    { key: 'rings', label: '环数', type: 'range', min: 3, max: 14, step: 1, default: 7 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.5, max: 6, step: 0.1, default: 1.6, unit: 'px' },
    { key: 'layers', label: '叠加层数', type: 'range', min: 1, max: 3, step: 1, default: 3 },
  ],

  presets: [
    {
      id: 'sonar',
      label: '声呐',
      elements: {
        bg: { paint: { type: 'solid', color: '#042f2e' } },
        ring_inner: { paint: { type: 'solid', color: '#5eead4' } },
        ring_mid: { paint: { type: 'solid', color: '#0d9488' } },
    ring_outer: { paint: { type: 'solid', color: '#134e4a' } },
      },
    },
    {
      id: 'dusk',
      label: '暮紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#1e1b4b' } },
        ring_inner: { paint: { type: 'solid', color: '#fde68a' } },
        ring_mid: { paint: { type: 'solid', color: '#c084fc' } },
        ring_outer: { paint: { type: 'solid', color: '#6d28d9' } },
      },
    },
    {
      id: 'paper',
      label: '纸感',
      elements: {
        bg: { paint: { type: 'solid', color: '#fafaf9' } },
        ring_inner: { paint: { type: 'solid', color: '#dc2626' } },
        ring_mid: { paint: { type: 'solid', color: '#1d4ed8' } },
        ring_outer: { paint: { type: 'solid', color: '#0f172a' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['ring_outer'], secondary: ['ring_mid'], accent: ['ring_inner'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
 const base = Math.max(30, Number(params.size));
    const ringCount = Math.max(3, Math.min(14, Math.round(Number(params.rings))));
    const weight = Math.max(0.3, Number(params.weight));
    const layers = Math.max(1, Math.min(3, Math.round(Number(params.layers))));

    const bg = elements.get('bg')!;
    const rInner = elements.get('ring_inner')!;
    const rMid = elements.get('ring_mid')!;
    const rOuter = elements.get('ring_outer')!;

    // 单元中心的 seeded 微偏移：同心圆的圆心若永远在正中，
    // 三档叠加会呈现 moiré 状的对齐感；偏移后错落开。
    const jx = (rng() - 0.5) * base * 0.16;
    const jy = (rng() - 0.5) * base * 0.16;

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // 三档互质比例的单元尺寸：让重复周期彼此不成整数倍
    const ratios = [1, 0.53, 0.29];
    for (let li = 0; li < layers; li++) {
  const cell = base * ratios[li];
      const cx = cell / 2 + jx * (li + 1) * 0.5;
      const cy = cell / 2 + jy * (li + 1) * 0.5;
      const maxR = cell * 0.46;
      const step = maxR / ringCount;
      // 越外的环线越细、越透明 —— 制造纵深，而不是一堆等权重圆
      const w = weight * (1 - li * 0.22);

      const marks: string[] = [];
      for (let i = 1; i <= ringCount; i++) {
        const r = step * i;
     // 按半径把环分到三段色带。
 // i 的小数位落在哪一段就决定它属于哪个元件 ——
        // 每段都必然覆盖到环（ringCount ≥ 3），所以三个元件在
        // 每个单元内都至少出现一次，命中率恒为 100%。
        const t = i / (ringCount + 1);
   const e = t < 1 / 3 ? rInner : t < 2 / 3 ? rMid : rOuter;
   if (!e.visible) continue;
        marks.push(
       circle(cx, cy, r, {
            fill: 'none',
            stroke: e.paintValue,
'stroke-width': w,
        'stroke-opacity': e.opacity * (1 - li * 0.25),
          }),
     );
   }

  if (marks.length > 0) {
        parts.push(
          rect(0, 0, W, H, {
            fill: api.tile({
              key: `cr-${api.n(cell)}-${ringCount}-${api.n(w)}-${li}`,
              w: cell,
  h: cell,
    content: marks.join(''),
            }),
    }),
        );
      }
    }

    return { body: parts.join('') };
  },
};

export default def;
