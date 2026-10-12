/**
 * 梯田 —— E 风景 / 单幅构图。
 *
 * 构图要点：远处一抹山影，下方整片山坡被层层梯田铺满：每一级田面是一条随山势弯曲的色带
 * （像等高线，但是填色的面），田面前缘有一道深色田埂墙、墙顶一线亮边；
 * 级距由远及近按幂次拉开（透视），山脊处色带向前凸、山谷处向后凹；色带深浅交替并随深度渐变，
 * 远处被山雾冲淡；几缕横向云雾浮在山腰。
 *
 * ⭐ 体积/节点策略：
 *   - 虚拟坐标「短边 = 1000」，整体 `scale(q)`；等高线用二次贝塞尔中点法 + 整数相对坐标。
 *   - 每级只写一份 d（放在 `<defs>` 里），用两个 `<use>` 复用：
 *     ① 田面填色 + 田埂描边（描边宽 = 2×墙高，上半盖住上一级田面前缘 = 田埂墙）；
 *     ② 上移一个墙高的细亮线 = 墙顶亮边。
 *   - TERRACE_CAP 超限时等高线采样放疏。
 * 动画（仅预览，cfg.animate && mistDrift）：每缕云雾以不同周期 / 幅度左右漂移。
 */
import { g, path, rect } from '../../engine/svg';
import { encLine, encSmooth, f1, mix, noise1D, num, peakRange, virt } from './_scene';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;
/** 等高线 d + 每级两个 <use>（≈ 270B/级）合计上限。 */
const TERRACE_CAP = 16000;
const USE_BYTES = 270;

