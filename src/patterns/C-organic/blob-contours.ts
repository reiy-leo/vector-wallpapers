/**
 * 轮廓色块 —— C 有机形态。
 *
 * 少量大块不规则色块，每块内部再描两圈同形缩小的轮廓线（同一组贝塞尔点按比例缩放），
 * 像等高线 / 年轮。色块平涂 + 线条单色，压边复制 → 可无缝平铺。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';
import { blobD, blobPoints, scatter, wrapCenters } from './_blob';

/** path 数据体积上限：保证任意尺寸/参数都不击穿 20KB。 */
const BYTE_CAP = 16500;

const def: PatternDef = {
  id: 'blob-contours',
  name: '轮廓色块',
  category: 'C-organic',
  description: '三色不规则色块里描着同形缩小的轮廓线，像等高线或年轮，块块形状不同。',
  seedable: true,
  animatable: false,
  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1f2a38' }, opacity: 1, visible: true, configurable: true },
    { id: 'fill_a', label: '色块 · A', role: 'primary', paint: { type: 'solid', color: '#35506a' }, opacity: 1, visible: true, configurable: true },
    { id: 'fill_b', label: '色块 · B', role: 'secondary', paint: { type: 'solid', color: '#5e4560' }, opacity: 1, visible: true, configurable: true },
    { id: 'fill_c', label: '色块 · C', role: 'accent', paint: { type: 'solid', color: '#3d5f55' }, opacity: 1, visible: true, configurable: true },
    { id: 'line', label: '轮廓线', role: 'detail', paint: { type: 'solid', color: '#e6c07b' }, opacity: 0.9, visible: true, configurable: true },
  ],
  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 260, max: 700, step: 10, default: 380, heavy: true },
    { key: 'scale', label: '色块大小', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: 'irregular', label: '不规则度', type: 'range', min: 0, max: 0.8, step: 0.05, default: 0.45 },
    { key: 'rings', label: '轮廓圈数', type: 'range', min: 1, max: 3, step: 1, default: 2 },
  ],
  presets: [
    {
      id: 'paper',
      label: '纸本',
      elements: {
        bg: { paint: { type: 'solid', color: '#f5f0e6' } },
        fill_a: { paint: { type: 'solid', color: '#e8cdb8' } },
        fill_b: { paint: { type: 'solid', color: '#d5dcc4' } },
        fill_c: { paint: { type: 'solid', color: '#cfd8e2' } },
        line: { paint: { type: 'solid', color: '#8a4a33' } },
      },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#eef5f1' } },
        fill_a: { paint: { type: 'solid', color: '#bfe0d1' } },
        fill_b: { paint: { type: 'solid', color: '#f3d6c8' } },
        fill_c: { paint: { type: 'solid', color: '#f1e3b5' } },
        line: { paint: { type: 'solid', color: '#2f6b57' } },
      },
    },
  ],
  paletteSlots: { bg: ['bg'], primary: ['fill_a'], secondary: ['fill_b'], accent: ['fill_c'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const step = Math.max(260, Number(params.size)) * unitPx;
    const scale = Math.max(0.1, Number(params.scale));
    const irr = Math.max(0, Math.min(0.8, Number(params.irregular)));
    const rings = Math.max(1, Math.min(3, Math.round(Number(params.rings))));
    const count = Math.max(5, Math.min(26, Math.round((W * H) / (step * step))));
    const fills = ['fill_a', 'fill_b', 'fill_c'].map((id) => elements.get(id)!);
    const lineE = elements.get('line')!;
    const fds = ['', '', ''];
    let ld = '';
    scatter(count, W, H, rng).forEach(([cx, cy], i) => {
      // 色组固定轮转（i % 3）：任意 seed 三色都必然出现
      const gi = i % 3;
      const r = step * 0.36 * scale * (0.55 + rng() * 0.6);
      const pts = blobPoints(r, 7, irr, rng, 0.75 + rng() * 0.25);
      for (const [x, y] of wrapCenters(cx, cy, r * 1.4, W, H)) {
        if (fds.join('').length + ld.length > BYTE_CAP) return;
        if (fills[gi].visible) fds[gi] += blobD(pts, x, y);
        for (let k = 1; k <= rings; k++) ld += blobD(pts, x, y, 1 - k / (rings + 1));
      }
    });
    const bg = elements.get('bg')!;
    const sw = Math.max(1.5, 3 * unitPx);
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    fills.forEach((e, gi) => {
      if (e.visible && fds[gi]) parts.push(path(fds[gi], { fill: e.paintValue, 'fill-opacity': e.opacity }));
    });
    if (lineE.visible && ld) parts.push(path(ld, { fill: 'none', stroke: lineE.paintValue, 'stroke-opacity': lineE.opacity, 'stroke-width': sw, 'stroke-linejoin': 'round' }));
    return { body: parts.join('') };
  },
};

export default def;
