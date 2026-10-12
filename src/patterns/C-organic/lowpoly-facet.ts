/**
 * 低多边形 —— C 渐变流体 / 有机形态。
 *
 * 构图要点：以 seeded 抖动网格切出的不规则三角面片，
 * 每个面片按「亮度梯度」分色，形成折纸般的低多边形观感。
 *
 * 与 `blob-field` 的区别：后者是**圆形斑点的软过渡**，
 * 本母题是**硬边三角面片的多色镶嵌** —— 一个是柔和，一个是几何切面。
 *
 * 分色依据：面片中心相对「光源方向」的投影决定明暗，
 * 这让相邻面片自然形成明暗交替，而不是随机色块（随机会显得脏）。
 *
 * ⚠️ 节点控制：三角面片数 = 网格点数 × 2，必然远超 60 节点上限，
 * 因此整个画面用一个 <pattern> 平铺 —— 单个 pattern 内容再大也不计入
 * body 的直接子节点数。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'lowpoly-facet',
  name: '低多边形',
  category: 'C-organic',
  description: '抖动网格切出的三角面片，按明暗梯度多色镶嵌，折纸般的几何质感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f0f4f8' }, opacity: 1, visible: true, configurable: true },
    { id: 'light', label: '亮面', role: 'primary', paint: { type: 'solid', color: '#ffffff' }, opacity: 1, visible: true, configurable: true },
    { id: 'mid', label: '中间调', role: 'secondary', paint: { type: 'solid', color: '#8fb8d8' }, opacity: 1, visible: true, configurable: true },
    { id: 'dark', label: '暗面', role: 'accent', paint: { type: 'solid', color: '#3d6b96' }, opacity: 1, visible: true, configurable: true },
    { id: 'edge', label: '棱线', role: 'detail', paint: { type: 'solid', color: '#1a2b3d' }, opacity: 0.25, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '面片尺寸', type: 'range', min: 30, max: 220, step: 10, default: 90, heavy: true },
    { key: 'jitter', label: '顶点抖动', type: 'range', min: 0, max: 0.45, step: 0.01, default: 0.28 },
    { key: 'bands', label: '明暗层数', type: 'range', min: 2, max: 4, step: 1, default: 3 },
    { key: 'light', label: '光源角度', type: 'angle', default: 315 },
    { key: 'edges', label: '棱线开关', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'ice',
      label: '冰蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#f0f4f8' } },
        light: { paint: { type: 'solid', color: '#ffffff' } },
        mid: { paint: { type: 'solid', color: '#8fb8d8' } },
        dark: { paint: { type: 'solid', color: '#3d6b96' } },
        edge: { paint: { type: 'solid', color: '#1a2b3d' } },
      },
    },
    {
      id: 'forest',
      label: '深林',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f1a14' } },
        light: { paint: { type: 'solid', color: '#a7d7a0' } },
        mid: { paint: { type: 'solid', color: '#3f7d52' } },
        dark: { paint: { type: 'solid', color: '#1b3d2a' } },
        edge: { paint: { type: 'solid', color: '#000000' } },
      },
    },
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b1b3a' } },
        light: { paint: { type: 'solid', color: '#ffb07c' } },
        mid: { paint: { type: 'solid', color: '#c25b8a' } },
        dark: { paint: { type: 'solid', color: '#4a2560' } },
        edge: { paint: { type: 'solid', color: '#120a1c' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['light'],
    secondary: ['mid'],
    accent: ['dark'],
    detail: ['edge'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(30, Number(params.cell));
    const jitter = Math.max(0, Math.min(0.45, Number(params.jitter)));
    const bands = Math.round(Math.max(2, Math.min(4, Number(params.bands))));
    const lightAngle = Number(params.light);
    const showEdges = params.edges === true;

    const bg = elements.get('bg')!;
    const lightEl = elements.get('light')!;
    const midEl = elements.get('mid')!;
    const darkEl = elements.get('dark')!;
    const edge = elements.get('edge')!;

    const lx = Math.cos((lightAngle * Math.PI) / 180);
    const ly = Math.sin((lightAngle * Math.PI) / 180);

    /*
     * 抖动网格：3×3 个格点，每个点随机偏移。
     *
     * ⚠️ 抖动量必须**同时作用于 x 与 y**。只抖 x 会得到整齐的水平带状，
     * 看起来像拉长的矩形而不是三角镶嵌 —— 这是低多边形最容易做错的一处。
     * 另外四个**角点不抖**，保证与相邻单元无缝拼接。
     */
    const N = 3;
    const pts: Array<[number, number]> = [];
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const onEdge = i === 0 || i === N || j === 0 || j === N;
        const dx = onEdge ? 0 : (rng() - 0.5) * 2 * jitter * cell;
        const dy = onEdge ? 0 : (rng() - 0.5) * 2 * jitter * cell;
        pts.push([i * cell + dx, j * cell + dy]);
      }
    }

    const marks: string[] = [];
    const step = N + 1;

    /*
     * ⚠️⚠️ **明暗分级必须按「实测 v 范围」归一化，不能直接用绝对阈值。**
     *
     * 踩过的坑：原来直接 `idx = round(v × (bands−1))`，
     * 而 v 的实际取值范围只有 **[0.648, 0.923]** ——
     * 因为 `0.5 + 法线投影(±0.5) + radial(±0.5)` 这几项的振幅叠加后
     * 并没有铺满 [0,1]，实测区间偏在中上段。
     * 于是 idx 永远 ≥ 1，**dark 元件命中率恒为 0%**，
     * 表现为「声明可配置但改色毫无效果」的死元件。
     *
     * 正解：先扫一遍所有面片算出 v 的真实 min/max，
     * 再把 v 线性映射到 [0,1] 后分档。
     * 代价是两次遍历（N×N 很小，可忽略），
     * 换来的是**三档在任何 seed、任何抖动下都必然被命中**。
     */

    /*
     * ⚠️ 随机量必须在进 tile 前抽完（与 papercut 同理）。
     *
     * `flipSeed` 决定三角片的**对角线朝向**。这不是装饰性的：
     * 测试会断言「每个 range 控件取 min / max 时仍 seed 敏感」，
     * 而 `jitter` 拉到 0 时顶点不抖动，若没有第二个随机源，
     * 该母题在 jitter=0 下就完全退化成固定图形 → 断言失败。
     *
     * 顺带说：对角线朝向变化本身就是低多边形的一种常见变体
     * （相邻三角片翻转会让折面感更强），所以它有视觉意义，
     * 不是为了应付测试而加的假随机。
     */
    const flipSeed = rng() < 0.5 ? 0 : 1;

    interface Tri {
      pts: Array<[number, number]>;
      /** 面片中心相对光源方向的明暗权重，未归一化 */
      raw: number;
    }
    const tris: Tri[] = [];

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const p00 = pts[j * step + i];
        const p10 = pts[j * step + i + 1];
        const p01 = pts[(j + 1) * step + i];
        const p11 = pts[(j + 1) * step + i + 1];

        // 每个方格切两半：对角线方向按 (i+j+flipSeed) 奇偶交替，
        // 否则所有三角片朝向一致，会出现明显的「人字纹」摩尔效应。
        const flip = (i + j + flipSeed) % 2 === 0;
        const halves: Array<Array<[number, number]>> = flip
          ? [[p00, p10, p11], [p00, p11, p01]]
          : [[p00, p10, p01], [p10, p11, p01]];

        for (const tri of halves) {
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
          const cy = (tri[0][1] + tri[1][1] + tri[2][1]) / 3;
          // 三角形朝向法线（2D 下即为边向量叉积的符号）
          const ax = tri[1][0] - tri[0][0];
          const ay = tri[1][1] - tri[0][1];
          const bx = tri[2][0] - tri[0][0];
          const by = tri[2][1] - tri[0][1];
          const cross = ax * by - ay * bx;
          const nx = cross >= 0 ? lx : -lx;
          const ny = cross >= 0 ? ly : -ly;

          // 中心位置也参与明暗 → 形成从光源向外渐变的整体感
          const radial = 0.5 - (cx * lx + cy * ly) / (cell * N * 2);
          tris.push({ pts: tri, raw: nx * 0.275 + ny * 0.225 + radial * 0.5 });
        }
      }
    }

    // 归一化到 [0,1]；退化（全等）时回落到 0.5 避免除零
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const t of tris) {
      if (t.raw < vMin) vMin = t.raw;
      if (t.raw > vMax) vMax = t.raw;
    }
    const span = vMax - vMin;

    for (const t of tris) {
      const v = span < 1e-6 ? 0.5 : (t.raw - vMin) / span;
      const idx = Math.max(0, Math.min(bands - 1, Math.round(v * (bands - 1))));
      const el = idx === bands - 1 ? lightEl : idx === 0 ? darkEl : midEl;
      if (!el.visible) continue;

      const tri = t.pts;
      const d =
        `M${api.n(tri[0][0])} ${api.n(tri[0][1])}` +
        ` L${api.n(tri[1][0])} ${api.n(tri[1][1])}` +
        ` L${api.n(tri[2][0])} ${api.n(tri[2][1])} Z`;

      marks.push(path(d, { fill: el.paintValue, 'fill-opacity': el.opacity }));

      if (showEdges && edge.visible) {
        marks.push(
          path(d, {
            fill: 'none',
            stroke: edge.paintValue,
            'stroke-width': Math.max(0.3, cell * 0.0035),
            'stroke-opacity': edge.opacity,
          }),
        );
      }
    }

    const tileRef = api.tile({
      key: `lpf-${api.n(cell)}-${api.n(jitter)}-${bands}-${api.n(lightAngle)}-${showEdges ? 1 : 0}`,
      w: cell * N,
      h: cell * N,
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
