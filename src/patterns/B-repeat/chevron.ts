/**
 * 人字纹 —— B 波点 / 网格重复。
 *
 * 结构：一个「折线周期」宽、`k × 条距` 高的单元（k = 2 或 3 色），
 * 每条色带是一条粗描边折线（stroke 而非多边形），这样：
 *  - 折点可用 `stroke-linejoin=round` 柔化，避免硬边多段折线的刺眼感；
 *  - 带宽只是 stroke-width，与折幅解耦。
 * 竖向人字纹 = 同一单元 + patternTransform rotate(90)。
 *
 * ⭐ 平铺无缝的关键：折线在 x=0 与 x=P 处高度相同（周期端点），并向两侧各多画半个周期，
 * 让圆角/端帽落在单元外被裁掉；纵向越界的色带在 ±tileH 处补画一份。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'chevron',
  name: '人字纹',
  category: 'B-repeat',
  description: '横向或竖向的人字折线色带，2–3 色交替，折幅与带宽可调，折点可柔化。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f3eee5' }, opacity: 1, visible: true, configurable: true },
    { id: 'band_a', label: '色带 · 主', role: 'primary', paint: { type: 'solid', color: '#9fb0a2' }, opacity: 1, visible: true, configurable: true },
    { id: 'band_b', label: '色带 · 次', role: 'secondary', paint: { type: 'solid', color: '#d9c9ab' }, opacity: 1, visible: true, configurable: true },
    { id: 'band_c', label: '色带 · 点缀', role: 'accent', paint: { type: 'solid', color: '#c98f6f' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '折数', type: 'range', min: 3, max: 20, step: 1, default: 7, heavy: true },
    { key: 'amp', label: '折幅', type: 'range', min: 0.1, max: 1.2, step: 0.05, default: 0.5 },
    { key: 'spacing', label: '条距', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.42 },
    { key: 'band', label: '带宽', type: 'range', min: 0.15, max: 1, step: 0.05, default: 0.55 },
    {
      key: 'direction', label: '方向', type: 'select', default: 'h', options: [
        { value: 'h', label: '横向' },
        { value: 'v', label: '竖向' },
      ],
    },
    {
      key: 'tones', label: '色数', type: 'select', default: '3', options: [
        { value: '2', label: '2 色' },
        { value: '3', label: '3 色' },
      ],
    },
    { key: 'soft', label: '圆角折点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'linen',
      label: '亚麻',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3eee5' } },
        band_a: { paint: { type: 'solid', color: '#9fb0a2' } },
        band_b: { paint: { type: 'solid', color: '#d9c9ab' } },
        band_c: { paint: { type: 'solid', color: '#c98f6f' } },
      },
    },
    {
      id: 'night-tweed',
      label: '夜呢',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2329' } },
        band_a: { paint: { type: 'solid', color: '#34414b' } },
        band_b: { paint: { type: 'solid', color: '#4a5a63' } },
        band_c: { paint: { type: 'solid', color: '#b08d5b' } },
      },
      params: { band: 0.6 },
    },
    {
      id: 'sage-duo',
      label: '鼠尾草 · 双色',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8ece4' } },
        band_a: { paint: { type: 'solid', color: '#7f9787' } },
        band_b: { paint: { type: 'solid', color: '#c4d0c0' } },
        band_c: { paint: { type: 'solid', color: '#5f7466' } },
      },
      params: { tones: '2', amp: 0.7, band: 0.5 },
    },
    {
      id: 'clay-vertical',
      label: '陶土 · 竖',
      elements: {
        bg: { paint: { type: 'solid', color: '#2a1f1b' } },
        band_a: { paint: { type: 'solid', color: '#7a4e3a' } },
        band_b: { paint: { type: 'solid', color: '#a97a5c' } },
        band_c: { paint: { type: 'solid', color: '#b8916b' } },
      },
      params: { direction: 'v', amp: 0.4 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['band_a'], secondary: ['band_b'], accent: ['band_c'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(Math.max(3, Math.min(20, Number(params.count))));
    const amp = Math.max(0.1, Math.min(1.2, Number(params.amp)));
    const spacing = Math.max(0.2, Math.min(1, Number(params.spacing)));
    const bandR = Math.max(0.15, Math.min(1, Number(params.band)));
    const vertical = params.direction === 'v';
    const three = params.tones !== '2';
    const soft = params.soft === true;

    const bg = elements.get('bg')!;
    // 色带顺序 = 交替顺序；第三色在「2 色」模式或隐藏时退出循环。
    const bands = [elements.get('band_a')!, elements.get('band_b')!];
    const c = elements.get('band_c')!;
    if (three && c.visible) bands.push(c);

    // 周期统一按长边计算：横竖两种方向下单元尺寸一致，旋转 90° 不会突然变密。
    const span = Math.max(W, H);
    const P = span / count; // 一个折线周期
    const A = (P / 2) * amp; // 折幅（峰谷高差）
    const S = P * spacing + A * 0.25; // 条距：折幅越大条距略增，避免带与带挤在一起
    const sw = Math.max(1, S * bandR * 0.95);
    const k = bands.length;
    const tileH = S * k;
    const n = api.n;

    const zig = (y: number): string =>
      `M${n(-P / 2)} ${n(y + A)}L0 ${n(y)}L${n(P / 2)} ${n(y + A)}L${n(P)} ${n(y)}L${n(P * 1.5)} ${n(y + A)}`;

    // 先收集全部「色带实例」（含 ±tileH 补画副本），再按 y 排序绘制：
    // 带宽拉大时相邻色带会互相压边，绘制顺序必须与无限平面里的上下顺序一致，
    // 否则单元边界处会出现「上一条压下一条」反转的接缝。
    const inst: Array<{ y: number; i: number }> = [];
    bands.forEach((b, i) => {
      if (!b.visible) return;
      const y = i * S + (S - A) / 2;
      for (const off of [-tileH, 0, tileH]) {
        const yy = y + off;
        if (yy + A + sw < 0 || yy - sw > tileH) continue;
        inst.push({ y: yy, i });
      }
    });
    inst.sort((a, b) => a.y - b.y);

    const marks: string[] = inst.map(({ y, i }) => {
      const b = bands[i];
      return path(zig(y), {
        fill: 'none',
        stroke: b.paintValue,
        'stroke-opacity': b.opacity,
        'stroke-width': n(sw),
        'stroke-linejoin': soft ? 'round' : 'miter',
        'stroke-miterlimit': soft ? undefined : 10,
      });
    });

    const tileRef = api.tile({
      key: `chev-${n(P)}-${n(A)}-${n(S)}-${n(sw)}-${k}-${soft ? 1 : 0}`,
      w: P,
      h: tileH,
      content: marks.join(''),
      transform: vertical ? 'rotate(90)' : undefined,
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
