/**
 * 方环交替 —— B 波点 / 网格重复。
 *
 * 结构：2×2 格的单元，对角两格放「方环 A」，另两格放「方环 B」；
 * B 可相对 A 旋转（默认 45° → 菱形环）、或缩小嵌套，形成棋盘式的交替节奏。
 * 方环 = 外圆角方 + 内圆角方，用 `fill-rule=evenodd` 镂空成方形甜甜圈；
 * 环心可放一个小方点作点缀。
 *
 * ⚠️ 旋转后的方环外接尺寸变大（最大 √2 倍），必须按旋转角收缩边长，
 * 否则会越出格子、在 <pattern> 单元边缘被硬裁掉。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'square-rings',
  name: '方环交替',
  category: 'B-repeat',
  description: '方形甜甜圈按棋盘交替排布，B 环可交替旋转或缩小，环厚与圆角可调。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f2ede4' }, opacity: 1, visible: true, configurable: true },
    { id: 'ring_a', label: '方环 · 主', role: 'primary', paint: { type: 'solid', color: '#7f9a95' }, opacity: 1, visible: true, configurable: true },
    { id: 'ring_b', label: '方环 · 次', role: 'secondary', paint: { type: 'solid', color: '#d3b98f' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot', label: '环心', role: 'accent', paint: { type: 'solid', color: '#c47f62' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '格数', type: 'range', min: 4, max: 24, step: 1, default: 9, heavy: true },
    { key: 'size', label: '环大小', type: 'range', min: 0.3, max: 0.95, step: 0.05, default: 0.62 },
    { key: 'thickness', label: '环厚', type: 'range', min: 0.08, max: 0.48, step: 0.02, default: 0.26 },
    { key: 'radius', label: '圆角', type: 'range', min: 0, max: 0.5, step: 0.02, default: 0.14 },
    {
      key: 'alt', label: '交替方式', type: 'select', default: 'rotate', options: [
        { value: 'rotate', label: '交替旋转' },
        { value: 'shrink', label: '交替缩小' },
        { value: 'none', label: '仅换色' },
      ],
    },
    { key: 'angle', label: '旋转角', type: 'range', min: 0, max: 45, step: 1, default: 45 },
    { key: 'center', label: '环心点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'oat',
      label: '燕麦',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2ede4' } },
        ring_a: { paint: { type: 'solid', color: '#7f9a95' } },
        ring_b: { paint: { type: 'solid', color: '#d3b98f' } },
        dot: { paint: { type: 'solid', color: '#c47f62' } },
      },
    },
    {
      id: 'slate',
      label: '石板',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f242b' } },
        ring_a: { paint: { type: 'solid', color: '#3c4754' } },
        ring_b: { paint: { type: 'solid', color: '#566170' } },
        dot: { paint: { type: 'solid', color: '#c9a66b' } },
      },
      params: { alt: 'shrink', thickness: 0.22 },
    },
    {
      id: 'blush',
      label: '藕粉',
      elements: {
        bg: { paint: { type: 'solid', color: '#f6ece9' } },
        ring_a: { paint: { type: 'solid', color: '#d8b4ab' } },
        ring_b: { paint: { type: 'solid', color: '#b9a5b8' } },
        dot: { paint: { type: 'solid', color: '#8f7a8e' } },
      },
      params: { radius: 0.3, size: 0.56 },
    },
    {
      id: 'forest',
      label: '林间',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c2620' } },
        ring_a: { paint: { type: 'solid', color: '#3f5a48' } },
        ring_b: { paint: { type: 'solid', color: '#2f4537' } },
        dot: { paint: { type: 'solid', color: '#a9b98a' } },
      },
      params: { angle: 20, radius: 0.08 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['ring_a'], secondary: ['ring_b'], accent: ['dot'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(Math.max(4, Math.min(24, Number(params.count))));
    const size = Math.max(0.3, Math.min(0.95, Number(params.size)));
    const thick = Math.max(0.08, Math.min(0.48, Number(params.thickness)));
    const radius = Math.max(0, Math.min(0.5, Number(params.radius)));
    const alt = String(params.alt);
    const angle = Math.max(0, Math.min(45, Number(params.angle)));
    const showCenter = params.center === true;

    const bg = elements.get('bg')!;
    const ringA = elements.get('ring_a')!;
    const ringB = elements.get('ring_b')!;
    const dot = elements.get('dot')!;
    const n = api.n;

    const C = W / count;

    /** 以 (0,0) 为中心、边长 s、圆角半径 rAbs 的圆角方子路径（顺时针）。 */
    const sq = (s: number, rAbs: number): string => {
      const h = s / 2;
      const r = Math.min(h, Math.max(0, rAbs));
      if (r <= 0.01) return `M${n(-h)} ${n(-h)}H${n(h)}V${n(h)}H${n(-h)}Z`;
      return (
        `M${n(-h + r)} ${n(-h)}H${n(h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(h)} ${n(-h + r)}` +
        `V${n(h - r)}A${n(r)} ${n(r)} 0 0 1 ${n(h - r)} ${n(h)}` +
        `H${n(-h + r)}A${n(r)} ${n(r)} 0 0 1 ${n(-h)} ${n(h - r)}` +
        `V${n(-h + r)}A${n(r)} ${n(r)} 0 0 1 ${n(-h + r)} ${n(-h)}Z`
      );
    };

    /**
     * 方环 path（外方 + 内方，evenodd 镂空）。
     * 内方圆角 = 外圆角 − 环宽（同心偏移），这样拐角处环宽与直边一致，不会「角上变粗」。
     */
    const ring = (s: number): string => {
      const band = s * thick;
      const hole = s - 2 * band;
      const rOut = (s / 2) * radius * 2;
      return sq(s, rOut) + (hole > 0.5 ? sq(hole, rOut - band) : '');
    };

    // B 环尺寸与旋转
    const rotB = alt === 'rotate' ? angle : 0;
    const t = (rotB * Math.PI) / 180;
    // 圆角会缩小旋转后的外接尺寸，这里按直角方保守估计（宁小勿裁）。
    const fitRot = 1 / (Math.abs(Math.cos(t)) + Math.abs(Math.sin(t)));
    const sA = C * size;
    let sB = Math.min(sA, C * 0.96 * fitRot);
    if (alt === 'shrink') sB = sA * 0.62;

    const cells: Array<[number, number, 'a' | 'b']> = [
      [0.5, 0.5, 'a'],
      [1.5, 1.5, 'a'],
      [1.5, 0.5, 'b'],
      [0.5, 1.5, 'b'],
    ];

    const marks: string[] = [];
    for (const [gx, gy, kind] of cells) {
      const e = kind === 'a' ? ringA : ringB;
      const s = kind === 'a' ? sA : sB;
      const rot = kind === 'b' && rotB !== 0 ? ` rotate(${n(rotB)})` : '';
      const inner: string[] = [];
      if (e.visible) {
        inner.push(path(ring(s), { fill: e.paintValue, 'fill-opacity': e.opacity, 'fill-rule': 'evenodd' }));
      }
      if (showCenter && dot.visible) {
        const hole = s * (1 - 2 * thick);
        const ds = Math.max(0.6, Math.min(hole * 0.42, C * 0.12));
        if (hole > ds * 1.4) inner.push(path(sq(ds, ds * radius), { fill: dot.paintValue, 'fill-opacity': dot.opacity }));
      }
      if (inner.length > 0) {
        marks.push(g({ transform: `translate(${n(gx * C)} ${n(gy * C)})${rot}` }, inner.join('')));
      }
    }

    const tileRef = api.tile({
      key: `sqr-${n(C)}-${n(sA)}-${n(sB)}-${n(thick)}-${n(radius)}-${n(rotB)}-${showCenter ? 1 : 0}`,
      w: 2 * C,
      h: 2 * C,
      content: marks.join(''),
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;
