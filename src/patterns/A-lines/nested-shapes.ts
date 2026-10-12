/**
 * 嵌套几何 —— A 极简几何线条。
 *
 * 同心嵌套的三角 / 方形 / 菱形，层层内缩、两色交替，最内层为点缀色。
 * 两种构图：
 *  - 平铺：一个单元内画一组嵌套形，走 <pattern>，可半格错位（菱形错位即成菱格）。
 *  - 单幅居中：一组大尺度嵌套形占据画面中心，四周留白，适合做桌面主视觉。
 *
 * 默认深石板 + 微差层色 + 暗金芯：层间亮度差小，安静不跳。
 */
import { g, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

function unitOf(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

type Shape = 'square' | 'diamond' | 'triangle';

/** 以 (cx,cy) 为中心、外接半径 r 的形状顶点。三角形重心下移，视觉居中。 */
function shapePoints(shape: Shape, cx: number, cy: number, r: number, rot: number): Array<[number, number]> {
  const sides = shape === 'triangle' ? 3 : 4;
  const base = shape === 'square' ? Math.PI / 4 : -Math.PI / 2;
  const dy = shape === 'triangle' ? r * 0.18 : 0;
  const a0 = base + (rot * Math.PI) / 180;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < sides; i++) {
    const a = a0 + (i * Math.PI * 2) / sides;
    pts.push([cx + Math.cos(a) * r, cy + dy + Math.sin(a) * r]);
  }
  return pts;
}

const def: PatternDef = {
  id: 'nested-shapes',
  name: '嵌套几何',
  category: 'B-repeat',
  description: '同心嵌套的方形、菱形或三角，两色交替层层内缩，可平铺或单幅居中。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1e262e' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer_a', label: '层 · 甲', role: 'primary', paint: { type: 'solid', color: '#2b3844' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer_b', label: '层 · 乙', role: 'secondary', paint: { type: 'solid', color: '#3a4a56' }, opacity: 1, visible: true, configurable: true },
    { id: 'core', label: '内芯', role: 'accent', paint: { type: 'solid', color: '#c4a06a' }, opacity: 0.8, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'shape',
      label: '形状',
      type: 'select',
      default: 'diamond',
      options: [
        { value: 'diamond', label: '菱形' },
        { value: 'square', label: '方形' },
        { value: 'triangle', label: '三角' },
      ],
    },
    {
      key: 'layout',
      label: '构图',
      type: 'select',
      default: 'tile',
      options: [
        { value: 'tile', label: '平铺' },
        { value: 'single', label: '单幅居中' },
      ],
    },
    { key: 'layers', label: '层数', type: 'range', min: 2, max: 14, step: 1, default: 6 },
    { key: 'cell', label: '单元尺寸', type: 'range', min: 80, max: 480, step: 4, default: 340, unit: 'px', heavy: true },
    { key: 'margin', label: '留白', type: 'range', min: 0, max: 0.4, step: 0.01, default: 0.05 },
    { key: 'stagger', label: '半格错位', type: 'toggle', default: true },
    { key: 'outline', label: '描边模式', type: 'toggle', default: false },
    { key: 'weight', label: '描边粗细', type: 'range', min: 0.5, max: 8, step: 0.1, default: 2, unit: 'px' },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
  ],

  presets: [
    {
      id: 'slate',
      label: '石板暗金',
      elements: {
        bg: { paint: { type: 'solid', color: '#1e262e' } },
        layer_a: { paint: { type: 'solid', color: '#2b3844' } },
        layer_b: { paint: { type: 'solid', color: '#3a4a56' } },
        core: { paint: { type: 'solid', color: '#c4a06a' } },
      },
    },
    {
      id: 'sand',
      label: '沙丘',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1ebe1' } },
        layer_a: { paint: { type: 'solid', color: '#e3d7c5' } },
        layer_b: { paint: { type: 'solid', color: '#d3c2aa' } },
        core: { paint: { type: 'solid', color: '#b07a5a' } },
      },
      params: { shape: 'square', stagger: false, cell: 300, margin: 0.1 },
    },
    {
      id: 'sage-single',
      label: '鼠尾草 · 单幅',
      elements: {
        bg: { paint: { type: 'solid', color: '#e6eae3' } },
        layer_a: { paint: { type: 'solid', color: '#d2dacd' } },
        layer_b: { paint: { type: 'solid', color: '#bccab6' } },
        core: { paint: { type: 'solid', color: '#7f8f78' } },
      },
      params: { layout: 'single', shape: 'triangle', layers: 9, margin: 0.12 },
    },
    {
      id: 'dusk-outline',
      label: '暮色线框',
      elements: {
        bg: { paint: { type: 'solid', color: '#232031' } },
        layer_a: { paint: { type: 'solid', color: '#6d6585' } },
        layer_b: { paint: { type: 'solid', color: '#9a8fae' }, opacity: 0.7 },
        core: { paint: { type: 'solid', color: '#d9a982' } },
      },
      params: { outline: true, layers: 5, shape: 'diamond', cell: 420, weight: 1.6 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['layer_a'], secondary: ['layer_b'], accent: ['core'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const u = unitOf(W, H);
    const shape = (['square', 'diamond', 'triangle'].includes(String(params.shape)) ? params.shape : 'diamond') as Shape;
    const single = params.layout === 'single';
    const layers = Math.max(2, Math.round(Number(params.layers)));
    const margin = Math.min(0.45, Math.max(0, Number(params.margin)));
    const outline = params.outline === true;
    const sw = Math.max(0.3, Number(params.weight) * u);
    const rot = Number(params.rotate);
    const stagger = params.stagger === true;

    const bg = elements.get('bg')!;
    const la = elements.get('layer_a')!;
    const lb = elements.get('layer_b')!;
    const core = elements.get('core')!;

    /** 画一组以 (cx,cy) 为中心、外接半径 R 的嵌套形。 */
    const nest = (cx: number, cy: number, R: number): string => {
      let out = '';
      for (let i = 0; i < layers; i++) {
        const r = R * (1 - i / layers);
        const isCore = i === layers - 1;
        const el = isCore ? core : i % 2 === 0 ? la : lb;
        if (!el.visible) continue;
        const pts = shapePoints(shape, cx, cy, r, rot);
        out += outline
          ? polygon(pts, { fill: 'none', stroke: el.paintValue, 'stroke-opacity': el.opacity, 'stroke-width': sw, 'stroke-linejoin': 'round' })
          : polygon(pts, { fill: el.paintValue, 'fill-opacity': el.opacity });
      }
      return out;
    };

    const body = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    if (single) {
      // 单幅：外接半径取短边的一半减留白；三角形外接圆更大，略缩以免顶到边。
      const k = shape === 'triangle' ? 1.05 : shape === 'square' ? 0.82 : 1;
      const R = (Math.min(W, H) / 2) * (1 - margin) * k;
      const inner = nest(W / 2, H / 2, R);
      if (inner) body.push(g({}, inner));
      return { body: body.join('') };
    }

    const c = Math.max(8, Number(params.cell) * u);
    // 外接半径：方形 = 半格 × √2（边贴格），菱形 = 半格（顶点贴格），三角略缩。
    // 错位时菱形恰好互相咬合成菱格；方形 / 三角会与角上的组重叠，故缩到约一半。
    const base = shape === 'square' ? (c / 2) * Math.SQRT2 : shape === 'triangle' ? (c / 2) * 0.92 : c / 2;
    const R = base * (1 - margin) * (stagger && shape !== 'diamond' ? 0.5 : 1);
    let content = '';
    const unitGroup = nest(c / 2, c / 2, R);
    if (unitGroup) {
      content = unitGroup;
      if (stagger) {
        // 四角各放一组（被单元裁成四分之一），平铺后即为半格错位排布。
        const corner = nest(0, 0, R);
        content += corner;
        content += g({ transform: `translate(${api.n(c)} 0)` }, corner);
        content += g({ transform: `translate(0 ${api.n(c)})` }, corner);
        content += g({ transform: `translate(${api.n(c)} ${api.n(c)})` }, corner);
      }
    }
    if (content) {
      const ref = api.tile({ key: `ns-${shape}-${api.n(c)}-${stagger ? 1 : 0}`, w: c, h: c, content });
      body.push(rect(0, 0, W, H, { fill: ref }));
    }
    return { body: body.join('') };
  },
};

export default def;
