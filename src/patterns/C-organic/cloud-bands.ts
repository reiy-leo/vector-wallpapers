/**
 * 云层带 —— C 渐变流体 / 有机形态。
 *
 * 构图要点：天顶竖向渐变打底 + 一枚径向光晕 + 三条水平云带。
 * 云带不用 filter 模糊（Safari 光栅化重灾区），而是**多个横向拉伸的
 * 椭圆叠加**、并靠低不透明度叠出软边 —— 体积恒定、无兼容风险。
 *
 * ⭐ 云带的三档高度固定（高/中/低），因此三个云元件在**任何参数下都必然绘制**，
 * 改色命中率恒为 100%。seeded 随机只作用于云团的横向位置与宽度。
 */
import { circle, ellipse, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 每条云带的云团数：固定值 → 体积与尺寸解耦。 */
const PUFFS = 7;

const def: PatternDef = {
  id: 'cloud-bands',
  name: '云层带',
  category: 'C-organic',
  description: '天顶渐变与光晕之上，三条云带横向铺陈，柔和安静。',
  seedable: true,
  animatable: false,

  elements: [
    {
      id: 'sky',
      label: '天顶',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
  { offset: 0, color: '#0c4a6e' },
          { offset: 0.5, color: '#38bdf8' },
    { offset: 1, color: '#fef3c7' },
   ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    {
      id: 'glow',
      label: '光晕',
      role: 'accent',
      paint: {
        type: 'radial',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: '#fffbeb', opacity: 0.95 },
          { offset: 0.55, color: '#fcd34d', opacity: 0.4 },
        { offset: 1, color: '#fbbf24', opacity: 0 },
        ],
      },
      opacity: 0.9,
      visible: true,
      configurable: true,
    },
    { id: 'cloud_hi', label: '云带 · 高', role: 'secondary', paint: { type: 'solid', color: '#f8fafc' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'cloud_mid', label: '云带 · 中', role: 'primary', paint: { type: 'solid', color: '#e2e8f0' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'cloud_low', label: '云带 · 低', role: 'detail', paint: { type: 'solid', color: '#cbd5e1' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    { key: 'bands', label: '云带层数', type: 'range', min: 1, max: 3, step: 1, default: 3, heavy: true },
    { key: 'scale', label: '云团尺度', type: 'range', min: 0.4, max: 2.2, step: 0.05, default: 1 },
    { key: 'spread', label: '云带厚度', type: 'range', min: 0.02, max: 0.22, step: 0.01, default: 0.1 },
    { key: 'glowX', label: '光晕横向', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.62 },
    { key: 'glowY', label: '光晕纵向', type: 'range', min: 0.1, max: 0.8, step: 0.01, default: 0.34 },
  ],

  presets: [
    {
      id: 'daybreak',
      label: '破晓',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
      stops: [
              { offset: 0, color: '#1e3a8a' },
        { offset: 0.45, color: '#f472b6' },
   { offset: 1, color: '#fed7aa' },
      ],
    },
      },
        glow: {
          paint: {
            type: 'radial',
            cx: 0.5,
      cy: 0.5,
   r: 0.5,
     stops: [
  { offset: 0, color: '#fff7ed', opacity: 0.95 },
   { offset: 1, color: '#fb923c', opacity: 0 },
       ],
   },
        },
      cloud_hi: { paint: { type: 'solid', color: '#fecdd3' } },
        cloud_mid: { paint: { type: 'solid', color: '#fda4af' } },
        cloud_low: { paint: { type: 'solid', color: '#fb7185' } },
      },
    },
    {
      id: 'storm',
 label: '风暴',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
       { offset: 0, color: '#0f172a' },
  { offset: 0.6, color: '#475569' },
        { offset: 1, color: '#94a3b8' },
            ],
          },
        },
        glow: {
 paint: {
   type: 'radial',
     cx: 0.5,
            cy: 0.5,
     r: 0.5,
   stops: [
   { offset: 0, color: '#e2e8f0', opacity: 0.6 },
    { offset: 1, color: '#64748b', opacity: 0 },
            ],
          },
        },
    cloud_hi: { paint: { type: 'solid', color: '#cbd5e1' } },
  cloud_mid: { paint: { type: 'solid', color: '#94a3b8' } },
     cloud_low: { paint: { type: 'solid', color: '#64748b' } },
      },
    },
    {
      id: 'mint',
      label: '薄暮',
      elements: {
        sky: {
          paint: {
          type: 'linear',
     angle: 90,
            stops: [
              { offset: 0, color: '#134e4a' },
      { offset: 0.5, color: '#5eead4' },
   { offset: 1, color: '#ecfdf5' },
 ],
   },
        },
        glow: {
          paint: {
            type: 'radial',
            cx: 0.5,
            cy: 0.5,
            r: 0.5,
            stops: [
       { offset: 0, color: '#ecfdf5', opacity: 0.9 },
  { offset: 1, color: '#2dd4bf', opacity: 0 },
    ],
    },
      },
   cloud_hi: { paint: { type: 'solid', color: '#ccfbf1' } },
        cloud_mid: { paint: { type: 'solid', color: '#99f6e4' } },
   cloud_low: { paint: { type: 'solid', color: '#5eead4' } },
  },
    },
  ],

  paletteSlots: {
    bg: ['sky'],
    accent: ['glow'],
    secondary: ['cloud_hi'],
    primary: ['cloud_mid'],
    detail: ['cloud_low'],
  },

  render(_def, cfg: ResolvedConfig, _api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const bandCount = Math.max(1, Math.min(3, Math.round(Number(params.bands))));
    const scale = Math.max(0.2, Number(params.scale));
    const spread = Math.max(0.01, Number(params.spread));
    const glowX = Number(params.glowX);
    const glowY = Number(params.glowY);

    const sky = elements.get('sky')!;
    const glow = elements.get('glow')!;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // 光晕：一大一小两个同心圆叠出柔和衰减（不用 filter）
    if (glow.visible) {
      const r = Math.min(W, H) * 0.42 * scale;
      const cx = W * glowX;
      const cy = H * glowY;
      parts.push(circle(cx, cy, r, { fill: glow.paintValue, 'fill-opacity': glow.opacity * 0.22 }));
      parts.push(circle(cx, cy, r * 0.55, { fill: glow.paintValue, 'fill-opacity': glow.opacity * 0.35 }));
    }

    // 云带：自上而下三条。层数不足时保留下方（构图更稳）。
    const CLOUD_IDS = ['cloud_hi', 'cloud_mid', 'cloud_low'] as const;
    const chosen = CLOUD_IDS.slice(Math.max(0, CLOUD_IDS.length - bandCount));

  /**
     * ⚠️ 这里曾有一段「在云带底缘压一条更实的窄带」的代码，已整条移除。
     * 它是硬边矩形：无论透明度调到 0.5 还是 0.16，都会在云底留下一条贯穿
     * 全宽的直边（实测可见），读起来像「图层被切了一刀」而不是云。
     * 椭圆云团本身已有足够层次，硬边反而是画蛇添足。
     */
    for (let bi = 0; bi < chosen.length; bi++) {
      const e = elements.get(chosen[bi])!;
      if (!e.visible) continue;
      const t = (bi + 1) / (chosen.length + 1);
      const baseY = H * (0.24 + t * 0.46);
      const thickness = H * spread * (0.75 + t * 0.5);

      // 一条云带 = PUFFS 个横向拉伸的椭圆，横向位置与宽度由 seed 决定
      for (let p = 0; p < PUFFS; p++) {
     const u = (p + 0.5) / PUFFS;
        const cx = W * u + (rng() - 0.5) * (W / PUFFS) * 0.7;
        // 竖向半径按 sin 包络：中段厚、两端薄 → 云带自然收尾
    const env = Math.sin(u * Math.PI) * 0.6 + 0.4;
     const ry = thickness * env * (0.7 + rng() * 0.6);
   const rx = ry * (2.2 + rng() * 3.4) * scale;
        parts.push(
          ellipse(cx, baseY + (rng() - 0.5) * thickness * 0.5, rx, Math.max(1, ry), {
     fill: e.paintValue,
     'fill-opacity': e.opacity,
          }),
        );
      }
    }

    return { body: parts.join('') };
  },
};

export default def;
