/**
 * 新浪潮落日 —— D 像素 / 复古游戏。
 *
 * 2026-10-12 视觉重做（Rei 反馈「看上去让人不舒服」）：
 * 旧版是「品红/紫高饱和撞色天空 + 9 道硬条纹太阳 + 折线剪影」，刺眼。
 *
 * 新版保留 synthwave 母题（条纹落日 + 地平线 + 透视网格地面 + 远山），
 * 但整体安静耐看：
 *   - 天空只铺到地平线，渐变落在「暗靛 → 灰紫 → 暖桃」相邻色上，不再撞色；
 *   - 太阳只在下半部切 3~5 道细缝，缝宽自上而下渐宽，柔和不晃眼；
 *   - 太阳外围用径向羽化光晕（stop-opacity → 0）而非实心大圆；
 *   - 远山两层：远层半透明融进天空、近层压实，轮廓用平滑贝塞尔；
 *   - 地面透视网格线条稀疏、低不透明度，地平线处再压一道柔和的反光。
 *
 * 落日的「条纹」用 clipPath 裁切一组横条实现 —— 缝隙是真透明，透出天空渐变。
 */
import { circle, g, path, rect } from '../../engine/svg';
import type { PaintSpec, PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'new-wave-sunset',
  name: '新浪潮落日',
  category: 'D-pixel',
  description: '条纹落日沉向远山，透视网格地面与柔和地平线，安静的复古新浪潮。',
  seedable: true,
  animatable: false,

  elements: [
    {
      id: 'sky',
      label: '落日渐变',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#1d1c38' },
          { offset: 0.45, color: '#4a3f6b' },
          { offset: 0.78, color: '#a7708a' },
          { offset: 1, color: '#e9a88a' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'sun', label: '太阳条纹', role: 'accent', paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ffe2b8' }, { offset: 1, color: '#ef9a86' }] }, opacity: 1, visible: true, configurable: true },
    { id: 'horizon', label: '地面', role: 'secondary', paint: { type: 'solid', color: '#211d3a' }, opacity: 1, visible: true, configurable: true },
    { id: 'silhouette', label: '远山', role: 'primary', paint: { type: 'solid', color: '#352c55' }, opacity: 1, visible: true, configurable: true },
    { id: 'glare', label: '辉光', role: 'detail', paint: { type: 'solid', color: '#f4b394' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'grid', label: '透视网格', role: 'detail', paint: { type: 'solid', color: '#e59a8f' }, opacity: 0.3, visible: true, configurable: true },
  ],

  controls: [
    { key: 'sunY', label: '太阳位置', type: 'range', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    { key: 'sunR', label: '太阳半径', type: 'range', min: 0.08, max: 0.4, step: 0.01, default: 0.22 },
    { key: 'stripes', label: '条纹数', type: 'range', min: 3, max: 24, step: 1, default: 5, heavy: true },
    { key: 'horizonH', label: '地平线高度', type: 'range', min: 0.3, max: 0.9, step: 0.01, default: 0.66 },
    { key: 'gridLines', label: '网格密度', type: 'range', min: 4, max: 20, step: 1, default: 9 },
  ],

  presets: [
    {
      id: 'vaporwave',
      label: '暮色',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1d1c38' }, { offset: 0.45, color: '#4a3f6b' }, { offset: 0.78, color: '#a7708a' }, { offset: 1, color: '#e9a88a' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#ffe2b8' }, { offset: 1, color: '#ef9a86' }] } },
        horizon: { paint: { type: 'solid', color: '#211d3a' } },
        silhouette: { paint: { type: 'solid', color: '#352c55' } },
        glare: { paint: { type: 'solid', color: '#f4b394' } },
        grid: { paint: { type: 'solid', color: '#e59a8f' } },
      },
    },
    {
      id: 'night',
      label: '深夜',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#090b17' }, { offset: 0.5, color: '#161834' }, { offset: 0.82, color: '#2e2a4f' }, { offset: 1, color: '#4f3d5e' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#e6cfd6' }, { offset: 1, color: '#a07892' }] } },
        horizon: { paint: { type: 'solid', color: '#0b0c19' } },
        silhouette: { paint: { type: 'solid', color: '#191a33' } },
        glare: { paint: { type: 'solid', color: '#8d7397' } },
        grid: { paint: { type: 'solid', color: '#7c6a9e' } },
      },
      params: { sunY: 0.54 },
    },
    {
      id: 'pastel',
      label: '粉彩',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#c7d3ec' }, { offset: 0.5, color: '#dccfe6' }, { offset: 0.82, color: '#f2d4d6' }, { offset: 1, color: '#fbdcc4' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fff4dc' }, { offset: 1, color: '#f5b8a6' }] } },
        horizon: { paint: { type: 'solid', color: '#ddd2e8' } },
        silhouette: { paint: { type: 'solid', color: '#b8b1d6' } },
        glare: { paint: { type: 'solid', color: '#fff0e2' } },
        grid: { paint: { type: 'solid', color: '#a99cc8' } },
      },
    },
    {
      id: 'desert',
      label: '沙漠',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1f2a44' }, { offset: 0.5, color: '#5d5a6e' }, { offset: 0.82, color: '#c08a6a' }, { offset: 1, color: '#efc08e' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fff1d6' }, { offset: 1, color: '#e7a36f' }] } },
        horizon: { paint: { type: 'solid', color: '#3a2a26' } },
        silhouette: { paint: { type: 'solid', color: '#5a3f3a' } },
        glare: { paint: { type: 'solid', color: '#f3c99a' } },
        grid: { paint: { type: 'solid', color: '#d79a6e' } },
      },
    },
    {
      id: 'mono',
      label: '灰调',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1c1d21' }, { offset: 0.6, color: '#4a4b52' }, { offset: 1, color: '#a9a8ab' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#f2f1ee' }, { offset: 1, color: '#bdbbb7' }] } },
        horizon: { paint: { type: 'solid', color: '#202125' } },
        silhouette: { paint: { type: 'solid', color: '#33343a' } },
        glare: { paint: { type: 'solid', color: '#d8d6d2' } },
        grid: { paint: { type: 'solid', color: '#8d8c90' } },
      },
    },
  ],

  paletteSlots: { bg: ['sky'], accent: ['sun'], secondary: ['horizon'], primary: ['silhouette'], detail: ['glare', 'grid'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const sunY = Number(params.sunY);
    const sunR = Number(params.sunR);
    const stripeCount = Math.max(3, Math.round(Number(params.stripes)));
    const horizonH = Number(params.horizonH);
    const gridLines = Math.max(2, Math.round(Number(params.gridLines)));
    const S = Math.min(W, H);
    const unit = Math.max(0.5, Math.min(4, S / 1080));

    const sky = elements.get('sky')!;
    const sun = elements.get('sun')!;
    const horizon = elements.get('horizon')!;
    const sil = elements.get('silhouette')!;
    const glare = elements.get('glare')!;
    const grid = elements.get('grid')!;

    const hy = H * horizonH; // 地平线
    const cx = W * 0.5;
    const r = S * sunR;
    // 太阳中心：sunY 是相对「天空高度」的位置，保证太阳始终落在天空里、贴近地平线
    const cy = hy * (0.35 + sunY * 0.75);

    // 天空只铺到地平线：渐变色标完整落在可见天空里
    const parts: string[] = [rect(0, 0, W, hy + 1, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // 辉光：径向羽化光晕（中心 → 透明），不留硬边
    const gc = colorOf(glare.paint);
    if (glare.visible) {
      const halo = api.radial({
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        key: 'nws-halo',
        stops: [
          { offset: 0, color: gc, opacity: 0.9 },
          { offset: 0.35, color: gc, opacity: 0.45 },
          { offset: 1, color: gc, opacity: 0 },
        ],
      });
      parts.push(circle(cx, cy, r * 2.6, { fill: halo, 'fill-opacity': glare.opacity }));
    }

    // 落日条纹：只在下半部切缝，缝宽自上而下渐宽（经典但克制）
    if (sun.visible) {
      const bars: string[] = [];
      const top = cy - r;
      const solidH = r * 1.0; // 上半部完整
      bars.push(rect(cx - r * 1.05, top, r * 2.1, solidH + r * 0.02, { fill: sun.paintValue }));
      const zone = r * 2 - solidH; // 下半部条纹区
      const pitch = zone / stripeCount;
      for (let i = 0; i < stripeCount; i++) {
        const t = (i + 1) / stripeCount;
        const gap = pitch * (0.12 + t * 0.38);
        const y = top + solidH + i * pitch + gap;
        const h = pitch - gap;
        if (h <= 0) continue;
        bars.push(rect(cx - r * 1.05, y, r * 2.1, h, { fill: sun.paintValue }));
      }
      const clipRef = api.clip(`nws-${api.n(r)}-${api.n(cy)}`, circle(cx, cy, r));
      parts.push(g({ 'clip-path': clipRef, 'fill-opacity': sun.opacity }, bars.join('')));
    }

    // 远山：两层平滑轮廓。远层半透明融进天空，近层压实。
    if (sil.visible) {
      const ranges: Array<[number, number, number]> = [
        // [峰高比例, 起伏频率, 不透明度系数]
        [0.15, 2.2, 0.5],
        [0.09, 3.4, 1],
      ];
      for (const [peak, freq, op] of ranges) {
        const p1 = rng() * Math.PI * 2;
        const p2 = rng() * Math.PI * 2;
        const pts: Array<[number, number]> = [];
        const N = 14;
        for (let k = 0; k <= N; k++) {
          const u = k / N;
          // 中间留低谷给太阳，两侧山更高：u 离中心越远越高
          const side = 0.45 + Math.min(1, Math.abs(u - 0.5) * 2.2) * 0.75;
          const wave = 0.55 + 0.3 * Math.sin(u * Math.PI * 2 * freq + p1) + 0.15 * Math.sin(u * Math.PI * 2 * freq * 2.3 + p2);
          pts.push([u * W, hy - H * peak * side * Math.max(0.08, wave)]);
        }
        const d = `${smooth(pts, api)} L${api.n(W)} ${api.n(hy + 2)} L0 ${api.n(hy + 2)} Z`;
        parts.push(path(d, { fill: sil.paintValue, 'fill-opacity': sil.opacity * op }));
      }
    }

    // 地面
    if (horizon.visible) {
      parts.push(rect(0, hy, W, H - hy, { fill: horizon.paintValue, 'fill-opacity': horizon.opacity }));
    }

    // 透视网格：纵线汇聚于地平线中心，横线越近越疏；整体低不透明度
    if (grid.visible) {
      const gh = H - hy;
      let d = '';
      const half = Math.ceil(gridLines * 1.6);
      for (let k = -half; k <= half; k++) {
        const xb = cx + (k / gridLines) * W * 0.9; // 底边落点
        d += `M${api.n(cx + (xb - cx) * 0.06)} ${api.n(hy)}L${api.n(xb)} ${api.n(H)}`;
      }
      const rows = Math.max(3, Math.round(gridLines * 0.6));
      for (let j = 1; j <= rows; j++) {
        const t = j / rows;
        const y = hy + gh * t * t;
        d += `M0 ${api.n(y)}H${api.n(W)}`;
      }
      // 网格从地平线往近处渐显：远处线条挤在一起会发灰，用纵向渐变压掉
      const fadeGrid = api.linear({
        angle: 90,
        key: 'nws-grid',
        stops: [
          { offset: 0, color: colorOf(grid.paint), opacity: 0 },
          { offset: 0.35, color: colorOf(grid.paint), opacity: 0.6 },
          { offset: 1, color: colorOf(grid.paint), opacity: 1 },
        ],
      });
      parts.push(
        path(d, {
          fill: 'none',
          stroke: fadeGrid,
          'stroke-width': 1.4 * unit,
          'stroke-opacity': grid.opacity,
        }),
      );
    }

    // 地平线反光：贴着地平线的一道柔光，把天空与地面缝合起来
    if (glare.visible) {
      const sheen = api.linear({
        angle: 90,
        key: 'nws-sheen',
        stops: [
          { offset: 0, color: gc, opacity: 0.5 },
          { offset: 1, color: gc, opacity: 0 },
        ],
      });
      parts.push(rect(0, hy, W, (H - hy) * 0.28, { fill: sheen, 'fill-opacity': glare.opacity }));
    }

    // D-pixel 类根节点默认 shape-rendering=crispEdges（像素风），
    // 但本母题全是圆与平滑曲线，关掉抗锯齿会出现阶梯边 → 在内容组上覆盖回几何精度。
    return { body: g({ 'shape-rendering': 'geometricPrecision' }, parts.join('')) };
  },
};

/** 过点序列 → 平滑三次贝塞尔（Catmull-Rom）。 */
function smooth(pts: Array<[number, number]>, api: RenderApi): string {
  const n = api.n;
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${n(p1[0] + (p2[0] - p0[0]) / 6)} ${n(p1[1] + (p2[1] - p0[1]) / 6)} ${n(p2[0] - (p3[0] - p1[0]) / 6)} ${n(p2[1] - (p3[1] - p1[1]) / 6)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** 取 PaintSpec 的代表色（实色直取；渐变取首色标）。 */
function colorOf(paint: PaintSpec): string {
  if (paint.type === 'solid') return paint.color;
  if (paint.type === 'none' || paint.stops.length === 0) return '#000000';
  return paint.stops[0].color;
}

export default def;
