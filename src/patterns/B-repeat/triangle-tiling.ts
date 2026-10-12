/**
 * 三角铺排 —— B 波点 / 网格重复。
 *
 * 构图要点：等边三角形的经典密铺 —— 上、下三角交替，相邻三角共享斜边。
 * 密铺能成立的关键是**平铺单元取 2×2 个三角**（宽 2w、高 2h，h = w·√3/2）：
 * 单元上半是两个「下三角」、下半是两个「上三角」，面积恰好 2wh = 单元面积，
 * 因此四边形无缝、无需裁剪。
 *
 * ⭐ tile 的必要性：三角形数量随密度平方增长，逐个画必然突破节点红线。
 *
 * ⭐ 色值可达性：上/下三角在**每个**单元内各出现 2 个，
 * 因此两个元件的改色命中率恒为 100%，与参数、seed 无关。
 * 种子只影响 `stud` 小圆的微偏移 —— 那才是「换一版」真正变化的来源。
 */
import { circle, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'triangle-tiling',
  name: '三角铺排',
  category: 'B-repeat',
  description: '等边三角形密铺，上下三角交替咬合，低对比面片缀以稀疏小圆点。',
  seedable: true,
  animatable: false,

  elements: [
    // 2026-10-12 审美复核：原默认粉/青/黑 56px 小三角 + 几何错误（同一行三角同向、
    // 顶点越界）在全屏上呈现为细横条纹 + 摩尔纹。现修正为真正的上下交替密铺，
    // 三角放大，默认改为同色系低饱和（暖砂 / 陶土灰）。
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#e9e2d8' }, opacity: 1, visible: true, configurable: true },
    { id: 'tri_up', label: '上三角', role: 'primary', paint: { type: 'solid', color: '#ddcfc1' }, opacity: 1, visible: true, configurable: true },
    { id: 'tri_down', label: '下三角', role: 'secondary', paint: { type: 'solid', color: '#efe8de' }, opacity: 1, visible: true, configurable: true },
    { id: 'stud', label: '节点圆点', role: 'accent', paint: { type: 'solid', color: '#b07c64' }, opacity: 0.8, visible: true, configurable: true },
  ],

  controls: [
    // size 以 1080p 短边为基准，渲染时乘 unit = 短边/1080（2560×1440 下 ×1.33）
    { key: 'size', label: '三角边长', type: 'range', min: 40, max: 320, step: 2, default: 150, heavy: true },
    { key: 'grout', label: '间隙', type: 'range', min: 0, max: 0.32, step: 0.01, default: 0.03 },
    { key: 'studSize', label: '圆点大小', type: 'range', min: 0.02, max: 0.3, step: 0.01, default: 0.1 },
    { key: 'studs', label: '节点圆点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'candy',
      label: '糖果',
      elements: {
        bg: { paint: { type: 'solid', color: '#f5ede7' } },
        tri_up: { paint: { type: 'solid', color: '#ecc9c0' } },
        tri_down: { paint: { type: 'solid', color: '#cfdbe2' } },
        stud: { paint: { type: 'solid', color: '#9a6a5e' } },
      },
    },
    {
      id: 'forest',
      label: '林间',
      elements: {
        bg: { paint: { type: 'solid', color: '#14241d' } },
        tri_up: { paint: { type: 'solid', color: '#2b4a3c' } },
        tri_down: { paint: { type: 'solid', color: '#1d362b' } },
        stud: { paint: { type: 'solid', color: '#b9cc98' } },
      },
    },
    {
      id: 'mono',
      label: '素色',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c1c1f' } },
        tri_up: { paint: { type: 'solid', color: '#34343a' } },
        tri_down: { paint: { type: 'solid', color: '#28282c' } },
        stud: { paint: { type: 'solid', color: '#9d9da6' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['tri_up'], secondary: ['tri_down'], accent: ['stud'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const w = Math.max(6, Number(params.size) * unit);
    const grout = Math.max(0, Math.min(0.32, Number(params.grout)));
    const studSize = Math.max(0, Number(params.studSize));
    const showStuds = params.studs === true;

    const bg = elements.get('bg')!;
    const up = elements.get('tri_up')!;
    const down = elements.get('tri_down')!;
    const stud = elements.get('stud')!;

    // 等边三角形的行高：h = w·√3/2；平铺单元 = 2 行 × 2 个边长
    const h = (w * Math.sqrt(3)) / 2;
    const tileW = w * 2;
    const tileH = h * 2;

    /**
     * 以底边左端 x0、行顶 y0 生成一个三角形，并按 shrink 向重心收缩（制造间隙）。
     * `dir` = 1 尖朝上（底边在行底），-1 尖朝下（底边在行顶）。
     */
    const tri = (x0: number, y0: number, dir: 1 | -1, shrink: number): Array<[number, number]> => {
      const pts: Array<[number, number]> =
        dir === 1
          ? [
              [x0, y0 + h],
              [x0 + w, y0 + h],
              [x0 + w / 2, y0],
            ]
          : [
              [x0, y0],
              [x0 + w, y0],
              [x0 + w / 2, y0 + h],
            ];
      const gx = (pts[0][0] + pts[1][0] + pts[2][0]) / 3;
      const gy = (pts[0][1] + pts[1][1] + pts[2][1]) / 3;
      const k = 1 - shrink;
      return pts.map(([x, y]) => [gx + (x - gx) * k, gy + (y - gy) * k] as [number, number]);
    };

    /**
     * 单元内 8 个「逻辑三角」：每行 2 上 2 下，第二行错开半个边长。
     * 跨越单元边界的三角在两侧各画一份（同一 shrink），pattern 裁切后拼回完整三角。
     *
     * seed 的作用：每个逻辑三角有 0~1.5% 的 seeded 收缩差 + 极轻的明度差，
     * 规则密铺不被破坏，但任意两个 seed 的产物都不同（也带来手作的微妙不齐）。
     */
    type Logical = { dir: 1 | -1; xs: number[]; y0: number };
    const logical: Logical[] = [
      // 行 0：上三角底边起点 0、w；下三角起点 w/2、3w/2（后者跨右边界 → 另画于 -w/2）
      { dir: 1, xs: [0], y0: 0 },
      { dir: 1, xs: [w], y0: 0 },
      { dir: -1, xs: [w / 2], y0: 0 },
      { dir: -1, xs: [w * 1.5, -w / 2], y0: 0 },
      // 行 1：整体右移 w/2
      { dir: 1, xs: [w / 2], y0: h },
      { dir: 1, xs: [w * 1.5, -w / 2], y0: h },
      { dir: -1, xs: [0], y0: h },
      { dir: -1, xs: [w], y0: h },
    ];

    const marks: string[] = [];
    const upCentroids: Array<[number, number]> = [];
    for (const t of logical) {
      const e = t.dir === 1 ? up : down;
      const shrink = grout * 0.5 + rng() * 0.015;
      const tone = 0.86 + rng() * 0.14;
      if (t.dir === 1) upCentroids.push([t.xs[0] + w / 2, t.y0 + (h * 2) / 3]);
      if (!e.visible) continue;
      for (const x0 of t.xs) {
        marks.push(polygon(tri(x0, t.y0, t.dir, shrink), { fill: e.paintValue, 'fill-opacity': e.opacity * tone }));
      }
    }

    /**
     * 节点圆点：只点在一个上三角的重心附近（每单元 1 个，克制的点缀），
     * 带 seeded 微偏移；偏移幅度远小于三角内切圆，永不越出三角。
     */
    if (showStuds && stud.visible && studSize > 0) {
      const [cx, cy] = upCentroids[Math.floor(rng() * 2)];
      const jx = cx + (rng() - 0.5) * w * 0.12;
      const jy = cy + (rng() - 0.5) * h * 0.12;
      marks.push(
        circle(jx, jy, Math.max(0.5, w * studSize * 0.35), {
          fill: stud.paintValue,
          'fill-opacity': stud.opacity,
        }),
      );
    }

    const tileRef = api.tile({
      key: `tt-${api.n(w)}-${api.n(grout)}-${api.n(studSize)}-${showStuds ? 1 : 0}`,
      w: tileW,
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
