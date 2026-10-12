/**
 * 条纹族 —— A 极简几何线条。
 *
 * 斜条纹的三种「族」：等宽交替、由细渐粗的节奏组、灰阶渐变色带。
 * 整个周期折进一个 <pattern> 单元，再用 patternTransform 旋转 ——
 * 条纹密度、角度与 SVG 体积完全解耦（顶层节点恒为 2）。
 *
 * 审美取舍（Rei：「耐看、安静」）：
 *  - 默认低饱和同色系（石色 + 鼠尾草），条宽 ≥ 60px，不做黑白细密条纹（摩尔纹）。
 *  - 渐变色带用 ping-pong（主→副→主）配色，单元首尾同色，平铺无接缝。
 */
import { mixHex, isHexColor } from '../../engine/colors';
import { rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult, ResolvedElement } from '../types';

/** 线宽/尺寸缩放基准：短边 / 1080，clamp 到 [0.5, 4]（铁律 6 补强）。 */
function unitOf(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

/** 两元件都为纯色时做插值；任一为渐变（url）则退化为按 t 二选一。 */
function blend(a: ResolvedElement, b: ResolvedElement, t: number): string {
  if (isHexColor(a.paintValue) && isHexColor(b.paintValue)) return mixHex(a.paintValue, b.paintValue, t);
  return t < 0.5 ? a.paintValue : b.paintValue;
}

/** 由细渐粗组的相对宽度（最后一条最粗）。 */
const TAPER = [0.3, 0.6, 1] as const;

const def: PatternDef = {
  id: 'stripe-bands',
  name: '条纹族',
  category: 'A-lines',
  description: '斜向条纹三式：等宽交替、由细渐粗的节奏组、灰阶渐变色带，安静耐看。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#e8e3d9' }, opacity: 1, visible: true, configurable: true },
    { id: 'band_main', label: '主条纹', role: 'primary', paint: { type: 'solid', color: '#cbbfab' }, opacity: 1, visible: true, configurable: true },
    { id: 'band_alt', label: '副条纹', role: 'secondary', paint: { type: 'solid', color: '#a9b4a3' }, opacity: 1, visible: true, configurable: true },
    { id: 'hairline', label: '细线', role: 'accent', paint: { type: 'solid', color: '#8c7c66' }, opacity: 0.4, visible: true, configurable: true },
  ],

  controls: [
    { key: 'angle', label: '角度', type: 'angle', default: 35 },
    { key: 'band', label: '条宽', type: 'range', min: 8, max: 160, step: 2, default: 80, unit: 'px', heavy: true },
    { key: 'gap', label: '间距', type: 'range', min: 0, max: 160, step: 2, default: 32, unit: 'px', heavy: true },
    {
      key: 'mode',
      label: '模式',
      type: 'select',
      default: 'even',
      options: [
        { value: 'even', label: '等宽' },
        { value: 'taper', label: '由细渐粗' },
        { value: 'tonal', label: '灰阶渐变色带' },
      ],
    },
    { key: 'steps', label: '色带级数', type: 'range', min: 3, max: 10, step: 1, default: 6 },
    { key: 'hairlineWidth', label: '细线粗细', type: 'range', min: 0.5, max: 6, step: 0.1, default: 1.4, unit: 'px' },
  ],

  presets: [
    {
      id: 'stone',
      label: '石与鼠尾草',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8e3d9' } },
        band_main: { paint: { type: 'solid', color: '#cbbfab' } },
        band_alt: { paint: { type: 'solid', color: '#a9b4a3' } },
        hairline: { paint: { type: 'solid', color: '#8c7c66' } },
      },
    },
    {
      id: 'slate-night',
      label: '石板夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#1b2129' } },
        band_main: { paint: { type: 'solid', color: '#26303b' } },
        band_alt: { paint: { type: 'solid', color: '#33404c' } },
        hairline: { paint: { type: 'solid', color: '#c9a36a' }, opacity: 0.45 },
      },
      params: { mode: 'taper', angle: 30, band: 90, gap: 40 },
    },
    {
      id: 'mist-tonal',
      label: '雾灰色带',
      elements: {
        bg: { paint: { type: 'solid', color: '#eceef0' } },
        band_main: { paint: { type: 'solid', color: '#dfe3e7' } },
        band_alt: { paint: { type: 'solid', color: '#8e9aa6' } },
        hairline: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.6 },
      },
      params: { mode: 'tonal', gap: 0, band: 72, angle: 60 },
    },
    {
      id: 'clay',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe4d6' } },
        band_main: { paint: { type: 'solid', color: '#d9b99a' } },
        band_alt: { paint: { type: 'solid', color: '#c99a7e' } },
        hairline: { paint: { type: 'solid', color: '#7a5240' }, opacity: 0.4 },
      },
      params: { mode: 'taper', angle: 135, band: 84, gap: 44 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['band_main'], secondary: ['band_alt'], accent: ['hairline'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const u = unitOf(W, H);
    const band = Math.max(1, Number(params.band) * u);
    const gap = Math.max(0, Number(params.gap) * u);
    const mode = String(params.mode);
    const steps = Math.max(3, Math.round(Number(params.steps)));
    const hw = Math.max(0.3, Number(params.hairlineWidth) * u);
    const angle = Number(params.angle);

    const bg = elements.get('bg')!;
    const main = elements.get('band_main')!;
    const alt = elements.get('band_alt')!;
    const hair = elements.get('hairline')!;

    const parts: string[] = [];
    let period = 0;
    /** 单元高度只影响 pattern 自身大小，任取一个与周期同量级的值即可。 */
    const th = Math.max(band, 40 * u);

    // 竖直条带（rect），单元在 x 方向重复；整体由 patternTransform 旋转成斜向。
    const bar = (x: number, w: number, fill: string, op: number): void => {
      parts.push(rect(x, 0, w, th, { fill, 'fill-opacity': op }));
    };
    const hairAt = (x: number): void => {
      if (hair.visible && gap >= hw * 2.5) parts.push(rect(x - hw / 2, 0, hw, th, { fill: hair.paintValue, 'fill-opacity': hair.opacity }));
    };

    if (mode === 'taper') {
      // 一组主色条由细到粗，组尾跟一条副色宽带；组间留双倍间距形成呼吸。
      let x = 0;
      for (const k of TAPER) {
        const w = band * k;
        if (main.visible) bar(x, w, main.paintValue, main.opacity);
        x += w + gap * 0.6;
      }
      x += gap * 0.9;
      hairAt(x - gap * 0.75);
      const wAlt = band * 1.4;
      if (alt.visible) bar(x, wAlt, alt.paintValue, alt.opacity);
      x += wAlt + gap * 1.5;
      hairAt(x - gap * 0.75);
      period = x;
    } else if (mode === 'tonal') {
      // 主 → 副 → 主 的 ping-pong 色阶：单元首尾同色，平铺无接缝。
      const n2 = steps * 2 - 2;
      let x = 0;
      for (let i = 0; i < n2; i++) {
        const t = i < steps ? i / (steps - 1) : (n2 - i) / (steps - 1);
        const src = t < 0.5 ? main : alt;
        if (main.visible && alt.visible) bar(x, band, blend(main, alt, t), main.opacity + (alt.opacity - main.opacity) * t);
        else if (src.visible) bar(x, band, src.paintValue, src.opacity * (0.35 + 0.65 * (src === main ? 1 - t : t)));
        x += band;
        if (gap > 0) {
          hairAt(x + gap / 2);
          x += gap;
        } else if (hair.visible && i % 2 === 1) {
          // 无间距时细线压在色阶交界处，给色带一点结构感
          parts.push(rect(x - hw / 2, 0, hw, th, { fill: hair.paintValue, 'fill-opacity': hair.opacity }));
        }
      }
      period = x;
    } else {
      // 等宽：主、间距、副、间距；间距中线可选细线。
      if (main.visible) bar(0, band, main.paintValue, main.opacity);
      hairAt(band + gap / 2);
      if (alt.visible) bar(band + gap, band, alt.paintValue, alt.opacity);
      hairAt(band * 2 + gap * 1.5);
      period = (band + gap) * 2;
    }

    const body = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (parts.length > 0 && period > 0) {
      const tileRef = api.tile({
        key: `sb-${mode}-${api.n(period)}`,
        w: period,
        h: th,
        content: parts.join(''),
        transform: angle % 360 === 0 ? undefined : `rotate(${api.n(angle)})`,
      });
      body.push(rect(0, 0, W, H, { fill: tileRef }));
    }
    return { body: body.join('') };
  },
};

export default def;
