/**
 * 水磨石 —— C 有机形态。
 *
 * 浅底上散落大小悬殊的不规则碎石片（点数少 + 高不规则度 → 有棱有角但仍圆润），
 * 外加一层极小的细碎点。四色固定轮转（i % 4）。压边复制 → 可无缝平铺。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';
import { blobD, blobPoints, scatter, wrapCenters } from './_blob';

/** path 数据体积上限：留出外壳与属性的余量，保证任意尺寸/参数都不击穿 20KB。 */
const BYTE_CAP = 17000;

const def: PatternDef = {
  id: 'terrazzo',
  name: '水磨石',
  category: 'C-organic',
  description: '浅色石底里嵌着大小悬殊的彩色碎石片和细碎点，形状各不相同，明快耐看。',
  seedable: true,
  animatable: false,
  elements: [
    { id: 'bg', label: '石底', role: 'bg', paint: { type: 'solid', color: '#f2ede4' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_a', label: '碎石 · A', role: 'primary', paint: { type: 'solid', color: '#e07a5f' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_b', label: '碎石 · B', role: 'secondary', paint: { type: 'solid', color: '#3d405b' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_c', label: '碎石 · C', role: 'accent', paint: { type: 'solid', color: '#81b29a' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_d', label: '碎石 · D', role: 'detail', paint: { type: 'solid', color: '#f2cc8f' }, opacity: 1, visible: true, configurable: true },
  ],
  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 130, max: 360, step: 10, default: 170, heavy: true },
    { key: 'scale', label: '碎石大小', type: 'range', min: 0.5, max: 1.6, step: 0.05, default: 1 },
    { key: 'irregular', label: '不规则度', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.75 },
    { key: 'specks', label: '细碎点', type: 'toggle', default: true },
  ],
  presets: [
    {
      id: 'mono',
      label: '灰白',
      elements: {
        bg: { paint: { type: 'solid', color: '#efefec' } },
        chip_a: { paint: { type: 'solid', color: '#9a9a96' } },
        chip_b: { paint: { type: 'solid', color: '#3c3c3a' } },
        chip_c: { paint: { type: 'solid', color: '#c9c8c3' } },
        chip_d: { paint: { type: 'solid', color: '#6d6c68' } },
      },
    },
    {
      id: 'dark',
      label: '黑石',
      elements: {
        bg: { paint: { type: 'solid', color: '#22242a' } },
        chip_a: { paint: { type: 'solid', color: '#d9785c' } },
        chip_b: { paint: { type: 'solid', color: '#e9e3d6' } },
        chip_c: { paint: { type: 'solid', color: '#6fa58b' } },
        chip_d: { paint: { type: 'solid', color: '#e3bd7d' } },
      },
    },
  ],
  paletteSlots: { bg: ['bg'], primary: ['chip_a'], secondary: ['chip_b'], accent: ['chip_c'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const step = Math.max(130, Number(params.size)) * unitPx;
    const scale = Math.max(0.1, Number(params.scale));
    const irr = Math.max(0.2, Math.min(1, Number(params.irregular)));
    const count = Math.max(8, Math.min(90, Math.round((W * H) / (step * step))));
    const groups = ['chip_a', 'chip_b', 'chip_c', 'chip_d'].map((id) => elements.get(id)!);
    const ds = ['', '', '', ''];
    let used = 0;
    scatter(count, W, H, rng, 6).forEach(([cx, cy], i) => {
      const gi = i % 4;
      // 大小悬殊：少量大片 + 大量小片，是水磨石的灵魂
      const roll = rng();
      const r = step * 0.28 * scale * (roll < 0.2 ? 1 + rng() * 0.6 : 0.3 + rng() * 0.5);
      const pts = blobPoints(r, 5, irr, rng, 0.6 + rng() * 0.4);
      if (!groups[gi].visible || used > BYTE_CAP) return;
      for (const [x, y] of wrapCenters(cx, cy, r * 2, W, H)) { const d = blobD(pts, x, y); ds[gi] += d; used += d.length; }
    });
    // 细碎点：零长度圆头线段画点，最省体积
    if (params.specks !== false) {
      const nSpeck = Math.min(120, count * 2);
      for (let i = 0; i < nSpeck; i++) {
        const gi = i % 4;
        const x = rng() * W;
        const y = rng() * H;
        if (groups[gi].visible) ds[gi + 4] = (ds[gi + 4] ?? '') + `M${Math.round(x)} ${Math.round(y)}h0`;
      }
    }
    const bg = elements.get('bg')!;
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const sw = Math.max(2, step * 0.035);
    groups.forEach((e, gi) => {
      if (!e.visible) return;
      if (ds[gi]) parts.push(path(ds[gi], { fill: e.paintValue, 'fill-opacity': e.opacity }));
      if (ds[gi + 4]) parts.push(path(ds[gi + 4], { fill: 'none', stroke: e.paintValue, 'stroke-opacity': e.opacity, 'stroke-width': sw, 'stroke-linecap': 'round' }));
    });
    return { body: parts.join('') };
  },
};

export default def;
