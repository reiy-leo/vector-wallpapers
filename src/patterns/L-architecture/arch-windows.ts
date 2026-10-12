/**
 * 拱窗立面 —— L 建筑空间 / 平铺 + 远景。
 *
 * 构图：一整面墙按「开间 × 层」重复开拱窗，透过所有窗洞看到**同一片**天空：
 * 天色渐变 + 太阳/月亮 + 远山（或海岛）剪影都画在墙后、横跨全屏，
 * 于是窗与窗之间的景是连续的 —— 像站在回廊里看日落，而不是每格贴一张小图。
 *
 * ⭐ 结构 / 体积：
 *   - 墙 = `api.tile()` 单元：墙面矩形挖掉窗洞（evenodd），窗洞处透明露出后面的天空；
 *   - 单元内另画：窗洞内侧的「侧壁阴影」（窗形 XOR 偏移窗形，左、上两条，再被墙压掉外溢部分）、
 *     窗台、拱顶石、层间檐线、窗棂；顶层节点数与开间数无关。
 *   - 单元宽 = 屏宽 / 整数开间，高 = 屏高 / 整数层 → 横竖都无缝、不截半扇窗。
 * 开间数按「长边」折算：竖屏自动减少列数，避免窗缝过密（与 tortoise-grid 等同一做法）。
 */
import { circle, path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clamp, f, op, unitOf } from './_helpers';

type Arch = 'round' | 'pointed' | 'horseshoe';

/** 窗形 path：底边 yb、起拱线 ys、左右 x0/x1。 */
function archPath(kind: Arch, x0: number, x1: number, ys: number, yb: number): string {
  const w = x1 - x0;
  const xm = (x0 + x1) / 2;
  if (kind === 'pointed') {
    const apex = ys - w * 0.866;
    return `M${f(x0)} ${f(yb)}V${f(ys)}A${f(w)} ${f(w)} 0 0 1 ${f(xm)} ${f(apex)}A${f(w)} ${f(w)} 0 0 1 ${f(x1)} ${f(ys)}V${f(yb)}Z`;
  }
  if (kind === 'horseshoe') {
    const r = w * 0.59;
    return `M${f(x0)} ${f(yb)}V${f(ys)}A${f(r)} ${f(r)} 0 1 1 ${f(x1)} ${f(ys)}V${f(yb)}Z`;
  }
  const r = w / 2;
  return `M${f(x0)} ${f(yb)}V${f(ys)}A${f(r)} ${f(r)} 0 0 1 ${f(x1)} ${f(ys)}V${f(yb)}Z`;
}

/** 起拱线到拱顶的高度 / 窗宽。 */
function riseOf(kind: Arch): number {
  if (kind === 'pointed') return 0.866;
  if (kind === 'horseshoe') return 0.59 + Math.sqrt(0.59 * 0.59 - 0.25);
  return 0.5;
}

