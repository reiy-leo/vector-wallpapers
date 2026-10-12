/**
 * 螺旋多边形 —— A 极简几何线条（连续平铺）。
 *
 * 经典「旋转内接」：每一层多边形旋转 θ 后恰好内接于上一层，
 * 缩放比 s = cos(π/n) / cos(π/n − θ)，层层叠加后顶点连成对数螺旋臂。
 *
 * 2026-10-12 Rei：「只有一个单一元件，让螺旋线连续多方向，不要只针对一个核心」→
 * 改为平铺：画面铺满正方形或正三角形格子，每格一个旋转内接螺旋，
 * **相邻格子手性相反**（顺/逆时针交替）。反向螺旋恰是正向螺旋沿公共边的镜像，
 * 所以内接顶点在公共边上两两重合，螺旋臂跨格连续，整面形成多中心、多方向的涡旋网。
 *  - 方形：棋盘手性，tile = 2×2 格。
 *  - 三角：正/倒三角天然交替手性，tile = 宽 1 格 × 高 2 行（6 个三角）。
 *
 * 走 <pattern>，DOM 与画面尺寸无关。
 */
import { isHexColor, mixHex } from '../../engine/colors';
import { circle, g, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult, ResolvedElement } from '../types';

function unitOf(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

function blend(a: ResolvedElement, b: ResolvedElement, t: number): string {
  if (isHexColor(a.paintValue) && isHexColor(b.paintValue)) return mixHex(a.paintValue, b.paintValue, t);
  return t < 0.5 ? a.paintValue : b.paintValue;
}

/** 坐标取整到 0.1，肉眼无差，体积再省一截。 */
const r1 = (v: number): number => Math.round(v * 10) / 10;

/** 一个格子：中心、外接圆半径、起始顶点角、手性（+1 顺时针 / −1 逆时针）。 */
interface Cell {
  cx: number;
  cy: number;
  R: number;
  a0: number;
  dir: 1 | -1;
}

const def: PatternDef = {
  id: 'spiral-polygons',
  name: '螺旋多边形',
  category: 'A-lines',
  description: '方形或三角格子铺满画面，每格多边形逐层旋转内接、相邻格顺逆交替，螺旋臂跨格连成多中心涡旋网。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f0ece5' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_outer', label: '外层', role: 'primary', paint: { type: 'solid', color: '#a8977f' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'line_inner', label: '内层', role: 'secondary', paint: { type: 'solid', color: '#6c7a89' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'center', label: '中心点缀', role: 'accent', paint: { type: 'solid', color: '#c4876a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'mode',
      label: '模式',
      type: 'select',
      default: 'outline',
      options: [
        { value: 'outline', label: '线框' },
        { value: 'filled', label: '填充' },
      ],
    },
    {
      key: 'shape',
      label: '格子',
      type: 'select',
      default: 'square',
      options: [
        { value: 'square', label: '方形' },
        { value: 'triangle', label: '三角' },
      ],
    },
    { key: 'cell', label: '格子大小', type: 'range', min: 80, max: 600, step: 10, default: 240, unit: 'px' },
    { key: 'layers', label: '层数', type: 'range', min: 4, max: 30, step: 1, default: 16 },
    { key: 'twist', label: '每层旋转', type: 'range', min: 2, max: 25, step: 0.5, default: 9, unit: '°' },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 4, step: 0.1, default: 1.2, unit: 'px' },
    { key: 'rotate', label: '整体旋转', type: 'angle', default: 0 },
  ],

  presets: [
    {
      id: 'linen',
      label: '亚麻',
      elements: {
        bg: { paint: { type: 'solid', color: '#f0ece5' } },
        line_outer: { paint: { type: 'solid', color: '#a8977f' } },
        line_inner: { paint: { type: 'solid', color: '#6c7a89' } },
        center: { paint: { type: 'solid', color: '#c4876a' } },
      },
    },
    {
      id: 'ink-gold',
      label: '墨金',
      elements: {
        bg: { paint: { type: 'solid', color: '#151a21' } },
        line_outer: { paint: { type: 'solid', color: '#36414f' } },
        line_inner: { paint: { type: 'solid', color: '#a7b4c2' }, opacity: 0.85 },
        center: { paint: { type: 'solid', color: '#d6b27a' } },
      },
      params: { shape: 'triangle', twist: 7, layers: 18 },
    },
    {
      id: 'terrace',
      label: '梯田（填充）',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9e5dc' } },
        line_outer: { paint: { type: 'solid', color: '#d6ccba' } },
        line_inner: { paint: { type: 'solid', color: '#7f917a' } },
        center: { paint: { type: 'solid', color: '#5d6b58' } },
      },
      params: { mode: 'filled', shape: 'square', twist: 8, layers: 14 },
    },
    {
      id: 'thread',
      label: '夜涡',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2230' } },
        line_outer: { paint: { type: 'solid', color: '#5e6a8a' }, opacity: 0.7 },
        line_inner: { paint: { type: 'solid', color: '#c9b8d4' }, opacity: 0.7 },
        center: { paint: { type: 'solid', color: '#e2b98f' } },
      },
      params: { shape: 'triangle', mode: 'filled', layers: 16, twist: 6 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['line_outer'], secondary: ['line_inner'], accent: ['center'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const u = unitOf(W, H);
    const n = api.n;
    const filled = String(params.mode) === 'filled';
    const tri = String(params.shape) === 'triangle';
    const sides = tri ? 3 : 4;
    const layers = Math.max(2, Math.round(Number(params.layers)));
    const twistDeg = Math.max(0.1, Number(params.twist));
    const L = Math.max(24, Number(params.cell) * u);
    const sw = Math.max(0.3, Number(params.weight) * u);
    const rotDeg = Number(params.rotate) || 0;

    const bg = elements.get('bg')!;
    const outer = elements.get('line_outer')!;
    const inner = elements.get('line_inner')!;
    const center = elements.get('center')!;

    /** 第 i 层的颜色 / 不透明度：外层 → 内层线性过渡；任一层元件隐藏则对应半程不画。 */
    const layerPaint = (t: number): { fill: string; op: number } | null => {
      if (outer.visible && inner.visible) return { fill: blend(outer, inner, t), op: outer.opacity + (inner.opacity - outer.opacity) * t };
      const src = outer.visible ? outer : inner.visible ? inner : null;
      if (!src) return null;
      if ((src === outer && t > 0.5) || (src === inner && t < 0.5)) return null;
      return { fill: src.paintValue, op: src.opacity };
    };

    // —— 格子布局（tile 内坐标）——
    const cells: Cell[] = [];
    let tileW: number;
    let tileH: number;
    if (tri) {
      const h = (L * Math.sqrt(3)) / 2;
      const R = L / Math.sqrt(3);
      tileW = L;
      tileH = 2 * h;
      // 第 0 行：正三角 x∈[0,L]，倒三角 x∈[-L/2,L/2]、[L/2,3L/2]；第 1 行整体右移 L/2。
      for (let row = 0; row < 2; row++) {
        const y = row * h;
        const ox = row === 0 ? 0 : -L / 2;
        const ups = row === 0 ? [0] : [0, L];
        const downs = row === 0 ? [-L, 0] : [0];
        for (const k of ups) cells.push({ cx: ox + k + L / 2, cy: y + (2 * h) / 3, R, a0: -Math.PI / 2, dir: 1 });
        for (const k of downs) cells.push({ cx: ox + k + L, cy: y + h / 3, R, a0: Math.PI / 2, dir: -1 });
      }
    } else {
      tileW = 2 * L;
      tileH = 2 * L;
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          cells.push({ cx: (i + 0.5) * L, cy: (j + 0.5) * L, R: L / Math.SQRT2, a0: Math.PI / 4, dir: (i + j) % 2 === 0 ? 1 : -1 });
        }
      }
    }

    // —— 旋转内接：θ ∈ (0, 2π/n)，缩放 s = cos(π/n) / cos(π/n − θ) ——
    const half = Math.PI / sides;
    const theta = Math.min((twistDeg * Math.PI) / 180, half * 2 - 0.01);
    const sc = Math.cos(half) / Math.cos(half - theta);

    // 同一层的所有格子颜色相同 → 按层合并成一个 <g>，属性只写一次
    const layerGroups: string[] = [];
    for (let i = 0; i < layers; i++) {
      const t = layers === 1 ? 0 : i / (layers - 1);
      const p = layerPaint(t);
      const r = cells[0].R * Math.pow(sc, i);
      if (r < sw) break;
      if (!p) continue;
      const polys = cells.map((c) => {
        const a = c.a0 + c.dir * theta * i;
        const pts: Array<[number, number]> = [];
        for (let k = 0; k < sides; k++) {
          const ak = a + k * half * 2;
          pts.push([r1(c.cx + Math.cos(ak) * r), r1(c.cy + Math.sin(ak) * r)]);
        }
        return polygon(pts, {});
      });
      layerGroups.push(
        filled
          ? g({ fill: p.fill, 'fill-opacity': n(p.op * (i % 2 === 0 ? 1 : 0.82)) }, polys.join(''))
          : g({ stroke: p.fill, 'stroke-opacity': n(p.op) }, polys.join('')),
      );
    }

    let content = filled
      ? layerGroups.join('')
      : g({ fill: 'none', 'stroke-width': n(sw), 'stroke-linejoin': 'round' }, layerGroups.join(''));
    if (center.visible) {
      const cr = Math.max(1.5 * u, L * 0.02);
      content += g(
        { fill: center.paintValue, 'fill-opacity': center.opacity },
        cells.map((c) => circle(r1(c.cx), r1(c.cy), r1(cr), {})).join(''),
      );
    }

    const tileRef = api.tile({
      key: `spiral-${tri ? 't' : 's'}-${n(L)}-${layers}-${n(theta)}-${filled ? 1 : 0}-${n(sw)}`,
      w: tileW,
      h: tileH,
      content,
      transform: rotDeg ? `rotate(${n(rotDeg)})` : undefined,
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
