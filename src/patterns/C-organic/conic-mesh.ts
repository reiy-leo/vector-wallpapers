/**
 * 圆锥渐变 —— C 渐变流体 / 有机形态。
 *
 * SVG 没有原生 conic-gradient。做法：以中心点为顶点，把 360° 切成 N 个细扇形楔块，
 * 每块取其中线角处的颜色（在 3–5 个色标间按 OKLab 环形样条插值，首尾相接成环），
 * 拼出圆锥渐变；再叠一层「柔光」与一层「暗角」大径向渐变，压住楔块的阶梯感、
 * 让画面带上 mesh 渐变的柔和起伏。
 *
 * 体积控制：
 *  - 楔块不是「超大三角形」，而是精确裁到画布矩形边界上
 *    （射线与矩形求交 + 补入落在楔块内的矩形角点），装进一个画布大小的 <pattern>，
 *    被「清晰底 + 模糊层」两个 rect 引用 —— 楔块只序列化一次；
 *  - 楔块数受控件上限 144 约束，每块一个 path ≈ 60–75B → 默认 96 块约 7KB，拉满约 10KB。
 *  - 相邻楔块向后多盖 0.35 个步长，消除抗锯齿造成的放射状发丝缝。
 *  - 「柔化模糊」用引擎 blur（feGaussianBlur）进一步抹平阶梯与锥心尖点；设 0 即无滤镜。
 *
 * 所有元件都是纯色（色标、柔光、暗角的颜色都可直接改），渐变由 render 现场合成。
 * 无随机性 → seedable: false。
 */
import { g, path, rect } from '../../engine/svg';
import type { PaintSpec, PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const STOP_IDS = ['stop_1', 'stop_2', 'stop_3', 'stop_4', 'stop_5'] as const;

type Lab = [number, number, number];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6);
  const v = parseInt(full, 16);
  if (!Number.isFinite(v)) return [0, 0, 0];
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

const toLin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};
const fromLin = (c: number): number => {
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.max(0, c), 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
};

function hexToLab(hex: string): Lab {
  const [r8, g8, b8] = hexToRgb(hex);
  const r = toLin(r8);
  const gg = toLin(g8);
  const b = toLin(b8);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * gg + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * gg + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * gg + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToHex([L, A, B]: Lab): string {
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3);
  const m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3);
  const s = Math.pow(L - 0.0894841775 * A - 1.291485548 * B, 3);
  const r = fromLin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const gg = fromLin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const b = fromLin(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return `#${((1 << 24) | (r << 16) | (gg << 8) | b).toString(16).slice(1)}`;
}

/** 元件 → 代表色：纯色取本色，渐变取首个色标（色标元件按设计应为纯色）。 */
function paintColor(p: PaintSpec): string | null {
  if (p.type === 'solid') return p.color;
  if (p.type === 'linear' || p.type === 'radial') return p.stops[0]?.color ?? null;
  return null;
}

