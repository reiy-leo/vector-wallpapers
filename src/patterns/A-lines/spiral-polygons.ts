/**
 * 螺旋多边形 —— A 极简几何线条（单幅居中构图）。
 *
 * 经典「旋转内接」：每一层多边形旋转 θ 后恰好内接于上一层，
 * 缩放比 s = cos(π/n) / cos(π/n − θ)。层层叠加后，顶点连线自然形成对数螺旋臂。
 *
 * 三种模式：
 *  - 线框：只描边，层色由外到内渐变（外层色 → 内层色）。
 *  - 填充：奇偶层交替填色，形成旋转的色块阶梯。
 *  - 旋线：绕中心旋转的线段环（弦），弦的包络是一个内圆 —— 像弦线编织。
 *
 * 单幅构图不走 <pattern>（只有一组图形），层数上限 60，体积可控。
 */
import { isHexColor, mixHex } from '../../engine/colors';
import { circle, g, path, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult, ResolvedElement } from '../types';

function unitOf(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

function blend(a: ResolvedElement, b: ResolvedElement, t: number): string {
  if (isHexColor(a.paintValue) && isHexColor(b.paintValue)) return mixHex(a.paintValue, b.paintValue, t);
  return t < 0.5 ? a.paintValue : b.paintValue;
}

/** 坐标取整到 0.1，单幅大构图下肉眼无差，体积再省一截。 */
const r1 = (v: number): number => Math.round(v * 10) / 10;

const def: PatternDef = {
  id: 'spiral-polygons',
  name: '螺旋多边形',
  category: 'A-lines',
  description: '多边形逐层旋转内接，顶点连成螺旋臂；另有绕中心旋转的线段环「旋线」模式。',
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
        { value: 'twist', label: '旋线' },
      ],
    },
    { key: 'sides', label: '边数', type: 'range', min: 3, max: 8, step: 1, default: 4 },
    { key: 'layers', label: '层数', type: 'range', min: 4, max: 60, step: 1, default: 28 },
    { key: 'twist', label: '每层旋转', type: 'range', min: 1, max: 30, step: 0.5, default: 6, unit: '°' },
    { key: 'size', label: '尺寸', type: 'range', min: 0.3, max: 1.4, step: 0.01, default: 0.86 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 6, step: 0.1, default: 1.5, unit: 'px' },
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
      params: { sides: 6, twist: 4, layers: 40 },
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
      params: { mode: 'filled', sides: 3, twist: 7, layers: 22 },
    },
    {
      id: 'thread',
      label: '弦线',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2230' } },
        line_outer: { paint: { type: 'solid', color: '#5e6a8a' }, opacity: 0.7 },
        line_inner: { paint: { type: 'solid', color: '#c9b8d4' }, opacity: 0.7 },
        center: { paint: { type: 'solid', color: '#e2b98f' } },
      },
      params: { mode: 'twist', layers: 40, twist: 10, weight: 1.1 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['line_outer'], secondary: ['line_inner'], accent: ['center'] },

  render(_def, cfg: ResolvedConfig, _api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const u = unitOf(W, H);
    const mode = String(params.mode);
    const sides = Math.min(8, Math.max(3, Math.round(Number(params.sides))));
    const layers = Math.max(2, Math.round(Number(params.layers)));
    const twistDeg = Math.max(0.1, Number(params.twist));
    const size = Math.max(0.05, Number(params.size));
    const sw = Math.max(0.3, Number(params.weight) * u);
    const rot0 = (Number(params.rotate) * Math.PI) / 180;

    const bg = elements.get('bg')!;
    const outer = elements.get('line_outer')!;
    const inner = elements.get('line_inner')!;
    const center = elements.get('center')!;

    const R0 = (Math.min(W, H) / 2) * size;
    const cx = W / 2;
    // 奇数边多边形顶点朝上时包围盒偏上，下移半个「顶-底差」让外形视觉居中（旋线模式无需）
    const cy = H / 2 + (mode !== 'twist' && sides % 2 === 1 ? (R0 * (1 - Math.cos(Math.PI / sides))) / 2 : 0);
    const body = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    /** 第 i 层的颜色 / 不透明度：外层 → 内层线性过渡；任一层元件隐藏则对应半程不画。 */
    const layerPaint = (t: number): { fill: string; op: number } | null => {
      if (outer.visible && inner.visible) return { fill: blend(outer, inner, t), op: outer.opacity + (inner.opacity - outer.opacity) * t };
      const src = outer.visible ? outer : inner.visible ? inner : null;
      if (!src) return null;
      if ((src === outer && t > 0.5) || (src === inner && t < 0.5)) return null;
      return { fill: src.paintValue, op: src.opacity };
    };

    const parts: string[] = [];

    if (mode === 'twist') {
      // 旋线：K 条等长弦绕中心均布、各跨 span 角；弦的包络是一个安静的内圆。
      // 颜色沿环一周由外层色过渡到内层色再回来（ping-pong），首尾无接缝。
      // 体积：颜色量化成 BUCKETS 档，每档的全部弦合并成一条 <path>，节点数与层数无关。
      const K = layers * 3;
      const BUCKETS = 8;
      const span = Math.PI * (0.5 + Math.min(0.45, twistDeg / 40));
      const ds: string[] = new Array<string>(BUCKETS).fill('');
      for (let i = 0; i < K; i++) {
        const t = 1 - Math.abs((i / K) * 2 - 1);
        const b = Math.min(BUCKETS - 1, Math.floor(t * BUCKETS));
        const a = rot0 + (i / K) * Math.PI * 2;
        const a2 = a + span;
        ds[b] += `M${r1(cx + Math.cos(a) * R0)} ${r1(cy + Math.sin(a) * R0)}L${r1(cx + Math.cos(a2) * R0)} ${r1(cy + Math.sin(a2) * R0)}`;
      }
      ds.forEach((d, b) => {
        const p = layerPaint((b + 0.5) / BUCKETS);
        if (d && p) parts.push(path(d, { stroke: p.fill, 'stroke-opacity': p.op }));
      });
      if (parts.length) body.push(g({ fill: 'none', 'stroke-width': sw, 'stroke-linecap': 'round' }, parts.join('')));
    } else {
      // 旋转内接：θ 必须在 (0, 2π/n) 内；缩放 s = cos(π/n) / cos(π/n − θ)
      const half = Math.PI / sides;
      const theta = ((twistDeg * Math.PI) / 180) % (half * 2);
      const s = Math.cos(half) / Math.cos(half - theta);
      const filled = mode === 'filled';
      let R = R0;
      let a = rot0 - Math.PI / 2;
      for (let i = 0; i < layers; i++) {
        const t = layers === 1 ? 0 : i / (layers - 1);
        const p = layerPaint(t);
        if (p) {
          const pts: Array<[number, number]> = [];
          for (let k = 0; k < sides; k++) {
            const ak = a + k * half * 2;
            pts.push([r1(cx + Math.cos(ak) * R), r1(cy + Math.sin(ak) * R)]);
          }
          if (filled) {
            // 填充：外层到内层渐变 + 奇偶层轻微明暗差（opacity），阶梯更清楚
            parts.push(polygon(pts, { fill: p.fill, 'fill-opacity': p.op * (i % 2 === 0 ? 1 : 0.82) }));
          } else {
            parts.push(polygon(pts, { stroke: p.fill, 'stroke-opacity': p.op }));
          }
        }
        R *= s;
        a += theta;
        if (R < sw) break;
      }
      if (parts.length) {
        body.push(
          filled
            ? g({}, parts.join(''))
            : g({ fill: 'none', 'stroke-width': sw, 'stroke-linejoin': 'round' }, parts.join('')),
        );
      }
    }

    if (center.visible) {
      body.push(circle(cx, cy, Math.max(2 * u, R0 * 0.035), { fill: center.paintValue, 'fill-opacity': center.opacity }));
    }

    return { body: body.join('') };
  },
};

export default def;
