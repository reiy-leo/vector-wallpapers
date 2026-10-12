/**
 * 七宝纹 —— F 传统纹样（七宝繋ぎ）。
 *
 * 几何：半径 r 的圆，圆心落在「方格 2r + 中心 (r, r)」的格点上（相邻圆心距 √2·r）。
 * 每两枚相邻圆相交成一片透镜形花瓣，四片花瓣在交点处攒成四瓣花；
 * 每个圆内去掉四瓣后剩一枚内凹四角星（花心）。
 *
 * 单元 2r × 2r 内恰好容纳 4 片完整花瓣：都属于中心圆与四角圆的交叠，
 * 所以单元内无需跨边拼接，花瓣始终完整。
 *
 * 元件：底色（四角圆花心）、花瓣、花心（中心圆花心，隔一染色）、环线、结点（四瓣交点）。
 * 两种样式：filled 填色花瓣；outline 花瓣不填，改为内缩一圈的花瓣细线。
 */
import { circle, g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';
import { clamp, f, op, unitOf } from './_helpers';

type P = readonly [number, number];

/** 两圆（同半径 rr）交成的透镜：从 p 沿圆心 A 的圆走到 q，再沿圆心 B 的圆回到 p。 */
function lens(p: P, q: P, A: P, B: P, rr: number): string {
  const sweep = (c: P, s: P, e: P): number => ((s[0] - c[0]) * (e[1] - c[1]) - (s[1] - c[1]) * (e[0] - c[0]) > 0 ? 1 : 0);
  return (
    `M${f(p[0])} ${f(p[1])}A${f(rr)} ${f(rr)} 0 0 ${sweep(A, p, q)} ${f(q[0])} ${f(q[1])}` +
    `A${f(rr)} ${f(rr)} 0 0 ${sweep(B, q, p)} ${f(p[0])} ${f(p[1])}Z`
  );
}

const def: PatternDef = {
  id: 'shippo',
  name: '七宝纹',
  category: 'F-ornament',
  description: '等径圆环相交连绵，交叠处成四瓣花、圆心处成内凹星；花瓣、花心、环线可分别着色。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#efe9df' }, opacity: 1, visible: true, configurable: true },
    { id: 'petal', label: '花瓣', role: 'primary', paint: { type: 'solid', color: '#d8c8b2' }, opacity: 1, visible: true, configurable: true },
    { id: 'core', label: '花心', role: 'secondary', paint: { type: 'solid', color: '#e4dacb' }, opacity: 1, visible: true, configurable: true },
    { id: 'ring', label: '环线', role: 'detail', paint: { type: 'solid', color: '#a88a64' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'knot', label: '结点', role: 'accent', paint: { type: 'solid', color: '#9c5a48' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '圆环数', type: 'range', min: 4, max: 24, step: 1, default: 9, heavy: true },
    {
      key: 'mode', label: '样式', type: 'select', default: 'filled', options: [
        { value: 'filled', label: '填色花瓣' },
        { value: 'outline', label: '线描' },
      ],
    },
    { key: 'line', label: '线宽', type: 'range', min: 0.5, max: 4, step: 0.25, default: 1.5 },
    { key: 'knot', label: '结点大小', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'coreFill', label: '花心染色', type: 'toggle', default: true },
    { key: 'tilt', label: '斜置 45°', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'kinari',
      label: '素绢',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe9df' } },
        petal: { paint: { type: 'solid', color: '#d8c8b2' } },
        core: { paint: { type: 'solid', color: '#e4dacb' } },
        ring: { paint: { type: 'solid', color: '#a88a64' }, opacity: 0.85 },
        knot: { paint: { type: 'solid', color: '#9c5a48' } },
      },
    },
    {
      id: 'cloisonne',
      label: '景泰蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d3340' } },
        petal: { paint: { type: 'solid', color: '#3f6a74' } },
        core: { paint: { type: 'solid', color: '#26424f' } },
        ring: { paint: { type: 'solid', color: '#c9a868' }, opacity: 0.95 },
        knot: { paint: { type: 'solid', color: '#c9725a' } },
      },
      params: { line: 2 },
    },
    {
      id: 'plum-line',
      label: '梅鼠线描',
      elements: {
        bg: { paint: { type: 'solid', color: '#ece4e2' } },
        petal: { paint: { type: 'solid', color: '#b48c8f' } },
        core: { paint: { type: 'solid', color: '#e2d6d4' } },
        ring: { paint: { type: 'solid', color: '#7d5f65' }, opacity: 0.9 },
        knot: { paint: { type: 'solid', color: '#8a6d72' } },
      },
      params: { mode: 'outline', count: 11, line: 1.25 },
    },
    {
      id: 'night-garden',
      label: '夜庭',
      elements: {
        bg: { paint: { type: 'solid', color: '#22252b' } },
        petal: { paint: { type: 'solid', color: '#454a52' } },
        core: { paint: { type: 'solid', color: '#2c3038' } },
        ring: { paint: { type: 'solid', color: '#8d96a3' }, opacity: 0.6 },
        knot: { paint: { type: 'solid', color: '#d5b98a' } },
      },
      params: { tilt: true, count: 8 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['petal'], secondary: ['core'], accent: ['knot'], detail: ['ring'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(clamp(params.count, 4, 24, 9));
    const outline = params.mode === 'outline';
    const lineK = clamp(params.line, 0.5, 4, 1.5);
    const knotK = clamp(params.knot, 0, 1, 0.4);
    const coreFill = params.coreFill === true;
    const tilt = params.tilt === true;
    const unit = unitOf(W, H);
    const n = api.n;

    const bg = elements.get('bg')!;
    const petal = elements.get('petal')!;
    const core = elements.get('core')!;
    const ring = elements.get('ring')!;
    const knot = elements.get('knot')!;

    // count = 长边方向上的单元数；单元 2r × 2r
    const r = Math.max(W, H) / count / 2;
    const T = 2 * r;
    const sw = Math.min(unit * lineK, r / 8);

    const C: P = [r, r];
    const corners: P[] = [[0, 0], [T, 0], [0, T], [T, T]];
    // 每片花瓣：两个尖端 + 两个圆心
    const petals: Array<[P, P, P, P]> = [
      [[r, 0], [0, r], [0, 0], C],
      [[T, r], [r, 0], [T, 0], C],
      [[0, r], [r, T], [0, T], C],
      [[r, T], [T, r], [T, T], C],
    ];

    const parts: string[] = [];
    // 花心：中心圆整片铺 core，花瓣再压在上面 → 只剩内凹四角星
    if (coreFill) parts.push(circle(r, r, r, { fill: core.paintValue, 'fill-opacity': op(core.opacity) }));

    if (!outline) {
      let d = '';
      for (const [p, q, A, B] of petals) d += lens(p, q, A, B, r);
      parts.push(path(d, { fill: petal.paintValue, 'fill-opacity': op(petal.opacity) }));
    } else {
      // 线描：在花瓣内部再勾一片内缩 0.62 的小花瓣
      const k = 0.62;
      let d = '';
      for (const [p, q, A, B] of petals) {
        const M: P = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
        const s = (v: P): P => [M[0] + (v[0] - M[0]) * k, M[1] + (v[1] - M[1]) * k];
        d += lens(s(p), s(q), s(A), s(B), r * k);
      }
      parts.push(path(d, { fill: 'none', stroke: petal.paintValue, 'stroke-width': n(sw * 0.8), 'stroke-opacity': op(petal.opacity) }));
    }

    // 环线：5 个圆（中心 + 四角，四角圆在单元内只露四分之一）
    let rings = circle(r, r, r);
    for (const [x, y] of corners) rings += circle(x, y, r);
    parts.push(g({ fill: 'none', stroke: ring.paintValue, 'stroke-width': n(sw), 'stroke-opacity': op(ring.opacity) }, rings));

    // 结点：四瓣花的交点（落在单元四边中点，被裁一半，由邻单元补齐）+ 圆心小环
    if (knotK > 0) {
      const kr = Math.max(sw * 1.1, r * 0.13 * knotK);
      let dots = '';
      for (const [x, y] of [[r, 0], [0, r], [T, r], [r, T]] as P[]) dots += circle(x, y, kr);
      parts.push(
        g({ fill: knot.paintValue, 'fill-opacity': op(knot.opacity) }, dots) +
          circle(r, r, kr * 0.9, { fill: 'none', stroke: knot.paintValue, 'stroke-width': n(sw * 0.8), 'stroke-opacity': op(knot.opacity) }),
      );
    }

    const tileRef = api.tile({
      key: `shippo-${n(r)}-${outline ? 1 : 0}-${n(sw)}-${n(knotK)}-${coreFill ? 1 : 0}-${tilt ? 1 : 0}`,
      w: T,
      h: T,
      content: parts.join(''),
      transform: tilt ? 'rotate(45)' : undefined,
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': op(bg.opacity) }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;