const def: PatternDef = {
  id: 'conic-mesh',
  name: '圆锥渐变',
  category: 'C-organic',
  description: '细扇形楔块拼出的圆锥渐变，色标首尾成环，叠加柔光与暗角形成 mesh 般的柔和起伏，中心可移动。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#efe6ea' }, opacity: 1, visible: true, configurable: true },
    { id: 'stop_1', label: '色标 1', role: 'primary', paint: { type: 'solid', color: '#f3c9b8' }, opacity: 1, visible: true, configurable: true },
    { id: 'stop_2', label: '色标 2', role: 'secondary', paint: { type: 'solid', color: '#e9b8cf' }, opacity: 1, visible: true, configurable: true },
    { id: 'stop_3', label: '色标 3', role: 'secondary', paint: { type: 'solid', color: '#bfc0ea' }, opacity: 1, visible: true, configurable: true },
    { id: 'stop_4', label: '色标 4', role: 'accent', paint: { type: 'solid', color: '#b7dbe0' }, opacity: 1, visible: true, configurable: true },
    { id: 'stop_5', label: '色标 5', role: 'accent', paint: { type: 'solid', color: '#f1dfb0' }, opacity: 1, visible: true, configurable: true },
    { id: 'glow', label: '柔光', role: 'detail', paint: { type: 'solid', color: '#ffffff' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'shade', label: '暗角', role: 'detail', paint: { type: 'solid', color: '#6b5a7a' }, opacity: 0.18, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '色标数', type: 'range', min: 3, max: 5, step: 1, default: 5 },
    { key: 'cx', label: '中心 X', type: 'range', min: 0, max: 1, step: 0.01, default: 0.62, group: '中心' },
    { key: 'cy', label: '中心 Y', type: 'range', min: 0, max: 1, step: 0.01, default: 0.58, group: '中心' },
    { key: 'start', label: '起始角', type: 'angle', default: 30 },
    { key: 'segments', label: '楔块数', type: 'range', min: 36, max: 144, step: 4, default: 96, heavy: true },
    { key: 'soften', label: '柔化模糊', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, group: '柔化' },
    { key: 'glowSize', label: '柔光范围', type: 'range', min: 0.1, max: 0.9, step: 0.01, default: 0.42, group: '柔化' },
    { key: 'glowAtCenter', label: '柔光跟随中心', type: 'toggle', default: true, group: '柔化' },
  ],

  presets: [
    {
      id: 'pastel',
      label: '粉彩',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe6ea' } },
        stop_1: { paint: { type: 'solid', color: '#f3c9b8' } },
        stop_2: { paint: { type: 'solid', color: '#e9b8cf' } },
        stop_3: { paint: { type: 'solid', color: '#bfc0ea' } },
        stop_4: { paint: { type: 'solid', color: '#b7dbe0' } },
        stop_5: { paint: { type: 'solid', color: '#f1dfb0' } },
        glow: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.55 },
        shade: { paint: { type: 'solid', color: '#6b5a7a' }, opacity: 0.18 },
      },
    },
    {
      id: 'ember',
      label: '余烬',
      elements: {
        bg: { paint: { type: 'solid', color: '#1a1220' } },
        stop_1: { paint: { type: 'solid', color: '#2a1b3d' } },
        stop_2: { paint: { type: 'solid', color: '#6b2d4f' } },
        stop_3: { paint: { type: 'solid', color: '#b5625a' } },
        stop_4: { paint: { type: 'solid', color: '#d99a64' } },
        stop_5: { paint: { type: 'solid', color: '#4a2b5c' } },
        glow: { paint: { type: 'solid', color: '#ffd9a8' }, opacity: 0.28 },
        shade: { paint: { type: 'solid', color: '#0b0710' }, opacity: 0.55 },
      },
      params: { count: 5, cx: 0.5, cy: 0.62, start: 200, glowSize: 0.3 },
    },
    {
      id: 'lagoon',
      label: '泻湖',
      elements: {
        bg: { paint: { type: 'solid', color: '#e3eeee' } },
        stop_1: { paint: { type: 'solid', color: '#9fd3cf' } },
        stop_2: { paint: { type: 'solid', color: '#cbe6c9' } },
        stop_3: { paint: { type: 'solid', color: '#a9c6e8' } },
        glow: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.5 },
        shade: { paint: { type: 'solid', color: '#2f5d68' }, opacity: 0.16 },
      },
      params: { count: 3, cx: 0.32, cy: 0.42, start: 90 },
    },
    {
      id: 'dusk',
      label: '暮霭',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2233' } },
        stop_1: { paint: { type: 'solid', color: '#2b3553' } },
        stop_2: { paint: { type: 'solid', color: '#5a4f7d' } },
        stop_3: { paint: { type: 'solid', color: '#a77a9a' } },
        stop_4: { paint: { type: 'solid', color: '#3f5f7f' } },
        glow: { paint: { type: 'solid', color: '#f2c6b4' }, opacity: 0.3 },
        shade: { paint: { type: 'solid', color: '#0d101a' }, opacity: 0.5 },
      },
      params: { count: 4, cx: 0.7, cy: 0.35, start: 120, glowAtCenter: false },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['stop_1'],
    secondary: ['stop_2', 'stop_3'],
    accent: ['stop_4', 'stop_5'],
    detail: ['glow', 'shade'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const { n } = api;
    const count = Math.max(3, Math.min(5, Math.round(Number(params.count))));
    const N = Math.max(8, Math.min(144, Math.round(Number(params.segments))));
    const ux = Math.min(1, Math.max(0, Number(params.cx)));
    const uy = Math.min(1, Math.max(0, Number(params.cy)));
    const cx = W * ux;
    const cy = H * uy;
    const start = (Number(params.start) * Math.PI) / 180;

    const bg = elements.get('bg')!;
    const glow = elements.get('glow')!;
    const shade = elements.get('shade')!;

    // 参与插值的色标：前 count 个中可见且有颜色的。
    const stops: Array<{ lab: Lab; op: number }> = [];
    for (let i = 0; i < count; i++) {
      const e = elements.get(STOP_IDS[i])!;
      const c = e.visible ? paintColor(e.paint) : null;
      if (c) stops.push({ lab: hexToLab(c), op: e.opacity });
    }

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    if (stops.length > 0) {
      const sigma = Math.min(W, H) * 0.03 * Math.min(1, Math.max(0, Number(params.soften)));
      // 楔块装进一个画布大小的 <pattern>：恰好裁到画布，且可被「清晰底 + 模糊层」引用两次而不重复体积。
      const m = 0;
      const x0 = -m;
      const y0 = -m;
      const x1 = W + m;
      const y1 = H + m;
      const corners: Array<[number, number]> = [
        [x1, y1],
        [x0, y1],
        [x0, y0],
        [x1, y0],
      ];
      const TAU = Math.PI * 2;
      const norm = (a: number): number => ((a % TAU) + TAU) % TAU;
      const cornerAng = corners.map(([x, y]) => Math.atan2(y - cy, x - cx));

      const hit = (a: number): [number, number] => {
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        let t = Infinity;
        if (dx > 1e-9) t = Math.min(t, (x1 - cx) / dx);
        if (dx < -1e-9) t = Math.min(t, (x0 - cx) / dx);
        if (dy > 1e-9) t = Math.min(t, (y1 - cy) / dy);
        if (dy < -1e-9) t = Math.min(t, (y0 - cy) / dy);
        return [cx + dx * t, cy + dy * t];
      };

      const colorAt = (t: number): { hex: string; op: number } => {
        const k = stops.length;
        if (k === 1) return { hex: labToHex(stops[0].lab), op: stops[0].op };
        const f = t * k;
        const i = Math.floor(f) % k;
        const u = f - Math.floor(f);
        // 环形 Catmull-Rom 样条（在 OKLab 中）：导数连续 —— 线性插值在色标处导数突变，
        // 会出现马赫带（一条从锥心射出的「亮线 / 暗线」）；smoothstep 又会把过渡挤进更少楔块。
        const P0 = stops[(i - 1 + k) % k];
        const P1 = stops[i];
        const P2 = stops[(i + 1) % k];
        const P3 = stops[(i + 2) % k];
        const u2 = u * u;
        const u3 = u2 * u;
        const cr = (a: number, b: number, c: number, d: number): number =>
          0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
        const lab: Lab = [
          cr(P0.lab[0], P1.lab[0], P2.lab[0], P3.lab[0]),
          cr(P0.lab[1], P1.lab[1], P2.lab[1], P3.lab[1]),
          cr(P0.lab[2], P1.lab[2], P2.lab[2], P3.lab[2]),
        ];
        return { hex: labToHex(lab), op: Math.min(1, Math.max(0, P1.op + (P2.op - P1.op) * u)) };
      };

      const step = TAU / N;
      const C = `${n(cx)} ${n(cy)}`;
      const wedges: string[] = [];
      for (let i = 0; i < N; i++) {
        const a0 = start + i * step;
        const span = step * 1.35;
        const a1 = a0 + span;
        const [px0, py0] = hit(a0);
        const [px1, py1] = hit(a1);
        let d = `M${C}L${n(px0)} ${n(py0)}`;
        const inner = cornerAng
          .map((ca, ci) => ({ ci, rel: norm(ca - a0) }))
          .filter((o) => o.rel > 0 && o.rel < span)
          .sort((p, q) => p.rel - q.rel);
        for (const o of inner) d += `L${n(corners[o.ci][0])} ${n(corners[o.ci][1])}`;
        d += `L${n(px1)} ${n(py1)}Z`;
        const { hex, op } = colorAt((i + 0.5) / N);
        wedges.push(path(d, { fill: hex, 'fill-opacity': op >= 0.995 ? undefined : n(op) }));
      }
      const conic = api.tile({ key: 'cm-conic', w: W, h: H, content: g({}, wedges.join('')) });
      // 清晰底：保证四边不露底（模糊在画布边缘会从外侧吸入透明，表现为一圈发白 / 发灰）。
      parts.push(rect(0, 0, W, H, { fill: conic }));
      // 模糊层：高斯模糊抹平楔块阶梯与锥心的尖点 —— 与 aurora-wave 同一个引擎 blur 入口。
      if (sigma > 0.5) parts.push(rect(0, 0, W, H, { fill: conic, filter: api.blur(sigma) }));
    }

    // 柔光：中心处的大径向渐变，柔化楔块汇聚点并提亮一片 —— mesh 感的主要来源。
    if (glow.visible) {
      const c = paintColor(glow.paint);
      if (c) {
        const follow = params.glowAtCenter === true;
        const gx = follow ? ux : 1 - ux * 0.8;
        const gy = follow ? uy : 1 - uy * 0.8;
        const fill = api.radial({
          key: 'cm-glow',
          cx: gx,
          cy: gy,
          r: Number(params.glowSize),
          stops: [
            { offset: 0, color: c, opacity: glow.opacity },
            { offset: 0.45, color: c, opacity: glow.opacity * 0.45 },
            { offset: 1, color: c, opacity: 0 },
          ],
        });
        parts.push(rect(0, 0, W, H, { fill }));
      }
    }

    // 暗角：画布中心透明 → 边缘染色，收拢视线、压住四角的高饱和楔块。
    if (shade.visible) {
      const c = paintColor(shade.paint);
      if (c) {
        const fill = api.radial({
          key: 'cm-shade',
          cx: 0.5,
          cy: 0.5,
          r: 0.75,
          stops: [
            { offset: 0.35, color: c, opacity: 0 },
            { offset: 1, color: c, opacity: shade.opacity },
          ],
        });
        parts.push(rect(0, 0, W, H, { fill }));
      }
    }

    return { body: parts.join('') };
  },
};

export default def;