const def: PatternDef = {
  id: 'rice-terraces',
  name: '梯田',
  category: 'E-scene',
  description: '整片山坡铺满随山势弯曲的层层梯田，田面深浅交替、田埂勾出亮边，山腰浮着几缕云雾。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天空', role: 'bg', paint: { type: 'solid', color: '#e5ebe1' }, opacity: 1, visible: true, configurable: true },
    { id: 'hill_far', label: '远山', role: 'detail', paint: { type: 'solid', color: '#b1c4b0' }, opacity: 1, visible: true, configurable: true },
    { id: 'terrace_light', label: '田面 · 浅', role: 'primary', paint: { type: 'solid', color: '#c3d78f' }, opacity: 1, visible: true, configurable: true },
    { id: 'terrace_dark', label: '田面 · 深', role: 'primary', paint: { type: 'solid', color: '#77a25b' }, opacity: 1, visible: true, configurable: true },
    { id: 'riser', label: '田埂墙', role: 'secondary', paint: { type: 'solid', color: '#4e6e3e' }, opacity: 1, visible: true, configurable: true },
    { id: 'edge', label: '田埂亮边', role: 'accent', paint: { type: 'solid', color: '#edf3cf' }, opacity: 1, visible: true, configurable: true },
    { id: 'mist', label: '云雾', role: 'accent', paint: { type: 'solid', color: '#f7f8f2' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'layers', label: '梯田层数', type: 'range', min: 8, max: 28, step: 1, default: 16, heavy: true },
    { key: 'curvature', label: '弯曲度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55, heavy: true },
    { key: 'mistAmount', label: '云雾浓度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'horizonLine', label: '山坡高度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, heavy: true },
    { key: 'mistDrift', label: '云雾飘移', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'spring-green',
      label: '春绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#e5ebe1' } },
        hill_far: { paint: { type: 'solid', color: '#b1c4b0' } },
        terrace_light: { paint: { type: 'solid', color: '#c3d78f' } },
        terrace_dark: { paint: { type: 'solid', color: '#77a25b' } },
        riser: { paint: { type: 'solid', color: '#4e6e3e' } },
        edge: { paint: { type: 'solid', color: '#edf3cf' } },
        mist: { paint: { type: 'solid', color: '#f7f8f2' } },
      },
    },
    {
      id: 'golden-harvest',
      label: '金秋',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe6d3' } },
        hill_far: { paint: { type: 'solid', color: '#c8bea3' } },
        terrace_light: { paint: { type: 'solid', color: '#e6c46c' } },
        terrace_dark: { paint: { type: 'solid', color: '#c49342' } },
        riser: { paint: { type: 'solid', color: '#86602f' } },
        edge: { paint: { type: 'solid', color: '#faeec6' } },
        mist: { paint: { type: 'solid', color: '#faf6ec' } },
      },
    },
    {
      id: 'water-season',
      label: '灌水季',
      elements: {
        bg: { paint: { type: 'solid', color: '#dee6eb' } },
        hill_far: { paint: { type: 'solid', color: '#a7b7be' } },
        terrace_light: { paint: { type: 'solid', color: '#cbdadf' } },
        terrace_dark: { paint: { type: 'solid', color: '#94aeb8' } },
        riser: { paint: { type: 'solid', color: '#5c6f58' } },
        edge: { paint: { type: 'solid', color: '#f3f7f7' } },
        mist: { paint: { type: 'solid', color: '#f6f8f9' } },
      },
      params: { curvature: 0.7 },
    },
    {
      id: 'tea-mist',
      label: '茶山云雾',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe6df' } },
        hill_far: { paint: { type: 'solid', color: '#9fb4a7' } },
        terrace_light: { paint: { type: 'solid', color: '#8fb78a' } },
        terrace_dark: { paint: { type: 'solid', color: '#4f8962' } },
        riser: { paint: { type: 'solid', color: '#335943' } },
        edge: { paint: { type: 'solid', color: '#cfe2c2' } },
        mist: { paint: { type: 'solid', color: '#f4f6f2' } },
      },
      params: { mistAmount: 0.75, layers: 20 },
    },
    {
      id: 'dusk-terrace',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#cac4d6' } },
        hill_far: { paint: { type: 'solid', color: '#9c95ad' } },
        terrace_light: { paint: { type: 'solid', color: '#a8b08f' } },
        terrace_dark: { paint: { type: 'solid', color: '#6f7e68' } },
        riser: { paint: { type: 'solid', color: '#444b46' } },
        edge: { paint: { type: 'solid', color: '#dad5c4' } },
        mist: { paint: { type: 'solid', color: '#ebe7f1' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['terrace_light', 'terrace_dark'],
    secondary: ['riser'],
    accent: ['edge', 'mist'],
    detail: ['hill_far'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const N = Math.round(num(params, 'layers', 4, 40));
    const curv = num(params, 'curvature', 0, 1);
    const mistAmt = num(params, 'mistAmount', 0, 1);
    const hl = num(params, 'horizonLine', 0, 1);
    const anim = cfg.animate && params.mistDrift === true;

    const { Wv, Hv, tf } = virt(W, H, V);
    const el = (id: string) => elements.get(id)!;
    const hex = (v: string): boolean => v.startsWith('#');
    const bg = el('bg');
    const out: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const inner: string[] = [];
    // 封底线放到画外足够远：描边 / 上移亮边都不会露出来
    const bottom = Math.ceil(Hv + V * 0.45);
    const top = Hv * (0.42 - hl * 0.24);
    const x0 = -V * 0.15;
    const x1 = Wv + V * 0.15;

    // ── 随机布局（固定消耗顺序）────────────────────────────────
    const hillR = peakRange(rng, { x0, x1, count: Math.max(2, Math.round((Wv / V) * 2)), height: V * 0.14, slope: [0.18, 0.32], detail: V * 0.01 });
    const cells = Math.max(2, Math.round((2.6 * Wv) / V));
    const F = noise1D(rng, cells, 3, 0.4); // 山势：山脊 / 山谷
    const G = noise1D(rng, cells, 1); // 级距疏密
    const crestN = noise1D(rng, Math.max(2, Math.round((1.5 * Wv) / V)), 2, 0.5); // 坡顶轮廓
    const drift = (rng() - 0.5) * 0.08;
    const jit: number[] = [];
    for (let k = 0; k < 40; k++) jit.push(rng());
    const clouds: Array<[number, number, number, number, number]> = [];
    for (let i = 0; i < 6; i++) clouds.push([rng(), rng(), rng(), rng(), rng()]);

    // ── 远山 ─────────────────────────────────────────────
    const hf = el('hill_far');
    if (hf.visible) {
      const pts: Array<[number, number]> = [];
      for (let x = x0; x <= x1 + V * 0.025; x += V * 0.025) pts.push([x, top - V * 0.02 - hillR(x)]);
      const d = `${encLine(pts)}V${Math.round(top + V * 0.05)}H${Math.round(x0)}z`;
      inner.push(path(d, { fill: hf.paintValue, 'fill-opacity': hf.opacity }));
    }
    const mist = el('mist');
    // 远山脚的雾（让坡顶与远山拉开）
    if (mist.visible && hex(mist.paintValue)) {
      const f = api.linear({ key: 'rt-haze', angle: 90, stops: [{ offset: 0, color: mist.paintValue, opacity: 0 }, { offset: 1, color: mist.paintValue, opacity: 0.85 * mist.opacity }] });
      inner.push(rect(0, Math.round(top - V * 0.12), Math.ceil(Wv), Math.round(V * 0.14), { fill: f }));
    }

    // ── 梯田等高线 ─────────────────────────────────────────
    const span = Hv - top;
    const curveY = (k: number, x: number): number => {
      const t = (x - x0) / (x1 - x0);
      const p = k / N;
      const depth = Math.pow(p, 1.35);
      // 级距沿 x 疏密变化（陡处窄、缓处宽）
      const thick = 1 + 0.45 * G(t) * (1 - depth * 0.6);
      const base = top + span * Math.min(0.97, depth * thick) - V * 0.035 * (crestN(t) + 1) * (1 - p) * (1 - p);
      // 山脊向前凸、山谷向后凹：越近幅度越大 → 等高线由远及近逐级张开
      const amp = V * (0.015 + 0.3 * Math.pow(p, 1.05)) * curv;
      const local = (jit[k % 40] - 0.5) * V * 0.008 * (1 + p * 3);
      return base + amp * F(Math.min(1, Math.max(0, t + drift * p))) + local;
    };
    let step = V * 0.05;
    let ds: string[] = [];
    for (let guard = 0; guard < 10; guard++) {
      ds = [];
      const xs: number[] = [];
      for (let x = x0; x <= x1 + step; x += step) xs.push(x);
      let prev: number[] = xs.map(() => -1e9);
      for (let k = 0; k < N; k++) {
        // 逐级单调：任何位置都不越过上一级（最小级距随深度增大），避免色带交叉成大块
        const gap = V * (0.006 + 0.02 * Math.pow(k / N, 1.3));
        const ys = xs.map((x, i) => Math.max(curveY(k, x), prev[i] + gap));
        prev = ys;
        ds.push(`${encSmooth(xs.map((x, i) => [x, ys[i]] as [number, number]))}V${bottom}H${Math.round(x0)}z`);
      }
      if (ds.reduce((s, d) => s + d.length, 0) + N * USE_BYTES <= TERRACE_CAP) break;
      step *= 1.18;
    }

    const lightE = el('terrace_light');
    const darkE = el('terrace_dark');
    const riser = el('riser');
    const edge = el('edge');
    const hazeC = mist.visible ? mist.paintValue : bg.paintValue;
    const idp = `rt${cfg.seed}-`;
    let defsM = '';
    let uses = '';
    ds.forEach((d, k) => {
      const p = k / Math.max(1, N - 1);
      const depth = Math.pow(p, 1.4);
      defsM += `<path id="${idp}${k}" d="${d}"/>`;
      // 交替深浅 + 远淡近浓
      const tone = Math.min(1, Math.max(0, 0.5 + 0.42 * Math.sin(k * 2.1 + jit[3] * 6) + (jit[(k * 7) % 40] - 0.5) * 0.35 + (1 - p) * 0.15));
      let fillC = mix(darkE.paintValue, lightE.paintValue, tone);
      fillC = mix(fillC, hazeC, (1 - p) * 0.38 * (0.4 + mistAmt * 0.6));
      const fillOp = lightE.opacity * tone + darkE.opacity * (1 - tone);
      const r = V * (0.003 + 0.008 * depth) * (0.6 + 0.4 * (N <= 16 ? 1 : 16 / N));
      const riserC = mix(mix(riser.paintValue, fillC, 0.3), hazeC, (1 - p) * 0.35);
      const showFill = lightE.visible || darkE.visible;
      uses +=
        `<use href="#${idp}${k}" fill="${showFill ? fillC : 'none'}"${showFill ? ` fill-opacity="${api.n(fillOp)}"` : ''}` +
        (riser.visible ? ` stroke="${riserC}" stroke-width="${f1(r * 2)}" stroke-opacity="${api.n(riser.opacity)}"` : '') +
        `/>`;
      if (edge.visible && k > 0) {
        uses += `<use href="#${idp}${k}" fill="none" stroke="${edge.paintValue}" stroke-width="${f1(Math.max(1, r * 0.4))}" stroke-opacity="${api.n(edge.opacity * (0.35 + 0.3 * p))}" transform="translate(0 ${f1(-r)})"/>`;
      }
    });
    inner.push(`<defs>${defsM}</defs>${uses}`);

    // ── 云雾：横向柔团（径向渐变椭圆）────────────────────────────
    if (mist.visible && hex(mist.paintValue) && mistAmt > 0) {
      const cf = api.radial({
        key: 'rt-cloud',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: mist.paintValue, opacity: Math.min(1, 0.85 * mist.opacity) },
          { offset: 0.5, color: mist.paintValue, opacity: Math.min(1, 0.45 * mist.opacity) },
          { offset: 1, color: mist.paintValue, opacity: 0 },
        ],
      });
      const nC = Math.max(1, Math.round(2 + mistAmt * 4));
      clouds.slice(0, nC).forEach(([a, b, c, dd, e], i) => {
        const cy = top + span * (0.05 + 0.5 * b * b);
        const cx = x0 + (x1 - x0) * a;
        const rx = V * (0.35 + c * 0.5) * (0.6 + mistAmt * 0.5);
        const ry = V * (0.03 + dd * 0.05) * (0.6 + mistAmt * 0.6);
        let s = `<ellipse cx="${Math.round(cx)}" cy="${Math.round(cy)}" rx="${Math.round(rx)}" ry="${Math.round(ry)}" fill="${cf}" fill-opacity="${api.n(0.5 + mistAmt * 0.5)}"/>`;
        if (anim) {
          const amp = Math.round(V * (0.08 + e * 0.12));
          const kf = api.keyframes(`vw-rt-c${amp}`, `from{transform:translateX(-${amp}px)}to{transform:translateX(${amp}px)}`);
          s = `<g style="animation:${kf} ${f1(16 + e * 14)}s ease-in-out -${f1(i * 4.3)}s infinite alternate">${s}</g>`;
        }
        inner.push(s);
      });
    }

    out.push(g({ transform: tf }, inner.join('')));
    return { body: out.join('') };
  },
};

export default def;
