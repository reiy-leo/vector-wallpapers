/**
 * 木纹 —— K 材质纹理。
 *
 * 结构：一组近似平行的年轮线（每「年」一条深色晚材线 + 1~2 条浅色早材细线，年宽不均），
 * 整体随低频正弦起伏；节疤处的年轮线被「推开」绕行（位移 = 指数衰减 × 沿纹理方向的高斯窗），
 * 节疤本身是一枚深色椭圆芯 + 几圈同心环。另有几条宽而淡的「光泽带」顺着纹理走。
 * 可选「拼板」：按纹理方向切成几块木板，每块独立相位与节疤，板缝 + 错位端缝。
 *
 * ⭐ 体积策略：
 *   - 在短边 = 1000 的虚拟坐标作画，整体 `scale(q)` → 体积与分辨率无关；
 *   - 每条线先密采样，再用 RDP 化简成整数相对折线；同一元件的所有线合为一条 path；
 *   - 线条总字节有上限 LINE_CAP，超出则逐级放宽化简容差（而不是删线）。
 * 竖向纹理 = 在交换宽高的坐标系里画横纹，再整体旋转 90°。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { V, clamp, num, op, polyD, scaleOf, simplify, type Pt } from './_helpers';

/** 年轮线 + 光泽带 path 数据总字节上限。 */
const LINE_CAP = 13500;

interface Knot {
  x: number;
  y: number;
  r: number;
  s: number; // 默认推开方向（线恰好穿过芯时用）
}

/** 一段木板（不拼板时即整幅）：独立相位与节疤。 */
interface Seg {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  phase: number[];
  knots: Knot[];
}

