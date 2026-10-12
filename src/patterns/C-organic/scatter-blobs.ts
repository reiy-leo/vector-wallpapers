/**
 * 随机色块 —— C 有机形态。
 *
 * 整幅画布 best-candidate 散布大小不一的不规则平涂色块（闭合贝塞尔，每块形状都不同），
 * 三组色固定映射（i % 3），任意 seed 都必然三色齐全。压边色块在对边复制 → 可无缝平铺。
 * 每组色合成一条 path，节点数恒定，体积随色块数线性、有上限。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';
import { blobD, blobPoints, scatter, wrapCenters } from './_blob';

/** path 数据体积上限：留出外壳与属性的余量，保证任意尺寸/参数都不击穿 20KB。 */
const BYTE_CAP = 17000;

const def: PatternDef = {
  id: 'scatter-blobs',
  name: '随机色块',
  category: 'C-organic',
  description: '大小不一的不规则色块随意散落，每块形状都不同，平涂、轻松，四边可无缝平铺。',
  seedable: true,
  animatable: false,
  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f4efe6' }, opacity: 1, visible: true, configurable: true },
    { id: 'blob_a', label: '色块 · A', role: 'primary', paint: { type: 'solid', color: '#2f3a4a' }, opacity: 1, visible: true, configurable: true },
    { id: 'blob_b', label: '色块 · B', role: 'secondary', paint: { type: 'solid', color: '#d9825b' }, opacity: 1, visible: true, configurable: true },
    { id: 'blob_c', label: '色块 · C', role: 'accent', paint: { type: 'solid', color: '#8fb3a0' }, opacity: 1, visible: true, configurable: true },
  ],
  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 200, max: 600, step: 10, default: 300, heavy: true },
    { key: 'scale', label: '色块大小', type: 'range', min: 0.5, max: 1.6, step: 0.05, default: 1 },
    { key: 'irregular', label: '不规则度', type: 'range', min: 0, max: 0.9, step: 0.05, default: 0.5 },
  ],
  presets: [
    {
      id: 'ink',
      label: '墨点',
      elements: {
        bg: { paint: { type: 'solid', color: '#ffffff' } },
        blob_a: { paint: { type: 'solid', color: '#1c2333' } },
        blob_b: { paint: { type: 'solid', color: '#1c2333' } },
        blob_c: { paint: { type: 'solid', color: '#1c2333' } },
      },
    },
    {
      id: 'sorbet',
      label: '雪葩',
      elements: {
        bg: { paint: { type: 'solid', color: '#fff6ee' } },
        blob_a: { paint: { type: 'solid', color: '#f4a6a0' } },
        blob_b: { paint: { type: 'solid', color: '#f7d08a' } },
        blob_c: { paint: { type: 'solid', color: '#9fcbd8' } },
      },
    },
    {
      id: 'night',
      label: '夜色',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2230' } },
        blob_a: { paint: { type: 'solid', color: '#3a4560' } },
        blob_b: { paint: { type: 'solid', color: '#c9805e' } },
        blob_c: { paint: { type: 'solid', color: '#7fa894' } },
      },
    },
  ],
  paletteSlots: { bg: ['bg'], primary: ['blob_a'], secondary: ['blob_b'], accent: ['blob_c'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const step = Math.max(200, Number(params.size)) * unitPx;
    const scale = Math.max(0.1, Number(params.scale));
    const irr = Math.max(0, Math.min(0.9, Number(params.irregular)));
    const count = Math.max(6, Math.min(70, Math.round((W * H) / (step * step))));
    const groups = [elements.get('blob_a')!, elements.get('blob_b')!, elements.get('blob_c')!];
    const ds: string[] = ['', '', ''];
    let used = 0;
    scatter(count, W, H, rng).forEach(([cx, cy], i) => {
      const gi = i % 3;
      // 大小起伏明显：约三成大块，其余中小块
      const r = step * 0.3 * scale * (rng() < 0.3 ? 1 + rng() * 0.5 : 0.4 + rng() * 0.45);
      const pts = blobPoints(r, 6 + Math.floor(rng() * 3), irr, rng, 0.75 + rng() * 0.25);
      if (!groups[gi].visible || used > BYTE_CAP) return;
      for (const [x, y] of wrapCenters(cx, cy, r * 1.5, W, H)) { const d = blobD(pts, x, y); ds[gi] += d; used += d.length; }
    });
    const bg = elements.get('bg')!;
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    groups.forEach((e, gi) => {
      if (e.visible && ds[gi]) parts.push(path(ds[gi], { fill: e.paintValue, 'fill-opacity': e.opacity }));
    });
    return { body: g({}, parts.join('')) };
  },
};

export default def;
