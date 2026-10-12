/**
 * 亚麻布纹 —— K 材质纹理 / 平铺。
 *
 * 一张安静的桌面底纹：细密的经（竖）纬（横）纱线，粗细与间距都略不均匀，
 * 夹杂少量亚麻特有的「竹节」（纱线局部变粗的一小段），上面再罩几团极淡的大面积色晕，
 * 打破平铺的周期感。
 *
 * ⭐ 体积：纱线走 `<pattern>`；单元固定 128×128 根纱，纱距按短边缩放（unit），
 * 因此体积与分辨率无关。每个方向按粗细分 3 档，每档一条 path（`M0 y h T` 串联）。
 * 色晕是少量模糊椭圆，不进平铺单元。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clamp, num, op } from './_helpers';

/** 单元每个方向的纱线根数。 */
const N = 128;

const def: PatternDef = {
  id: 'linen-weave',
  name: '亚麻布纹',
  category: 'K-texture',
  description: '细密而略不均匀的经纬纱线，夹着零星竹节与淡淡色晕，安静耐看的布面底纹。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '布底', role: 'bg', paint: { type: 'solid', color: '#e4ddd0' }, opacity: 1, visible: true, configurable: true },
    { id: 'warp', label: '经纱', role: 'primary', paint: { type: 'solid', color: '#cfc6b6' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'weft', label: '纬纱', role: 'secondary', paint: { type: 'solid', color: '#f1ece3' }, opacity: 0.6, visible: true, configurable: true },
    { id: 'slub', label: '竹节', role: 'accent', paint: { type: 'solid', color: '#c2b8a6' }, opacity: 0.6, visible: true, configurable: true },
    { id: 'mottle', label: '色晕', role: 'detail', paint: { type: 'solid', color: '#d3cab9' }, opacity: 0.35, visible: true, configurable: true },
  ],

  controls: [
    { key: 'fineness', label: '纱距', type: 'range', min: 2.5, max: 8, step: 0.5, default: 4 },
    { key: 'irregular', label: '不均匀', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: 'slubs', label: '竹节', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'mottled', label: '色晕', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'natural',
      label: '原麻',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4ddd0' } },
        warp: { paint: { type: 'solid', color: '#cfc6b6' }, opacity: 0.55 },
        weft: { paint: { type: 'solid', color: '#f1ece3' }, opacity: 0.6 },
        slub: { paint: { type: 'solid', color: '#c2b8a6' }, opacity: 0.6 },
        mottle: { paint: { type: 'solid', color: '#d3cab9' }, opacity: 0.35 },
      },
    },
    {
      id: 'fog',
      label: '雾灰',
      elements: {
        bg: { paint: { type: 'solid', color: '#d9dadb' } },
        warp: { paint: { type: 'solid', color: '#c3c5c8' }, opacity: 0.6 },
        weft: { paint: { type: 'solid', color: '#e9eaeb' }, opacity: 0.6 },
        slub: { paint: { type: 'solid', color: '#b5b8bc' }, opacity: 0.55 },
        mottle: { paint: { type: 'solid', color: '#c9cbce' }, opacity: 0.35 },
      },
      params: { fineness: 3.5 },
    },
    {
      id: 'indigo',
      label: '靛染',
      elements: {
        bg: { paint: { type: 'solid', color: '#28344a' } },
        warp: { paint: { type: 'solid', color: '#1d273a' }, opacity: 0.65 },
        weft: { paint: { type: 'solid', color: '#3b4a66' }, opacity: 0.6 },
        slub: { paint: { type: 'solid', color: '#4c5c7a' }, opacity: 0.55 },
        mottle: { paint: { type: 'solid', color: '#1f2a3d' }, opacity: 0.4 },
      },
      params: { fineness: 4.5, slubs: 0.5 },
    },
    {
      id: 'charcoal',
      label: '炭灰',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b2b2d' } },
        warp: { paint: { type: 'solid', color: '#222224' }, opacity: 0.7 },
        weft: { paint: { type: 'solid', color: '#3a3a3d' }, opacity: 0.6 },
        slub: { paint: { type: 'solid', color: '#46464a' }, opacity: 0.5 },
        mottle: { paint: { type: 'solid', color: '#202022' }, opacity: 0.3 },
      },
      params: { fineness: 3.5, irregular: 0.7 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['warp'],
    secondary: ['weft'],
    accent: ['slub'],
    detail: ['mottle'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const fine = num(params, 'fineness', 2.5, 8);
    const irr = num(params, 'irregular', 0, 1);
    const slubK = num(params, 'slubs', 0, 1);
    const mottled = params.mottled === true;
    const n = api.n;

    const bg = elements.get('bg')!;
    const warp = elements.get('warp')!;
    const weft = elements.get('weft')!;
    const slub = elements.get('slub')!;
    const mottle = elements.get('mottle')!;

    const unit = clamp(Math.min(W, H) / 1080, 0.5, 4);
    const sp = fine * unit; // 平均纱距
    const T = N * sp; // 单元边长

    // 纱线位置：均匀网格 + 抖动（不均匀度控制），保证单元首尾可无缝衔接（抖动 < 半纱距）
    const W3 = [0.34, 0.5, 0.7]; // 三档粗细（× 纱距）
    const O3 = [0.6, 0.8, 0.95]; // 三档不透明度系数
    const pick = (): number => {
      if (irr === 0) return 1;
      const u = rng();
      return u < 0.3 * irr ? 0 : u > 1 - 0.28 * irr ? 2 : 1;
    };
    const threads = (): { pos: number[]; cls: number[] } => {
      const pos: number[] = [];
      const cls: number[] = [];
      for (let i = 0; i < N; i++) {
        pos.push((i + 0.5 + (rng() - 0.5) * 0.7 * irr) * sp);
        cls.push(pick());
      }
      return { pos, cls };
    };
    const wp = threads(); // 经：竖线 x
    const wf = threads(); // 纬：横线 y

    const linesD = (t: { pos: number[]; cls: number[] }, k: number, vertical: boolean): string => {
      let d = '';
      for (let i = 0; i < N; i++) {
        if (t.cls[i] !== k) continue;
        d += vertical ? `M${n(t.pos[i])} 0v${n(T)}` : `M0 ${n(t.pos[i])}h${n(T)}`;
      }
      return d;
    };
    let content = '';
    const layer = (el: typeof warp, t: { pos: number[]; cls: number[] }, vertical: boolean): void => {
      if (!el.visible) return;
      for (let k = 0; k < 3; k++) {
        const d = linesD(t, k, vertical);
        if (d === '') continue;
        content += `<path d="${d}" stroke="${el.paintValue}" stroke-opacity="${op(el.opacity * O3[k])}" stroke-width="${n(sp * W3[k])}"/>`;
      }
    };
    // 纬在下、经在上（经纱略深，压出细密的竖向肌理）
    layer(weft, wf, false);
    layer(warp, wp, true);

    // 竹节：沿某根纱的一小段略微加粗（多在纬向）；短、淡、圆头，不跨单元边界
    if (slub.visible && slubK > 0) {
      const count = Math.round(slubK * N * 0.5);
      const ds = ['', ''];
      for (let i = 0; i < count; i++) {
        const vertical = rng() < 0.25;
        const t = vertical ? wp : wf;
        const idx = Math.floor(rng() * N);
        const len = sp * (1.5 + rng() * rng() * 7);
        const at = sp + rng() * (T - len - 2 * sp);
        const seg = vertical ? `M${n(t.pos[idx])} ${n(at)}v${n(len)}` : `M${n(at)} ${n(t.pos[idx])}h${n(len)}`;
        ds[rng() < 0.6 ? 0 : 1] += seg;
      }
      ds.forEach((d, k) => {
        if (d !== '') content += `<path d="${d}" stroke="${slub.paintValue}" stroke-opacity="${op(slub.opacity * (k === 0 ? 0.65 : 1))}" stroke-width="${n(sp * (k === 0 ? 0.6 : 0.78))}" stroke-linecap="round"/>`;
      });
    }

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (content !== '') {
      const tile = api.tile({ key: `lw-${n(sp)}`, w: T, h: T, content });
      parts.push(rect(0, 0, W, H, { fill: tile }));
    }

    // 色晕：几团极淡的大椭圆（模糊），覆盖在纱线之上，打破平铺周期
    if (mottled && mottle.visible) {
      const S = Math.min(W, H);
      let blobs = '';
      const nb = 6 + Math.floor(rng() * 4);
      for (let i = 0; i < nb; i++) {
        const x = rng() * W;
        const y = rng() * H;
        const rx = S * (0.18 + rng() * 0.3);
        const ry = rx * (0.45 + rng() * 0.45);
        blobs += `<ellipse transform="translate(${Math.round(x)} ${Math.round(y)})rotate(${Math.round(rng() * 180)})" rx="${Math.round(rx)}" ry="${Math.round(ry)}" fill-opacity="${op(0.4 + rng() * 0.6)}"/>`;
      }
      parts.push(`<g fill="${mottle.paintValue}" opacity="${op(mottle.opacity)}" filter="${api.blur(S * 0.07)}">${blobs}</g>`);
    }

    return { body: parts.join('') };
  },
};

export default def;
