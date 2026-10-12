/**
 * 回纹 —— F 传统纹样（希腊回纹 / 中式回字纹）。
 *
 * 几何：网格步长 s，一条方形螺旋从底线升起、向内绕 N 圈；螺旋占宽 N−1 格，
 * 相邻周期间隔 1 格，底线贯穿整个周期 → 一条连续不断的「回」字带。
 * 线宽 = s × weight，线与线之间的空隙恒为 1 格减线宽，疏密均匀。
 *
 * 两种排布：
 *  - band  饰带：每条回纹带上下各有一道饰线（border），带底色 band；带与带之间露出底色 bg；
 *  - field 满铺：回纹行紧密堆叠，隔行左右镜像，行间一道细饰线；band 作为隔行底纹。
 * key_shadow：回纹线的错位投影，给出一点浮雕感。
 *
 * 走 <pattern> 平铺：单元宽 = 1 个周期，高 = 1 条带 + 间距（满铺为 2 行）。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';
import { clamp, f, op, unitOf } from './_helpers';

/** 一个周期的回纹路径（网格坐标 → 像素），x0/y0 为偏移，mirror 时左右镜像。 */
function keyPath(N: number, s: number, x0: number, y0: number, mirror: boolean): string {
  const X = (gx: number): string => f(x0 + (mirror ? N - gx : gx) * s);
  const Y = (gy: number): string => f(y0 + gy * s);
  // 底线贯穿整个周期（两端方头被单元裁掉，与邻居无缝相接）
  let d = `M${X(mirror ? N : 0)} ${Y(N)}H${X(mirror ? 0 : N)}`;
  // 螺旋：自 (0.5, N) 起，上 → 右 → 下 → 左，步长 N, N−1, N−1, N−2, N−2 …
  let x = 0.5;
  let y = N;
  d += `M${X(x)} ${Y(y)}`;
  const dirs: Array<[number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const lens: number[] = [N];
  for (let k = N - 1; k > 0; k--) lens.push(k, k);
  lens.forEach((len, i) => {
    const [dx, dy] = dirs[i % 4];
    x += dx * len;
    y += dy * len;
    d += dx !== 0 ? `H${X(x)}` : `V${Y(y)}`;
  });
  return d;
}

const def: PatternDef = {
  id: 'meander-key',
  name: '回纹',
  category: 'F-ornament',
  description: '方形螺旋首尾相连的连续回纹；可作横向饰带或满铺，圈数、线宽、带距可调。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#ece6da' }, opacity: 1, visible: true, configurable: true },
    { id: 'band', label: '饰带底', role: 'secondary', paint: { type: 'solid', color: '#d9cfbd' }, opacity: 1, visible: true, configurable: true },
    { id: 'key', label: '回纹线', role: 'primary', paint: { type: 'solid', color: '#7a4a3a' }, opacity: 1, visible: true, configurable: true },
    { id: 'border', label: '饰线', role: 'accent', paint: { type: 'solid', color: '#a57a52' }, opacity: 1, visible: true, configurable: true },
    { id: 'key_shadow', label: '投影', role: 'detail', paint: { type: 'solid', color: '#b9ab94' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '纹样大小', type: 'range', min: 4, max: 24, step: 1, default: 14, heavy: true },
    { key: 'turns', label: '螺旋圈数', type: 'range', min: 3, max: 7, step: 1, default: 4 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.3, max: 0.6, step: 0.05, default: 0.45 },
    { key: 'spacing', label: '带距', type: 'range', min: 0.2, max: 3, step: 0.1, default: 0.9 },
    {
      key: 'layout', label: '排布', type: 'select', default: 'band', options: [
        { value: 'band', label: '饰带' },
        { value: 'field', label: '满铺' },
      ],
    },
    { key: 'shadow', label: '浮雕投影', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'terracotta',
      label: '陶红',
      elements: {
        bg: { paint: { type: 'solid', color: '#ece6da' } },
        band: { paint: { type: 'solid', color: '#d9cfbd' } },
        key: { paint: { type: 'solid', color: '#7a4a3a' } },
        border: { paint: { type: 'solid', color: '#a57a52' } },
        key_shadow: { paint: { type: 'solid', color: '#b9ab94' }, opacity: 0.9 },
      },
    },
    {
      id: 'bronze-night',
      label: '青铜',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2321' } },
        band: { paint: { type: 'solid', color: '#26302c' } },
        key: { paint: { type: 'solid', color: '#9fae8f' } },
        border: { paint: { type: 'solid', color: '#6f7d68' } },
        key_shadow: { paint: { type: 'solid', color: '#121614' }, opacity: 0.9 },
      },
      params: { turns: 5, spacing: 1.2, size: 16 },
    },
    {
      id: 'porcelain-field',
      label: '青花满铺',
      elements: {
        bg: { paint: { type: 'solid', color: '#eef0f2' } },
        band: { paint: { type: 'solid', color: '#e2e7ee' } },
        key: { paint: { type: 'solid', color: '#3d5378' } },
        border: { paint: { type: 'solid', color: '#9aaac2' } },
        key_shadow: { paint: { type: 'solid', color: '#c7d0dd' }, opacity: 0.8 },
      },
      params: { layout: 'field', size: 16, weight: 0.4 },
    },
    {
      id: 'lacquer',
      label: '漆金',
      elements: {
        bg: { paint: { type: 'solid', color: '#2a1d1b' } },
        band: { paint: { type: 'solid', color: '#3a2420' } },
        key: { paint: { type: 'solid', color: '#c8a46a' } },
        border: { paint: { type: 'solid', color: '#8e6b45' } },
        key_shadow: { paint: { type: 'solid', color: '#1a110f' }, opacity: 0.85 },
      },
      params: { size: 11, spacing: 1.5, turns: 3 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['key'], secondary: ['band'], accent: ['border'], detail: ['key_shadow'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const size = Math.round(clamp(params.size, 4, 24, 14));
    const N = Math.round(clamp(params.turns, 3, 7, 4));
    const weight = clamp(params.weight, 0.3, 0.6, 0.45);
    const spacing = clamp(params.spacing, 0.2, 3, 0.9);
    const field = params.layout === 'field';
    const shadowOn = params.shadow === true;
    const unit = unitOf(W, H);
    const n = api.n;

    const bg = elements.get('bg')!;
    const band = elements.get('band')!;
    const key = elements.get('key')!;
    const border = elements.get('border')!;
    const shadow = elements.get('key_shadow')!;

    // 每条带高 N+4 格（含上下饰线），size = 长边方向上能放下的回纹「周期」数 → 网格步长
    const s = Math.max(W, H) / size / N;
    const sw = s * weight;
    const off = Math.max(unit * 0.8, sw * 0.35);
    const tileW = N * s;

    const parts: string[] = [];
    let tileH: number;
    const line = (d: string, el: typeof key, w: number, extra: Record<string, string | undefined> = {}): string =>
      path(d, {
        fill: 'none',
        stroke: el.paintValue,
        'stroke-width': n(w),
        'stroke-opacity': op(el.opacity),
        'stroke-linecap': 'square',
        ...extra,
      });

    if (!field) {
      const bandH = (N + 4) * s;
      const gap = bandH * spacing;
      tileH = bandH + gap;
      const y0 = gap / 2; // 带在单元中居中
      parts.push(rect(0, y0, tileW, bandH, { fill: band.paintValue, 'fill-opacity': op(band.opacity) }));
      const ky = y0 + 2 * s;
      const d = keyPath(N, s, 0, ky, false);
      if (shadowOn) parts.push(line(d, shadow, sw, { transform: `translate(${n(off)} ${n(off)})` }));
      parts.push(line(d, key, sw));
      // 上下饰线：距回纹 1 格，外侧再一道细线
      const b1 = `M0 ${f(ky - s)}H${f(tileW)}M0 ${f(ky + (N + 1) * s)}H${f(tileW)}`;
      const b2 = `M0 ${f(y0 + sw * 0.4)}H${f(tileW)}M0 ${f(y0 + bandH - sw * 0.4)}H${f(tileW)}`;
      parts.push(
        g(
          { fill: 'none', stroke: border.paintValue, 'stroke-opacity': op(border.opacity) },
          path(b1, { 'stroke-width': n(sw * 0.7) }) + path(b2, { 'stroke-width': n(Math.max(unit * 0.75, sw * 0.3)) }),
        ),
      );
    } else {
      // 满铺：一行高 N+2 格（回纹 N + 上下各 1 格空隙），两行一周期，隔行镜像
      const rowH = (N + 2) * s;
      tileH = 2 * rowH;
      parts.push(rect(0, rowH, tileW, rowH, { fill: band.paintValue, 'fill-opacity': op(band.opacity) }));
      let dAll = '';
      for (let r = 0; r < 2; r++) dAll += keyPath(N, s, 0, r * rowH + s, r === 1);
      if (shadowOn) parts.push(line(dAll, shadow, sw, { transform: `translate(${n(off)} ${n(off)})` }));
      parts.push(line(dAll, key, sw));
      const rule = `M0 ${f(sw * 0.3)}H${f(tileW)}M0 ${f(rowH)}H${f(tileW)}M0 ${f(tileH - sw * 0.3)}H${f(tileW)}`;
      parts.push(line(rule, border, Math.max(unit * 0.75, sw * 0.3), { 'stroke-linecap': undefined }));
    }

    const tileRef = api.tile({
      key: `meander-${n(s)}-${N}-${n(sw)}-${n(spacing)}-${field ? 1 : 0}-${shadowOn ? 1 : 0}`,
      w: tileW,
      h: tileH,
      content: parts.join(''),
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
