/**
 * 山峦日落 —— C 渐变流体 / 有机形态。
 *
 * 构图要点：天空线性渐变打底 + 径向渐变太阳 + N 层山脊剪影。
 * 山脊线用「多频正弦叠加 + seeded rng 相位」生成，同 seed 稳定、换 seed 换山形。
 *
 * ⚠️ 本pattern 是 20KB 红线的主要风险点（6 元件 / 多段渐变），
 * 因此：山脊层数受控件上限约束（≤6），渐变由 DefsRegistry 按内容去重，
 * 路径点数固定 48 —— 三者共同保证体积与层数线性且可控。
 */
import { circle, n, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 山脊采样点数：固定值，与尺寸、层数无关 → 体积可预测。 */
const RIDGE_POINTS = 48;

/**
 * 生成一条山脊路径。
 * 用 3 个不同频率的正弦叠加模拟自然山体：低频定走势、中频造峰、高频加噪。
 */
function ridgePath(
  w: number,
  baseY: number,
  height: number,
  rng: () => number,
  roughness: number,
): string {
  const f1 = 0.7 + rng() * 0.8;
  const f2 = 1.8 + rng() * 1.6;
  const f3 = 4.2 + rng() * 3;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const steep = 0.35 + roughness * 0.9;

  const yAt = (t: number): number => {
    const a = Math.sin(t * Math.PI * 2 * f1 + p1);
    const b = Math.sin(t * Math.PI * 2 * f2 + p2) * 0.42;
    const c = Math.sin(t * Math.PI * 2 * f3 + p3) * 0.16 * roughness;
    return baseY - height * (0.55 + steep * 0.45) * (a * 0.5 + b + c);
  };

  let d = `M0 ${n(yAt(0))}`;
  for (let i = 1; i <= RIDGE_POINTS; i++) {
    const t = i / RIDGE_POINTS;
    d += ` L${n(t * w)} ${n(yAt(t))}`;
  }
  return `${d} L${n(w)} ${n(baseY + height * 3)} L0 ${n(baseY + height * 3)} Z`;
}

const def: PatternDef = {
  id: 'dusk-ridges',
  name: '山峦日落',
  category: 'E-scene',
  description: '渐变天空、径向光晕太阳与多层山脊剪影，构图的经典壁纸母题。',
  seedable: true,
  animatable: false,

  elements: [
    {
      id: 'sky',
      label: '天空',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#1e1b4b' },
          { offset: 0.45, color: '#be185d' },
          { offset: 1, color: '#fb923c' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'sun', label: '太阳', role: 'accent', paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fff7ae' }, { offset: 0.55, color: '#fbbf24' }, { offset: 1, color: '#f97316' }] }, opacity: 1, visible: true, configurable: true },
    { id: 'ridge_far', label: '山峦 · 远', role: 'secondary', paint: { type: 'solid', color: '#7c2d5e' }, opacity: 1, visible: true, configurable: true },
    { id: 'ridge_mid', label: '山峦 · 中', role: 'secondary', paint: { type: 'solid', color: '#4c1d74' }, opacity: 1, visible: true, configurable: true },
    { id: 'ridge_near', label: '山峦 · 近', role: 'primary', paint: { type: 'solid', color: '#241142' }, opacity: 1, visible: true, configurable: true },
    { id: 'fore', label: '前景', role: 'detail', paint: { type: 'solid', color: '#0d0620' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'layers', label: '层数', type: 'range', min: 2, max: 6, step: 1, default: 4, heavy: true },
    { key: 'ridgeH', label: '山高', type: 'range', min: 0.08, max: 0.55, step: 0.01, default: 0.24 },
    { key: 'sunSize', label: '太阳大小', type: 'range', min: 0.04, max: 0.3, step: 0.01, default: 0.12 },
    { key: 'sunY', label: '太阳高度', type: 'range', min: 0.15, max: 0.85, step: 0.01, default: 0.52 },
    { key: 'rough', label: '崎岖度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
  ],

  presets: [
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#1e1b4b' },
              { offset: 0.45, color: '#be185d' },
              { offset: 1, color: '#fb923c' },
            ],
          },
        },
        ridge_far: { paint: { type: 'solid', color: '#7c2d5e' } },
        ridge_mid: { paint: { type: 'solid', color: '#4c1d74' } },
        ridge_near: { paint: { type: 'solid', color: '#241142' } },
        fore: { paint: { type: 'solid', color: '#0d0620' } },
      },
    },
    {
      id: 'arctic',
      label: '极地',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#0c4a6e' },
              { offset: 0.5, color: '#7dd3fc' },
              { offset: 1, color: '#fef3c7' },
            ],
          },
        },
        sun: { paint: { type: 'solid', color: '#fffbeb' } },
        ridge_far: { paint: { type: 'solid', color: '#a5c4d4' } },
        ridge_mid: { paint: { type: 'solid', color: '#6b8fa3' } },
        ridge_near: { paint: { type: 'solid', color: '#3c5a6b' } },
        fore: { paint: { type: 'solid', color: '#1e3444' } },
      },
    },
    {
      id: 'neon',
      label: '霓虹夜',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#020617' },
              { offset: 0.55, color: '#4c1d95' },
              { offset: 1, color: '#db2777' },
            ],
          },
        },
        sun: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#f0abfc' }, { offset: 0.6, color: '#d946ef' }, { offset: 1, color: '#7c3aed' }] } },
        ridge_far: { paint: { type: 'solid', color: '#4c1d95' } },
        ridge_mid: { paint: { type: 'solid', color: '#2e1065' } },
        ridge_near: { paint: { type: 'solid', color: '#1e1b4b' } },
        fore: { paint: { type: 'solid', color: '#020617' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['sky'],
    accent: ['sun'],
    secondary: ['ridge_far', 'ridge_mid'],
    primary: ['ridge_near'],
    detail: ['fore'],
  },

  render(_def, cfg: ResolvedConfig, _api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const layerCount = Math.max(1, Math.min(6, Math.round(Number(params.layers))));
    const ridgeH = Number(params.ridgeH);
    const sunSize = Number(params.sunSize);
    const sunY = Number(params.sunY);
    const rough = Number(params.rough);

    const sky = elements.get('sky')!;
    const sun = elements.get('sun')!;
    const fore = elements.get('fore')!;

    // 山脊自远及近：越近基线越低、越高。数量不足时优先保留近景（构图更稳）。
    const RIDGE_IDS = ['ridge_far', 'ridge_mid', 'ridge_near'] as const;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // 太阳：本体 + 外圈柔光。
    // 柔光用一个同心大圆、低不透明度叠出，避免引入 <filter> ——
    // filter 在 canvas 光栅化时是 Safari 的重灾区，且会显著拖慢导出。
    if (sun.visible) {
      const r = Math.min(W, H) * sunSize;
      const cx = W * 0.5;
      const cy = H * sunY;
      parts.push(circle(cx, cy, r * 2.4, { fill: sun.paintValue, 'fill-opacity': sun.opacity * 0.18 }));
      parts.push(circle(cx, cy, r, { fill: sun.paintValue, 'fill-opacity': sun.opacity }));
    }

    // 山脊层：数量不足时优先保留近景（构图更稳）
    // 同pixel-terrain：切片起点必须用「实际保留层数」，
    // 写成 `length - (layerCount - 1)` 会 off-by-one，在 layers=2 时少画一层。
    const keep = Math.min(layerCount - 1, RIDGE_IDS.length);
  const chosen = RIDGE_IDS.slice(RIDGE_IDS.length - keep);
    for (let i = 0; i < chosen.length; i++) {
      const e = elements.get(chosen[i])!;
      if (!e.visible) continue;
      const t = (i + 1) / (chosen.length + 1);
      const baseY = H * (0.52 + t * 0.3);
      const height = H * ridgeH * (0.6 + t * 0.9);
      parts.push(
        path(ridgePath(W, baseY, height, rng, rough), {
          fill: e.paintValue,
          'fill-opacity': e.opacity,
        }),
      );
    }

    // 前景：底部暗带，压住画面下缘
    if (fore.visible) {
      const fh = H * 0.08;
      parts.push(rect(0, H - fh, W, fh, { fill: fore.paintValue, 'fill-opacity': fore.opacity }));
    }

    return { body: parts.join('') };
  },
};

export default def;