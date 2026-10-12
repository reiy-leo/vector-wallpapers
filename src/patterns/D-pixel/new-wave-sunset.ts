/**
 * 新浪潮落日 —— D 像素 / 复古游戏。
 *
 * 构图要点：条纹化的大圆（落日）+ 横向色带（云层/水面）+ 地平线 + 前景剪影。
 * 落日的「条纹」用 clipPath 裁切一组横条实现 —— 这是本 pattern 的视觉签名。
 *
 * ⚠️ clipPath 由 api.clip 注册，id 需按 seed 派生以保证同 seed 同结果。
 */
import { circle, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'new-wave-sunset',
  name: '新浪潮落日',
  category: 'D-pixel',
  description: '条纹落日、横向色带、地平线与前景剪影，80 年代新浪潮海报风。',
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
          { offset: 0, color: '#2b1055' },
          { offset: 0.45, color: '#c026d3' },
          { offset: 0.75, color: '#fb7185' },
          { offset: 1, color: '#fbbf24' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'sun', label: '太阳条纹', role: 'accent', paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fde047' }, { offset: 1, color: '#fb923c' }] }, opacity: 1, visible: true, configurable: true },
    { id: 'horizon', label: '地平线', role: 'secondary', paint: { type: 'solid', color: '#4c1d95' }, opacity: 1, visible: true, configurable: true },
    { id: 'silhouette', label: '剪影', role: 'primary', paint: { type: 'solid', color: '#1e0b3a' }, opacity: 1, visible: true, configurable: true },
    { id: 'glare', label: '辉光', role: 'detail', paint: { type: 'solid', color: '#fda4af' }, opacity: 0.5, visible: true, configurable: true },
  ],

  controls: [
    { key: 'sunY', label: '太阳位置', type: 'range', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    { key: 'sunR', label: '太阳半径', type: 'range', min: 0.08, max: 0.4, step: 0.01, default: 0.2 },
    { key: 'stripes', label: '条纹数', type: 'range', min: 3, max: 24, step: 1, default: 9, heavy: true },
    { key: 'horizonH', label: '地平线高度', type: 'range', min: 0.3, max: 0.9, step: 0.01, default: 0.68 },
  ],

  presets: [
    {
      id: 'vaporwave',
      label: '蒸汽波',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1e1b4b' }, { offset: 0.4, color: '#a21caf' }, { offset: 0.72, color: '#fb7185' }, { offset: 1, color: '#fcd34d' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fef08a' }, { offset: 1, color: '#fb7185' }] } },
        horizon: { paint: { type: 'solid', color: '#4c1d95' } },
        silhouette: { paint: { type: 'solid', color: '#2e1065' } },
        glare: { paint: { type: 'solid', color: '#f0abfc' } },
      },
    },
    {
      id: 'desert',
      label: '沙漠',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#0c2461' }, { offset: 0.5, color: '#f97316' }, { offset: 1, color: '#fde047' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fff7ed' }, { offset: 1, color: '#ea580c' }] } },
        horizon: { paint: { type: 'solid', color: '#7c2d12' } },
        silhouette: { paint: { type: 'solid', color: '#431407' } },
        glare: { paint: { type: 'solid', color: '#fed7aa' } },
      },
    },
    {
      id: 'mono',
      label: '灰调',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#171717' }, { offset: 1, color: '#d4d4d4' }] } },
        sun: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fafafa' }, { offset: 1, color: '#a3a3a3' }] } },
        horizon: { paint: { type: 'solid', color: '#525252' } },
        silhouette: { paint: { type: 'solid', color: '#171717' } },
        glare: { paint: { type: 'solid', color: '#e5e5e5' } },
      },
    },
  ],

  paletteSlots: { bg: ['sky'], accent: ['sun'], secondary: ['horizon'], primary: ['silhouette'], detail: ['glare'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const sunY = Number(params.sunY);
    const sunR = Number(params.sunR);
    const stripeCount = Math.max(3, Math.round(Number(params.stripes)));
    const horizonH = Number(params.horizonH);

    const sky = elements.get('sky')!;
    const sun = elements.get('sun')!;
    const horizon = elements.get('horizon')!;
    const sil = elements.get('silhouette')!;
    const glare = elements.get('glare')!;

    const cx = W * 0.5;
    const cy = H * sunY;
    const r = Math.min(W, H) * sunR;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // 辉光：落日外围的大范围柔光
    if (glare.visible) {
      parts.push(circle(cx, cy, r * 1.8, { fill: glare.paintValue, 'fill-opacity': glare.opacity * 0.35 }));
    }

    // 落日条纹：把一组横条裁进圆形 clipPath 里。
    // 关键点：横条之间的空隙是**真透明**的，会直接透出下方的天空渐变——
    // 因此不需要「用背景色擦除」这种脆弱技巧。
    if (sun.visible) {
      const bars: string[] = [];
      for (let i = 0; i < stripeCount; i++) {
        const t = i / stripeCount;
        // 条纹自下而上逐渐变宽：经典海报的视觉节奏
        const gap = r * (0.015 + t * 0.075);
        const barH = (r * 2) / stripeCount - gap;
        if (barH <= 0) continue;
        const y = cy - r + (r * 2 * i) / stripeCount;
        bars.push(rect(cx - r * 1.05, y, r * 2.1, barH, { fill: sun.paintValue, 'fill-opacity': sun.opacity }));
      }
      // clip id 随半径/位置派生：改参数时不会误复用旧裁剪区
      const clipRef = api.clip(`nws-${api.n(r)}-${api.n(cy)}`, circle(cx, cy, r));
      parts.push(`<g clip-path="${clipRef}">${bars.join('')}</g>`);
    }

    // 地平线 + 前景剪影
    if (horizon.visible) {
      parts.push(rect(0, H * horizonH, W, H * (1 - horizonH), { fill: horizon.paintValue, 'fill-opacity': horizon.opacity }));
    }

    if (sil.visible) {
      // 剪影：起伏山脊 + 底部实心，两笔完成
      const baseY = H * horizonH;
      const segs = 16;
      let d = `M0 ${api.n(H)} L0 ${api.n(baseY)}`;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const y = baseY - H * (0.02 + rng() * 0.06) * (1 - Math.abs(t - 0.5) * 0.8);
        d += ` L${api.n(t * W)} ${api.n(y)}`;
      }
      d += ` L${api.n(W)} ${api.n(H)} Z`;
      parts.push(path(d, { fill: sil.paintValue, 'fill-opacity': sil.opacity }));
    }

    return { body: parts.join('') };
  },
};

export default def;