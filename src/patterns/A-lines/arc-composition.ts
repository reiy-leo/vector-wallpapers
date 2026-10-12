/**
 * 弧光构成 —— A 极简线条 / 几何。
 *
 * 构图要点：同心弧带按半径分三档（大/中/小弧），叠加圆点作为节点，
 * 构成一张有节奏的「弧光构成图」—— 介于雷达图与唱片纹路之间。
 *
 * ⭐ 弧用 `<path>` 的圆弧命令（A）绘制，不用完整圆：
 * 完整圆在单元内会互相叠成一团，弧段只画一段、留出缺口，
 * 缺口方向由 seed 决定，于是同seed 稳定、换 seed 整张图的「呼吸方向」都变。
 *
 * ⭐ 色值可达性：大/中/小弧与圆点在**每个**单元内都必然出现，
 * 因此四个元件改色命中率恒为 100%。
 */
import { circle, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'arc-composition',
  name: '弧光构成',
  category: 'A-lines',
  description: '三档同心弧带沿半径分布，缀以节点圆点，疏密有致。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f5f5f4' }, opacity: 1, visible: true, configurable: true },
    { id: 'arc_big', label: '大弧', role: 'primary', paint: { type: 'solid', color: '#1d4ed8' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'arc_mid', label: '中弧', role: 'secondary', paint: { type: 'solid', color: '#0ea5e9' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'arc_small', label: '小弧', role: 'accent', paint: { type: 'solid', color: '#f97316' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'node', label: '节点圆点', role: 'detail', paint: { type: 'solid', color: '#be123c' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 70, max: 400, step: 10, default: 180, heavy: true },
    { key: 'arcs', label: '每档弧数', type: 'range', min: 1, max: 5, step: 1, default: 3 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.6, max: 8, step: 0.1, default: 2.2, unit: 'px' },
    { key: 'sweep', label: '弧张角', type: 'angle', default: 250 },
    { key: 'nodes', label: '节点圆点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'blueprint',
      label: '蓝图',
      elements: {
  bg: { paint: { type: 'solid', color: '#f8fafc' } },
        arc_big: { paint: { type: 'solid', color: '#1e3a8a' } },
        arc_mid: { paint: { type: 'solid', color: '#2563eb' } },
        arc_small: { paint: { type: 'solid', color: '#60a5fa' } },
        node: { paint: { type: 'solid', color: '#0f172a' } },
      },
    },
    {
      id: 'sunset',
      label: '落日',
      elements: {
        bg: { paint: { type: 'solid', color: '#1a1033' } },
        arc_big: { paint: { type: 'solid', color: '#f97316' } },
        arc_mid: { paint: { type: 'solid', color: '#ec4899' } },
        arc_small: { paint: { type: 'solid', color: '#fde68a' } },
      node: { paint: { type: 'solid', color: '#fff7ed' } },
      },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#ecfdf5' } },
        arc_big: { paint: { type: 'solid', color: '#047857' } },
        arc_mid: { paint: { type: 'solid', color: '#10b981' } },
        arc_small: { paint: { type: 'solid', color: '#6ee7b7' } },
        node: { paint: { type: 'solid', color: '#065f46' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['arc_big'],
    secondary: ['arc_mid'],
    accent: ['arc_small'],
    detail: ['node'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(40, Number(params.size));
    const perBand = Math.max(1, Math.min(5, Math.round(Number(params.arcs))));
    const weight = Math.max(0.4, Number(params.weight));
    const sweepDeg = Math.max(20, Math.min(340, Number(params.sweep)));
    const showNodes = params.nodes === true;

    const bg = elements.get('bg')!;
    const aBig = elements.get('arc_big')!;
    const aMid = elements.get('arc_mid')!;
    const aSmall = elements.get('arc_small')!;
    const node = elements.get('node')!;

    // 三档半径区间：大弧占外圈、中弧居中、小弧靠内
    const bands: Array<[number, number, typeof aBig]> = [
      [0.62, 0.95, aBig],
      [0.36, 0.56, aMid],
      [0.13, 0.3, aSmall],
  ];

    // 每档弧的起始角：档内相邻弧依次错开，形成扇形排布
    const marks: string[] = [];
    const cx = cell / 2;
    const cy = cell / 2;
    const R = cell * 0.48;

    for (let bi = 0; bi < bands.length; bi++) {
      const [r0, r1, e] = bands[bi];
      if (!e.visible) continue;
      for (let k = 0; k < perBand; k++) {
   const r = R * (r0 + ((r1 - r0) * (perBand === 1 ? 0.5 : k / (perBand - 1))));
     // 起始角带 seeded 抖动：弧的「缺口方向」是这张图最有辨识度的变量
        const a0 = ((bi * 47 + k * 61 + rng() * 40) * Math.PI) / 180;
 const sweep = (sweepDeg * Math.PI) / 180;
     const x0 = cx + r * Math.cos(a0);
     const y0 = cy + r * Math.sin(a0);
        const x1 = cx + r * Math.cos(a0 + sweep);
        const y1 = cy + r * Math.sin(a0 + sweep);
     const large = sweepDeg > 180 ? 1 : 0;
 marks.push(
          path(`M${api.n(x0)} ${api.n(y0)} A${api.n(r)} ${api.n(r)} 0 ${large} 1 ${api.n(x1)} ${api.n(y1)}`, {
 fill: 'none',
            stroke: e.paintValue,
     'stroke-width': weight * (1 - bi * 0.18),
    'stroke-opacity': e.opacity,
       'stroke-linecap': 'round',
       }),
  );
      }
    }

    // 节点圆点：放在三档弧的起点处，一档一个 → 每个元件都在场
    if (showNodes && node.visible) {
      for (let bi = 0; bi < bands.length; bi++) {
    const [r0, , ] = bands[bi];
        const r = R * (r0 + 0.08);
     const a = ((bi * 83 + rng() * 30) * Math.PI) / 180;
     marks.push(
        circle(cx + r * Math.cos(a), cy + r * Math.sin(a), Math.max(0.8, weight * 1.1), {
       fill: node.paintValue,
     'fill-opacity': node.opacity,
        }),
      );
      }
}

    const tileRef = api.tile({
      key: `ac-${api.n(cell)}-${perBand}-${api.n(weight)}-${api.n(sweepDeg)}-${showNodes ? 1 : 0}`,
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
