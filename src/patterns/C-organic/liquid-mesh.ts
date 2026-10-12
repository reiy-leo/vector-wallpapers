/**
 * 流体渐变 —— C 渐变流体 / 有机形态。
 *
 * 构图要点：底色之上叠放多个大尺寸径向渐变团，团与团以低不透明度混合，
 * 形成类似「mesh gradient」的柔和流体观感。团的位置/大小由 seeded rng 决定。
 *
 * ⭐ 必须 tile：细密的柔光颗粒层若逐点绘制，密度 60 时会有上万个节点。
 * 颗粒层本身就是一个 <pattern>，密度只改变单元内点数，不改变 DOM 结构。
 */
import { circle, g, n, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** Catmull-Rom → 三次贝塞尔，得到闭合的有机团块轮廓。 */
function blobPath(cx: number, cy: number, r: number, wobble: number, rng: () => number): string {
  const pts = 8;
  const coords: Array<[number, number]> = [];
  for (let i = 0; i < pts; i++) {
    const ang = (Math.PI * 2 * i) / pts;
    // 每个顶点独立扰动半径 → 不规则但闭合平滑
    const rr = r * (1 - wobble / 2 + rng() * wobble);
    coords.push([cx + rr * Math.cos(ang), cy + rr * Math.sin(ang)]);
  }

  let d = `M${n(coords[0][0])} ${n(coords[0][1])}`;
  for (let i = 0; i < pts; i++) {
    const p0 = coords[(i - 1 + pts) % pts];
    const p1 = coords[i];
    const p2 = coords[(i + 1) % pts];
    const p3 = coords[(i + 2) % pts];
    // 控制点沿「下一顶点 - 上一顶点」的 1/6 处取，得到平滑闭合曲线
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return `${d} Z`;
}

const def: PatternDef = {
  id: 'liquid-mesh',
  name: '流体渐变',
  category: 'C-organic',
  description: '多个径向渐变团以低不透明度叠加，柔和的 mesh gradient 流体观感。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#1e1b4b' }, { offset: 1, color: '#0f172a' }] }, opacity: 1, visible: true, configurable: true },
    { id: 'blob_a', label: '渐变团 A', role: 'primary', paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#f472b6' }, { offset: 1, color: '#7c3aed' }] }, opacity: 0.75, visible: true, configurable: true },
    { id: 'blob_b', label: '渐变团 B', role: 'secondary', paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#22d3ee' }, { offset: 1, color: '#0ea5e9' }] }, opacity: 0.7, visible: true, configurable: true },
    { id: 'blob_c', label: '渐变团 C', role: 'accent', paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fde047' }, { offset: 1, color: '#f97316' }] }, opacity: 0.6, visible: true, configurable: true },
  ],

  controls: [
    { key: 'blobs', label: '团数', type: 'range', min: 2, max: 8, step: 1, default: 4, heavy: true },
    { key: 'warp', label: '形变幅度', type: 'range', min: 0, max: 0.8, step: 0.01, default: 0.32 },
    { key: 'size', label: '团尺寸', type: 'range', min: 0.2, max: 0.9, step: 0.01, default: 0.52 },
    { key: 'grain', label: '颗粒密度', type: 'range', min: 0, max: 40, step: 1, default: 14 },
    { key: 'drift', label: '漂移动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'aurora',
      label: '极光',
      elements: {
        bg: { paint: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#042f2e' }, { offset: 1, color: '#0b1120' }] } },
        blob_a: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#5eead4' }, { offset: 1, color: '#0d9488' }] } },
        blob_b: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#a78bfa' }, { offset: 1, color: '#6d28d9' }] } },
        blob_c: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#f0abfc' }, { offset: 1, color: '#c026d3' }] } },
      },
    },
    {
      id: 'sunset',
      label: '落日',
      elements: {
        bg: { paint: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#3f0d12' }, { offset: 1, color: '#0c0a09' }] } },
        blob_a: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fb923c' }, { offset: 1, color: '#dc2626' }] } },
        blob_b: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#facc15' }, { offset: 1, color: '#ea580c' }] } },
        blob_c: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fda4af' }, { offset: 1, color: '#9f1239' }] } },
      },
    },
    {
      id: 'ocean',
      label: '深海',
      elements: {
        bg: { paint: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#082f49' }, { offset: 1, color: '#020617' }] } },
        blob_a: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#38bdf8' }, { offset: 1, color: '#0369a1' }] } },
        blob_b: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#2dd4bf' }, { offset: 1, color: '#0f766e' }] } },
        blob_c: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#818cf8' }, { offset: 1, color: '#3730a3' }] } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['blob_a'], secondary: ['blob_b'], accent: ['blob_c'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const blobCount = Math.max(1, Math.min(8, Math.round(Number(params.blobs))));
    const warp = Number(params.warp);
    const size = Number(params.size);
    const grain = Math.round(Number(params.grain));
    const drift = params.drift === true;

    const bg = elements.get('bg')!;
    const pool = [elements.get('blob_a')!, elements.get('blob_b')!, elements.get('blob_c')!];

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    const unit = Math.min(W, H);
    for (let i = 0; i < blobCount; i++) {
      const e = pool[i % pool.length];
      if (!e.visible) continue;
      // 落点铺满整幅（允许出血），尺寸以短边为基准 → 任意比例都不变形
      const cx = rng() * W;
      const cy = rng() * H;
      const r = unit * size * (0.6 + rng() * 0.7);
      parts.push(path(blobPath(cx, cy, r, warp, rng), { fill: e.paintValue, 'fill-opacity': e.opacity }));
    }

    // 颗粒层：<pattern> 平铺。密度只影响单元尺寸，DOM 结构恒定。
    // 三点分别落在单元中心与两处对角 —— 比规则点阵更自然，且仍严格可平铺。
    if (grain > 0) {
      const gs = unit / Math.max(6, grain);
      const r1 = Math.max(0.25, gs * 0.055);
      const r2 = Math.max(0.25, gs * 0.04);
      const tileRef = api.tile({
        key: `lm-grain-${n(gs)}`,
        w: gs,
        h: gs,
        content: g(
          { fill: bg.paintValue },
          [
            circle(gs / 2, gs / 2, r1, {}),
            circle(0, 0, r2, {}),
            circle(gs, gs, r2, {}),
          ].join(''),
        ),
      });
      parts.push(rect(0, 0, W, H, { fill: tileRef, 'fill-opacity': 0.06 }));
    }

    const body = parts.join('');
    if (!animate || !drift) return { body };

    // 漂移：整层极缓慢平移，导出时被 stripAnimation 剥离 → 产物仍字节级可复现
    const name = api.keyframes(
      'vw-liquid',
      `from{transform:translate(0,0)}to{transform:translate(${api.n(W * 0.03)}px,${api.n(-H * 0.02)}px)}`,
    );
    return { body: g({ style: `animation:${name} 26s ease-in-out infinite alternate` }, body) };
  },
};

export default def;