/**
 * 等距体素 —— D 像素 / 复古游戏。
 *
 * 2026-10-12 重做：旧版把 3×3 根柱子塞进一个矩形 <pattern>，
 * 但单元宽高与轴测网格的周期**对不上**，相邻单元在接缝处错位，
 * 平铺出来是一条条锯齿横带。
 *
 * 新版是**正确的周期性轴测高度场**：
 *   - 世界网格 (i, j) 的高度表以 N×N 为周期（seeded），
 *     投影 X = (i − j)·c、Y = (i + j)·s/2 − z·s（c = s·√3/2，真 30° 轴测）。
 *   - 周期格的两个格向量投影为 u = (N·c, N·s/2)、v = (−N·c, N·s/2)，
 *     其和/差 (0, N·s)、(2N·c, 0) 构成**严格对齐**的矩形 <pattern> 单元 → 无接缝。
 *   - 单元内绘制所有「投影与单元相交」的柱子（含邻周期的副本），
 *     按 i + j 由后向前画（轴测高度场的正确画家顺序）。
 *   - 每根柱子：顶面 / 左面 / 右面三色；被前方邻柱完全挡住的侧面直接跳过（省体积）。
 *   - 阴影：左后方邻柱更高时，在本格顶面（或地面）靠该邻柱一侧压一条阴影带。
 */
