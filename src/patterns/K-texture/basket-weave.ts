/**
 * 篮编 —— K 材质纹理 / 平铺。
 *
 * 结构：经（竖条 warp）纬（横条 weft）一上一下平纹交织，周期 2×2 格，走 `<pattern>` 平铺。
 * 立体感全靠「影」与「光」两个元件（均为纯色，经渐变的 stop-opacity 做明暗层）：
 *   - 压在上面的一段：两端渐暗（正要钻到下面去），长边一道细暗线收边；
 *   - 钻在下面露出的一段：越靠近压住它的那条越暗；
 *   - 上面一段中部偏上有一道柔和的高光。
 * 每条可由 1~4 股细篾组成（股间细线），条间缝隙露出底色。可整体斜 45°。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, PaintStop, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { num, op } from './_helpers';

const def: PatternDef = {
  id: 'basket-weave',
  name: '篮编',
  category: 'K-texture',
  description: '经纬篾条一上一下交织，压处渐暗、上段带柔光，像一张安静的藤编席面。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '缝隙', role: 'bg', paint: { type: 'solid', color: '#4f3d2c' }, opacity: 1, visible: true, configurable: true },
    { id: 'warp', label: '经条', role: 'primary', paint: { type: 'solid', color: '#c8a774' }, opacity: 1, visible: true, configurable: true },
    { id: 'weft', label: '纬条', role: 'secondary', paint: { type: 'solid', color: '#d6b988' }, opacity: 1, visible: true, configurable: true },
    { id: 'shade', label: '阴影', role: 'detail', paint: { type: 'solid', color: '#3a2a1b' }, opacity: 1, visible: true, configurable: true },
    { id: 'highlight', label: '高光', role: 'accent', paint: { type: 'solid', color: '#f6e7c8' }, opacity: 0.42, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '编格大小', type: 'range', min: 0.04, max: 0.18, step: 0.005, default: 0.09 },
    { key: 'gap', label: '缝隙', type: 'range', min: 0, max: 0.4, step: 0.02, default: 0.14 },
    { key: 'strands', label: '每条股数', type: 'range', min: 1, max: 4, step: 1, default: 3 },
    { key: 'depth', label: '立体感', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    {
      key: 'orient', label: '方向', type: 'select', default: 'straight', options: [
        { value: 'straight', label: '正交' },
        { value: 'diagonal', label: '斜 45°' },
      ],
    },
  ],

  presets: [
    {
      id: 'rattan',
      label: '藤席',
      elements: {
        bg: { paint: { type: 'solid', color: '#4f3d2c' } },
        warp: { paint: { type: 'solid', color: '#c8a774' } },
        weft: { paint: { type: 'solid', color: '#d6b988' } },
        shade: { paint: { type: 'solid', color: '#3a2a1b' } },
        highlight: { paint: { type: 'solid', color: '#f6e7c8' }, opacity: 0.42 },
      },
    },
    {
      id: 'paper',
      label: '米纸',
      elements: {
        bg: { paint: { type: 'solid', color: '#cfc6b6' } },
        warp: { paint: { type: 'solid', color: '#ede7dc' } },
        weft: { paint: { type: 'solid', color: '#e4ddcf' } },
        shade: { paint: { type: 'solid', color: '#7a6c58' } },
        highlight: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.5 },
      },
      params: { gap: 0.04, strands: 2, depth: 0.5, size: 0.1 },
    },
    {
      id: 'indigo',
      label: '靛蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#161d2b' } },
        warp: { paint: { type: 'solid', color: '#3a4d70' } },
        weft: { paint: { type: 'solid', color: '#566b8f' } },
        shade: { paint: { type: 'solid', color: '#0a0e17' } },
        highlight: { paint: { type: 'solid', color: '#b3c2dc' }, opacity: 0.35 },
      },
      params: { strands: 2, gap: 0.18, size: 0.075 },
    },
    {
      id: 'sage',
      label: '草编',
      elements: {
        bg: { paint: { type: 'solid', color: '#39433c' } },
        warp: { paint: { type: 'solid', color: '#a5b29c' } },
        weft: { paint: { type: 'solid', color: '#bfc8b1' } },
        shade: { paint: { type: 'solid', color: '#1d241f' } },
        highlight: { paint: { type: 'solid', color: '#eef2e4' }, opacity: 0.45 },
      },
      params: { orient: 'diagonal', strands: 4, gap: 0.08, size: 0.11 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['warp'],
    secondary: ['weft'],
    accent: ['highlight'],
    detail: ['shade'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const size = num(params, 'size', 0.04, 0.18);
    const gap = num(params, 'gap', 0, 0.4);
    const strands = Math.round(num(params, 'strands', 1, 4));
    const depth = num(params, 'depth', 0, 1);
    const diagonal = params.orient === 'diagonal';
    const n = api.n;

    const bg = elements.get('bg')!;
    const warp = elements.get('warp')!;
    const weft = elements.get('weft')!;
    const shade = elements.get('shade')!;
    const hl = elements.get('highlight')!;

    const s = Math.min(W, H) * size; // 一格边长（按短边缩放）
    const w = s * (1 - gap); // 条宽
    const e = (s - w) / 2; // 条到格边的距离
    const sc = shade.paintValue;
    const so = shade.opacity;
    const eo = e / s;

    // 沿条长方向的明暗（0~1 = 一格）：上段两端渐暗；下段越靠近交叉越暗
    const overStops: PaintStop[] = [
      { offset: 0, color: sc, opacity: so * depth * 0.5 },
      { offset: 0.22, color: sc, opacity: so * depth * 0.1 },
      { offset: 0.5, color: sc, opacity: 0 },
      { offset: 0.78, color: sc, opacity: so * depth * 0.1 },
      { offset: 1, color: sc, opacity: so * depth * 0.5 },
    ];
    const underStops: PaintStop[] = [
      { offset: 0, color: sc, opacity: so * depth * 0.5 },
      { offset: Math.max(0.01, eo), color: sc, opacity: so * Math.min(1, depth * 0.85) },
      { offset: 0.5, color: sc, opacity: so * Math.min(1, depth * 0.95) },
      { offset: Math.min(0.99, 1 - eo), color: sc, opacity: so * Math.min(1, depth * 0.85) },
      { offset: 1, color: sc, opacity: so * depth * 0.5 },
    ];
    const hlStops: PaintStop[] = [
      { offset: 0.1, color: hl.paintValue, opacity: 0 },
      { offset: 0.5, color: hl.paintValue, opacity: hl.opacity },
      { offset: 0.9, color: hl.paintValue, opacity: 0 },
    ];
    const gOverH = shade.visible ? api.linear({ key: 'bw-oh', angle: 0, stops: overStops }) : '';
    const gOverV = shade.visible ? api.linear({ key: 'bw-ov', angle: 90, stops: overStops }) : '';
    const gUnderH = shade.visible ? api.linear({ key: 'bw-uh', angle: 0, stops: underStops }) : '';
    const gUnderV = shade.visible ? api.linear({ key: 'bw-uv', angle: 90, stops: underStops }) : '';
    const gHlH = hl.visible ? api.linear({ key: 'bw-hh', angle: 0, stops: hlStops }) : '';
    const gHlV = hl.visible ? api.linear({ key: 'bw-hv', angle: 90, stops: hlStops }) : '';

    const edgeT = Math.max(0.6, w * 0.045); // 长边收边暗线粗细
    const strandSW = Math.max(0.5, s * 0.012);

    /** 一段横条（纬）或竖条（经）在一格内的全部图形。 */
    const piece = (x: number, y: number, horiz: boolean, over: boolean): string => {
      const el = horiz ? weft : warp;
      const [rx, ry, rw, rh] = horiz ? [x, y + e, s, w] : [x + e, y, w, s];
      let out = '';
      if (el.visible) out += rect(rx, ry, rw, rh, { fill: el.paintValue, 'fill-opacity': el.opacity });
      // 股间细线
      if (strands > 1 && shade.visible) {
        let d = '';
        for (let k = 1; k < strands; k++) {
          const t = (w * k) / strands;
          d += horiz ? `M${n(rx)} ${n(ry + t)}h${n(rw)}` : `M${n(rx + t)} ${n(ry)}v${n(rh)}`;
        }
        out += `<path d="${d}" stroke="${sc}" stroke-opacity="${op(so * (0.18 + depth * 0.25))}" stroke-width="${n(strandSW)}"/>`;
      }
      if (shade.visible && depth > 0) {
        out += rect(rx, ry, rw, rh, { fill: over ? (horiz ? gOverH : gOverV) : horiz ? gUnderH : gUnderV });
        if (over) {
          // 长边收边
          const a = horiz ? rect(rx, ry, rw, edgeT) : rect(rx, ry, edgeT, rh);
          const b = horiz ? rect(rx, ry + rh - edgeT, rw, edgeT) : rect(rx + rw - edgeT, ry, edgeT, rh);
          out += `<g fill="${sc}" fill-opacity="${op(so * (0.25 + depth * 0.45))}">${a}${b}</g>`;
        }
      }
      if (over && hl.visible) {
        const hw = w * 0.2;
        const off = w * 0.2;
        out += horiz ? rect(rx, ry + off, rw, hw, { fill: gHlH, rx: n(hw / 2) }) : rect(rx + off, ry, hw, rh, { fill: gHlV, rx: n(hw / 2) });
      }
      return out;
    };

    /** 一格：先画下面那条，再画压在上面那条。 */
    const cell = (i: number, j: number): string => {
      const hOver = (i + j) % 2 === 0;
      const x = i * s;
      const y = j * s;
      return hOver ? piece(x, y, false, false) + piece(x, y, true, true) : piece(x, y, true, false) + piece(x, y, false, true);
    };
    const content = cell(0, 0) + cell(1, 0) + cell(0, 1) + cell(1, 1);
    const tile = api.tile({
      key: `bw-${n(s)}-${n(gap)}-${strands}-${n(depth)}`,
      w: 2 * s,
      h: 2 * s,
      content,
      transform: diagonal ? 'rotate(45)' : undefined,
    });

    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + rect(0, 0, W, H, { fill: tile }),
    };
  },
};

export default def;
