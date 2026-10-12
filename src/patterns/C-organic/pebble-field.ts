/**
 * 鹅卵石 —— C 有机形态。
 *
 * 密排的扁圆卵石：低不规则度 + 压扁 + 随机朝向，四种石色固定轮转（i % 4）。
 * best-candidate 落位让石子之间留出均匀缝隙，像铺在地上的河滩石。压边复制 → 可无缝平铺。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';
import { blobD, blobPoints, scatter, wrapCenters } from './_blob';

/** path 数据体积上限：留出外壳与属性的余量，保证任意尺寸/参数都不击穿 20KB。 */
const BYTE_CAP = 17000;

const def: PatternDef = {
  id: 'pebble-field',
  name: '鹅卵石',
  category: 'C-organic',
  description: '扁圆的卵石密密铺开，朝向各异、缝隙均匀，四种石色安静交错。',
  seedable: true,
  animatable: false,
  elements: [
    { id: 'bg', label: '缝隙', role: 'bg', paint: { type: 'solid', color: '#ebe6dc' }, opacity: 1, visible: true, configurable: true },
    { id: 'stone_a', label: '卵石 · A', role: 'primary', paint: { type: 'solid', color: '#a89c8a' }, opacity: 1, visible: true, configurable: true },
    { id: 'stone_b', label: '卵石 · B', role: 'secondary', paint: { type: 'solid', color: '#7d766b' }, opacity: 1, visible: true, configurable: true },
    { id: 'stone_c', label: '卵石 · C', role: 'accent', paint: { type: 'solid', color: '#cfc5b5' }, opacity: 1, visible: true, configurable: true },
    { id: 'stone_d', label: '卵石 · D', role: 'detail', paint: { type: 'solid', color: '#5f6b6a' }, opacity: 1, visible: true, configurable: true },
  ],
  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 150, max: 400, step: 10, default: 190, heavy: true },
    { key: 'scale', label: '卵石大小', type: 'range', min: 0.6, max: 1.3, step: 0.05, default: 1 },
    { key: 'flat', label: '扁平度', type: 'range', min: 0, max: 0.6, step: 0.05, default: 0.3 },
  ],
  presets: [
    {
      id: 'riverbed',
      label: '河床',
      elements: {
        bg: { paint: { type: 'solid', color: '#2c3438' } },
        stone_a: { paint: { type: 'solid', color: '#6e7c80' } },
        stone_b: { paint: { type: 'solid', color: '#8f8a7e' } },
        stone_c: { paint: { type: 'solid', color: '#b3aa99' } },
        stone_d: { paint: { type: 'solid', color: '#4f5e5c' } },
      },
    },
    {
      id: 'candy',
      label: '糖豆',
      elements: {
        bg: { paint: { type: 'solid', color: '#fbf6f0' } },
        stone_a: { paint: { type: 'solid', color: '#f2b5a7' } },
        stone_b: { paint: { type: 'solid', color: '#9dc9c2' } },
        stone_c: { paint: { type: 'solid', color: '#f3d59b' } },
        stone_d: { paint: { type: 'solid', color: '#b9aed8' } },
      },
    },
  ],
  paletteSlots: { bg: ['bg'], primary: ['stone_a'], secondary: ['stone_b'], accent: ['stone_c'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const step = Math.max(150, Number(params.size)) * unitPx;
    const scale = Math.max(0.1, Number(params.scale));
    const flat = Math.max(0, Math.min(0.6, Number(params.flat)));
    const count = Math.max(8, Math.min(85, Math.round(((W * H) / (step * step)) * 1.2)));
    const ids = ['stone_a', 'stone_b', 'stone_c', 'stone_d'];
    const groups = ids.map((id) => elements.get(id)!);
    const ds = ['', '', '', ''];
    let used = 0;
    scatter(count, W, H, rng, 12).forEach(([cx, cy], i) => {
      const gi = i % 4;
      const r = step * 0.4 * scale * (0.7 + rng() * 0.45);
      const pts = blobPoints(r, 6, 0.18, rng, 1 - flat * (0.6 + rng() * 0.6));
      if (!groups[gi].visible || used > BYTE_CAP) return;
      for (const [x, y] of wrapCenters(cx, cy, r * 1.2, W, H)) { const d = blobD(pts, x, y); ds[gi] += d; used += d.length; }
    });
    const bg = elements.get('bg')!;
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    groups.forEach((e, gi) => {
      if (e.visible && ds[gi]) parts.push(path(ds[gi], { fill: e.paintValue, 'fill-opacity': e.opacity }));
    });
    return { body: parts.join('') };
  },
};

export default def;
