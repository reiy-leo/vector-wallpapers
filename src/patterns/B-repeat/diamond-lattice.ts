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
    // 2026-10-12 审美复核：原默认 64px 细密菱格 + 白/紫/金三色高对比，全屏摩尔纹。
    // 现格距放大、线宽随分辨率缩放、配色收敛为同色系梅紫 + 极淡金色对角线。
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#2a2436' }, opacity: 1, visible: true, configurable: true },
    { id: 'dia_a', label: '菱形 A', role: 'primary', paint: { type: 'solid', color: '#8d81a6' }, opacity: 0.5, visible: true, configurable: true },
    { id: 'dia_b', label: '菱形 B', role: 'secondary', paint: { type: 'solid', color: '#3a3149' }, opacity: 1, visible: true, configurable: true },
    { id: 'grid', label: '格线', role: 'accent', paint: { type: 'solid', color: '#c9a96e' }, opacity: 0.22, visible: true, configurable: true },
  ],

  controls: [
    // cell / weight 以 1080p 短边为基准，渲染时乘 unit = 短边/1080（2560×1440 下 ×1.33）
    { key: 'cell', label: '格距', type: 'range', min: 40, max: 360, step: 2, default: 150, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 5, step: 0.1, default: 1.2, unit: 'px' },
    { key: 'fillRatio', label: '填充率', type: 'range', min: 0, max: 1, step: 0.01, default: 0.75 },
    { key: 'strokeGrid', label: '显示格线', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'amethyst',
      label: '紫晶',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f1a2e' } },
        dia_a: { paint: { type: 'solid', color: '#a596c8' }, opacity: 0.45 },
        dia_b: { paint: { type: 'solid', color: '#2f2744' } },
        grid: { paint: { type: 'solid', color: '#d8b878' }, opacity: 0.2 },
      },
    },
    {
      id: 'jade',
      label: '翡翠',
      elements: {
        bg: { paint: { type: 'solid', color: '#13291f' } },
        dia_a: { paint: { type: 'solid', color: '#86b8a0' }, opacity: 0.45 },
        dia_b: { paint: { type: 'solid', color: '#1b382b' } },
        grid: { paint: { type: 'solid', color: '#d6c98a' }, opacity: 0.18 },
      },
    },
    {
      id: 'porcelain',
      label: '瓷白',
      elements: {
        bg: { paint: { type: 'solid', color: '#f4f2ee' } },
        dia_a: { paint: { type: 'solid', color: '#7d8796' }, opacity: 0.4 },
        dia_b: { paint: { type: 'solid', color: '#e6e3dc' } },
        grid: { paint: { type: 'solid', color: '#4f6d8f' }, opacity: 0.15 },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['dia_a'], secondary: ['dia_b'], accent: ['grid'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const cell = Math.max(8, Number(params.cell) * unit);
    const weight = Number(params.weight) * unit;
    const fillRatio = Number(params.fillRatio);
    const showGrid = params.strokeGrid === true;

    const bg = elements.get('bg')!;
    const a = elements.get('dia_a')!;
    const b = elements.get('dia_b')!;
    const grid = elements.get('grid')!;

    const h = cell / 2;
    /** 以 (cx, cy) 为中心画一个半径为 r 的菱形（子路径，可拼接）。 */
    const diamond = (cx: number, cy: number, r: number): string =>
      `M${api.n(cx)} ${api.n(cy - r)}L${api.n(cx + r)} ${api.n(cy)}L${api.n(cx)} ${api.n(cy + r)}L${api.n(cx - r)} ${api.n(cy)}Z`;

    /**
     * 平铺单元 = 2×2 格的「超单元」（边长 2·cell）。
     *
     * ⚠️ 原实现的 bug：B 菱形画在单格的四个角上、每个角独立随机 → 同一个格点上的
     * 菱形被 pattern 裁成四块，各块来自不同的角，拼出来是残片。现在每个 B 菱形是一个
     * 「逻辑格点」，跨边界时在所有对应位置用**同一组偏移**各画一份，裁切后拼回完整菱形。
     */
    const T = cell * 2;
    const marks: string[] = [];

    // A 组：超单元内 4 个格心的描边菱形，构成格纹骨架（合并成一条 path）
    if (a.visible) {
      let d = '';
      for (const [cx, cy] of [
        [h, h],
        [h + cell, h],
        [h, h + cell],
        [h + cell, h + cell],
      ]) {
        d += diamond(cx, cy, h);
      }
      marks.push(path(d, { fill: 'none', stroke: a.paintValue, 'stroke-width': weight, 'stroke-opacity': a.opacity }));
    }

    /**
     * B 组：超单元内 4 个逻辑格点，每个附带它跨边界时的复制位置。
     * 填充率换算成**精确个数**再由 seeded rng 决定点亮哪几个；
     * 另有连续量微偏移保证不同 seed 的产物不可能逐字节相同。
     */
    const lattice: Array<Array<[number, number]>> = [
      [
        [0, 0],
        [T, 0],
        [0, T],
        [T, T],
      ],
      [
        [cell, 0],
        [cell, T],
      ],
      [
        [0, cell],
        [T, cell],
      ],
      [[cell, cell]],
    ];
    const fillCount = Math.round(Math.max(0, Math.min(1, fillRatio)) * lattice.length);
    const order = [0, 1, 2, 3];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    if (b.visible && fillCount > 0) {
      let d = '';
      for (let i = 0; i < fillCount; i++) {
        const ox = (rng() - 0.5) * h * 0.1;
        const oy = (rng() - 0.5) * h * 0.1;
        // 内缩到 0.78：B 菱形与 A 描边之间留一圈呼吸空间，避免边线挤在一起
        for (const [bx, by] of lattice[order[i]]) d += diamond(bx + ox, by + oy, h * 0.78);
      }
      marks.push(path(d, { fill: b.paintValue, 'fill-opacity': b.opacity }));
    }

    // 格线：只画超单元对角线（每 2 格一条，贯穿 A 菱形中心与 B 格点），极淡，只强调结构。
    // 原先每格都画，叠上 A 菱形描边后线距只剩半格，正是细密交叉线的来源。
    if (showGrid && grid.visible) {
      marks.push(
        path(`M0 0L${api.n(T)} ${api.n(T)}M${api.n(T)} 0L0 ${api.n(T)}`, {
          fill: 'none',
          stroke: grid.paintValue,
          'stroke-width': Math.max(0.3, weight * 0.6),
          'stroke-opacity': grid.opacity,
        }),
      );
    }

    const tileRef = api.tile({
      key: `dl-${api.n(cell)}-${api.n(weight)}-${api.n(fillRatio)}-${showGrid ? 1 : 0}`,
      w: T,
      h: T,
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