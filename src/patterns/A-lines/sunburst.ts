/**
 * 放射光芒 —— B 分类里的**单幅构图**（例外：不平铺）。
 *
 * 构图：从一个光源点（可居中、可偏移到画外）向四周放射等角扇形，
 * 主光芒与底色交替；可选在底色扇区中央加一道细的次光芒；
 * 光源处叠一层径向渐变光晕 + 小光核。
 *
 * 与 `art-deco-fan` 的区分：
 *  - art-deco-fan 是**象限扇面 + 阶梯同心环**的平铺装饰纹，焦点重复出现、上下镜像；
 *  - 这里是**整幅只有一个焦点**的 360° 放射，射线直通画面边缘，没有阶梯环、没有平铺。
 *
 * 体积：全部扇形合并为**一条 path**（多子路径），射线数拉满也只是几十段直线。
 */
import { circle, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'sunburst',
  name: '放射光芒',
  category: 'A-lines',
  description: '单一光源向四周放射的交替色扇形光芒，光源位置可偏移，可叠中心光晕。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#efe4d3' }, opacity: 1, visible: true, configurable: true },
    { id: 'ray_a', label: '主光芒', role: 'primary', paint: { type: 'solid', color: '#e6d5bb' }, opacity: 1, visible: true, configurable: true },
    { id: 'ray_b', label: '次光芒', role: 'secondary', paint: { type: 'solid', color: '#e0ccae' }, opacity: 0.7, visible: true, configurable: true },
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
          { offset: 0, color: '#fff8ec', opacity: 0.95 },
          { offset: 0.45, color: '#fbeedb', opacity: 0.45 },
          { offset: 1, color: '#f6e6cf', opacity: 0 },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'core', label: '光核', role: 'detail', paint: { type: 'solid', color: '#e2b384' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    { key: 'rays', label: '射线数', type: 'range', min: 8, max: 60, step: 2, default: 24, heavy: true },
    { key: 'cx', label: '光源 X', type: 'range', min: -0.3, max: 1.3, step: 0.05, default: 0.5 },
    { key: 'cy', label: '光源 Y', type: 'range', min: -0.3, max: 1.3, step: 0.05, default: 0.62 },
    { key: 'width', label: '光芒宽度', type: 'range', min: 0.2, max: 1, step: 0.05, default: 1 },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
    { key: 'secondary', label: '次光芒', type: 'toggle', default: true },
    { key: 'glowSize', label: '光晕大小', type: 'range', min: 0, max: 1.2, step: 0.05, default: 0.55 },
    { key: 'coreSize', label: '光核大小', type: 'range', min: 0, max: 0.2, step: 0.01, default: 0.035 },
  ],

  presets: [
    {
      id: 'cream',
      label: '奶油晨光',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe4d3' } },
        ray_a: { paint: { type: 'solid', color: '#e6d5bb' } },
        ray_b: { paint: { type: 'solid', color: '#e0ccae' } },
        glow: {
          paint: {
            type: 'radial', cx: 0.5, cy: 0.5, r: 0.5,
            stops: [
              { offset: 0, color: '#fff8ec', opacity: 0.95 },
              { offset: 0.45, color: '#fbeedb', opacity: 0.45 },
              { offset: 1, color: '#f6e6cf', opacity: 0 },
            ],
          },
        },
        core: { paint: { type: 'solid', color: '#e2b384' } },
      },
    },
    {
      id: 'dusk',
      label: '暮紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#26222f' } },
        ray_a: { paint: { type: 'solid', color: '#302a3b' } },
        ray_b: { paint: { type: 'solid', color: '#3a3247' } },
        glow: {
          paint: {
            type: 'radial', cx: 0.5, cy: 0.5, r: 0.5,
            stops: [
              { offset: 0, color: '#f2c39b', opacity: 0.55 },
              { offset: 0.5, color: '#9c6f84', opacity: 0.18 },
              { offset: 1, color: '#3a3247', opacity: 0 },
            ],
          },
        },
        core: { paint: { type: 'solid', color: '#f2c39b' } },
      },
      params: { cy: 1.05, rays: 32, glowSize: 0.75, coreSize: 0.09 },
    },
    {
      id: 'sage-corner',
      label: '鼠尾草 · 角光',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe5da' } },
        ray_a: { paint: { type: 'solid', color: '#d3dccd' } },
        ray_b: { paint: { type: 'solid', color: '#c9d4c2' } },
        glow: {
          paint: {
            type: 'radial', cx: 0.5, cy: 0.5, r: 0.5,
            stops: [
              { offset: 0, color: '#fbfcf6', opacity: 0.9 },
              { offset: 1, color: '#eef2e8', opacity: 0 },
            ],
          },
        },
        core: { paint: { type: 'solid', color: '#9fb39a' } },
      },
      params: { cx: 0.08, cy: 0.1, rays: 28, glowSize: 0.7, coreSize: 0 },
    },
    {
      id: 'midnight',
      label: '午夜蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#141b26' } },
        ray_a: { paint: { type: 'solid', color: '#1b2533' } },
        ray_b: { paint: { type: 'solid', color: '#222e3f' } },
        glow: {
          paint: {
            type: 'radial', cx: 0.5, cy: 0.5, r: 0.5,
            stops: [
              { offset: 0, color: '#a9c1d9', opacity: 0.35 },
              { offset: 1, color: '#1b2533', opacity: 0 },
            ],
          },
        },
        core: { paint: { type: 'solid', color: '#c9d6e3' } },
      },
      params: { width: 0.7, rays: 36, coreSize: 0.03 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['ray_a'], secondary: ['ray_b'], accent: ['glow'], detail: ['core'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const rays = Math.round(Math.max(8, Math.min(60, Number(params.rays)) / 2)) * 2;
    const ox = W * Math.max(-0.3, Math.min(1.3, Number(params.cx)));
    const oy = H * Math.max(-0.3, Math.min(1.3, Number(params.cy)));
    const widthR = Math.max(0.2, Math.min(1, Number(params.width)));
    const rot = (Number(params.rotate) * Math.PI) / 180;
    const showSecondary = params.secondary === true;
    const glowSize = Math.max(0, Math.min(1.2, Number(params.glowSize)));
    const coreSize = Math.max(0, Math.min(0.2, Number(params.coreSize)));

    const bg = elements.get('bg')!;
    const rayA = elements.get('ray_a')!;
    const rayB = elements.get('ray_b')!;
    const glow = elements.get('glow')!;
    const core = elements.get('core')!;
    const n = api.n;

    // 射线长度：光源到最远画布角的距离再放大一点，保证扇形完全盖住画面。
    const R =
      Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy)) * 1.05;
    const slot = (Math.PI * 2) / rays;

    /** 以 a 为中心、张角 span 的扇形。外缘必须用圆弧：射线少时张角达 45°，直线弦会缩进到画内露出缺口。 */
    const wedge = (a: number, span: number): string => {
      const a0 = a - span / 2;
      const a1 = a + span / 2;
      return (
        `M${n(ox)} ${n(oy)}L${n(ox + R * Math.cos(a0))} ${n(oy + R * Math.sin(a0))}` +
        `A${n(R)} ${n(R)} 0 0 1 ${n(ox + R * Math.cos(a1))} ${n(oy + R * Math.sin(a1))}Z`
      );
    };

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // 主光芒：偶数槽；宽度 = 槽宽 × widthR（1 = 与底色扇区等宽的经典交替）。
    if (rayA.visible) {
      let d = '';
      for (let i = 0; i < rays; i += 2) d += wedge(rot + (i + 0.5) * slot, slot * widthR);
      parts.push(path(d, { fill: rayA.paintValue, 'fill-opacity': rayA.opacity }));
    }
    // 次光芒：奇数槽（底色扇区）中央的窄光芒，宽度为主光芒的 35%。
    if (showSecondary && rayB.visible) {
      let d = '';
      for (let i = 1; i < rays; i += 2) d += wedge(rot + (i + 0.5) * slot, slot * widthR * 0.35);
      parts.push(path(d, { fill: rayB.paintValue, 'fill-opacity': rayB.opacity }));
    }

    const short = Math.min(W, H);
    if (glow.visible && glowSize > 0) {
      parts.push(circle(ox, oy, short * glowSize, { fill: glow.paintValue, opacity: glow.opacity }));
    }
    if (core.visible && coreSize > 0) {
      parts.push(circle(ox, oy, short * coreSize, { fill: core.paintValue, 'fill-opacity': core.opacity }));
    }

    return { body: parts.join('') };
  },
};

export default def;
