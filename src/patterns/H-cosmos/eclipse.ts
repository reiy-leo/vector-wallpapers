/**
 * 日食 —— H 宇宙天文。
 *
 * 三种构图：
 *  - single   单幅：「钻石环」瞬间 —— 月盘几乎完全遮住日盘，只在一侧露出极细的日牙，
 *             日牙处一颗高亮「钻石」带星芒；日冕是一圈柔光 + 向两侧（赤道方向）伸展的细长冕流，
 *             日面边缘一圈色球亮环，零星红色日珥；背景星点稀疏（离日越近越少）。
 *  - sequence 延时序列：一排食相沿弧线横过天空，从初亏到复圆，正中为全食（带日冕）。
 *  - tile     平铺：食相序列做成 <pattern> 两行错位平铺，像一张天文图鉴纹样。
 *
 * ⭐ 渐变只做「层」（日冕柔光 / 钻石光晕），元件本身全为纯色；
 * 冕流按不透明度分 3 档各合并为一条 path；平铺模式走 api.tile。
 * 动画（仅预览）：日冕缓慢呼吸。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { V, dotPath, f1, fitCount, gauss, hexOf, num, op, sparkle, virt, type Pt } from './_helpers';

const STAR_CAP = 3200;

const def: PatternDef = {
  id: 'eclipse',
  name: '日食',
  category: 'H-cosmos',
  tones: ['dark'],
  description: '日全食的钻石环瞬间：月盘、色球亮环、柔光日冕与冕流；也可排成食相序列或平铺纹样。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天空', role: 'bg', paint: { type: 'solid', color: '#0b0d14' }, opacity: 1, visible: true, configurable: true },
    { id: 'stars', label: '星点', role: 'detail', paint: { type: 'solid', color: '#aeb6cc' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'corona', label: '日冕', role: 'secondary', paint: { type: 'solid', color: '#d9dcef' }, opacity: 1, visible: true, configurable: true },
    { id: 'sun', label: '日盘', role: 'accent', paint: { type: 'solid', color: '#ffe3a6' }, opacity: 1, visible: true, configurable: true },
    { id: 'ring', label: '色球亮环', role: 'accent', paint: { type: 'solid', color: '#fff4dc' }, opacity: 1, visible: true, configurable: true },
    { id: 'moon', label: '月盘', role: 'primary', paint: { type: 'solid', color: '#05060a' }, opacity: 1, visible: true, configurable: true },
    { id: 'flare', label: '钻石 / 日珥', role: 'detail', paint: { type: 'solid', color: '#ff9a7a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'mode',
      label: '构图',
      type: 'select',
      options: [
        { value: 'single', label: '单幅' },
        { value: 'sequence', label: '食相序列' },
        { value: 'tile', label: '平铺' },
      ],
      default: 'single',
    },
    { key: 'size', label: '日盘大小', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: 'rays', label: '冕流', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'offset', label: '钻石环', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'phases', label: '食相数', type: 'range', min: 5, max: 13, step: 2, default: 9 },
    { key: 'starDensity', label: '星点密度', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.45 },
    { key: 'pulse', label: '日冕呼吸', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'totality',
      label: '全食',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b0d14' } },
        stars: { paint: { type: 'solid', color: '#aeb6cc' }, opacity: 0.8 },
        corona: { paint: { type: 'solid', color: '#d9dcef' } },
        sun: { paint: { type: 'solid', color: '#ffe3a6' } },
        ring: { paint: { type: 'solid', color: '#fff4dc' } },
        moon: { paint: { type: 'solid', color: '#05060a' } },
        flare: { paint: { type: 'solid', color: '#ff9a7a' } },
      },
    },
    {
      id: 'blood-gold',
      label: '赤金',
      elements: {
        bg: { paint: { type: 'solid', color: '#140b0a' } },
        stars: { paint: { type: 'solid', color: '#c9a99a' }, opacity: 0.7 },
        corona: { paint: { type: 'solid', color: '#e9a25c' } },
        sun: { paint: { type: 'solid', color: '#ffd27a' } },
        ring: { paint: { type: 'solid', color: '#ffe2a8' } },
        moon: { paint: { type: 'solid', color: '#0a0505' } },
        flare: { paint: { type: 'solid', color: '#ff6a4a' } },
      },
      params: { rays: 0.8, offset: 0.7 },
    },
    {
      id: 'timelapse',
      label: '延时',
      elements: {
        bg: { paint: { type: 'solid', color: '#101a2c' } },
        stars: { paint: { type: 'solid', color: '#93a6c7' }, opacity: 0.7 },
        corona: { paint: { type: 'solid', color: '#b9cdee' } },
        sun: { paint: { type: 'solid', color: '#f6c97a' } },
        ring: { paint: { type: 'solid', color: '#fbe9c8' } },
        moon: { paint: { type: 'solid', color: '#1a2438' } },
        flare: { paint: { type: 'solid', color: '#f39a83' } },
      },
      params: { mode: 'sequence' },
    },
    {
      id: 'atlas',
      label: '图鉴',
      elements: {
        bg: { paint: { type: 'solid', color: '#16141f' } },
        stars: { paint: { type: 'solid', color: '#7f7896' }, opacity: 0.8 },
        corona: { paint: { type: 'solid', color: '#c9b8e6' } },
        sun: { paint: { type: 'solid', color: '#e9c98f' } },
        ring: { paint: { type: 'solid', color: '#f5e8cf' } },
        moon: { paint: { type: 'solid', color: '#26223a' } },
        flare: { paint: { type: 'solid', color: '#e48b8b' } },
      },
      params: { mode: 'tile', size: 0.8, phases: 7 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['moon'],
    secondary: ['corona'],
    accent: ['sun', 'ring'],
    detail: ['stars', 'flare'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const { q, Wv, Hv } = virt(W, H);
    const E = (id: string) => elements.get(id)!;
    const mode = params.mode === 'sequence' || params.mode === 'tile' ? params.mode : 'single';
    const size = num(params, 'size', 0.6, 1.5);
    const rays = num(params, 'rays', 0, 1);
    const offset = num(params, 'offset', 0, 1);
    let K = Math.round(num(params, 'phases', 5, 13));
    if (K % 2 === 0) K += 1;
    const sd = num(params, 'starDensity', 0.1, 1);
    const pulse = animate && params.pulse === true;
    const r0 = Math.round;
    const S = Math.min(Wv, Hv);

    const bgEl = E('bg');
    const starEl = E('stars');
    const corEl = E('corona');
    const sunEl = E('sun');
    const ringEl = E('ring');
    const moonEl = E('moon');
    const flEl = E('flare');
    const corOp = corEl.visible ? corEl.opacity : 0;
    const flOp = flEl.visible ? flEl.opacity : 0;
    const corHex = hexOf(corEl);
    const flHex = hexOf(flEl);

    const corGlow = api.radial({
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
      key: 'ecl-glow',
      stops: [
        { offset: 0, color: corHex, opacity: 0.55 },
        { offset: 0.3, color: corHex, opacity: 0.2 },
        { offset: 1, color: corHex, opacity: 0 },
      ],
    });
    const corInner = api.radial({
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
      key: 'ecl-inner',
      stops: [
        { offset: 0.6, color: corHex, opacity: 0.95 },
        { offset: 0.74, color: corHex, opacity: 0.4 },
        { offset: 1, color: corHex, opacity: 0 },
      ],
    });
    const flGlow = api.radial({
      cx: 0.5,
      cy: 0.5,
      r: 0.5,
      key: 'ecl-flare',
      stops: [
        { offset: 0, color: flHex, opacity: 0.9 },
        { offset: 0.25, color: flHex, opacity: 0.35 },
        { offset: 1, color: flHex, opacity: 0 },
      ],
    });
    const C = (x: number, y: number, r: number, attrs: string) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${f1(r)}" ${attrs}/>`;

    /** 一次全食（钻石环）的完整绘制。beta = 月盘偏移方向；钻石在反方向。 */
    const totality = (cx: number, cy: number, R: number, beta: number, rayN: number): string => {
      let s = C(cx, cy, R * 4.2, `fill="${corGlow}" fill-opacity="${op(corOp)}"`);
      // 冕流：赤道方向两瓣为主
      const th0 = rng() * Math.PI;
      const tiers = ['', '', ''];
      for (let i = 0; i < rayN; i++) {
        const lobe = rng() < 0.72;
        const th = lobe ? th0 + (rng() < 0.5 ? 0 : Math.PI) + gauss(rng) * 0.5 : rng() * Math.PI * 2;
        const len = R * (0.2 + Math.pow(rng(), 2.2) * (lobe ? 2.1 : 0.9) * (0.55 + rays * 0.45));
        const hw = 0.012 + rng() * 0.05;
        const tier = Math.floor(rng() * 3) % 3;
        const curve = (rng() - 0.5) * 0.25;
        const b1: Pt = [cx + Math.cos(th - hw) * R * 0.97, cy + Math.sin(th - hw) * R * 0.97];
        const b2: Pt = [cx + Math.cos(th + hw) * R * 0.97, cy + Math.sin(th + hw) * R * 0.97];
        const tip: Pt = [cx + Math.cos(th + curve) * (R + len), cy + Math.sin(th + curve) * (R + len)];
        const mid: Pt = [cx + Math.cos(th + curve * 0.4) * (R + len * 0.45), cy + Math.sin(th + curve * 0.4) * (R + len * 0.45)];
        tiers[tier] += `M${r0(b1[0])} ${r0(b1[1])}Q${r0(mid[0])} ${r0(mid[1])} ${r0(tip[0])} ${r0(tip[1])}Q${r0(mid[0])} ${r0(mid[1])} ${r0(b2[0])} ${r0(b2[1])}z`;
      }
      let rm = '';
      tiers.forEach((d, i) => {
        if (d) rm += `<path d="${d}" fill-opacity="${op(corOp * [0.12, 0.2, 0.32][i])}"/>`;
      });
      if (rm) s += `<g fill="${corEl.paintValue}">${rm}</g>`;
      s += C(cx, cy, R * 1.6, `fill="${corInner}" fill-opacity="${op(corOp)}"`);
      s += C(cx, cy, R, `fill="${sunEl.paintValue}" fill-opacity="${op(sunEl.opacity)}"`);
      // 色球亮环（外半圈露出）+ 外圈柔光
      s += C(cx, cy, R * 1.012, `fill="none" stroke="${ringEl.paintValue}" stroke-opacity="${op(ringEl.opacity * 0.28)}" stroke-width="${f1(R * 0.07)}"`);
      s += C(cx, cy, R * 1.006, `fill="none" stroke="${ringEl.paintValue}" stroke-opacity="${op(ringEl.opacity)}" stroke-width="${f1(Math.max(1.2, R * 0.022))}"`);
      // 日珥：边缘几粒小火舌（底部会被月盘压住）
      let pd = '';
      const np = 3 + Math.floor(rng() * 3);
      for (let i = 0; i < np; i++) {
        const a = rng() * Math.PI * 2;
        const h = R * (0.035 + rng() * 0.045);
        const w = R * (0.03 + rng() * 0.05);
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        pd += `M${f1(x - Math.sin(a) * w)} ${f1(y + Math.cos(a) * w)}Q${f1(x + Math.cos(a) * h * 2.2)} ${f1(y + Math.sin(a) * h * 2.2)} ${f1(x + Math.sin(a) * w)} ${f1(y - Math.cos(a) * w)}z`;
      }
      s += `<path d="${pd}" fill="${flEl.paintValue}" fill-opacity="${op(flOp * 0.85)}"/>`;
      // 月盘
      const d = offset * R * 0.085;
      s += C(cx + Math.cos(beta) * d, cy + Math.sin(beta) * d, R * 1.0, `fill="${moonEl.paintValue}" fill-opacity="${op(moonEl.opacity)}"`);
      // 钻石：在日牙最宽处
      const bx = cx - Math.cos(beta) * R * 1.0;
      const by = cy - Math.sin(beta) * R * 1.0;
      const k = 0.35 + offset * 0.65;
      s += C(bx, by, R * 0.42 * k, `fill="${flGlow}" fill-opacity="${op(flOp)}"`);
      s += `<path d="${sparkle(bx, by, R * 0.75 * k, R * 0.018)}${sparkle(bx, by, R * 0.3 * k, R * 0.014).replace(/^M/, 'M')}" fill="${ringEl.paintValue}" fill-opacity="${op(ringEl.opacity * 0.9)}" transform="rotate(${r0((beta * 180) / Math.PI + 45)} ${r0(bx)} ${r0(by)})"/>`;
      s += C(bx, by, Math.max(1.5, R * 0.04 * k), `fill="${ringEl.paintValue}" fill-opacity="${op(ringEl.opacity)}"`);
      return s;
    };

    /** 偏食相：日盘 + 被月盘遮去一部分（u ∈ [-1,1]，0 = 全遮）。 */
    const partial = (cx: number, cy: number, r: number, u: number, dirA: number): string => {
      const d = u * r * 2.08;
      // 月盘只在日盘内可见（裁剪到日盘）→ 天空里不会多出一圈「黑月亮」
      const cid = `ecl${r0(cx * 10)}_${r0(cy * 10)}_${r0(r * 10)}`;
      const clip = api.clip(cid, `<circle cx="${f1(cx)}" cy="${f1(cy)}" r="${f1(r)}"/>`);
      return (
        C(cx, cy, r, `fill="${sunEl.paintValue}" fill-opacity="${op(sunEl.opacity)}"`) +
        C(cx + Math.cos(dirA) * d, cy + Math.sin(dirA) * d, r * 1.01, `fill="${moonEl.paintValue}" fill-opacity="${op(moonEl.opacity)}" clip-path="${clip}"`)
      );
    };

    // ── 星点（离日越近越少）────────────────────────────────
    const starField = (avoid: (p: Pt) => boolean, w: number, h: number, dens: number, cap: number): string => {
      const n = r0(dens * 220 * ((w * h) / (V * V)));
      const a: Array<{ p: Pt; big: boolean }> = [];
      for (let i = 0; i < n; i++) {
        const p: Pt = [rng() * w, rng() * h];
        const big = rng() < 0.18;
        if (!avoid(p)) a.push({ p, big });
      }
      const enc = (k: number) => {
        const s: Pt[] = [];
        const b: Pt[] = [];
        for (let i = 0; i < k; i++) (a[i].big ? b : s).push(a[i].p);
        return [dotPath(s.sort((x, y) => x[0] - y[0])), dotPath(b.sort((x, y) => x[0] - y[0]))];
      };
      const [ds, db] = enc(fitCount(a.length, cap, (k) => enc(k).join('').length));
      return (
        `<g fill="none" stroke="${starEl.paintValue}" stroke-linecap="round">` +
        (ds ? `<path d="${ds}" stroke-width="2" stroke-opacity="${op(starEl.opacity * 0.55)}"/>` : '') +
        (db ? `<path d="${db}" stroke-width="3.4" stroke-opacity="${op(starEl.opacity)}"/>` : '') +
        `</g>`
      );
    };

    let inner = '';
    const breathe = pulse ? api.keyframes('vw-ecl-br', 'to{opacity:.72}') : '';
    const wrapPulse = (m: string) => (breathe ? `<g style="animation:${breathe} 7s ease-in-out infinite alternate">${m}</g>` : m);

    if (mode === 'single') {
      const R = S * 0.16 * size;
      const cx = Wv * 0.5;
      const cy = Hv * (Hv > Wv ? 0.42 : 0.47);
      inner += starField((p) => Math.hypot(p[0] - cx, p[1] - cy) < R * (2.2 + rng() * 2.5), Wv, Hv, sd, STAR_CAP);
      const beta = rng() * Math.PI * 2;
      inner += wrapPulse(totality(cx, cy, R, beta, Math.round(rays * 120)));
    } else if (mode === 'sequence') {
      const x0 = Wv * 0.08;
      const x1 = Wv * 0.92;
      const r = Math.min(((x1 - x0) / (K - 1)) * 0.36, S * 0.075) * size;
      const base = Hv * (Hv > Wv ? 0.6 : 0.66);
      const lift = Hv * (Hv > Wv ? 0.18 : 0.3);
      const mid = (K - 1) / 2;
      const pos = (i: number): Pt => [x0 + ((x1 - x0) * i) / (K - 1), base - lift * Math.sin((Math.PI * i) / (K - 1))];
      const [mx, my] = pos(mid);
      inner += starField((p) => Math.hypot(p[0] - mx, p[1] - my) < r * 3, Wv, Hv, sd, STAR_CAP);
      // 轨迹：一条极淡的细弧把食相串起来
      let td = '';
      for (let s = 0; s <= 40; s++) {
        const [x, y] = pos((s / 40) * (K - 1));
        td += `${s === 0 ? 'M' : 'L'}${r0(x)} ${r0(y)}`;
      }
      inner += `<path d="${td}" fill="none" stroke="${sunEl.paintValue}" stroke-opacity="${op(sunEl.opacity * 0.18)}" stroke-width="1.2" stroke-dasharray="2 7"/>`;
      for (let i = 0; i < K; i++) {
        if (i === mid) continue;
        const [x, y] = pos(i);
        const [xa, ya] = pos(i + 0.01);
        inner += partial(x, y, r, (i - mid) / mid, Math.atan2(ya - y, xa - x) + Math.PI);
      }
      inner += wrapPulse(totality(mx, my, r * 1.35, rng() * Math.PI * 2, Math.round(rays * 70)));
    } else {
      const c = r0(S * 0.15 * size);
      const r = c * 0.3;
      const tw = K * c;
      const th = c * 2.4;
      let content = '';
      const mid = (K - 1) / 2;
      const rowY = [c * 0.62, c * 1.8];
      for (let row = 0; row < 2; row++) {
        const shift = row === 0 ? 0 : tw / 2;
        for (let j = 0; j < K; j++) {
          let x = ((j + 0.5) * c + shift) % tw;
          const y = rowY[row];
          const copies = [x];
          if (x < c) copies.push(x + tw);
          if (x > tw - c) copies.push(x - tw);
          for (x of copies) {
            if (j === mid) {
              content +=
                C(x, y, r * 1.9, `fill="${corGlow}" fill-opacity="${op(corOp)}"`) +
                C(x, y, r * 1.5, `fill="${corInner}" fill-opacity="${op(corOp)}"`) +
                C(x, y, r * 1.01, `fill="none" stroke="${ringEl.paintValue}" stroke-opacity="${op(ringEl.opacity)}" stroke-width="${f1(Math.max(1, r * 0.05))}"`) +
                C(x, y, r, `fill="${moonEl.paintValue}" fill-opacity="${op(moonEl.opacity)}"`) +
                C(x - r * 0.72, y - r * 0.72, Math.max(1.4, r * 0.08 * (0.5 + offset)), `fill="${flEl.paintValue}" fill-opacity="${op(flOp)}"`);
            } else {
              content += partial(x, y, r, (j - mid) / mid, Math.PI);
            }
          }
        }
      }
      // 平铺单元内的零星小星（随 seed）
      const sp: Pt[] = [];
      const ns = Math.max(2, r0(sd * K * 3));
      for (let i = 0; i < ns; i++) sp.push([rng() * tw, c * 1.18 + (rng() - 0.5) * c * 0.35]);
      content += `<path d="${dotPath(sp)}" fill="none" stroke="${starEl.paintValue}" stroke-opacity="${op(starEl.opacity)}" stroke-width="2.2" stroke-linecap="round"/>`;
      const fill = api.tile({ w: tw, h: th, content, key: 'ecl-tile', transform: `translate(${f1(((Wv - tw) / 2) % tw)} ${f1(((Hv - th) / 2) % th)})` });
      inner += rect(0, 0, r0(Wv) + 1, r0(Hv) + 1, { fill });
    }

    return {
      body: rect(0, 0, W, H, { fill: bgEl.paintValue, 'fill-opacity': bgEl.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
