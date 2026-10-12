/**
 * 递变网点 —— B 波点 / 网格重复。
 *
 * 构图要点：网点半径随「场函数」连续变化（不是等半径点阵）。
 * 这是 `STYLE-100-ANALYSIS.md` §4.2 列出的缺口 —— 现有 `polka-dots`
 * 是**等半径**规则点阵，而真实印刷的半色调网点必须随明暗渐变，
 * 否则画面是「平的」，没有印刷感。
 *
 * 场的构成：斜向线性渐变 × 同心波纹，两者相乘。
 * 相乘是关键 —— 线性项给出整体的明暗走向，波纹项打破机械感。
 *
 * ⭐ 必须 tile：网点密度可拉到 60×40 = 2400 个，必须走 <pattern>。
 */
import { circle, g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'halftone',
  name: '递变网点',
  category: 'B-repeat',
  description: '网点半径随明暗场连续变化，双色分色，模拟印刷半色调。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f4efe4' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot_dark', label: '暗部网点', role: 'primary', paint: { type: 'solid', color: '#1a1a1a' }, opacity: 0.92, visible: true, configurable: true },
    { id: 'dot_light', label: '亮部网点', role: 'secondary', paint: { type: 'solid', color: '#e0453c' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'paper', label: '纸色', role: 'detail', paint: { type: 'solid', color: '#d9cdb6' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'pitch', label: '网点间距', type: 'range', min: 6, max: 40, step: 1, default: 16, heavy: true },
    { key: 'angle', label: '网点角度', type: 'angle', default: 45 },
    { key: 'spread', label: '渐变跨度', type: 'range', min: 0.2, max: 2, step: 0.05, default: 1 },
    { key: 'ripple', label: '波纹强度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'split', label: '双色分色', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'print',
      label: '丝网印刷',
      elements: {
        bg: { paint: { type: 'solid', color: '#f4efe4' } },
        dot_dark: { paint: { type: 'solid', color: '#1a1a1a' } },
        dot_light: { paint: { type: 'solid', color: '#e0453c' } },
        paper: { paint: { type: 'solid', color: '#d9cdb6' } },
      },
    },
    {
      id: 'cyanotype',
      label: '蓝晒',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8f0f6' } },
        dot_dark: { paint: { type: 'solid', color: '#0d3b66' } },
        dot_light: { paint: { type: 'solid', color: '#5fa8d3' } },
        paper: { paint: { type: 'solid', color: '#cfe0ec' } },
      },
    },
    {
      id: 'duotone-pink',
      label: '粉调',
      elements: {
        bg: { paint: { type: 'solid', color: '#fdf2f6' } },
        dot_dark: { paint: { type: 'solid', color: '#9d174d' } },
        dot_light: { paint: { type: 'solid', color: '#f9a8d4' } },
        paper: { paint: { type: 'solid', color: '#fbcfe8' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['dot_dark'], secondary: ['dot_light'], detail: ['paper'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const pitch = Math.max(6, Number(params.pitch));
    const angle = Number(params.angle);
    const spread = Math.max(0.2, Math.min(2, Number(params.spread)));
    const ripple = Math.max(0, Math.min(1, Number(params.ripple)));
    const split = params.split === true;

    const bg = elements.get('bg')!;
    const dotDark = elements.get('dot_dark')!;
    const dotLight = elements.get('dot_light')!;
    const paper = elements.get('paper')!;

    /**
     * 半色调场函数 → [0,1]。
     *
     * 线性项：把 [0,1]² 投影到角度方向，得到一个斜向梯度。
     * 波纹项：`sin` 环，取半周期做正弦包络，中心最亮。
     * 两者相乘再归一化 —— 相乘是「亮处波纹弱、暗处波纹强」，
     * 加法会让亮处也出现同样的波纹起伏，看起来像水波而不是网点。
     */
    const rad = (angle * Math.PI) / 180;
    const ux = Math.cos(rad);
    const uy = Math.sin(rad);
    const k = 3.2 * spread;

    const field = (nx: number, ny: number): number => {
      // 线性项：沿角度方向的投影，取三角函数使其在 0~1 间平滑起伏
      const lin = 0.5 + 0.5 * Math.sin((nx * ux + ny * uy) * Math.PI * k);
      // 波纹项：以单元中心为圆心的环
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const rip = 1 - ripple * (0.5 + 0.5 * Math.cos(dist * Math.PI * 4));
      const v = lin * rip;
      return v < 0 ? 0 : v > 1 ? 1 : v;
    };

    const maxR = pitch * 0.46;
    const marks: string[] = [];

    // 单元取 pitch×pitch 的正方形，旋转后的网点由 <pattern patternTransform> 处理，
    // 因此单元内只需画轴对齐的一列点 —— 实际渲染的是斜向网格。
    const n = 4;
    for (let iy = 0; iy < n; iy++) {
      for (let ix = 0; ix < n; ix++) {
        const nx = (ix + 0.5) / n;
        const ny = (iy + 0.5) / n;
        const v = field(nx, ny);
        const r = maxR * v;
        if (r < 0.25) continue; // 小于 0.25px 渲染出来是噪点，直接跳过

        // 双色分色：场值高 → 亮部色，低 → 暗部色，中间地带用暗色以保证密度感
        if (split && dotLight.visible && v > 0.62) {
          marks.push(circle(nx * pitch, ny * pitch, r, {
            fill: dotLight.paintValue,
            'fill-opacity': dotLight.opacity,
          }));
        } else if (dotDark.visible) {
          marks.push(circle(nx * pitch, ny * pitch, r, {
            fill: dotDark.paintValue,
            'fill-opacity': dotDark.opacity,
          }));
        }
      }
    }

    const tileRef = api.tile({
      key: `ht-${api.n(pitch)}-${api.n(angle)}-${api.n(spread)}-${api.n(ripple)}-${split ? 1 : 0}`,
      w: pitch,
      h: pitch,
      content: g({}, marks.join('')),
      // 整块平铺旋转 → 网点成为斜向网格，正是印刷网屏的方向感来源
      transform: `rotate(${api.n(angle - 45)})`,
    });

    return {
      body: [
        // 纸色作为最底层，让网点之间的空隙呈现纸张而非纯白
        paper.visible
          ? rect(0, 0, W, H, { fill: paper.paintValue, 'fill-opacity': paper.opacity })
          : '',
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;
