/**
 * 青海波 —— F 传统纹样。
 *
 * 结构：半径 R 的同心圆组按「横距 2R、行距 R×rowGap、隔行错位 R」排布，
 * 自上而下逐行绘制，下一行压住上一行 → 每组只露出上半部的同心弧，形成层层海浪。
 *
 * ⭐ <pattern> 会裁掉超出单元的内容，跨单元的「压边」无法靠相邻单元叠出来，
 * 因此单元内把所有可能覆盖 [0, tileH] 的行（中心 ∈ [-R, tileH + R]）按 y 递增全部画出。
 *
 * 两种样式：
 *  - banded 色带：同心环交替填 wave_a / wave_b，环缘描 line，最内圈填 core；
 *  - lines  线描：圆片填底色（遮挡上一行），同心环描边交替 wave_a / wave_b，外缘 line 加粗，core 为中心小圆。
 */
import { circle, g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';
import { clamp, op, unitOf } from './_helpers';

const def: PatternDef = {
  id: 'seigaiha',
  name: '青海波',
  category: 'F-ornament',
  description: '同心半圆鳞状层叠，如层层海浪；可切换色带或线描，环数与行距可调。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1c2735' }, opacity: 1, visible: true, configurable: true },
    { id: 'wave_a', label: '浪环 · 主', role: 'primary', paint: { type: 'solid', color: '#2c4058' }, opacity: 1, visible: true, configurable: true },
    { id: 'wave_b', label: '浪环 · 次', role: 'secondary', paint: { type: 'solid', color: '#39536e' }, opacity: 1, visible: true, configurable: true },
    { id: 'line', label: '环线', role: 'detail', paint: { type: 'solid', color: '#c6d2dc' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'core', label: '浪心', role: 'accent', paint: { type: 'solid', color: '#d6c193' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '浪组数', type: 'range', min: 4, max: 24, step: 1, default: 9, heavy: true },
    { key: 'rings', label: '环数', type: 'range', min: 3, max: 6, step: 1, default: 4 },
    { key: 'rowGap', label: '行距', type: 'range', min: 0.45, max: 0.7, step: 0.05, default: 0.5 },
    {
      key: 'mode', label: '样式', type: 'select', default: 'banded', options: [
        { value: 'banded', label: '色带' },
        { value: 'lines', label: '线描' },
      ],
    },
    { key: 'alternate', label: '隔行换色', type: 'toggle', default: true },
    { key: 'line', label: '线宽', type: 'range', min: 0.5, max: 4, step: 0.25, default: 1.25 },
  ],

  presets: [
    {
      id: 'ai-indigo',
      label: '藍染',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c2735' } },
        wave_a: { paint: { type: 'solid', color: '#2c4058' } },
        wave_b: { paint: { type: 'solid', color: '#39536e' } },
        line: { paint: { type: 'solid', color: '#c6d2dc' }, opacity: 0.75 },
        core: { paint: { type: 'solid', color: '#d6c193' } },
      },
    },
    {
      id: 'washi',
      label: '和纸',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3eee5' } },
        wave_a: { paint: { type: 'solid', color: '#e6dccd' } },
        wave_b: { paint: { type: 'solid', color: '#efe7da' } },
        line: { paint: { type: 'solid', color: '#9c8a74' }, opacity: 0.8 },
        core: { paint: { type: 'solid', color: '#c99a86' } },
      },
      params: { rings: 5 },
    },
    {
      id: 'kinpaku-lines',
      label: '金线',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f1d1c' } },
        wave_a: { paint: { type: 'solid', color: '#b89a62' } },
        wave_b: { paint: { type: 'solid', color: '#7d6d55' } },
        line: { paint: { type: 'solid', color: '#d8bf8a' }, opacity: 0.9 },
        core: { paint: { type: 'solid', color: '#b89a62' } },
      },
      params: { mode: 'lines', rings: 5, line: 1.5, count: 8 },
    },
    {
      id: 'celadon',
      label: '青瓷',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe7e1' } },
        wave_a: { paint: { type: 'solid', color: '#b7cbc0' } },
        wave_b: { paint: { type: 'solid', color: '#cddbd2' } },
        line: { paint: { type: 'solid', color: '#f6f8f5' }, opacity: 0.9 },
        core: { paint: { type: 'solid', color: '#8eaa9c' } },
      },
      params: { line: 1.75, rowGap: 0.55 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['wave_a'], secondary: ['wave_b'], accent: ['core'], detail: ['line'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(clamp(params.count, 4, 24, 9));
    const rings = Math.round(clamp(params.rings, 3, 6, 4));
    const rowGap = clamp(params.rowGap, 0.45, 0.7, 0.5);
    const lines = params.mode === 'lines';
    const alternate = params.alternate === true;
    const lineK = clamp(params.line, 0.5, 4, 1.25);
    const unit = unitOf(W, H);
    const n = api.n;

    const bg = elements.get('bg')!;
    const wa = elements.get('wave_a')!;
    const wb = elements.get('wave_b')!;
    const ln = elements.get('line')!;
    const core = elements.get('core')!;

    // 单元尺寸按长边推导：竖屏不至于过密（保证横竖屏观感一致）。
    const R = Math.max(W, H) / count / 2;
    const rowH = R * rowGap;
    const tileW = 2 * R;
    const tileH = 2 * rowH;
    const sw = Math.min(unit * lineK, R / rings / 2.2);
    const step = R / (rings + (lines ? 0.6 : 0.35));

    const marks: string[] = [];
    const jMin = Math.floor(-R / rowH) - 1;
    const jMax = Math.ceil((tileH + R) / rowH) + 1;
    for (let j = jMin; j <= jMax; j++) {
      const y = j * rowH;
      if (y + R < 0 || y - R > tileH) continue;
      const odd = ((j % 2) + 2) % 2 === 1;
      const xs = odd ? [-R, R, 3 * R] : [0, 2 * R];
      const A = alternate && odd ? wb : wa;
      const B = alternate && odd ? wa : wb;
      for (const x of xs) {
        if (x + R < 0 || x - R > tileW) continue;
        let grp = '';
        if (!lines) {
          // 色带：外 → 内依次叠圆，交替主次色；最内一圈为浪心。
          for (let i = 0; i < rings; i++) {
            const r = R - i * step;
            const el = i % 2 === 0 ? A : B;
            grp += circle(x, y, r - sw / 2, { fill: el.paintValue, 'fill-opacity': op(el.opacity) });
          }
          grp += circle(x, y, R - rings * step, { fill: core.paintValue, 'fill-opacity': op(core.opacity) });
          marks.push(g({ stroke: ln.paintValue, 'stroke-opacity': op(ln.opacity), 'stroke-width': n(sw) }, grp));
        } else {
          // 线描：底色圆片遮挡上一行，外缘 line 加粗，内环交替主次色描边。
          grp += circle(x, y, R - sw, {
            fill: bg.paintValue,
            stroke: ln.paintValue,
            'stroke-width': n(sw * 1.6),
            'stroke-opacity': op(ln.opacity),
          });
          let inner = '';
          for (let i = 1; i < rings; i++) {
            const el = i % 2 === 1 ? A : B;
            inner += circle(x, y, R - i * step, { stroke: el.paintValue, 'stroke-opacity': op(el.opacity) });
          }
          grp += g({ fill: 'none', 'stroke-width': n(sw) }, inner);
          grp += circle(x, y, Math.max(sw, R - rings * step), { fill: core.paintValue, 'fill-opacity': op(core.opacity) });
          marks.push(g({}, grp));
        }
      }
    }

    const tileRef = api.tile({
      key: `seigaiha-${n(R)}-${n(rowH)}-${rings}-${lines ? 1 : 0}-${alternate ? 1 : 0}-${n(sw)}`,
      w: tileW,
      h: tileH,
      content: marks.join(''),
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