const def: PatternDef = {
  id: 'wood-grain',
  name: '木纹',
  category: 'K-texture',
  description: '疏密不均的年轮线顺着木材缓缓起伏，在节疤处绕行；可切换横竖纹理与拼板。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '木色', role: 'bg', paint: { type: 'solid', color: '#d8bd95' }, opacity: 1, visible: true, configurable: true },
    { id: 'sheen', label: '光泽带', role: 'detail', paint: { type: 'solid', color: '#e6cfaa' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'grain_light', label: '早材细纹', role: 'secondary', paint: { type: 'solid', color: '#c3a275' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'grain_dark', label: '年轮线', role: 'primary', paint: { type: 'solid', color: '#a27c51' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'knot', label: '节疤', role: 'accent', paint: { type: 'solid', color: '#6f4e31' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    { key: 'rings', label: '年轮密度', type: 'range', min: 8, max: 36, step: 1, default: 17, heavy: true },
    { key: 'flow', label: '起伏', type: 'range', min: 0, max: 1, step: 0.05, default: 0.45 },
    { key: 'knots', label: '节疤数', type: 'range', min: 0, max: 5, step: 1, default: 2 },
    { key: 'line', label: '线宽', type: 'range', min: 0.5, max: 2.5, step: 0.1, default: 1 },
    {
      key: 'direction', label: '纹理方向', type: 'select', default: 'h', options: [
        { value: 'h', label: '横向' },
        { value: 'v', label: '竖向' },
      ],
    },
    { key: 'planks', label: '拼板', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'oak',
      label: '浅橡',
      elements: {
        bg: { paint: { type: 'solid', color: '#d8bd95' } },
        sheen: { paint: { type: 'solid', color: '#e6cfaa' }, opacity: 0.55 },
        grain_light: { paint: { type: 'solid', color: '#c3a275' }, opacity: 0.8 },
        grain_dark: { paint: { type: 'solid', color: '#a27c51' }, opacity: 0.85 },
        knot: { paint: { type: 'solid', color: '#6f4e31' }, opacity: 0.9 },
      },
    },
    {
      id: 'walnut',
      label: '胡桃',
      elements: {
        bg: { paint: { type: 'solid', color: '#4d3627' } },
        sheen: { paint: { type: 'solid', color: '#5e4331' }, opacity: 0.4 },
        grain_light: { paint: { type: 'solid', color: '#3f2b1f' }, opacity: 0.8 },
        grain_dark: { paint: { type: 'solid', color: '#2c1d14' }, opacity: 0.85 },
        knot: { paint: { type: 'solid', color: '#1f140e' }, opacity: 0.9 },
      },
      params: { rings: 21, flow: 0.55 },
    },
    {
      id: 'whitewash',
      label: '灰洗',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8e3db' } },
        sheen: { paint: { type: 'solid', color: '#f1ede7' }, opacity: 0.7 },
        grain_light: { paint: { type: 'solid', color: '#d7d0c5' }, opacity: 0.8 },
        grain_dark: { paint: { type: 'solid', color: '#b8ae9f' }, opacity: 0.8 },
        knot: { paint: { type: 'solid', color: '#918676' }, opacity: 0.85 },
      },
      params: { planks: true, rings: 15, knots: 3 },
    },
    {
      id: 'charred',
      label: '烧杉',
      elements: {
        bg: { paint: { type: 'solid', color: '#26272a' } },
        sheen: { paint: { type: 'solid', color: '#2f3034' }, opacity: 0.5 },
        grain_light: { paint: { type: 'solid', color: '#36373b' }, opacity: 0.8 },
        grain_dark: { paint: { type: 'solid', color: '#4a4b50' }, opacity: 0.85 },
        knot: { paint: { type: 'solid', color: '#17181a' }, opacity: 0.9 },
      },
      params: { direction: 'v', rings: 13, flow: 0.6, knots: 1 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['grain_dark'],
    secondary: ['grain_light'],
    accent: ['knot'],
    detail: ['sheen'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const rings = Math.round(num(params, 'rings', 8, 36));
    const flow = num(params, 'flow', 0, 1);
    const knotN = Math.round(num(params, 'knots', 0, 5));
    const lineK = num(params, 'line', 0.5, 2.5);
    const vertical = params.direction === 'v';
    const planksOn = params.planks === true;

    const q = scaleOf(W, H);
    // 作画坐标系：横纹 = 屏幕；竖纹 = 宽高互换后整体旋转
    const FW = (vertical ? H : W) / q;
    const FH = (vertical ? W : H) / q;
    const r0 = Math.round;

    const bg = elements.get('bg')!;
    const sheen = elements.get('sheen')!;
    const gl = elements.get('grain_light')!;
    const gd = elements.get('grain_dark')!;
    const knotEl = elements.get('knot')!;

    // ── 板块划分：不拼板 = 一整块；拼板 = 若干长条板，部分板再被端缝切成两段 ──
    //    每段（Seg）有独立的相位与节疤，段内纹理用 clip 收边，跨段互不干扰。
    const segs: Seg[] = [];
    const nP = planksOn ? Math.max(2, Math.round(FH / (V * 0.27))) : 1;
    const ph = FH / nP;
    const newPhase = (): number[] => [rng() * 6.283, rng() * 6.283, rng() * 6.283, rng() - 0.5];
    const joints: number[] = [];
    for (let p = 0; p < nP; p++) {
      const y0 = p * ph;
      const y1 = (p + 1) * ph;
      const joint = planksOn && rng() < 0.75 ? FW * (0.15 + rng() * 0.7) : -1;
      if (joint < 0) segs.push({ x0: 0, x1: FW, y0, y1, phase: newPhase(), knots: [] });
      else {
        joints.push(joint, y0, y1);
        segs.push({ x0: 0, x1: joint, y0, y1, phase: newPhase(), knots: [] });
        segs.push({ x0: joint, x1: FW, y0, y1, phase: newPhase(), knots: [] });
      }
    }
    // 节疤：在整幅里撒点，分配给所在段；彼此保持距离
    const knots: Array<Knot & { seg: Seg }> = [];
    for (let k = 0, tries = 0; k < knotN && tries < 60; tries++) {
      const r = V * (0.016 + rng() * 0.018) * (planksOn ? 0.8 : 1);
      let x = FW * (0.1 + rng() * 0.8);
      let y = FH * (0.12 + rng() * 0.76);
      const s = rng() < 0.5 ? -1 : 1;
      if (knots.some((o) => Math.hypot((o.x - x) * 0.5, o.y - y) < V * 0.22)) continue;
      const seg = segs.find((g) => x >= g.x0 && x < g.x1 && y >= g.y0 && y < g.y1) ?? segs[0];
      // 拼板时把节疤收进板内
      if (planksOn) {
        y = clamp(y, seg.y0 + r * 2.6, seg.y1 - r * 2.6);
        if (seg.x1 - seg.x0 > r * 10) x = clamp(x, seg.x0 + r * 4.5, seg.x1 - r * 4.5);
      }
      const kn = { x, y, r, s, seg };
      seg.knots.push(kn);
      knots.push(kn);
      k++;
    }

    // ── 位移场 ───────────────────────────────────────────
    const amp = V * (0.004 + flow * 0.05);
    const wave = (sg: Seg, x: number, b: number): number => {
      const [a, c, e, tilt] = sg.phase;
      return (
        amp * Math.sin((x / V) * 1.2 * Math.PI + a + b * 0.0021) +
        amp * 0.45 * Math.sin((x / V) * 3 * Math.PI + c - b * 0.0047) +
        amp * 0.16 * Math.sin((x / V) * 7.3 * Math.PI + e + b * 0.011) +
        tilt * flow * V * 0.06 * (x / V)
      );
    };
    const field = (sg: Seg, x: number, b: number): number => {
      let y = b + wave(sg, x, b);
      for (const k of sg.knots) {
        const A = k.r * 2.3;
        // 绕行方向按「该线在节疤处的位置」定死，避免沿途翻边造成折钩
        const d = b + wave(sg, k.x, b) - k.y;
        const s = d === 0 ? k.s : Math.sign(d);
        const gx = (x - k.x) / (k.r * 5.5);
        y += s * A * Math.exp(-Math.abs(d) / (A * 1.35)) * Math.exp(-gx * gx);
      }
      return y;
    };

    /** 段内采样横坐标：拼板时恰好落在段的两端（端缝处纹理齐口），否则两端各外扩一步。 */
    const xsOf = (sg: Seg, st: number): number[] => {
      const a = planksOn ? sg.x0 : sg.x0 - st;
      const b = planksOn ? sg.x1 : sg.x1 + st;
      const n = Math.max(2, Math.ceil((b - a) / st));
      const out: number[] = [];
      for (let i = 0; i <= n; i++) out.push(a + ((b - a) * i) / n);
      return out;
    };

    // ── 年轮线（每段：浅细纹 / 深 / 深粗 三组）──────────────────
    const yearW = V / rings;
    const step = Math.max(4, FW / 260);
    const segLines = segs.map((sg) => {
      const list: Array<{ kind: number; pts: Pt[] }> = [];
      const m = planksOn ? amp * 1.7 + yearW : V * 0.12;
      let b = sg.y0 - m + rng() * yearW;
      const add = (bb: number, kind: number): void => {
        const pts: Pt[] = [];
        let inside = false;
        for (const x of xsOf(sg, step)) {
          const y = field(sg, x, bb);
          if (planksOn) {
            // 拼板：越出板边的部分压到板缝上（被板缝描边盖住），整条都在板外则丢弃
            if (y > sg.y0 && y < sg.y1) inside = true;
            pts.push([x, clamp(y, sg.y0 + 0.5, sg.y1 - 0.5)]);
          } else {
            inside = true;
            pts.push([x, y]);
          }
        }
        if (inside) list.push({ kind, pts });
      };
      while (b < sg.y1 + m) {
        const w = yearW * (0.45 + rng() * 1.1);
        add(b, rng() < 0.3 ? 2 : 1);
        const thin = w > yearW * 0.8 ? 2 : 1;
        for (let t = 1; t <= thin; t++) add(b + (w * t) / (thin + 1) + (rng() - 0.5) * w * 0.15, 0);
        b += w;
      }
      return list;
    });

    // ── 光泽带：顺纹理的宽淡色带（粗采样多边形）────────────────
    const sheenDs = segs.map((sg) => {
      if (!sheen.visible) return '';
      let d = '';
      const bStep = V / 14;
      const nb = planksOn ? (rng() < 0.6 ? 1 : 0) : 2 + Math.floor(rng() * 3);
      for (let i = 0; i < nb; i++) {
        const b1 = sg.y0 + (sg.y1 - sg.y0) * rng();
        const bw = V * (0.04 + rng() * 0.14);
        const top: Pt[] = [];
        const bot: Pt[] = [];
        for (const x of xsOf(sg, bStep)) {
          top.push([x, clamp(field(sg, x, b1), sg.y0, sg.y1)]);
          bot.push([x, clamp(field(sg, x, b1 + bw), sg.y0, sg.y1)]);
        }
        d += polyD(simplify([...top, ...bot.reverse()], 0.8), true);
      }
      return d;
    });
    const sheenLen = sheenDs.join('').length;

    const build = (tol: number): string[][] =>
      segLines.map((list) => {
        const out = ['', '', ''];
        for (const ln of list) out[ln.kind] += polyD(simplify(ln.pts, tol));
        return out;
      });
    let tol = 0.45;
    let ds = build(tol);
    const total = (): number => ds.reduce((a, o) => a + o.join('').length, 0);
    for (let g = 0; g < 24 && total() > LINE_CAP - sheenLen; g++) {
      tol *= 1.2;
      ds = build(tol);
    }

    // ── 组装 ────────────────────────────────────────────
    // 线宽在虚拟坐标里给（1 = 短边 / 1000），随整体 scale(q) 放大
    const swThin = 0.9 * lineK;
    const swDark = 1.5 * lineK;
    const swHeavy = 2.6 * lineK;
    const strokeG = (el: typeof gd, d: string, sw: number): string =>
      d === ''
        ? ''
        : `<path d="${d}" fill="none" stroke="${el.paintValue}" stroke-opacity="${op(el.opacity)}" stroke-width="${api.n(sw)}" stroke-linejoin="round"/>`;

    // 各段合并为每元件一条 path（拼板时越界部分已压到板缝上，无需逐段裁切）
    const kindD = ['', '', ''];
    ds.forEach((o) => o.forEach((d, k) => (kindD[k] += d)));
    const sheenD = sheenDs.join('');
    let inner = '';
    if (sheenD !== '') inner += `<path d="${sheenD}" fill="${sheen.paintValue}" fill-opacity="${op(sheen.opacity)}" filter="${api.blur(V * 0.012)}"/>`;
    if (gl.visible) inner += strokeG(gl, kindD[0], swThin);
    if (gd.visible) inner += strokeG(gd, kindD[1], swDark) + strokeG(gd, kindD[2], swHeavy);

    // 节疤：椭圆芯 + 同心环（沿局部纹理方向微旋）
    if (knotEl.visible && knots.length > 0) {
      let rings2 = '';
      let cores = '';
      for (const k of knots) {
        const dy = wave(k.seg, k.x + 4, k.y) - wave(k.seg, k.x - 4, k.y);
        const ang = r0((Math.atan2(dy, 8) * 180) / Math.PI);
        const tr = `translate(${r0(k.x)} ${r0(k.y)})${ang !== 0 ? `rotate(${ang})` : ''}`;
        cores += `<ellipse transform="${tr}" rx="${api.n(k.r * 1.35)}" ry="${api.n(k.r * 0.72)}"/>`;
        for (let i = 1; i <= 3; i++) {
          const f = 1 + i * 0.45;
          rings2 += `<ellipse transform="${tr}" rx="${api.n(k.r * 1.35 * f * (1 + i * 0.12))}" ry="${api.n(k.r * 0.72 * f)}" stroke-opacity="${op(knotEl.opacity * (0.8 - i * 0.18))}"/>`;
        }
      }
      inner +=
        `<g fill="none" stroke="${knotEl.paintValue}" stroke-width="${api.n(swDark)}">${rings2}</g>` +
        `<g fill="${knotEl.paintValue}" fill-opacity="${op(knotEl.opacity)}">${cores}</g>`;
    }

    // 拼板：板缝 + 端缝（年轮线色，加粗）
    if (planksOn && gd.visible) {
      let d = '';
      for (let p = 1; p < nP; p++) d += `M0 ${r0(p * ph)}H${r0(FW)}`;
      for (let j = 0; j < joints.length; j += 3) d += `M${r0(joints[j])} ${r0(joints[j + 1])}V${r0(joints[j + 2])}`;
      inner += `<path d="${d}" fill="none" stroke="${gd.paintValue}" stroke-opacity="${op(Math.min(1, gd.opacity * 1.15))}" stroke-width="${api.n(swHeavy * 1.3)}"/>`;
    }

    const tf = vertical ? `translate(${W} 0)rotate(90)scale(${q})` : `scale(${q})`;
    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="${tf}">${inner}</g>`,
    };
  },
};

export default def;
