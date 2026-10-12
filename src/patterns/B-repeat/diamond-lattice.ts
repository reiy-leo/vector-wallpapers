/**
 * 菱形格纹 —— B 波点 / 网格重复。
 *
 * 构图要点：两组菱形以半格错位叠加成格纹，交替填充形成编织感。
 * 两组共用一个 <pattern> 单元（内含 A/B 两个菱形），密度与体积解耦。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'diamond-lattice',
  name: '菱形格纹',
  category: 'B-repeat',
  description: '两组菱形半格错位叠加成格纹，交替填充带来编织般的秩序感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#18181b' }, opacity: 1, visible: true, configurable: true },
    { id: 'dia_a', label: '菱形 A', role: 'primary', paint: { type: 'solid', color: '#f4f4f5' }, opacity: 0.95, visible: true, configurable: true },
    { id: 'dia_b', label: '菱形 B', role: 'secondary', paint: { type: 'solid', color: '#7c3aed' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'grid', label: '格线', role: 'accent', paint: { type: 'solid', color: '#fbbf24' }, opacity: 0.7, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '格距', type: 'range', min: 16, max: 200, step: 2, default: 64, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 5, step: 0.1, default: 1.2, unit: 'px' },
    { key: 'fillRatio', label: '填充率', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'strokeGrid', label: '显示格线', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'amethyst',
      label: '紫晶',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f0a1e' } },
        dia_a: { paint: { type: 'solid', color: '#c4b5fd' } },
        dia_b: { paint: { type: 'solid', color: '#6d28d9' } },
        grid: { paint: { type: 'solid', color: '#fcd34d' } },
      },
    },
    {
      id: 'jade',
      label: '翡翠',
      elements: {
        bg: { paint: { type: 'solid', color: '#022c22' } },
        dia_a: { paint: { type: 'solid', color: '#a7f3d0' } },
        dia_b: { paint: { type: 'solid', color: '#047857' } },
        grid: { paint: { type: 'solid', color: '#fde047' } },
      },
    },
    {
      id: 'porcelain',
      label: '瓷白',
      elements: {
        bg: { paint: { type: 'solid', color: '#f8fafc' } },
        dia_a: { paint: { type: 'solid', color: '#1e293b' } },
        dia_b: { paint: { type: 'solid', color: '#94a3b8' } },
        grid: { paint: { type: 'solid', color: '#e11d48' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['dia_a'], secondary: ['dia_b'], accent: ['grid'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(8, Number(params.cell));
    const weight = Number(params.weight);
    const fillRatio = Number(params.fillRatio);
    const showGrid = params.strokeGrid === true;

    const bg = elements.get('bg')!;
    const a = elements.get('dia_a')!;
    const b = elements.get('dia_b')!;
    const grid = elements.get('grid')!;

    const h = cell / 2;
    /** 以 (cx, cy) 为中心画一个半径为 h 的菱形。 */
    const diamond = (cx: number, cy: number): string =>
      `M${api.n(cx)} ${api.n(cy - h)} L${api.n(cx + h)} ${api.n(cy)} L${api.n(cx)} ${api.n(cy + h)} L${api.n(cx - h)} ${api.n(cy)} Z`;

    const marks: string[] = [];

    // A 组：单元中心的描边菱形，构成格纹骨架
    if (a.visible) {
      marks.push(
        path(diamond(h, h), {
          fill: 'none',
          stroke: a.paintValue,
          'stroke-width': weight,
          'stroke-opacity': a.opacity,
        }),
      );
    }

    // B 组：单元四角 → 与 A 组构成格纹。
    // 填充率换算成**精确个数**再由 seeded rng 决定点亮哪几个，
    // 避免「逐格掷骰子」导致两个不同 seed 偶发同图。
    const corners: Array<[number, number]> = [
      [0, 0],
      [cell, 0],
      [0, cell],
      [cell, cell],
    ];
    const fillCount = Math.round(Math.max(0, Math.min(1, fillRatio)) * corners.length);
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (b.visible) {
      for (let i = 0; i < fillCount; i++) {
        const [bx, by] = corners[order[i]];
        // 连续量微偏移：打乱顺序只决定「填哪几格」（离散，碰撞率 25%），
        // 微偏移保证任意两个不同 seed 的产物都不可能逐字节相同。
        const cx = bx + (rng() - 0.5) * h * 0.34;
        const cy = by + (rng() - 0.5) * h * 0.34;
        marks.push(path(diamond(cx, cy), { fill: b.paintValue, 'fill-opacity': b.opacity * 0.85 }));
      }
    }

    // 格线：单元对角线，强调结构
    if (showGrid && grid.visible) {
      marks.push(
        path(`M0 0 L${api.n(cell)} ${api.n(cell)} M${api.n(cell)} 0 L0 ${api.n(cell)}`, {
          fill: 'none',
          stroke: grid.paintValue,
          'stroke-width': Math.max(0.3, weight * 0.4),
          'stroke-opacity': grid.opacity,
        }),
      );
    }

    const tileRef = api.tile({
      key: `dl-${api.n(cell)}-${api.n(weight)}-${api.n(fillRatio)}-${showGrid ? 1 : 0}`,
      w: cell,
      h: cell,
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