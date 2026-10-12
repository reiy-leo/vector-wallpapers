/**
 * 行星轨道 —— H 宇宙天文 / 扁平插画。
 *
 * 构图要点：一颗扁平太阳（实心圆 + 三圈同色系光晕），外面一组同心 / 偏心的椭圆轨道，
 * 每条轨道上一颗行星：纯色圆 + 背光一侧的月牙形阴影（扁平插画式明暗），
 * 大行星可带光环（后半弧画在行星之下、前半弧画在之上 → 有穿插关系），
 * 背景散布小星点与少量四角星。
 * 三种布局：侧边（巨大太阳半露在左缘，轨道弧线扫过画面）/ 居中（倾斜的太阳系）/ 角落。
 *
 * ⭐ 体积策略：虚拟坐标短边 = 1000 + scale(q)；同色行星合并为一条 path；星点零长度子路径。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { V, circleSub, dotPath, f1, fitCount, num, op, sparkle, virt, type Pt } from './_helpers';

const STAR_CAP = 3600;

const def: PatternDef = {
  id: 'planet-orbits',
  name: '行星轨道',
  category: 'H-cosmos',
  description: '扁平插画风的太阳系：太阳与光晕、同心或偏心的椭圆轨道，行星带明暗与光环。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#101a2e' }, opacity: 1, visible: true, configurable: true },
    { id: 'stars', label: '星点', role: 'detail', paint: { type: 'solid', color: '#9fb0cf' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'orbit', label: '轨道', role: 'detail', paint: { type: 'solid', color: '#3f5175' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'sun_glow', label: '日晕', role: 'secondary', paint: { type: 'solid', color: '#d98c4e' }, opacity: 1, visible: true, configurable: true },
    { id: 'sun', label: '太阳', role: 'primary', paint: { type: 'solid', color: '#f4b860' }, opacity: 1, visible: true, configurable: true },
    { id: 'planet_a', label: '行星 · 甲', role: 'accent', paint: { type: 'solid', color: '#d9785b' }, opacity: 1, visible: true, configurable: true },
    { id: 'planet_b', label: '行星 · 乙', role: 'accent', paint: { type: 'solid', color: '#6fa6a2' }, opacity: 1, visible: true, configurable: true },
    { id: 'planet_c', label: '行星 · 丙', role: 'accent', paint: { type: 'solid', color: '#cdb68f' }, opacity: 1, visible: true, configurable: true },
    { id: 'ring', label: '光环', role: 'accent', paint: { type: 'solid', color: '#ead9b4' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'layout',
      label: '布局',
      type: 'select',
      options: [
        { value: 'side', label: '侧边' },
        { value: 'center', label: '居中' },
        { value: 'corner', label: '角落' },
      ],
      default: 'side',
    },
    { key: 'orbitCount', label: '轨道数', type: 'range', min: 3, max: 9, step: 1, default: 6 },
    { key: 'tilt', label: '轨道倾角', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.8 },
    { key: 'eccentric', label: '偏心', type: 'range', min: 0, max: 0.3, step: 0.02, default: 0.08 },
    { key: 'planetSize', label: '行星大小', type: 'range', min: 0.6, max: 1.6, step: 0.1, default: 1 },
    { key: 'starDensity', label: '星点密度', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5 },
    { key: 'rings', label: '行星光环', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'midnight',
      label: '午夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#101a2e' } },
        stars: { paint: { type: 'solid', color: '#9fb0cf' }, opacity: 0.8 },
        orbit: { paint: { type: 'solid', color: '#3f5175' }, opacity: 0.9 },
        sun_glow: { paint: { type: 'solid', color: '#d98c4e' } },
        sun: { paint: { type: 'solid', color: '#f4b860' } },
        planet_a: { paint: { type: 'solid', color: '#d9785b' } },
        planet_b: { paint: { type: 'solid', color: '#6fa6a2' } },
        planet_c: { paint: { type: 'solid', color: '#cdb68f' } },
        ring: { paint: { type: 'solid', color: '#ead9b4' } },
      },
    },
    {
      id: 'retro-cream',
      label: '复古米',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1e8d6' } },
        stars: { paint: { type: 'solid', color: '#c2ab84' }, opacity: 0.8 },
        orbit: { paint: { type: 'solid', color: '#c9b593' }, opacity: 1 },
        sun_glow: { paint: { type: 'solid', color: '#f0bf8f' } },
        sun: { paint: { type: 'solid', color: '#e07f3c' } },
        planet_a: { paint: { type: 'solid', color: '#3f6b73' } },
        planet_b: { paint: { type: 'solid', color: '#c4563d' } },
        planet_c: { paint: { type: 'solid', color: '#e2b04f' } },
        ring: { paint: { type: 'solid', color: '#2f3d45' } },
      },
      params: { layout: 'center', tilt: 0.45 },
    },
    {
      id: 'dusk-violet',
      label: '暮紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c152e' } },
        stars: { paint: { type: 'solid', color: '#b3a6d4' }, opacity: 0.75 },
        orbit: { paint: { type: 'solid', color: '#4a3d68' }, opacity: 0.9 },
        sun_glow: { paint: { type: 'solid', color: '#a55d72' } },
        sun: { paint: { type: 'solid', color: '#ff9f72' } },
        planet_a: { paint: { type: 'solid', color: '#6e8fd2' } },
        planet_b: { paint: { type: 'solid', color: '#e3a5bf' } },
        planet_c: { paint: { type: 'solid', color: '#f1d28c' } },
        ring: { paint: { type: 'solid', color: '#f3e6cb' } },
      },
      params: { layout: 'corner', eccentric: 0.14 },
    },
    {
      id: 'deep-sea',
      label: '深海',
      elements: {
        bg: { paint: { type: 'solid', color: '#0c2226' } },
        stars: { paint: { type: 'solid', color: '#8fbfb8' }, opacity: 0.7 },
        orbit: { paint: { type: 'solid', color: '#2c4e52' }, opacity: 1 },
        sun_glow: { paint: { type: 'solid', color: '#3f8a7f' } },
        sun: { paint: { type: 'solid', color: '#e9e2c4' } },
        planet_a: { paint: { type: 'solid', color: '#e48a64' } },
        planet_b: { paint: { type: 'solid', color: '#7fc2b1' } },
        planet_c: { paint: { type: 'solid', color: '#d7c8a0' } },
        ring: { paint: { type: 'solid', color: '#f2ead2' } },
      },
      params: { orbitCount: 8, tilt: 1 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['sun'],
    secondary: ['sun_glow'],
    accent: ['planet_a', 'planet_b', 'planet_c', 'ring'],
    detail: ['orbit', 'stars'],
  },

  render(_def, cfg: ResolvedConfig, _api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const { q, Wv, Hv } = virt(W, H);
    const E = (id: string) => elements.get(id)!;
    const k = Math.round(num(params, 'orbitCount', 3, 9));
    const tilt = num(params, 'tilt', 0.3, 1);
    const ecc = num(params, 'eccentric', 0, 0.3);
    const ps = num(params, 'planetSize', 0.6, 1.6);
    const sd = num(params, 'starDensity', 0.1, 1);
    const rings = params.rings === true;
    const layout = params.layout === 'center' || params.layout === 'corner' ? params.layout : 'side';
    const r0 = Math.round;
    const portrait = Hv > Wv;

    // ── 太阳与系统几何 ─────────────────────────────────────
    let sx: number;
    let sy: number;
    let rs: number;
    let rot: number;
    if (layout === 'center') {
      sx = Wv * 0.5;
      sy = Hv * 0.5;
      rs = V * 0.085;
      rot = -14;
    } else if (layout === 'corner') {
      sx = Wv * 0.1;
      sy = Hv * 0.9;
      rs = V * 0.15;
      rot = -24;
    } else if (portrait) {
      sx = Wv * 0.5;
      sy = -Hv * 0.06;
      rs = Wv * 0.4;
      rot = 0;
    } else {
      sx = -Hv * 0.12;
      sy = Hv * 0.5;
      rs = Hv * 0.4;
      rot = 0;
    }
    const cr = Math.cos((rot * Math.PI) / 180);
    const sr = Math.sin((rot * Math.PI) / 180);
    // 最远可见点（考虑倾斜压扁后的纵向需要更大半径）
    let far = 0;
    for (const [x, y] of [
      [0, 0],
      [Wv, 0],
      [0, Hv],
      [Wv, Hv],
    ]) {
      const dx = x - sx;
      const dy = y - sy;
      const lx = dx * cr + dy * sr;
      const ly = -dx * sr + dy * cr;
      far = Math.max(far, Math.hypot(lx, ly / tilt));
    }
    far = Math.min(far, layout === 'center' ? Math.max(Wv, Hv) * 0.75 : far) * 0.94;
    const rIn = rs * 1.55;

    // ── 星点 ────────────────────────────────────────────
    const starsEl = E('stars');
    const nStar = r0(sd * 260 * ((Wv * Hv) / (V * V)));
    const sp: Array<{ p: Pt; big: boolean }> = [];
    for (let i = 0; i < nStar; i++) sp.push({ p: [rng() * Wv, rng() * Hv], big: rng() < 0.2 });
    const sparkles: Pt[] = [];
    for (let i = 0; i < 7; i++) sparkles.push([rng() * Wv, rng() * Hv]);
    const enc = (n: number) => {
      const a: Pt[] = [];
      const b: Pt[] = [];
      for (let i = 0; i < n; i++) (sp[i].big ? b : a).push(sp[i].p);
      return [dotPath(a.sort((x, y) => x[0] - y[0])), dotPath(b.sort((x, y) => x[0] - y[0]))];
    };
    const nFit = fitCount(nStar, STAR_CAP, (n) => enc(n).join('').length);
    const [dSmall, dBig] = enc(nFit);
    let inner = '';
    const so = starsEl.opacity;
    inner +=
      `<g fill="none" stroke="${starsEl.paintValue}" stroke-linecap="round">` +
      (dSmall ? `<path d="${dSmall}" stroke-width="2.2" stroke-opacity="${op(so * 0.6)}"/>` : '') +
      (dBig ? `<path d="${dBig}" stroke-width="3.8" stroke-opacity="${op(so)}"/>` : '') +
      `</g>` +
      `<path d="${sparkles.map(([x, y], i) => sparkle(x, y, 7 + (i % 3) * 3, 1.4)).join('')}" fill="${starsEl.paintValue}" fill-opacity="${op(so)}"/>`;

    // ── 轨道 + 行星位置 ───────────────────────────────────
    interface Planet {
      x: number;
      y: number;
      r: number;
      c: number;
      shadowA: number;
    }
    const planets: Planet[] = [];
    let orbitD = '';
    const eDir = rng() * Math.PI * 2;
    const colorOffset = Math.floor(rng() * 3);
    const span = far - rIn;
    for (let i = 0; i < k; i++) {
      // 间距外疏内密
      const t = (i + 0.5) / k;
      const R = rIn + span * Math.pow(t, 1.18);
      const off = ecc * R * 0.5 * (i / Math.max(1, k - 1));
      const ocx = off * Math.cos(eDir);
      const ocy = off * Math.sin(eDir) * tilt;
      const rx = R;
      const ry = R * tilt;
      // 椭圆本地坐标 → 世界：先平移(本地偏心)，再旋转 rot，再平移到太阳
      const toW = (lx: number, ly: number): Pt => [sx + lx * cr - ly * sr, sy + lx * sr + ly * cr];
      // 轨道折线（48 段，避免 rotate transform 让体积随轨道数增加 attr）
      const segs = 72;
      let d = '';
      let px = 0;
      let py = 0;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const [X, Y] = toW(ocx + rx * Math.cos(a), ocy + ry * Math.sin(a));
        const x = r0(X);
        const y = r0(Y);
        d += s === 0 ? `M${x} ${y}` : `l${x - px} ${y - py}`;
        px = x;
        py = y;
      }
      orbitD += `${d}z`;
      // 行星：抽角度，尽量落在画面内且离边一些
      const pr = (11 + (i / Math.max(1, k - 1)) * 24 + rng() * 12) * ps * (layout === 'center' ? 0.9 : 1.1);
      let best: Pt = toW(ocx + rx, ocy);
      let bestScore = -Infinity;
      for (let tries = 0; tries < 18; tries++) {
        const a = rng() * Math.PI * 2;
        const p = toW(ocx + rx * Math.cos(a), ocy + ry * Math.sin(a));
        const m = Math.min(p[0], Wv - p[0], p[1], Hv - p[1]);
        let sep = Infinity;
        for (const o of planets) sep = Math.min(sep, Math.hypot(o.x - p[0], o.y - p[1]) - o.r - pr);
        const score = Math.min(m - pr * 1.5, sep * 0.8);
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      planets.push({
        x: best[0],
        y: best[1],
        r: pr,
        c: (i + colorOffset) % 3,
        shadowA: Math.atan2(best[1] - sy, best[0] - sx),
      });
    }
    const orbit = E('orbit');
    inner += `<path d="${orbitD.replace(/ -/g, '-')}" fill="none" stroke="${orbit.paintValue}" stroke-opacity="${op(orbit.opacity)}" stroke-width="1.6"/>`;

    // ── 太阳 + 光晕 ─────────────────────────────────────
    const glow = E('sun_glow');
    const sun = E('sun');
    [2.15, 1.7, 1.3].forEach((m, i) => {
      inner += `<circle cx="${r0(sx)}" cy="${r0(sy)}" r="${r0(rs * m)}" fill="${glow.paintValue}" fill-opacity="${op(glow.opacity * [0.07, 0.13, 0.26][i])}"/>`;
    });
    inner += `<circle cx="${r0(sx)}" cy="${r0(sy)}" r="${r0(rs)}" fill="${sun.paintValue}" fill-opacity="${op(sun.opacity)}"/>`;

    // ── 行星 ─────────────────────────────────────────────
    const ringEl = E('ring');
    const ringed = new Set<number>();
    if (rings) {
      const order = planets.map((p, i) => [p.r, i] as const).sort((a, b) => b[0] - a[0]);
      ringed.add(order[0][1]);
      if (order.length > 4 && rng() < 0.6) ringed.add(order[2][1]);
    }
    const ringTilt = -22;
    const ringArc = (p: Planet, front: boolean, w: number): string => {
      const a = (ringTilt * Math.PI) / 180;
      const rx = p.r * 2.05;
      const ry = p.r * 0.55;
      const s1: Pt = [p.x - rx * Math.cos(a), p.y - rx * Math.sin(a)];
      const s2: Pt = [p.x + rx * Math.cos(a), p.y + rx * Math.sin(a)];
      // 后弧：上半（sweep 1 从左到右经上方）；前弧：下半
      return `<path d="M${f1(s1[0])} ${f1(s1[1])}A${f1(rx)} ${f1(ry)} ${ringTilt} 0 ${front ? 0 : 1} ${f1(s2[0])} ${f1(s2[1])}" fill="none" stroke="${ringEl.paintValue}" stroke-opacity="${op(ringEl.opacity)}" stroke-width="${f1(w)}" stroke-linecap="round"/>`;
    };
    const pEls = [E('planet_a'), E('planet_b'), E('planet_c')];
    let backRings = '';
    let frontRings = '';
    ringed.forEach((i) => {
      backRings += ringArc(planets[i], false, planets[i].r * 0.16);
      frontRings += ringArc(planets[i], true, planets[i].r * 0.16);
    });
    inner += backRings;
    const bodyD = ['', '', ''];
    let shadowD = '';
    let moonD = '';
    planets.forEach((p, i) => {
      bodyD[p.c] += circleSub(p.x, p.y, p.r);
      // 背光月牙：本地 +x 指向远离太阳一侧；外缘半圆 + 内缘半椭圆
      const c = Math.cos(p.shadowA);
      const s = Math.sin(p.shadowA);
      const top: Pt = [p.x + p.r * s, p.y - p.r * c];
      const bot: Pt = [p.x - p.r * s, p.y + p.r * c];
      const R = f1(p.r);
      shadowD += `M${f1(top[0])} ${f1(top[1])}A${R} ${R} 0 0 1 ${f1(bot[0])} ${f1(bot[1])}A${f1(p.r * 0.42)} ${R} ${f1((p.shadowA * 180) / Math.PI)} 0 0 ${f1(top[0])} ${f1(top[1])}z`;
      // 小卫星：第 2、5 颗行星带一颗
      if (i % 3 === 1 && !ringed.has(i)) {
        const ma = p.shadowA - 2.2;
        moonD += circleSub(p.x + Math.cos(ma) * p.r * 1.9, p.y + Math.sin(ma) * p.r * 1.9, Math.max(2.5, p.r * 0.22));
      }
    });
    pEls.forEach((pe, ci) => {
      if (bodyD[ci] !== '') inner += `<path d="${bodyD[ci]}" fill="${pe.paintValue}" fill-opacity="${op(pe.opacity)}"/>`;
    });
    inner += `<path d="${shadowD}" fill="#000000" fill-opacity="0.24"/>`;
    if (moonD !== '') inner += `<path d="${moonD}" fill="${pEls[2].paintValue}" fill-opacity="${op(pEls[2].opacity * 0.9)}"/>`;
    inner += frontRings;

    const bg = E('bg');
    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
