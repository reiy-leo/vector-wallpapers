/**
 * 错位方格 —— A 极简几何线条。
 *
 * 构图要点：竖线组与横线组以不同「相位」排布，交点形成错落的视觉节奏；
 * 再叠加若干强调块打破规整感。线组走 <pattern> 平铺 —— 密度拉到最大时
 * DOM 节点数依然恒定，这是 20KB 红线的关键。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'offset-grid',
  name: '错位方格',
  category: 'A-lines',
  description: '竖线组与横线组以错位相位排布，交点形成错落节奏，点缀强调色块。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f5f3ee' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_v', label: '竖线组', role: 'secondary', paint: { type: 'solid', color: '#1f2937' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'line_h', label: '横线组', role: 'primary', paint: { type: 'solid', color: '#4b5563' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'block', label: '强调块', role: 'accent', paint: { type: 'solid', color: '#e11d48' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '格距', type: 'range', min: 16, max: 160, step: 2, default: 56, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.5, max: 6, step: 0.1, default: 1.4, unit: 'px' },
    { key: 'shift', label: '错位量', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.28 },
    { key: 'blocks', label: '强调块数', type: 'range', min: 0, max: 8, step: 1, default: 3 },
  ],

  presets: [
    {
      id: 'paper',
      label: '纸白',
      elements: {
        bg: { paint: { type: 'solid', color: '#faf7f0' } },
        line_v: { paint: { type: 'solid', color: '#111827' } },
        line_h: { paint: { type: 'solid', color: '#9ca3af' } },
        block: { paint: { type: 'solid', color: '#f59e0b' } },
      },
    },
    {
      id: 'ink',
      label: '墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#0a0a0a' } },
        line_v: { paint: { type: 'solid', color: '#e5e7eb' }, opacity: 0.7 },
        line_h: { paint: { type: 'solid', color: '#6b7280' }, opacity: 0.5 },
        block: { paint: { type: 'solid', color: '#22d3ee' } },
      },
    },
    {
      id: 'terracotta',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2e8dc' } },
        line_v: { paint: { type: 'solid', color: '#9a3412' } },
        line_h: { paint: { type: 'solid', color: '#c2410c' }, opacity: 0.4 },
        block: { paint: { type: 'solid', color: '#166534' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], secondary: ['line_v'], primary: ['line_h'], accent: ['block'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(8, Number(params.cell));
    const weight = Number(params.weight);
    const shift = Number(params.shift);
    const blockCount = Math.round(Number(params.blocks));

    const bg = elements.get('bg')!;
    const lv = elements.get('line_v')!;
    const lh = elements.get('line_h')!;
    const block = elements.get('block')!;

    const parts: string[] = [
      rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
    ];

    // 竖线组：<pattern> 平铺，密度不影响 DOM 数量
    if (lv.visible) {
      const vTile = api.tile({
        key: `og-v-${api.n(cell)}-${api.n(weight)}`,
        w: cell,
        h: H,
        content: path(`M${api.n(weight / 2)} 0 L${api.n(weight / 2)} ${api.n(H)}`, {
          fill: 'none',
          stroke: lv.paintValue,
          'stroke-width': weight,
          'stroke-opacity': lv.opacity,
        }),
      });
      parts.push(rect(0, 0, W, H, { fill: vTile }));
    }

    // 横线组：整体右移 shift * cell → 与竖线错位
    if (lh.visible) {
      const hTile = api.tile({
        key: `og-h-${api.n(cell)}-${api.n(weight)}`,
        w: cell,
        h: cell,
        content: path(`M0 ${api.n(weight / 2)} L${api.n(cell)} ${api.n(weight / 2)}`, {
          fill: 'none',
          stroke: lh.paintValue,
          'stroke-width': weight,
          'stroke-opacity': lh.opacity,
        }),
      });
      parts.push(rect(-cell * shift, 0, W + cell, H, { fill: hTile }));
    }

    // 强调块：数量受控（≤8），随机落点由 seeded rng 决定 → 同 seed 同构图
    if (block.visible && blockCount > 0) {
      const size = cell * 0.62;
      for (let i = 0; i < blockCount; i++) {
        const cols = Math.max(1, Math.round(W / cell));
        const rows = Math.max(1, Math.round(H / cell));
        const cx = Math.round(rng() * cols) * cell - (cell - size) / 2;
        const cy = Math.round(rng() * rows) * cell - (cell - size) / 2;
        parts.push(rect(cx, cy, size, size, { fill: block.paintValue, 'fill-opacity': block.opacity }));
      }
    }

    return { body: parts.join('') };
  },
};

export default def;