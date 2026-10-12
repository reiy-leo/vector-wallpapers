/**
 * 等距体素 —— D 像素 / 复古游戏。
 *
 * 构图要点：30° 轴测投影下的立方体堆叠。
 * 与 `pixel-terrain` 的本质区别（`STYLE-100-ANALYSIS.md` §4.2）：
 *  - `pixel-terrain` 是**2D 像素高度场**（正视图，逐列高度）
 *  - 本母题是**轴测立方体**（顶面 + 左面 + 右手面三个可见面）
 * 投影机制与数据结构都不同，不是同一母题的换色。
 *
 * 轴测投影：世界坐标 (x, y, z) → 屏幕 (x−y)·cos30, (x+y)·sin30 − z
 *
 * ⭐ 节点控制：立方体数 = 高宽深三者组合，必须走 <pattern>，
 * 否则「体素数量」参数一拉就破 60 节点上限。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'isometric-voxel',
  name: '等距体素',
  category: 'D-pixel',
  description: '30 度轴测投影的立方体堆叠，立体像素地形，玩具般的几何感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1b2438' }, opacity: 1, visible: true, configurable: true },
    { id: 'top', label: '顶面', role: 'primary', paint: { type: 'solid', color: '#7fd1ae' }, opacity: 1, visible: true, configurable: true },
    { id: 'left', label: '左面', role: 'secondary', paint: { type: 'solid', color: '#4a7fa8' }, opacity: 1, visible: true, configurable: true },
    { id: 'right', label: '右面', role: 'accent', paint: { type: 'solid', color: '#2d4f6e' }, opacity: 1, visible: true, configurable: true },
    { id: 'shadow', label: '阴影面', role: 'detail', paint: { type: 'solid', color: '#0d1420' }, opacity: 0.55, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '体素尺寸', type: 'range', min: 14, max: 90, step: 2, default: 38, heavy: true },
    { key: 'height', label: '堆叠高度', type: 'range', min: 1, max: 6, step: 1, default: 3 },
    { key: 'density', label: '生成密度', type: 'range', min: 0.2, max: 0.9, step: 0.05, default: 0.55 },
    { key: 'shadows', label: '阴影面', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'meadow',
      label: '草地',
      elements: {
        bg: { paint: { type: 'solid', color: '#1b2438' } },
        top: { paint: { type: 'solid', color: '#7fd1ae' } },
        left: { paint: { type: 'solid', color: '#4a7fa8' } },
        right: { paint: { type: 'solid', color: '#2d4f6e' } },
        shadow: { paint: { type: 'solid', color: '#0d1420' } },
      },
    },
    {
      id: 'desert',
      label: '荒漠',
      elements: {
        bg: { paint: { type: 'solid', color: '#3b2416' } },
        top: { paint: { type: 'solid', color: '#e8c07d' } },
        left: { paint: { type: 'solid', color: '#b4763c' } },
        right: { paint: { type: 'solid', color: '#7a4a24' } },
        shadow: { paint: { type: 'solid', color: '#2a170c' } },
      },
    },
    {
      id: 'frost',
      label: '霜原',
      elements: {
        bg: { paint: { type: 'solid', color: '#141c2e' } },
        top: { paint: { type: 'solid', color: '#dbeafe' } },
        left: { paint: { type: 'solid', color: '#7fa8d8' } },
        right: { paint: { type: 'solid', color: '#41618f' } },
        shadow: { paint: { type: 'solid', color: '#0a0f1c' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['top'],
    secondary: ['left'],
    accent: ['right'],
    detail: ['shadow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const size = Math.max(14, Number(params.size));
    const maxH = Math.round(Math.max(1, Math.min(6, Number(params.height))));
    const density = Math.max(0.2, Math.min(0.9, Number(params.density)));
    const showShadow = params.shadows === true;

    const bg = elements.get('bg')!;
    const top = elements.get('top')!;
    const left = elements.get('left')!;
    const right = elements.get('right')!;
    const shadow = elements.get('shadow')!;

    const COS30 = Math.cos(Math.PI / 6);
    const SIN30 = Math.sin(Math.PI / 6);

    /** 单个立方体：底面中心 (gx, gy) 为地面锚点，高 h 层。 */
    const cube = (gx: number, gy: number, h: number): string => {
      const s = size;
      // 轴测：地面菱形的四个顶点
      const p = {
        top: [gx, gy - h * s * SIN30 - s * 0.5],
        right: [gx + s * COS30, gy - h * s * SIN30 + s * 0.25],
        bottom: [gx, gy - h * s * SIN30 + s],
        left: [gx - s * COS30, gy - h * s * SIN30 + s * 0.25],
      };
      const lift = h * s * SIN30;

      const out: string[] = [];

      // 右侧面（从 right 顶点到 bottom，带高度）
      if (right.visible) {
        out.push(
          path(
            `M${api.n(p.right[0])} ${api.n(p.right[1])}` +
              ` L${api.n(p.bottom[0])} ${api.n(p.bottom[1])}` +
              ` L${api.n(p.bottom[0])} ${api.n(p.bottom[1] + lift)}` +
              ` L${api.n(p.right[0])} ${api.n(p.right[1] + lift)} Z`,
            { fill: right.paintValue, 'fill-opacity': right.opacity },
          ),
        );
      }
      // 左侧面
      if (left.visible) {
        out.push(
          path(
            `M${api.n(p.left[0])} ${api.n(p.left[1])}` +
              ` L${api.n(p.bottom[0])} ${api.n(p.bottom[1])}` +
              ` L${api.n(p.bottom[0])} ${api.n(p.bottom[1] + lift)}` +
              ` L${api.n(p.left[0])} ${api.n(p.left[1] + lift)} Z`,
            { fill: left.paintValue, 'fill-opacity': left.opacity },
          ),
        );
      }
      // 顶面（菱形）
      if (top.visible) {
        out.push(
          path(
            `M${api.n(p.top[0])} ${api.n(p.top[1] - lift)}` +
              ` L${api.n(p.right[0])} ${api.n(p.right[1] - lift)}` +
              ` L${api.n(p.bottom[0])} ${api.n(p.bottom[1] - lift)}` +
              ` L${api.n(p.left[0])} ${api.n(p.left[1] - lift)} Z`,
            { fill: top.paintValue, 'fill-opacity': top.opacity },
          ),
        );
      }
      return out.join('');
    };

    /*
     * 平铺单元：3×3 根柱，高度由 seeded rng 决定。
     *
     * ⚠️ 随机量必须在进 tile 前抽完（与 papercut 同理），
     * 否则单元内容每次渲染都变，defs 去重会失效且无法复现。
     */
    const N = 3;
    const heights: number[] = [];
    for (let i = 0; i < N * N; i++) {
      heights.push(rng() < density ? 1 + Math.floor(rng() * maxH) : 0);
    }

    const marks: string[] = [];
    const spanX = size * COS30 * N * 1.5;
    const originX = spanX / 2;
    const originY = size * SIN30 * N * 2;

    // 由后向前绘制：靠下的柱子先画，靠后的柱子后画 → 正确遮挡
    for (let gy = 0; gy < N; gy++) {
      for (let gx = 0; gx < N; gx++) {
        const h = heights[gy * N + gx];
        if (h <= 0) continue;
        const px = originX + (gx - gy) * size * COS30;
        const py = originY + (gx + gy) * size * SIN30;
        // 地面阴影垫底
        if (showShadow && shadow.visible) {
          marks.push(
            path(
              `M${api.n(px - size * COS30)} ${api.n(py + size * 0.25)}` +
                ` L${api.n(px)} ${api.n(py - size * 0.5)}` +
                ` L${api.n(px + size * COS30)} ${api.n(py + size * 0.25)}` +
                ` L${api.n(px)} ${api.n(py + size)} Z`,
              { fill: shadow.paintValue, 'fill-opacity': shadow.opacity * 0.5 },
            ),
          );
        }
        marks.push(cube(px, py, h));
      }
    }

    const tileRef = api.tile({
      key: `ivx-${api.n(size)}-${maxH}-${api.n(density)}-${showShadow ? 1 : 0}`,
      w: spanX,
      h: originY + size * 1.5,
      content: g({}, marks.join('')),
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
