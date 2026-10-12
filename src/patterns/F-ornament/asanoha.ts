/**
 * 麻叶纹 —— F 传统纹样。
 *
 * 几何：边长 a 的正三角网格；每个三角形由重心向三个顶点连线，分成 3 个等腰小三角。
 * 每个格点周围 6 条格线 + 12 条重心连线组成六角星形「麻叶」。
 *
 * 着色（facet）：按小三角所依附的格线方向（水平 / 60° / 120°）分三档明度，
 * 朝上、朝下三角的映射错开一档 → 每片菱形叶的两半一明一暗，呈折纸般的棱面感。
 * 线描（line）：只留一档淡叶面；格线用 leaf_b、重心连线用 line 分别着色；格点缀小圆（node）。
 *
 * 走 <pattern> 平铺：单元宽 a、高 √3·a（两行三角）；同色小三角合并为一条 path。
 */
import { circle, g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';
import { clamp, f, op, unitOf } from './_helpers';

type P = readonly [number, number];

const def: PatternDef = {
  id: 'asanoha',
  name: '麻叶纹',
  category: 'F-ornament',
  description: '正三角网格以重心细分，连成六角星形的麻叶；可切换棱面着色或纯线描。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#e9e4da' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_a', label: '叶面 · 亮', role: 'primary', paint: { type: 'solid', color: '#dcd3c4' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf_b', label: '叶面 · 暗', role: 'secondary', paint: { type: 'solid', color: '#cdc2b0' }, opacity: 1, visible: true, configurable: true },
    { id: 'line', label: '叶脉线', role: 'detail', paint: { type: 'solid', color: '#8a7a66' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'node', label: '结点', role: 'accent', paint: { type: 'solid', color: '#b0563f' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '纹样数', type: 'range', min: 4, max: 24, step: 1, default: 10, heavy: true },
    {
      key: 'mode', label: '样式', type: 'select', default: 'facet', options: [
        { value: 'facet', label: '棱面' },
        { value: 'line', label: '线描' },
      ],
    },
    { key: 'line', label: '线宽', type: 'range', min: 0.5, max: 4, step: 0.25, default: 1.25 },
    { key: 'node', label: '结点大小', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: 'vertical', label: '竖向', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'kinari',
      label: '生成',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9e4da' } },
        leaf_a: { paint: { type: 'solid', color: '#dcd3c4' } },
        leaf_b: { paint: { type: 'solid', color: '#cdc2b0' } },
        line: { paint: { type: 'solid', color: '#8a7a66' }, opacity: 0.85 },
        node: { paint: { type: 'solid', color: '#b0563f' } },
      },
    },
    {
      id: 'kon',
      label: '紺',
      elements: {
        bg: { paint: { type: 'solid', color: '#1b2433' } },
        leaf_a: { paint: { type: 'solid', color: '#26334a' } },
        leaf_b: { paint: { type: 'solid', color: '#212c40' } },
        line: { paint: { type: 'solid', color: '#b7c2d3' }, opacity: 0.7 },
        node: { paint: { type: 'solid', color: '#d4b77c' } },
      },
    },
    {
      id: 'sumi-line',
      label: '墨线',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2efe8' } },
        leaf_a: { paint: { type: 'solid', color: '#e7e2d8' } },
        leaf_b: { paint: { type: 'solid', color: '#5a5650' }, opacity: 0.9 },
        line: { paint: { type: 'solid', color: '#3c3a37' }, opacity: 0.8 },
        node: { paint: { type: 'solid', color: '#3c3a37' } },
      },
      params: { mode: 'line', count: 12, node: 0.25, line: 1 },
    },
    {
      id: 'moss',
      label: '苔',
      elements: {
        bg: { paint: { type: 'solid', color: '#3d4a3c' } },
        leaf_a: { paint: { type: 'solid', color: '#566553' } },
        leaf_b: { paint: { type: 'solid', color: '#4a5848' } },
        line: { paint: { type: 'solid', color: '#c7cdb2' }, opacity: 0.55 },
        node: { paint: { type: 'solid', color: '#e0d2a4' } },
      },
      params: { count: 8, vertical: true },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['leaf_a'], secondary: ['leaf_b'], accent: ['node'], detail: ['line'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(clamp(params.count, 4, 24, 10));
    const lineMode = params.mode === 'line';
    const lineK = clamp(params.line, 0.5, 4, 1.25);
    const nodeK = clamp(params.node, 0, 1, 0.35);
    const vertical = params.vertical === true;
    const unit = unitOf(W, H);
    const n = api.n;

    const bg = elements.get('bg')!;
    const la = elements.get('leaf_a')!;
    const lb = elements.get('leaf_b')!;
    const ln = elements.get('line')!;
    const node = elements.get('node')!;

    const a = Math.max(W, H) / count;
    const h = (a * Math.sqrt(3)) / 2;
    const tileW = a;
    const tileH = 2 * h;
    const sw = Math.min(unit * lineK, a / 14);

    // 三档：0 → leaf_a，1 → leaf_b，2 → 留底色
    const fills: string[] = ['', '', ''];
    let lines = '';
    const pt = (p: P): string => `${f(p[0])} ${f(p[1])}`;
    const tri = (p1: P, p2: P, p3: P, up: boolean): void => {
      const c: P = [(p1[0] + p2[0] + p3[0]) / 3, (p1[1] + p2[1] + p3[1]) / 3];
      const edges: Array<[P, P]> = [[p1, p2], [p2, p3], [p3, p1]];
      for (const [u, v] of edges) {
        const dx = v[0] - u[0];
        const dy = v[1] - u[1];
        // 方向档：水平 0，/ 1，\ 2（y 向下）
        const dir = Math.abs(dy) < 1e-6 ? 0 : dx * dy < 0 ? 1 : 2;
        const tone = (dir + (up ? 0 : 1)) % 3;
        fills[tone] += `M${pt(u)}L${pt(v)}L${pt(c)}Z`;
        lines += `M${pt(u)}L${pt(c)}`;
      }
    };

    // 覆盖单元的三角：行 r ∈ [-1, 2]，奇数行横向错位 a/2
    for (let r = -1; r <= 2; r++) {
      const y0 = r * h;
      const y1 = (r + 1) * h;
      const oTop = ((r % 2) + 2) % 2 === 1 ? a / 2 : 0;
      const oBot = oTop === 0 ? a / 2 : 0;
      for (let i = -1; i <= 1; i++) {
        const tx = oTop + i * a;
        tri([tx, y0], [tx + a, y0], [tx + a / 2, y1], false); // 朝下
        const bx = oBot + i * a;
        tri([bx, y1], [bx + a, y1], [bx + a / 2, y0], true); // 朝上
      }
    }
    // 格线：水平线 + 两组斜线（各画一遍，避免重复描边加深）
    let grid = '';
    for (let r = 0; r <= 2; r++) grid += `M${f(-a)} ${f(r * h)}H${f(2 * a)}`;
    for (let i = -2; i <= 2; i++) {
      const x = i * a;
      grid += `M${f(x)} 0L${f(x + a)} ${f(tileH)}M${f(x + a)} 0L${f(x)} ${f(tileH)}`;
    }

    const parts: string[] = [];
    if (!lineMode) {
      parts.push(path(fills[0], { fill: la.paintValue, 'fill-opacity': op(la.opacity) }));
      parts.push(path(fills[1], { fill: lb.paintValue, 'fill-opacity': op(lb.opacity) }));
      parts.push(
        g(
          { fill: 'none', stroke: ln.paintValue, 'stroke-opacity': op(ln.opacity), 'stroke-linecap': 'round' },
          path(grid, { 'stroke-width': n(sw) }) + path(lines, { 'stroke-width': n(sw * 0.75) }),
        ),
      );
    } else {
      // 线描：只留一档淡淡的叶面（单向棱光），格线用 leaf_b、重心连线用 line —— 两套线可分别着色
      parts.push(path(fills[0], { fill: la.paintValue, 'fill-opacity': op(la.opacity) }));
      parts.push(
        path(grid, { fill: 'none', stroke: lb.paintValue, 'stroke-width': n(sw * 1.15), 'stroke-opacity': op(lb.opacity), 'stroke-linecap': 'round' }),
      );
      parts.push(
        path(lines, { fill: 'none', stroke: ln.paintValue, 'stroke-width': n(sw * 0.75), 'stroke-opacity': op(ln.opacity), 'stroke-linecap': 'round' }),
      );
    }
    if (nodeK > 0) {
      const nr = Math.max(sw * 1.2, (a / 16) * nodeK * 2);
      let dots = '';
      for (const [cx, cy] of [[0, 0], [a, 0], [a / 2, h], [0, tileH], [a, tileH]] as P[]) dots += circle(cx, cy, nr);
      parts.push(g({ fill: node.paintValue, 'fill-opacity': op(node.opacity) }, dots));
    }

    const tileRef = api.tile({
      key: `asanoha-${n(a)}-${lineMode ? 1 : 0}-${n(sw)}-${n(nodeK)}-${vertical ? 1 : 0}`,
      w: tileW,
      h: tileH,
      content: parts.join(''),
      transform: vertical ? 'rotate(90)' : undefined,
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
