/**
 * 箭头重复 —— B 波点 / 网格重复。
 *
 * 结构：一个「两行」单元 —— A 行箭头居中，B 行箭头错位半格（stagger）。
 * B 行在单元左右边缘各画一份，平铺后正好拼成完整箭头；
 * 方向由 patternTransform rotate(angle) 统一控制，单元内箭头一律朝上绘制。
 *
 * 与 chevron（人字纹）的区别：后者是连续折线色带，本母题是**离散的独立记号**，
 * 底色占主导、记号低调，适合做安静的桌面底纹。
 * 无随机性 → seedable: false。
 */
import { circle, g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

type ArrowStyle = 'chevron' | 'line' | 'solid';

/** 以 (x,y) 为中心、半高 s、朝上的箭头路径。 */
function arrowD(style: ArrowStyle, x: number, y: number, s: number, n: (v: number) => string): string {
  const P = (dx: number, dy: number): string => `${n(x + dx * s)} ${n(y + dy * s)}`;
  if (style === 'chevron') {
    return `M${P(-0.7, 0.35)}L${P(0, -0.35)}L${P(0.7, 0.35)}`;
  }
  if (style === 'line') {
    return `M${P(0, 1)}L${P(0, -1)}M${P(-0.5, -0.5)}L${P(0, -1)}L${P(0.5, -0.5)}`;
  }
  return `M${P(0, -1)}L${P(0.75, -0.1)}L${P(0.25, -0.1)}L${P(0.25, 0.9)}L${P(-0.25, 0.9)}L${P(-0.25, -0.1)}L${P(-0.75, -0.1)}Z`;
}

const def: PatternDef = {
  id: 'arrow-repeat',
  name: '箭头重复',
  category: 'B-repeat',
  description: '人字 / 细线 / 实心箭头按网格错位重复，方向可调，浅底淡色的低调底纹。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#2346e8' }, opacity: 1, visible: true, configurable: true },
    { id: 'arrow', label: '箭头 · 主', role: 'primary', paint: { type: 'solid', color: '#ffd23f' }, opacity: 1, visible: true, configurable: true },
    { id: 'arrow_alt', label: '箭头 · 错位行', role: 'secondary', paint: { type: 'solid', color: '#ff6b9a' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot', label: '间隙圆点', role: 'detail', paint: { type: 'solid', color: '#ffffff' }, opacity: 0.8, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'style',
      label: '箭头样式',
      type: 'select',
      options: [
        { value: 'chevron', label: '人字' },
        { value: 'line', label: '细线箭头' },
        { value: 'solid', label: '实心箭头' },
      ],
      default: 'chevron',
    },
    { key: 'cols', label: '长边数量', type: 'range', min: 6, max: 40, step: 1, default: 14, heavy: true },
    { key: 'size', label: '箭头大小', type: 'range', min: 0.2, max: 1, step: 0.01, default: 0.7 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.02, max: 0.2, step: 0.005, default: 0.06 },
    { key: 'rowGap', label: '行距', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 0.9 },
    { key: 'stagger', label: '错位', type: 'toggle', default: true },
    { key: 'angle', label: '方向', type: 'angle', default: 0 },
  ],

  presets: [
    {
      id: 'cobalt',
      label: '钴蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#2346e8' } },
        arrow: { paint: { type: 'solid', color: '#ffd23f' }, opacity: 1 },
        arrow_alt: { paint: { type: 'solid', color: '#ff6b9a' }, opacity: 1 },
        dot: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.8 },
      },
    },
    {
      id: 'coral',
      label: '珊瑚',
      elements: {
        bg: { paint: { type: 'solid', color: '#ff6f59' } },
        arrow: { paint: { type: 'solid', color: '#fff1d0' }, opacity: 1 },
        arrow_alt: { paint: { type: 'solid', color: '#ffc23d' }, opacity: 1 },
        dot: { paint: { type: 'solid', color: '#2a1e5c' }, opacity: 0.6 },
      },
      params: { style: 'solid', size: 0.55, angle: 0, cols: 16, rowGap: 1.2 },
    },
    {
      id: 'neon',
      label: '霓虹夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#15123a' } },
        arrow: { paint: { type: 'solid', color: '#ff3d7f' }, opacity: 1 },
        arrow_alt: { paint: { type: 'solid', color: '#00d1c1' }, opacity: 1 },
        dot: { paint: { type: 'solid', color: '#ffd23f' }, opacity: 0.85 },
      },
      params: { style: 'line', weight: 0.05, size: 0.6, angle: 90 },
    },
    {
      id: 'lemon',
      label: '柠檬',
      elements: {
        bg: { paint: { type: 'solid', color: '#fff2b8' } },
        arrow: { paint: { type: 'solid', color: '#ff4f2e' }, opacity: 1 },
        arrow_alt: { paint: { type: 'solid', color: '#2f6bff' }, opacity: 1 },
        dot: { paint: { type: 'solid', color: '#ff4f2e' }, opacity: 0.45 },
      },
      params: { style: 'chevron', cols: 12, angle: 90, rowGap: 1.1 },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#bff0dc' } },
        arrow: { paint: { type: 'solid', color: '#00a37a' }, opacity: 1 },
        arrow_alt: { paint: { type: 'solid', color: '#ff7a45' }, opacity: 1 },
        dot: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.9 },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['arrow'], secondary: ['arrow_alt'], detail: ['dot'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const { n } = api;
    const raw = String(params.style);
    const style: ArrowStyle = raw === 'line' || raw === 'solid' ? raw : 'chevron';
    const cols = Math.max(2, Number(params.cols));
    // 以长边为基准：竖屏下单元不会被挤得过密。
    const cell = Math.max(W, H) / cols;
    const rowH = cell * Number(params.rowGap);
    const tw = cell;
    const th = rowH * 2;
    const stagger = params.stagger === true;
    const angle = Number(params.angle);

    // 箭头半高上限：不越过本行行高的一半，也不越过半格宽，平铺时永不互相压线。
    const sMax = Math.min(cell * 0.45, rowH * 0.45);
    const s = sMax * Number(params.size);
    const sw = Math.max(0.5, cell * Number(params.weight));

    const bg = elements.get('bg')!;
    const ar = elements.get('arrow')!;
    const alt = elements.get('arrow_alt')!;
    const dot = elements.get('dot')!;

    const yA = rowH * 0.5;
    const yB = rowH * 1.5;
    const xsB = stagger ? [0, tw] : [tw / 2];

    const paintAttrs = (fill: string, op: number): Record<string, string | number> =>
      style === 'solid'
        ? { fill, 'fill-opacity': op }
        : {
            fill: 'none',
            stroke: fill,
            'stroke-opacity': op,
            'stroke-width': n(sw),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
          };

    const marks: string[] = [];
    if (ar.visible) {
      marks.push(path(arrowD(style, tw / 2, yA, s, n), paintAttrs(ar.paintValue, ar.opacity)));
    }
    if (alt.visible) {
      const d = xsB.map((x) => arrowD(style, x, yB, s, n)).join('');
      marks.push(path(d, paintAttrs(alt.paintValue, alt.opacity)));
    }
    if (dot.visible) {
      // 圆点落在箭头之间的空位：A 行的半格处、B 行的格中（或错位关闭时的行间）。
      const r = Math.max(0.6, sw * 0.6);
      const pts: Array<[number, number]> = stagger
        ? [
            [0, yA],
            [tw, yA],
            [tw / 2, yB],
          ]
        : [
            [0, rowH],
            [tw, rowH],
            [0, 0],
            [tw, 0],
            [0, th],
            [tw, th],
          ];
      marks.push(g({ fill: dot.paintValue, 'fill-opacity': dot.opacity }, pts.map(([x, y]) => circle(x, y, r)).join('')));
    }

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (marks.length) {
      const tileRef = api.tile({
        key: `ar-${style}-${n(tw)}-${n(th)}`,
        w: tw,
        h: th,
        content: marks.join(''),
        transform: angle % 360 === 0 ? undefined : `rotate(${n(angle)})`,
      });
      parts.push(rect(0, 0, W, H, { fill: tileRef }));
    }
    return { body: parts.join('') };
  },
};

export default def;
