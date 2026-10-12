/**
 * 六边形网格 —— B 波点 / 网格重复。
 *
 * 构图要点：正六边形描边网格 + 按填充率随机填充部分单元。
 * 蜂窝平铺的「错位」由单元内容偏移半个高度实现，因此单元高度 = 2 × 行高。
 *
 * ⭐ 必须 tile：网格密度拉到 40 时若逐个画，六边形数量会突破千级。
 */
import { circle, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'hex-grid',
  name: '六边形网格',
  category: 'B-repeat',
  description: '蜂窝状六边形网格，按填充率点亮部分单元，科技感秩序。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0e1116' }, opacity: 1, visible: true, configurable: true },
    { id: 'line', label: '网格线', role: 'secondary', paint: { type: 'solid', color: '#4b5563' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'fill', label: '填充六边形', role: 'primary', paint: { type: 'solid', color: '#22d3ee' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'dot', label: '节点圆点', role: 'accent', paint: { type: 'solid', color: '#f472b6' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '边长', type: 'range', min: 10, max: 120, step: 2, default: 34, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 5, step: 0.1, default: 1.3, unit: 'px' },
    { key: 'ratio', label: '填充率', type: 'range', min: 0, max: 1, step: 0.01, default: 0.32 },
    { key: 'nodes', label: '节点圆点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'cyber',
      label: '赛博',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b0f14' } },
        line: { paint: { type: 'solid', color: '#334155' } },
        fill: { paint: { type: 'solid', color: '#06b6d4' } },
        dot: { paint: { type: 'solid', color: '#f0abfc' } },
      },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#f0fdf4' } },
        line: { paint: { type: 'solid', color: '#86efac' } },
        fill: { paint: { type: 'solid', color: '#059669' } },
        dot: { paint: { type: 'solid', color: '#065f46' } },
      },
    },
    {
      id: 'amber',
      label: '琥珀',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c1408' } },
        line: { paint: { type: 'solid', color: '#78350f' } },
        fill: { paint: { type: 'solid', color: '#f59e0b' } },
        dot: { paint: { type: 'solid', color: '#fde68a' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], secondary: ['line'], primary: ['fill'], accent: ['dot'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const s = Math.max(4, Number(params.size));
    const weight = Number(params.weight);
    const ratio = Number(params.ratio);
    const showNodes = params.nodes === true;

    const bg = elements.get('bg')!;
    const line = elements.get('line')!;
    const fill = elements.get('fill')!;
    const dot = elements.get('dot')!;

    // 平铺六边形（尖角朝上）：外接矩形宽 √3·s、高 3s，两行错位半格
    const hexW = Math.sqrt(3) * s;
    const rowH = s * 1.5;
    const tileH = rowH * 2;
    const R = (Math.sqrt(3) / 2) * s;

    /** 以 (cx, cy) 为中心画一个尖角朝上的正六边形。 */
    const hexPath = (cx: number, cy: number): string => {
      const pts: string[] = [];
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i - 90);
        pts.push(`${api.n(cx + R * Math.cos(ang))},${api.n(cy + R * Math.sin(ang))}`);
      }
      return `M${pts[0]} L${pts[1]} L${pts[2]} L${pts[3]} L${pts[4]} L${pts[5]} Z`;
    };

    const marks: string[] = [];

    // 平铺单元内的 3 个六边形中心（蜂窝咬合：下沿两个各被切成两半，
    // 与相邻单元的另一半拼成完整六边形）
    const spots: Array<[number, number]> = [
      [R, rowH],
      [0, 0],
      [0, tileH],
    ];

    for (const [cx, cy] of spots) {
      marks.push(
        path(hexPath(cx, cy), {
          fill: 'none',
          stroke: line.paintValue,
          'stroke-width': weight,
          'stroke-opacity': line.opacity,
        }),
      );
    }

    // 填充率 → **精确个数**的填充单元，再用seeded rng 决定填哪几个。
    // 之所以不用「每个格独立掷骰子」：那样填充率只是概率期望，
    // 两个不同 seed 可能碰巧得到同一张图，破坏「换 seed 必得新变体」的契约。
    const fillCount = Math.round(Math.max(0, Math.min(1, ratio)) * spots.length);
    const order = [0, 1, 2];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (let i = 0; i < fillCount; i++) {
      const [bx, by] = spots[order[i]];
      // 连续量微偏移：打乱顺序只决定「填哪几格」（离散，碰撞率约 1/3），
      // 微偏移则保证任何两个不同 seed 的产物都不可能逐字节相同。
      // 偏移幅度远小于格距，视觉上只是细微差别，网格秩序不受影响。
      const cx = bx + (rng() - 0.5) * R * 0.4;
      const cy = by + (rng() - 0.5) * R * 0.4;
      if (fill.visible) {
        marks.push(path(hexPath(cx, cy), { fill: fill.paintValue, 'fill-opacity': fill.opacity }));
      }
      // 节点圆点跟随第一个被填充的单元，让 accent 也随 seed 变化
      if (i === 0 && showNodes && dot.visible) {
        marks.push(circle(cx, cy, Math.max(0.6, s * 0.12), { fill: dot.paintValue, 'fill-opacity': dot.opacity }));
      }
    }

    const tileRef = api.tile({
      key: `hg-${api.n(s)}-${api.n(weight)}`,
      w: hexW,
      h: tileH,
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