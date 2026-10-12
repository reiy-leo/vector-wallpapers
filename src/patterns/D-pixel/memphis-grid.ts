/**
 * 孟菲斯网格 —— D 像素 / 复古游戏。
 *
 * 构图要点：每个网格单元内随机落位 1~2 个孟菲斯元素（波浪线 / 锯齿 / 圆点 / 三角 / 方块）。
 * 全部走<pattern> 平铺 —— 网格数 40 时若逐单元绘制将有数千个节点。
 *
 * ⚠️ 像素风铁律：禁止 <text>（字体依赖破坏导出纯净度），
 * 一切图形用 <rect>/<path>/<circle>/<polygon> 拼。
 * 根 <svg> 的 shape-rendering="crispEdges" 由引擎按 category 自动注入。
 */
import { circle, g, path, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'memphis-grid',
  name: '孟菲斯网格',
  category: 'D-pixel',
  description: '80 年代孟菲斯风：波浪线、锯齿、圆点、三角与方块在网格中自由落位。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#fdf6e9' }, opacity: 1, visible: true, configurable: true },
    { id: 'wave', label: '波浪线', role: 'primary', paint: { type: 'solid', color: '#00b3d6' }, opacity: 1, visible: true, configurable: true },
    { id: 'zigzag', label: '锯齿', role: 'secondary', paint: { type: 'solid', color: '#f2529b' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot', label: '圆点', role: 'accent', paint: { type: 'solid', color: '#ffd23e' }, opacity: 1, visible: true, configurable: true },
    { id: 'tri', label: '三角', role: 'primary', paint: { type: 'solid', color: '#2ec4b6' }, opacity: 1, visible: true, configurable: true },
    { id: 'block', label: '方块', role: 'secondary', paint: { type: 'solid', color: '#5c4d9c' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'gridN', label: '网格数', type: 'range', min: 4, max: 24, step: 1, default: 8, heavy: true },
    // 默认 0.35：QA 按「cell 内 shape 外接面积占比」实测，0.45 时覆盖 75.5%
    // ——形与形几乎不留空隙，视觉从「跳跃」变成「糊」；0.35 时覆盖 45.7%，
    // 留白充足仍可读，更贴近孟菲斯原作的大面积留白。
    { key: 'size', label: '元件尺寸', type: 'range', min: 0.2, max: 0.8, step: 0.01, default: 0.35 },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
    // 5 种基础元件恒定出现（保证可配色），extra 控制额外叠加几个随机元件。
    // 注意：extra=0 也依然 seed 敏感 —— 5 个固定落位各自带 seed 抖动，
    // 因此不存在「某个参数值会让『换一版』失效」的盲区。
    { key: 'extra', label: '额外随机元件', type: 'range', min: 0, max: 4, step: 1, default: 2 },
  ],

  presets: [
    {
      id: 'classic',
      label: '经典孟菲斯',
      elements: {
        bg: { paint: { type: 'solid', color: '#fff8e7' } },
        wave: { paint: { type: 'solid', color: '#00b4d8' } },
        zigzag: { paint: { type: 'solid', color: '#f15bb5' } },
        dot: { paint: { type: 'solid', color: '#fee440' } },
        tri: { paint: { type: 'solid', color: '#00c2a8' } },
        block: { paint: { type: 'solid', color: '#6a4c93' } },
      },
    },
    {
      id: 'pastel',
      label: '柔和',
      elements: {
        bg: { paint: { type: 'solid', color: '#fdf2f8' } },
        wave: { paint: { type: 'solid', color: '#a5b4fc' } },
        zigzag: { paint: { type: 'solid', color: '#fda4af' } },
        dot: { paint: { type: 'solid', color: '#fde68a' } },
        tri: { paint: { type: 'solid', color: '#99f6e4' } },
        block: { paint: { type: 'solid', color: '#c4b5fd' } },
      },
    },
    {
      id: 'night',
      label: '夜间',
      elements: {
        bg: { paint: { type: 'solid', color: '#18181b' } },
        wave: { paint: { type: 'solid', color: '#22d3ee' } },
        zigzag: { paint: { type: 'solid', color: '#e879f9' } },
        dot: { paint: { type: 'solid', color: '#facc15' } },
        tri: { paint: { type: 'solid', color: '#4ade80' } },
        block: { paint: { type: 'solid', color: '#fb7185' } },
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
    const gridN = Math.max(2, Math.round(Number(params.gridN)));
    const size = Number(params.size);
    const rotate = Number(params.rotate);
    const extra = Math.max(0, Math.min(4, Math.round(Number(params.extra))));

    const bg = elements.get('bg')!;
    const wave = elements.get('wave')!;
    const zigzag = elements.get('zigzag')!;
    const dot = elements.get('dot')!;
    const tri = elements.get('tri')!;
    const block = elements.get('block')!;

    const cell = Math.min(W, H) / gridN;
    const s = cell * size * 0.5;

    /** 波浪线：上下两条对称正弦。 */
    const wavePath = (cx: number, cy: number): string => {
      const segs = 6;
      let top = `M${api.n(cx - s)} ${api.n(cy)}`;
      let bottom = `M${api.n(cx - s)} ${api.n(cy)}`;
      for (let i = 1; i <= segs; i++) {
        const u = i / segs;
        const x = cx - s + 2 * s * u;
        const y = Math.sin(u * Math.PI * segs) * s * 0.4;
        top += ` L${api.n(x)} ${api.n(cy + y)}`;
        bottom = ` L${api.n(x)} ${api.n(cy - y)}${bottom.slice(bottom.indexOf('L') + 1)}`;
      }
      return `${top} L${api.n(cx + s)} ${api.n(cy)} L${api.n(cx - s)} ${api.n(cy)} Z`;
    };

    /** 锯齿：三角波折线。 */
    const zigPath = (cx: number, cy: number): string => {
      const teeth = 4;
      let d = `M${api.n(cx - s)} ${api.n(cy + s)}`;
      for (let i = 0; i < teeth; i++) {
        d += ` L${api.n(cx - s + ((2 * s) / teeth) * (i + 0.5))} ${api.n(cy - s)}`;
        d += ` L${api.n(cx - s + ((2 * s) / teeth) * (i + 1))} ${api.n(cy + s)}`;
      }
      return `${d} Z`;
    };

        const shapes: string[] = [];

    /**
     * 绘制一种元件。抽出来是为了让「保证位」与「随机位」共用同一套绘制逻辑。
     * @param kind 0=wave 1=zigzag 2=dot 3=tri 4=block
     */
    const drawKind = (kind: number, cx: number, cy: number): void => {
      switch (kind) {
        case 0:
          if (wave.visible) shapes.push(path(wavePath(cx, cy), { fill: wave.paintValue, 'fill-opacity': wave.opacity }));
          break;
        case 1:
          if (zigzag.visible) shapes.push(path(zigPath(cx, cy), { fill: zigzag.paintValue, 'fill-opacity': zigzag.opacity }));
          break;
        case 2:
          if (dot.visible) shapes.push(circle(cx, cy, s * 0.8, { fill: dot.paintValue, 'fill-opacity': dot.opacity }));
          break;
        case 3:
          if (tri.visible) {
            shapes.push(
              polygon(
                [
                  [cx, cy - s],
                  [cx + s, cy + s],
                  [cx - s, cy + s],
                ],
                { fill: tri.paintValue, 'fill-opacity': tri.opacity },
              ),
            );
          }
          break;
        default:
          if (block.visible) {
            shapes.push(
              rect(cx - s * 0.85, cy - s * 0.85, s * 1.7, s * 1.7, {
                fill: block.paintValue,
                'fill-opacity': block.opacity,
              }),
            );
          }
          break;
      }
    };

    /**
     * 单元内**先摆满 5 种元件各一个**，再叠加 `extra` 个随机元件。
     *
     * 为什么必须这样：原先一个 tile 只画 2 个、且种类随机，
     * 于是在 200 个 seed 里每种元件只有 24~43% 的命中率 ——
     * 面板列了 6 行，用户改任一行却有 60~76% 概率看不到任何变化。
     * 平铺会把单元内容复制到全屏，所以「单元内覆盖全部 5 种」
     * 等价于「屏幕上 5 种必然共存」，这是元件级配色的底线。
     */
    const KINDS = 5;
    // 5 个固定落位排成梅花形，视觉上是有意的构成而非随机堆砌
    const anchors: Array<[number, number]> = [
      [0.28, 0.28],
      [0.72, 0.3],
      [0.3, 0.72],
      [0.72, 0.72],
      [0.5, 0.5],
    ];
    /**
     * 固定落位也吃 seed：给每个锚点加一个**微小**的抖动。
     *
     * 为什么必须这样：锚点是常量，于是 `extra=0` 时全pattern 没有任何 rng() 调用，
     * seed 完全失效 —— 用户点「换一版」画面纹丝不动，但 seedable 仍亮着。
     * 声明 seedable 就该在任何参数下都成立，抖动幅度（±7% 格距）远小于
     * 形状尺寸，既避免了「换seed 没变化」的自相矛盾，视觉上也只是细微差别。
     */
    for (let k = 0; k < KINDS; k++) {
      const [ax, ay] = anchors[k];
      const jx = (rng() - 0.5) * 0.14;
      const jy = (rng() - 0.5) * 0.14;
      // 固定位用满尺寸；中心位略小一点，避免与四角糊成一团
      const shrink = k === 4 ? 0.72 : 1;
      drawKind(k, cell * (ax + jx), cell * (ay + jy) * shrink + cell * 0.5 * (1 - shrink));
    }

    // 额外随机元件：制造「不呆板」的节奏变化
    for (let i = 0; i < extra; i++) {
      // 落点偏向单元中心区域，避免溢出相邻单元
      const cx = cell * 0.5 + (rng() - 0.5) * cell * 0.4;
      const cy = cell * 0.5 + (rng() - 0.5) * cell * 0.4;
      drawKind(Math.floor(rng() * KINDS), cx, cy);
    }

    const tileRef = api.tile({
      key: `mg-${api.n(cell)}-${api.n(s)}-${api.n(rotate)}-${extra}`,
      w: cell,
      h: cell,
      content: g({}, shapes.join('')),
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