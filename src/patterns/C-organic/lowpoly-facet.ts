/**
 * 低多边形 —— C 渐变流体 / 有机形态。
 *
 * 2026-10-12 重做：旧版用 3×3 网格做小单元再 <pattern> 平铺，
 * 画面读起来是「小块碎片 + 白色方块」的重复贴纸，完全不像低多边形。
 *
 * 新版是**整幅** seeded 三角剖分：
 *   1. 规则网格覆盖整个画布（边界点贴边、只沿边滑动），内部顶点按 jitter 抖动；
 *   2. 每个格子按 seed 选对角线拆成两个三角形；
 *   3. 三角形颜色 = 质心沿「光源方向」的投影，在 亮面 → 中间调 → 暗面
 *      这 2~3 个色标之间线性插值，再叠一点 seeded 明度抖动 —— 折面感由此而来，
 *      整体仍是平滑的大渐变，不会花。
 *   4. 棱线不单独描线：所有三角形放进一个带 stroke 的 <g>，零额外字节，
 *      还顺带盖住相邻三角形之间的抗锯齿白缝。
 *
 * 体积：三角形数封顶（≤ 2×150，cell 拉到最小时约 16KB），坐标取整，默认约 7KB，任何参数都 < 20KB。
 * 不再需要 <pattern>：全部三角形收在一个 <g> 里，body 顶层只有 2 个节点。
 */
import { g, rect } from '../../engine/svg';
import type { PaintSpec, PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 网格格子数上限（每格 2 个三角形）：体积红线的唯一乘数。 */
const MAX_CELLS = 150;

const def: PatternDef = {
  id: 'lowpoly-facet',
  name: '低多边形',
  category: 'C-organic',
  description: '整幅抖动网格三角剖分，颜色沿光源方向在多个色标间渐变，折纸般的几何质感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#6f93b3' }, opacity: 1, visible: true, configurable: true },
    { id: 'light', label: '亮面', role: 'primary', paint: { type: 'solid', color: '#dfe9f1' }, opacity: 1, visible: true, configurable: true },
    { id: 'mid', label: '中间调', role: 'secondary', paint: { type: 'solid', color: '#86a9c6' }, opacity: 1, visible: true, configurable: true },
    { id: 'dark', label: '暗面', role: 'accent', paint: { type: 'solid', color: '#34506e' }, opacity: 1, visible: true, configurable: true },
    { id: 'edge', label: '棱线', role: 'detail', paint: { type: 'solid', color: '#ffffff' }, opacity: 0.08, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '面片尺寸', type: 'range', min: 60, max: 260, step: 10, default: 170, heavy: true },
    { key: 'jitter', label: '顶点抖动', type: 'range', min: 0, max: 0.45, step: 0.01, default: 0.34 },
    { key: 'bands', label: '色标数', type: 'range', min: 2, max: 4, step: 1, default: 3 },
    { key: 'light', label: '光源角度', type: 'angle', default: 225 },
    { key: 'edges', label: '棱线开关', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'ice',
      label: '冰蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#6f93b3' } },
        light: { paint: { type: 'solid', color: '#dfe9f1' } },
        mid: { paint: { type: 'solid', color: '#86a9c6' } },
        dark: { paint: { type: 'solid', color: '#34506e' } },
        edge: { paint: { type: 'solid', color: '#ffffff' } },
      },
    },
    {
      id: 'forest',
      label: '深林',
      elements: {
        bg: { paint: { type: 'solid', color: '#29483a' } },
        light: { paint: { type: 'solid', color: '#9cc29a' } },
        mid: { paint: { type: 'solid', color: '#4f7d5f' } },
        dark: { paint: { type: 'solid', color: '#16281f' } },
        edge: { paint: { type: 'solid', color: '#000000' } },
      },
    },
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#6a4466' } },
        light: { paint: { type: 'solid', color: '#efb594' } },
        mid: { paint: { type: 'solid', color: '#a2647c' } },
        dark: { paint: { type: 'solid', color: '#2f2240' } },
        edge: { paint: { type: 'solid', color: '#ffffff' } },
      },
    },
    {
      id: 'sand',
      label: '砂岩',
      elements: {
        bg: { paint: { type: 'solid', color: '#d9c7ae' } },
        light: { paint: { type: 'solid', color: '#f6efe4' } },
        mid: { paint: { type: 'solid', color: '#dccab1' } },
        dark: { paint: { type: 'solid', color: '#a88d72' } },
        edge: { paint: { type: 'solid', color: '#ffffff' } },
      },
      params: { cell: 200 },
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
    const S = Math.min(W, H);
    const jitter = Math.max(0, Math.min(0.45, Number(params.jitter)));
    const bands = Math.round(Math.max(2, Math.min(4, Number(params.bands))));
    const lightAngle = Number(params.light);
    const showEdges = params.edges === true;

    const bg = elements.get('bg')!;
    const lightEl = elements.get('light')!;
    const midEl = elements.get('mid')!;
    const darkEl = elements.get('dark')!;
    const edge = elements.get('edge')!;

    // 面片尺寸以 1080 短边为基准缩放；格子总数封顶保证体积
    let cellPx = Math.max(20, (Number(params.cell) * S) / 1080);
    let cols = Math.max(2, Math.round(W / cellPx));
    let rows = Math.max(2, Math.round(H / cellPx));
    if (cols * rows > MAX_CELLS) {
      const k = Math.sqrt((cols * rows) / MAX_CELLS);
      cols = Math.max(2, Math.floor(cols / k));
      rows = Math.max(2, Math.floor(rows / k));
      cellPx = Math.max(W / cols, H / rows);
    }
    const cw = W / cols;
    const ch = H / rows;

    // 顶点：边界点只沿边滑动（不离开画布），内部点二维抖动
    const pts: Array<[number, number]> = [];
    for (let j = 0; j <= rows; j++) {
      for (let i = 0; i <= cols; i++) {
        const dx = (rng() - 0.5) * 2 * jitter * cw;
        const dy = (rng() - 0.5) * 2 * jitter * ch;
        const edgeX = i === 0 || i === cols;
        const edgeY = j === 0 || j === rows;
        pts.push([i * cw + (edgeX ? 0 : dx), j * ch + (edgeY ? 0 : dy)]);
      }
    }

    // 色标：按 bands 取 亮 → (中) → 暗 (→ 中)，隐藏的元件不参与
    const order =
      bands === 2 ? [lightEl, darkEl] : bands === 3 ? [lightEl, midEl, darkEl] : [lightEl, midEl, darkEl, midEl];
    const stops = order.filter((e) => e.visible).map((e) => ({ rgb: hexToRgb(colorOf(e.paint)), op: e.opacity }));

    // 光源方向：角度指向光源所在一侧（225° = 左上），迎光一侧取亮色
    const la = (lightAngle * Math.PI) / 180;
    const lx = Math.cos(la);
    const ly = Math.sin(la);
    const proj = (x: number, y: number): number => x * lx + y * ly;
    const corners = [proj(0, 0), proj(W, 0), proj(0, H), proj(W, H)];
    const pMax = Math.max(...corners);
    const pMin = Math.min(...corners);
    const pSpan = Math.max(1e-6, pMax - pMin);

    const out: string[] = [];
    const stride = cols + 1;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const a = pts[j * stride + i];
        const b = pts[j * stride + i + 1];
        const c = pts[(j + 1) * stride + i];
        const d = pts[(j + 1) * stride + i + 1];
        // 对角线朝向随 seed：jitter=0 时也保有随机性，且折面方向更自然
        const tris = rng() < 0.5 ? [[a, b, d], [a, d, c]] : [[a, b, c], [b, d, c]];
        for (const t of tris) {
          const noise = (rng() - 0.5) * 0.14;
          if (stops.length === 0) continue;
          const cx = (t[0][0] + t[1][0] + t[2][0]) / 3;
          const cy = (t[0][1] + t[1][1] + t[2][1]) / 3;
          // v=1 最靠近光源 → 亮色（色标序列的起点）
          const v = Math.max(0, Math.min(1, (proj(cx, cy) - pMin) / pSpan + noise * 0.6));
          const [rgb, op] = sample(stops, 1 - v, noise);
          const dpath =
            `M${Math.round(t[0][0])} ${Math.round(t[0][1])} ` +
            `${Math.round(t[1][0])} ${Math.round(t[1][1])} ` +
            `${Math.round(t[2][0])} ${Math.round(t[2][1])}z`;
          out.push(`<path fill="${rgb}"${op < 1 ? ` fill-opacity="${api.n(op)}"` : ''} d="${dpath}"/>`);
        }
      }
    }

    const groupAttrs: Record<string, string | number> = {};
    if (showEdges && edge.visible) {
      groupAttrs.stroke = edge.paintValue;
      groupAttrs['stroke-opacity'] = edge.opacity;
      groupAttrs['stroke-width'] = Math.max(0.5, S / 1080);
      groupAttrs['stroke-linejoin'] = 'round';
    }

    return {
      body: [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }), g(groupAttrs, out.join(''))].join(''),
    };
  },
};