import { g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 高度表周期（格）。5 格周期在大尺寸体素下已不易察觉重复，且单元体积可控。 */
const N = 5;

const def: PatternDef = {
  id: 'isometric-voxel',
  name: '等距体素',
  category: 'D-pixel',
  description: '30 度轴测投影的立方体高度场，三面三色、无缝平铺，玩具般的几何感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '地面', role: 'bg', paint: { type: 'solid', color: '#36485c' }, opacity: 1, visible: true, configurable: true },
    { id: 'top', label: '顶面', role: 'primary', paint: { type: 'solid', color: '#b4cdbf' }, opacity: 1, visible: true, configurable: true },
    { id: 'left', label: '左面', role: 'secondary', paint: { type: 'solid', color: '#7f9db0' }, opacity: 1, visible: true, configurable: true },
    { id: 'right', label: '右面', role: 'accent', paint: { type: 'solid', color: '#587389' }, opacity: 1, visible: true, configurable: true },
    { id: 'shadow', label: '阴影', role: 'detail', paint: { type: 'solid', color: '#141c28' }, opacity: 0.35, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '体素尺寸', type: 'range', min: 14, max: 90, step: 2, default: 80, heavy: true },
    { key: 'height', label: '堆叠高度', type: 'range', min: 1, max: 6, step: 1, default: 2 },
    { key: 'density', label: '生成密度', type: 'range', min: 0.2, max: 0.9, step: 0.05, default: 0.35 },
    { key: 'shadows', label: '阴影', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'meadow',
      label: '草地',
      elements: {
        bg: { paint: { type: 'solid', color: '#36485c' } },
        top: { paint: { type: 'solid', color: '#b4cdbf' } },
        left: { paint: { type: 'solid', color: '#7f9db0' } },
        right: { paint: { type: 'solid', color: '#587389' } },
        shadow: { paint: { type: 'solid', color: '#141c28' } },
      },
    },
    {
      id: 'desert',
      label: '荒漠',
      elements: {
        bg: { paint: { type: 'solid', color: '#7a5a45' } },
        top: { paint: { type: 'solid', color: '#e6c79a' } },
        left: { paint: { type: 'solid', color: '#b98a62' } },
        right: { paint: { type: 'solid', color: '#8a6047' } },
        shadow: { paint: { type: 'solid', color: '#2e1f16' } },
      },
    },
    {
      id: 'frost',
      label: '霜原',
      elements: {
        bg: { paint: { type: 'solid', color: '#c9d3e1' } },
        top: { paint: { type: 'solid', color: '#fbfcfe' } },
        left: { paint: { type: 'solid', color: '#dce4ef' } },
        right: { paint: { type: 'solid', color: '#b3c1d4' } },
        shadow: { paint: { type: 'solid', color: '#5f6f8a' } },
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
    const S = Math.min(W, H);
    const s = Math.max(6, (Math.max(14, Number(params.size)) * S) / 1080);
    const maxH = Math.round(Math.max(1, Math.min(6, Number(params.height))));
    const density = Math.max(0.2, Math.min(0.9, Number(params.density)));
    const showShadow = params.shadows === true;

    const bg = elements.get('bg')!;
    const top = elements.get('top')!;
    const left = elements.get('left')!;
    const right = elements.get('right')!;
    const shadow = elements.get('shadow')!;

    const c = (s * Math.sqrt(3)) / 2;
    const tw = 2 * N * c;
    const th = N * s;

    // 周期高度表（随机量全部在进 tile 前抽完）
    const heights: number[] = [];
    for (let k = 0; k < N * N; k++) heights.push(rng() < density ? 1 + Math.floor(rng() * maxH) : 0);
    const mod = (a: number): number => ((a % N) + N) % N;
    const hAt = (i: number, j: number): number => heights[mod(j) * N + mod(i)];

    // 坐标保留 1 位小数：体素边长 ≥ 数十 px，0.05px 的误差不可见，却能省下约 15% 体积
    const n = (v: number): string => api.n(Math.round(v * 10) / 10);
    const P = (i: number, j: number, z: number): string => `${n((i - j) * c)} ${n(((i + j) * s) / 2 - z * s)}`;
    const quad = (a: string, b: string, cc: string, d: string): string => `M${a} ${b} ${cc} ${d}z`;
    const face = (fill: string, op: number, d: string): string =>
      `<path fill="${fill}"${op < 1 ? ` fill-opacity="${api.n(op)}"` : ''} d="${d}"/>`;

    // 候选柱：投影包围盒与单元 [0,tw]×[0,th] 相交者
    const M = 2 * N + maxH + 3;
    const cells: Array<[number, number]> = [];
    for (let i = -M; i <= M; i++) {
      for (let j = -M; j <= M; j++) {
        const h = hAt(i, j);
        const x0 = (i - j - 1) * c;
        const x1 = (i - j + 1) * c;
        const y0 = ((i + j) * s) / 2 - h * s;
        const y1 = ((i + j + 2) * s) / 2;
        if (x1 <= 0 || x0 >= tw || y1 <= 0 || y0 >= th) continue;
        cells.push([i, j]);
      }
    }
    cells.sort((a, b) => a[0] + a[1] - (b[0] + b[1]) || a[0] - b[0]);

    const out: string[] = [];
    for (const [i, j] of cells) {
      const h = hAt(i, j);
      if (h > 0) {
        // 右面：位于 i+1 平面，被 (i+1, j) 挡住其高度以下部分
        const hr = Math.min(h, hAt(i + 1, j));
        if (right.visible && hr < h) {
          out.push(face(right.paintValue, right.opacity, quad(P(i + 1, j, h), P(i + 1, j + 1, h), P(i + 1, j + 1, hr), P(i + 1, j, hr))));
        }
        // 左面：位于 j+1 平面，被 (i, j+1) 挡住其高度以下部分
        const hl = Math.min(h, hAt(i, j + 1));
        if (left.visible && hl < h) {
          out.push(face(left.paintValue, left.opacity, quad(P(i, j + 1, h), P(i + 1, j + 1, h), P(i + 1, j + 1, hl), P(i, j + 1, hl))));
        }
        if (top.visible) {
          out.push(face(top.paintValue, top.opacity, quad(P(i, j, h), P(i + 1, j, h), P(i + 1, j + 1, h), P(i, j + 1, h))));
        }
      }
      // 阴影：左后方邻柱 (i−1, j) 更高 → 本格顶面（或地面）靠该侧压一条阴影带
      const hb = hAt(i - 1, j);
      if (showShadow && shadow.visible && hb > h) {
        const w = Math.min(0.8, 0.32 * (hb - h) + 0.12);
        out.push(face(shadow.paintValue, shadow.opacity, quad(P(i, j, h), P(i, j + 1, h), P(i + w, j + 1, h), P(i + w, j, h))));
      }
    }

    const tileRef = api.tile({
      key: `ivx-${api.n(s)}-${maxH}-${n(density)}-${showShadow ? 1 : 0}`,
      w: tw,
      h: th,
      content: g({}, out.join('')),
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
