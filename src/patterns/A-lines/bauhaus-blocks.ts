/**
 * 包豪斯块面 —— A 极简几何线条。
 *
 * 构图要点：在一个 pattern 单元内放置圆 / 半圆 / 三角 / 方块四类基本形，
 * 再用 <pattern> 平铺成壁纸。单元内的落位由 seeded rng 决定，
 * 因此同 seed 构图稳定，换 seed 即得新变体 —— 这正是「壁纸生成器」的意义。
 *
 * 体积策略：单元内容恒定为 4 个图形，与平铺密度完全解耦。
 */
import { circle, path, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'bauhaus-blocks',
  name: '包豪斯块面',
  category: 'A-lines',
  description: '圆、半圆、三角、方块在单元内自由落位，平铺成几何块面壁纸。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f4efe6' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_a', label: '形 · A', role: 'primary', paint: { type: 'solid', color: '#d7263d' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_b', label: '形 · B', role: 'secondary', paint: { type: 'solid', color: '#1b4965' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_c', label: '形 · C', role: 'accent', paint: { type: 'solid', color: '#f6ae2d' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '单元尺寸', type: 'range', min: 40, max: 400, step: 4, default: 140, heavy: true },
    { key: 'radius', label: '图形占比', type: 'range', min: 0.2, max: 0.9, step: 0.01, default: 0.62 },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
    { key: 'outlined', label: '描边风格', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'classic',
      label: '经典包豪斯',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2ede4' } },
        shape_a: { paint: { type: 'solid', color: '#c1121f' } },
        shape_b: { paint: { type: 'solid', color: '#003049' } },
        shape_c: { paint: { type: 'solid', color: '#fdf0d5' } },
      },
    },
    {
      id: 'primary',
      label: '原色',
      elements: {
        bg: { paint: { type: 'solid', color: '#ffffff' } },
        shape_a: { paint: { type: 'solid', color: '#0057b7' } },
        shape_b: { paint: { type: 'solid', color: '#ffdd00' } },
        shape_c: { paint: { type: 'solid', color: '#e63946' } },
      },
    },
    {
      id: 'noir',
      label: '单色',
      elements: {
        bg: { paint: { type: 'solid', color: '#111111' } },
        shape_a: { paint: { type: 'solid', color: '#ededed' } },
        shape_b: { paint: { type: 'solid', color: '#9a9a9a' } },
        shape_c: { paint: { type: 'solid', color: '#4d4d4d' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['shape_a'], secondary: ['shape_b'], accent: ['shape_c'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(16, Number(params.cell));
    const ratio = Number(params.radius);
    const rotate = Number(params.rotate);
    const outlined = params.outlined === true;

    const bg = elements.get('bg')!;
    const a = elements.get('shape_a')!;
    const b = elements.get('shape_b')!;
    const c = elements.get('shape_c')!;

    const r = cell * ratio * 0.5;
    // 4 个图形在单元内随机落位 —— 这是「换 seed 换构图」的实现点
    const spots: Array<[number, number]> = [
      [cell * (0.25 + rng() * 0.2), cell * (0.25 + rng() * 0.2)],
      [cell * (0.6 + rng() * 0.2), cell * (0.3 + rng() * 0.2)],
      [cell * (0.3 + rng() * 0.2), cell * (0.65 + rng() * 0.2)],
      [cell * (0.65 + rng() * 0.2), cell * (0.68 + rng() * 0.18)],
    ];

    const style = (e: typeof a): Record<string, string | number> =>
      outlined
        ? {
            fill: 'none',
            stroke: e.paintValue,
            'stroke-width': Math.max(1, cell * 0.035),
            'stroke-opacity': e.opacity,
          }
        : { fill: e.paintValue, 'fill-opacity': e.opacity };

    const shapes: string[] = [
      circle(spots[0][0], spots[0][1], r, style(a)),
      // 半圆：半圆弧用两段弧拼，避免依赖 path 弧命令的浏览器差异
      path(
        `M${api.n(spots[1][0] - r)} ${api.n(spots[1][1])} A${api.n(r)} ${api.n(r)} 0 0 1 ${api.n(spots[1][0] + r)} ${api.n(spots[1][1])} Z`,
        style(b),
      ),
      polygon(
        [
          [spots[2][0], spots[2][1] - r],
          [spots[2][0] + r, spots[2][1] + r],
          [spots[2][0] - r, spots[2][1] + r],
        ],
        style(c),
      ),
      rect(spots[3][0] - r * 0.8, spots[3][1] - r * 0.8, r * 1.6, r * 1.6, style(a)),
    ];

    const tileRef = api.tile({
      key: `bb-${api.n(cell)}-${api.n(ratio)}-${api.n(rotate)}-${outlined ? 1 : 0}-${api.n(spots[0][0])}`,
      w: cell,
      h: cell,
      content: shapes.join(''),
      transform: rotate === 0 ? undefined : `rotate(${api.n(rotate)})`,
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