/** 在色标序列上取 t∈[0,1] 处的颜色（线性插值）并叠加明度抖动。 */
function sample(
  stops: Array<{ rgb: [number, number, number]; op: number }>,
  t: number,
  noise: number,
): [string, number] {
  if (stops.length === 1) return [rgbToHex(shade(stops[0].rgb, noise)), stops[0].op];
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const a = stops[i];
  const b = stops[i + 1];
  const rgb: [number, number, number] = [
    a.rgb[0] + (b.rgb[0] - a.rgb[0]) * f,
    a.rgb[1] + (b.rgb[1] - a.rgb[1]) * f,
    a.rgb[2] + (b.rgb[2] - a.rgb[2]) * f,
  ];
  return [rgbToHex(shade(rgb, noise)), a.op + (b.op - a.op) * f];
}

/** 明度抖动：正值向白、负值向黑。 */
function shade(rgb: [number, number, number], k: number): [number, number, number] {
  return k >= 0
    ? [rgb[0] + (255 - rgb[0]) * k, rgb[1] + (255 - rgb[1]) * k, rgb[2] + (255 - rgb[2]) * k]
    : [rgb[0] * (1 + k), rgb[1] * (1 + k), rgb[2] * (1 + k)];
}

function colorOf(paint: PaintSpec): string {
  if (paint.type === 'solid') return paint.color;
  if (paint.type === 'none' || paint.stops.length === 0) return '#808080';
  return paint.stops[0].color;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!h) return [128, 128, 128];
  const v = parseInt(h[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgbToHex(rgb: [number, number, number]): string {
  let s = '#';
  for (const c of rgb) {
    const v = Math.max(0, Math.min(255, Math.round(c)));
    s += v.toString(16).padStart(2, '0');
  }
  return s;
}

export default def;