const def: PatternDef = {
  id: 'arch-windows',
  name: '拱窗立面',
  category: 'L-architecture',
  description: '一整面墙重复开着拱窗，所有窗洞共享同一片天色、太阳与远山，像在回廊里看黄昏。',
  seedable: true,
  animatable: false,

  elements: [
    {
      id: 'sky',
      label: '天色',
      role: 'bg',
      paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#9dbfd6' }, { offset: 1, color: '#eef0ea' }] },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'sun', label: '日 / 月', role: 'accent', paint: { type: 'solid', color: '#f7e3c4' }, opacity: 1, visible: true, configurable: true },
    { id: 'hills', label: '远山', role: 'detail', paint: { type: 'solid', color: '#87a5b8' }, opacity: 1, visible: true, configurable: true },
    { id: 'wall', label: '墙面', role: 'primary', paint: { type: 'solid', color: '#f3eee6' }, opacity: 1, visible: true, configurable: true },
    { id: 'reveal', label: '窗洞阴影', role: 'secondary', paint: { type: 'solid', color: '#d8dde0' }, opacity: 1, visible: true, configurable: true },
    { id: 'trim', label: '窗台 · 檐线', role: 'detail', paint: { type: 'solid', color: '#e2d9cc' }, opacity: 1, visible: true, configurable: true },
    { id: 'frame', label: '窗框 · 窗棂', role: 'accent', paint: { type: 'solid', color: '#56789a' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cols', label: '开间数', type: 'range', min: 3, max: 12, step: 1, default: 6, heavy: true },
    { key: 'storey', label: '层高', type: 'range', min: 1, max: 3, step: 0.1, default: 1.7 },
    {
      key: 'arch',
      label: '拱形',
      type: 'select',
      default: 'round',
      options: [
        { value: 'round', label: '半圆拱' },
        { value: 'pointed', label: '尖拱' },
        { value: 'horseshoe', label: '马蹄拱' },
      ],
    },
    { key: 'openness', label: '窗宽', type: 'range', min: 0.35, max: 0.75, step: 0.05, default: 0.55 },
    { key: 'sunSize', label: '日月大小', type: 'range', min: 0.4, max: 1.6, step: 0.05, default: 1 },
    { key: 'mullions', label: '窗棂', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'aegean',
      label: '爱琴海',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#9dbfd6' }, { offset: 1, color: '#eef0ea' }] } },
        sun: { paint: { type: 'solid', color: '#f7e3c4' } },
        hills: { paint: { type: 'solid', color: '#87a5b8' } },
        wall: { paint: { type: 'solid', color: '#f3eee6' } },
        reveal: { paint: { type: 'solid', color: '#d8dde0' } },
        trim: { paint: { type: 'solid', color: '#e2d9cc' } },
        frame: { paint: { type: 'solid', color: '#56789a' }, opacity: 0.9 },
      },
    },
    {
      id: 'terracotta-dusk',
      label: '赭墙黄昏',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#6e6a8e' },
              { offset: 0.55, color: '#e7a38a' },
              { offset: 1, color: '#f5d7b4' },
            ],
          },
        },
        sun: { paint: { type: 'solid', color: '#fbe6c6' } },
        hills: { paint: { type: 'solid', color: '#8a6275' } },
        wall: { paint: { type: 'solid', color: '#c4876a' } },
        reveal: { paint: { type: 'solid', color: '#a06a55' } },
        trim: { paint: { type: 'solid', color: '#d9a98a' } },
        frame: { paint: { type: 'solid', color: '#6e4033' }, opacity: 0.85 },
      },
      params: { arch: 'pointed', openness: 0.5 },
    },
    {
      id: 'moon-cloister',
      label: '月夜回廊',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#18233d' }, { offset: 1, color: '#3e5076' }] } },
        sun: { paint: { type: 'solid', color: '#e9e3cf' } },
        hills: { paint: { type: 'solid', color: '#141c2d' } },
        wall: { paint: { type: 'solid', color: '#2a3241' } },
        reveal: { paint: { type: 'solid', color: '#1d2430' } },
        trim: { paint: { type: 'solid', color: '#364052' } },
        frame: { paint: { type: 'solid', color: '#8a96ab' }, opacity: 0.55 },
      },
      params: { arch: 'horseshoe', sunSize: 0.8, cols: 5, mullions: false },
    },
    {
      id: 'sage-noon',
      label: '鼠尾草',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#efd9b6' }, { offset: 1, color: '#f6eadb' }] } },
        sun: { paint: { type: 'solid', color: '#e9b98c' } },
        hills: { paint: { type: 'solid', color: '#c3a785' } },
        wall: { paint: { type: 'solid', color: '#a9b39a' } },
        reveal: { paint: { type: 'solid', color: '#8f9a80' } },
        trim: { paint: { type: 'solid', color: '#c3cab5' } },
        frame: { paint: { type: 'solid', color: '#5f6a52' }, opacity: 0.8 },
      },
      params: { cols: 8, storey: 1.4, mullions: false },
    },
  ],

  paletteSlots: {
    bg: ['sky'],
    primary: ['wall'],
    secondary: ['reveal'],
    accent: ['frame', 'sun'],
    detail: ['trim', 'hills'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = unitOf(W, H);
    const cols = clamp(params.cols, 3, 12, 6);
    const storey = clamp(params.storey, 1, 3, 1.7);
    const kind: Arch = params.arch === 'pointed' || params.arch === 'horseshoe' ? params.arch : 'round';
    const openness = clamp(params.openness, 0.35, 0.75, 0.55);
    const sunSize = clamp(params.sunSize, 0.4, 1.6, 1);
    const mullions = params.mullions === true;

    const sky = elements.get('sky')!;
    const sun = elements.get('sun')!;
    const hills = elements.get('hills')!;
    const wall = elements.get('wall')!;
    const reveal = elements.get('reveal')!;
    const trim = elements.get('trim')!;
    const frame = elements.get('frame')!;

    const parts: string[] = [];
    if (sky.visible) parts.push(rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': op(sky.opacity) }));

    // ── 墙面单元 ───────────────────────────────────────────────
    const L = Math.max(W, H);
    const colsEff = Math.max(2, Math.round(W / (L / cols)));
    const tw = W / colsEff;
    const rows = Math.max(1, Math.round(H / (tw * storey)));
    const th = H / rows;

    const yTop = th * 0.13;
    const yb = th * 0.84;
    const rise = riseOf(kind);
    let ww = tw * openness;
    ww = Math.min(ww, ((yb - yTop) * 0.62) / rise);
    const x0 = (tw - ww) / 2;
    const x1 = x0 + ww;
    const xm = tw / 2;
    const ys = yTop + rise * ww;
    const apex = yTop;
    const win = archPath(kind, x0, x1, ys, yb);

    // ── 墙后远景：日 / 月 + 两层远山（跨全屏，所有窗洞共享）────────────
    // 太阳 / 月亮落在某一扇窗里（半径相对窗宽），像窗框框住的一轮日
    const S = Math.min(W, H);
    const ri = Math.min(rows - 1, Math.floor(rows * 0.42));
    const col = Math.min(colsEff - 1, Math.floor(colsEff * (0.5 + rng() * 0.25)));
    if (sun.visible) {
      parts.push(circle((col + 0.5) * tw, ri * th + ys + (yb - ys) * 0.3, ww * 0.3 * sunSize, { fill: sun.paintValue, 'fill-opacity': op(sun.opacity) }));
    }
    const ridge = (base: number, amp: number, o: number): void => {
      const ph1 = rng() * 6.28;
      const ph2 = rng() * 6.28;
      const fr1 = 1.2 + rng() * 1.2;
      const fr2 = 3 + rng() * 2;
      const N = 18;
      const hy = (t: number): number => base - amp * (0.6 * Math.sin(t * fr1 * 3.14 + ph1) + 0.4 * Math.sin(t * fr2 * 3.14 + ph2));
      if (!hills.visible) return;
      let d = `M0 ${f(H)}L0 ${f(hy(0))}`;
      for (let i = 1; i <= N; i++) {
        const t0 = (i - 0.5) / N;
        const t1 = i / N;
        d += `Q${f(W * t0)} ${f(hy(t0))} ${f(W * t1)} ${f(i === N ? hy(1) : (hy(t0) + hy((i + 0.5) / N)) / 2)}`;
      }
      d += `L${f(W)} ${f(H)}Z`;
      parts.push(path(d, { fill: hills.paintValue, 'fill-opacity': op(hills.opacity * o) }));
    };
    ridge(H * 0.73, S * 0.06, 0.45);
    ridge(H * 0.85, S * 0.04, 1);

    const cell: string[] = [];
    // 窗洞侧壁阴影：窗形 XOR 偏移窗形（右下偏移）→ 左、上两条；外溢部分随后被墙压住
    if (reveal.visible) {
      const dd = ww * 0.075;
      cell.push(
        path(win + archPath(kind, x0 + dd, x1 + dd, ys + dd, yb + dd), {
          fill: reveal.paintValue,
          'fill-opacity': op(reveal.opacity),
          'fill-rule': 'evenodd',
        }),
      );
    }
    if (wall.visible) {
      cell.push(
        path(`M0 0H${f(tw)}V${f(th)}H0Z${win}`, {
          fill: wall.paintValue,
          'fill-opacity': op(wall.opacity),
          'fill-rule': 'evenodd',
        }),
      );
    }
    // 窗台 + 拱顶石 + 层间檐线
    if (trim.visible) {
      let d = '';
      const sx0 = x0 - ww * 0.1;
      const sh = Math.max(th * 0.022, unit * 3);
      d += `M${f(sx0)} ${f(yb)}h${f(ww * 1.2)}v${f(sh)}h${f(-ww * 1.2)}Z`;
      if (kind !== 'pointed') {
        const kw = ww * 0.09;
        const kh = ww * 0.11;
        const top = kind === 'horseshoe' ? ys - ww * Math.sqrt(0.59 * 0.59 - 0.25) - ww * 0.59 : apex;
        d += `M${f(xm - kw * 0.7)} ${f(top + kh * 0.55)}L${f(xm - kw)} ${f(top - kh * 0.45)}H${f(xm + kw)}L${f(xm + kw * 0.7)} ${f(top + kh * 0.55)}Z`;
      }
      const ch = Math.max(th * 0.02, unit * 3);
      d += `M0 ${f(th - ch * 1.6)}H${f(tw)}v${f(ch)}H0Z`;
      cell.push(path(d, { fill: trim.paintValue, 'fill-opacity': op(trim.opacity) }));
    }
    // 窗框 + 窗棂
    if (frame.visible) {
      const sw = unit * 2.6;
      let d = win;
      if (mullions) {
        const realTop = kind === 'horseshoe' ? ys - ww * Math.sqrt(0.59 * 0.59 - 0.25) - ww * 0.59 : kind === 'pointed' ? ys - ww * 0.866 : ys - ww / 2;
        d += `M${f(xm)} ${f(realTop)}V${f(yb)}M${f(x0)} ${f(ys)}H${f(x1)}`;
        const mid = (ys + yb) / 2;
        if (yb - ys > ww * 0.9) d += `M${f(x0)} ${f(mid)}H${f(x1)}`;
      }
      cell.push(
        path(d, {
          fill: 'none',
          stroke: frame.paintValue,
          'stroke-opacity': op(frame.opacity),
          'stroke-width': f(sw),
          'stroke-linejoin': 'round',
        }),
      );
    }

    if (cell.length > 0) {
      const ref = api.tile({ key: `arch-${kind}-${f(tw)}-${f(th)}-${f(ww)}-${mullions ? 1 : 0}`, w: tw, h: th, content: cell.join('') });
      parts.push(rect(0, 0, W, H, { fill: ref }));
    }
    return { body: parts.join('') };
  },
};

export default def;
