/**
 * 孟菲斯网格 —— D 像素 / 复古游戏。
 *
 * 构图要点：孟菲斯元素（波浪线 / 锯齿 / 圆点 / 三角 / 方块）疏朗散落、各自随机旋转。
 * 全部走 <pattern> 平铺 —— 体积与屏幕大小无关。
 *
 * ⚠️ 像素风铁律：禁止 <text>（字体依赖破坏导出纯净度），
 * 一切图形用 <rect>/<path>/<circle>/<polygon> 拼。
 * 根 <svg> 的 shape-rendering="crispEdges" 由引擎按 category 自动注入。
 *
 * 2026-10-12 审美返修：旧版每个小单元塞 5~9 个形 → 密密麻麻的小贴纸网格。
 * 现在一个 <pattern> 超级单元 = 6×6 个大落位格，只有约一半格子放一个形，
 * 位置在格内 seeded 游走、每个形 seeded 旋转，大面积留白；
 * 超级单元边长 ≈ 短边 × 1.2，肉眼看不出平铺周期。
 * 形的内部关闭 crispEdges（geometricPrecision），曲线与斜边不再锯齿。
 */
import { circle, g, path, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'memphis-grid',
  name: '孟菲斯网格',
  category: 'D-pixel',
  description: '80 年代孟菲斯风：波浪线、锯齿、圆点、三角与方块疏朗散落、随机旋转，大面积留白。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f6f0e4' }, opacity: 1, visible: true, configurable: true },
    { id: 'wave', label: '波浪线', role: 'primary', paint: { type: 'solid', color: '#4f9bb0' }, opacity: 1, visible: true, configurable: true },
    { id: 'zigzag', label: '锯齿', role: 'secondary', paint: { type: 'solid', color: '#de8a9c' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot', label: '圆点', role: 'accent', paint: { type: 'solid', color: '#ecc35e' }, opacity: 1, visible: true, configurable: true },
    { id: 'tri', label: '三角', role: 'primary', paint: { type: 'solid', color: '#6db4a0' }, opacity: 1, visible: true, configurable: true },
    { id: 'block', label: '方块', role: 'secondary', paint: { type: 'solid', color: '#6e639c' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    // 网格数 = 短边方向上的落位格数（每格至多一个形）。默认 5 → 每格约 290px @1440。
    { key: 'gridN', label: '网格数', type: 'range', min: 3, max: 10, step: 1, default: 5, heavy: true },
    // 形相对落位格的大小；0.5 时形约占格宽一半，仍留白充足
    { key: 'size', label: '元件尺寸', type: 'range', min: 0.2, max: 0.7, step: 0.01, default: 0.5 },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
    // 5 种基础元件恒定出现（保证可配色），extra 每档多填 3 个格子（默认 2 → 36 格填 18 个）
    { key: 'extra', label: '额外随机元件', type: 'range', min: 0, max: 4, step: 1, default: 2 },
  ],

  presets: [
    {
      id: 'classic',
      label: '经典孟菲斯',
      elements: {
        bg: { paint: { type: 'solid', color: '#fbf5e8' } },
        wave: { paint: { type: 'solid', color: '#3aa0c0' } },
        zigzag: { paint: { type: 'solid', color: '#e2729b' } },
        dot: { paint: { type: 'solid', color: '#f2cf4a' } },
        tri: { paint: { type: 'solid', color: '#3fb39e' } },
        block: { paint: { type: 'solid', color: '#5e4b8e' } },
      },
    },
    {
      id: 'pastel',
      label: '柔和',
      elements: {
        bg: { paint: { type: 'solid', color: '#fbf3f4' } },
        wave: { paint: { type: 'solid', color: '#a7b3e0' } },
        zigzag: { paint: { type: 'solid', color: '#f0afb6' } },
        dot: { paint: { type: 'solid', color: '#f3dc9a' } },
        tri: { paint: { type: 'solid', color: '#a8dccf' } },
        block: { paint: { type: 'solid', color: '#c7b9e6' } },
      },
    },
    {
      id: 'night',
      label: '夜间',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1d24' } },
        wave: { paint: { type: 'solid', color: '#5fb3c9' } },
        zigzag: { paint: { type: 'solid', color: '#c98bc9' } },
        dot: { paint: { type: 'solid', color: '#e3c25a' } },
        tri: { paint: { type: 'solid', color: '#6fbf92' } },
        block: { paint: { type: 'solid', color: '#d98590' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['wave', 'tri'],
    secondary: ['zigzag', 'block'],
    accent: ['dot'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const gridN = Math.max(2, Math.min(10, Math.round(Number(params.gridN))));
    const size = Math.max(0.1, Math.min(0.8, Number(params.size)));
    const rotate = Number(params.rotate);
    const extra = Math.max(0, Math.min(4, Math.round(Number(params.extra))));

    const bg = elements.get('bg')!;
    const KIND_ELS = [
      elements.get('wave')!,
      elements.get('zigzag')!,
      elements.get('dot')!,
      elements.get('tri')!,
      elements.get('block')!,
    ];

    const cell = Math.min(W, H) / gridN; // 落位格
    const N = 6; // 超级单元 = N×N 落位格（边长 ≈ 短边 × 1.2）
    const S = cell * N;
    const s = cell * size * 0.5; // 形的半尺寸
    const n = api.n;

    /** 波浪线：描边正弦（经典孟菲斯「弹簧线」），圆头。以原点为中心。 */
    const wavePath = (): string => {
      const segs = 3;
      const step = (2 * s) / segs;
      let d = `M${n(-s)} 0`;
      for (let i = 0; i < segs; i++) {
        const x = -s + step * i;
        const dy = (i % 2 === 0 ? -1 : 1) * s * 0.45;
        d += `Q${n(x + step / 2)} ${n(dy * 2)} ${n(x + step)} 0`;
      }
      return d;
    };
    /** 锯齿：描边折线。以原点为中心。 */
    const zigPath = (): string => {
      const teeth = 3;
      const step = (2 * s) / teeth;
      let d = `M${n(-s)} ${n(s * 0.4)}`;
      for (let i = 0; i < teeth; i++) {
        d += `L${n(-s + step * (i + 0.5))} ${n(-s * 0.4)}L${n(-s + step * (i + 1))} ${n(s * 0.4)}`;
      }
      return d;
    };
    const lineW = Math.max(1, s * 0.16);

    /** 以原点为中心画第 kind 种形（外层 <g> 负责平移 + 旋转）。 */
    const shapeOf = (kind: number): string => {
      const e = KIND_ELS[kind];
      switch (kind) {
        case 0:
          return path(wavePath(), {
            fill: 'none',
            stroke: e.paintValue,
            'stroke-width': lineW,
            'stroke-linecap': 'round',
            'stroke-opacity': e.opacity,
          });
        case 1:
          return path(zigPath(), {
            fill: 'none',
            stroke: e.paintValue,
            'stroke-width': lineW,
            'stroke-linejoin': 'round',
            'stroke-linecap': 'round',
            'stroke-opacity': e.opacity,
          });
        case 2: {
          // 圆点：实心圆 + 一圈同色细环（孟菲斯常见的「靶点」），只占一个形的体积
          return g(
            {},
            circle(0, 0, s * 0.55, { fill: e.paintValue, 'fill-opacity': e.opacity }) +
              circle(0, 0, s * 0.85, {
                fill: 'none',
                stroke: e.paintValue,
                'stroke-width': Math.max(1, s * 0.08),
                'stroke-opacity': e.opacity,
              }),
          );
        }
        case 3:
          return polygon(
            [
              [0, -s * 0.9],
              [s * 0.85, s * 0.6],
              [-s * 0.85, s * 0.6],
            ],
            { fill: e.paintValue, 'fill-opacity': e.opacity },
          );
        default:
          return rect(-s * 0.7, -s * 0.7, s * 1.4, s * 1.4, { fill: e.paintValue, 'fill-opacity': e.opacity });
      }
    };

    /**
     * 落位：N×N 格洗牌后取前 count 个格子各放一个形。
     * 前 5 个格子依次放 5 种元件（屏幕上 5 种必然共存 → 元件级配色命中率 100%，
     * 这是 memphis 旧 bug 的教训），其余格子随机种类。
     * 位置在格内游走（不越出格 → 不被 <pattern> 边界裁切、形与形不重叠），旋转全随机。
     */
    const order = Array.from({ length: N * N }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const count = Math.min(N * N, 5 + 7 + extra * 3); // 默认 18/36 格 → 一半留白
    const room = Math.max(0, cell / 2 - s * 1.05); // 游走余量

    const shapes: string[] = [];
    for (let k = 0; k < count; k++) {
      const idx = order[k];
      const kind = k < 5 ? k : Math.floor(rng() * 5);
      const cx = (idx % N) * cell + cell / 2 + (rng() * 2 - 1) * room;
      const cy = Math.floor(idx / N) * cell + cell / 2 + (rng() * 2 - 1) * room;
      const ang = Math.round(rng() * 360);
      if (!KIND_ELS[kind].visible) continue;
      shapes.push(g({ transform: `translate(${n(cx)} ${n(cy)}) rotate(${ang})` }, shapeOf(kind)));
    }

    const tileRef = api.tile({
      key: `mg-${n(cell)}-${n(s)}-${n(rotate)}-${extra}`,
      w: S,
      h: S,
      // 曲线 / 斜边需要抗锯齿：在形的容器上覆盖根节点继承来的 crispEdges
      content: g({ 'shape-rendering': 'geometricPrecision' }, shapes.join('')),
      transform: rotate === 0 ? undefined : `rotate(${n(rotate)})`,
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