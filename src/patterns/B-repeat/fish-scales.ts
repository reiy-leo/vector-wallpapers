/**
 * 重叠圆鳞 —— B 波点 / 网格重复。
 *
 * 结构：半径 r 的圆按「横距 2r、行距 r×overlap、隔行错位 r」排布，
 * 从上到下逐行绘制，下一行压住上一行 → 只露出每片的下缘弧，形成鱼鳞 / 扇贝纹。
 *
 * ⭐ <pattern> 内容超出单元会被裁掉，跨单元「压边」无法靠多个单元叠出来，
 * 所以单元内要把所有可能覆盖 [0, tileH] 的行（中心落在 [-r, tileH + r]）
 * 按 y 递增**全部画出**：任一点最终颜色 = 覆盖它的最下一行，于是天然无缝。
 *
 * 两种模式：
 *  - solid   实心层叠：鳞片填 scale_a / scale_b（隔行交替），描边 edge，内弧 inner；
 *  - outline 描边：鳞片填底色（遮挡上一行），描边 edge 加粗，内弧在 scale_a / scale_b 间隔行交替。
 */
import { circle, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'fish-scales',
  name: '重叠圆鳞',
  category: 'B-repeat',
  description: '错位重叠的圆片层层相压，形成鱼鳞 / 扇贝纹；可切换实心层叠或描边。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1e2a2f' }, opacity: 1, visible: true, configurable: true },
    { id: 'scale_a', label: '鳞片 · 主', role: 'primary', paint: { type: 'solid', color: '#3f5a5c' }, opacity: 1, visible: true, configurable: true },
    { id: 'scale_b', label: '鳞片 · 次', role: 'secondary', paint: { type: 'solid', color: '#4d6a68' }, opacity: 1, visible: true, configurable: true },
    { id: 'edge', label: '鳞缘', role: 'detail', paint: { type: 'solid', color: '#1e2a2f' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'inner', label: '内弧', role: 'accent', paint: { type: 'solid', color: '#c8b48a' }, opacity: 0.55, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '鳞片数', type: 'range', min: 5, max: 32, step: 1, default: 11, heavy: true },
    { key: 'overlap', label: '行距', type: 'range', min: 0.4, max: 1, step: 0.05, default: 0.6 },
    {
      key: 'mode', label: '样式', type: 'select', default: 'solid', options: [
        { value: 'solid', label: '实心层叠' },
        { value: 'outline', label: '描边' },
      ],
    },
    { key: 'alternate', label: '隔行换色', type: 'toggle', default: true },
    { key: 'innerRatio', label: '内弧大小', type: 'range', min: 0.3, max: 0.9, step: 0.05, default: 0.68 },
    { key: 'line', label: '线宽', type: 'range', min: 0.5, max: 4, step: 0.25, default: 1.5 },
  ],

  presets: [
    {
      id: 'deep-teal',
      label: '深潭',
      elements: {
        bg: { paint: { type: 'solid', color: '#1e2a2f' } },
        scale_a: { paint: { type: 'solid', color: '#3f5a5c' } },
        scale_b: { paint: { type: 'solid', color: '#4d6a68' } },
        edge: { paint: { type: 'solid', color: '#1e2a2f' } },
        inner: { paint: { type: 'solid', color: '#c8b48a' } },
      },
    },
    {
      id: 'shell',
      label: '贝壳',
      elements: {
        bg: { paint: { type: 'solid', color: '#f5efe6' } },
        scale_a: { paint: { type: 'solid', color: '#ead9c6' } },
        scale_b: { paint: { type: 'solid', color: '#f1e4d4' } },
        edge: { paint: { type: 'solid', color: '#c9a98a' } },
        inner: { paint: { type: 'solid', color: '#d9b99b' } },
      },
    },
    {
      id: 'ink-outline',
      label: '墨线',
      elements: {
        bg: { paint: { type: 'solid', color: '#20242c' } },
        scale_a: { paint: { type: 'solid', color: '#6f7f99' } },
        scale_b: { paint: { type: 'solid', color: '#8d7f9c' } },
        edge: { paint: { type: 'solid', color: '#a9b4c6' }, opacity: 0.7 },
        inner: { paint: { type: 'solid', color: '#6f7f99' } },
      },
      params: { mode: 'outline', line: 1.75, overlap: 0.55 },
    },
    {
      id: 'paper-outline',
      label: '纸本描边',
      elements: {
        bg: { paint: { type: 'solid', color: '#f4f1ea' } },
        scale_a: { paint: { type: 'solid', color: '#b9c7c0' } },
        scale_b: { paint: { type: 'solid', color: '#d6c3a5' } },
        edge: { paint: { type: 'solid', color: '#7d8f88' }, opacity: 0.8 },
        inner: { paint: { type: 'solid', color: '#b9c7c0' } },
      },
      params: { mode: 'outline', count: 9 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['scale_a'], secondary: ['scale_b'], accent: ['inner'], detail: ['edge'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(Math.max(5, Math.min(32, Number(params.count))));
    const overlap = Math.max(0.4, Math.min(1, Number(params.overlap)));
    const outline = params.mode === 'outline';
    const alternate = params.alternate === true;
    const innerRatio = Math.max(0.3, Math.min(0.9, Number(params.innerRatio)));
    const lineK = Math.max(0.5, Math.min(4, Number(params.line)));
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));

    const bg = elements.get('bg')!;
    const sa = elements.get('scale_a')!;
    const sb = elements.get('scale_b')!;
    const edge = elements.get('edge')!;
    const inner = elements.get('inner')!;

    const n = api.n;
    const r = W / count / 2;
    const rowH = r * overlap;
    const tileW = 2 * r;
    const tileH = 2 * rowH; // 两行一周期（错位 + 隔行换色）
    const sw = unit * lineK * (outline ? 1.4 : 1);
    const ri = r * innerRatio;

    const marks: string[] = [];
    // 行号 j：中心 y = j·rowH；j 为奇数的行横向错位 r。
    const jMin = Math.floor(-r / rowH) - 1;
    const jMax = Math.ceil((tileH + r) / rowH) + 1;
    for (let j = jMin; j <= jMax; j++) {
      const y = j * rowH;
      if (y + r < 0 || y - r > tileH) continue;
      const odd = ((j % 2) + 2) % 2 === 1;
      const xs = odd ? [-r, r, 3 * r] : [0, 2 * r];
      const rowEl = alternate && odd ? sb : sa;
      for (const x of xs) {
        if (x + r < 0 || x - r > tileW) continue;
        // 底片：实心模式用鳞片色；描边模式用底色遮挡上一行。
        const fillEl = outline ? bg : rowEl;
        const fillVisible = outline ? true : rowEl.visible;
        const strokeOn = edge.visible;
        if (fillVisible || strokeOn) {
          marks.push(
            circle(x, y, r - sw / 2, {
              fill: fillVisible ? fillEl.paintValue : 'none',
              'fill-opacity': fillVisible ? (outline ? 1 : fillEl.opacity) : undefined,
              stroke: strokeOn ? edge.paintValue : undefined,
              'stroke-width': strokeOn ? n(sw) : undefined,
              'stroke-opacity': strokeOn ? edge.opacity : undefined,
            }),
          );
        }
        // 内弧：同心小圆描边，被下一行遮住后只剩一道弧。
        const innerEl = outline ? (alternate && odd ? sb : sa) : inner;
        if (inner.visible && innerEl.visible) {
          marks.push(
            circle(x, y, ri, {
              fill: 'none',
              stroke: innerEl.paintValue,
              'stroke-width': n(sw * (outline ? 0.9 : 0.8)),
              'stroke-opacity': outline ? innerEl.opacity * inner.opacity : inner.opacity,
            }),
          );
        }
      }
    }

    const tileRef = api.tile({
      key: `fish-${n(r)}-${n(rowH)}-${outline ? 1 : 0}-${alternate ? 1 : 0}-${n(ri)}-${n(sw)}`,
      w: tileW,
      h: tileH,
      content: marks.join(''),
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
