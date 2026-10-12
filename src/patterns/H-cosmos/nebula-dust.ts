/**
 * 星云星尘 —— H 宇宙天文。
 *
 * 构图要点：一团沿「脊线」舒展的星云 —— 外层大而淡的色团（主色）、中层（次色）、
 * 靠近脊线的小而亮的热核（点缀色），层层柔边叠出体积感；
 * 几条细长的暗尘带斜压在星云上，打破均匀；星尘粒子沿星云密集、向外稀疏，
 * 另有少量亮星带十字星芒。三种形态：斜贯光带 / 中央团簇 / 角落弧。
 * 与 starry-night-sky 的区别：没有银河带与山景，主角是彩色柔光云团 + 颗粒。
 *
 * ⭐ 「渐变做层不做面」：所有元件均为纯色；柔边来自每种元件色各一个径向渐变
 * （色标透明度 1 → 0），所有色团共用，渐变数量与色团数量无关。
 * 体积：虚拟坐标短边 = 1000 + scale(q)；星尘为零长度子路径，按字节上限截断。
 * 动画（仅预览）：星尘分组闪烁 + 色团整体缓慢呼吸。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { V, dotPath, f1, fitCount, gauss, hexOf, num, op, sparkle, virt, type Pt } from './_helpers';

const DUST_CAP = 7200;

const def: PatternDef = {
  id: 'nebula-dust',
  name: '星云星尘',
  category: 'H-cosmos',
  tones: ['dark'],
  description: '柔和渐变的彩色星云团沿一条脊线舒展，暗尘带穿插其间，星尘粒子沿云团聚散。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '深空', role: 'bg', paint: { type: 'solid', color: '#0a0a1a' }, opacity: 1, visible: true, configurable: true },
    { id: 'cloud_outer', label: '星云 · 外层', role: 'primary', paint: { type: 'solid', color: '#5b3a96' }, opacity: 1, visible: true, configurable: true },
    { id: 'cloud_mid', label: '星云 · 中层', role: 'secondary', paint: { type: 'solid', color: '#c4507e' }, opacity: 1, visible: true, configurable: true },
    { id: 'cloud_core', label: '星云 · 热核', role: 'accent', paint: { type: 'solid', color: '#f3b9a0' }, opacity: 1, visible: true, configurable: true },
    { id: 'dust_lane', label: '暗尘带', role: 'detail', paint: { type: 'solid', color: '#06060f' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'stardust', label: '星尘', role: 'detail', paint: { type: 'solid', color: '#d3cbef' }, opacity: 1, visible: true, configurable: true },
    { id: 'stars', label: '亮星', role: 'accent', paint: { type: 'solid', color: '#ffffff' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'form',
      label: '形态',
      type: 'select',
      options: [
        { value: 'drift', label: '斜贯光带' },
        { value: 'bloom', label: '中央团簇' },
        { value: 'arc', label: '角落弧' },
      ],
      default: 'drift',
    },
    { key: 'angle', label: '走向', type: 'range', min: -60, max: 60, step: 1, default: -24, unit: '°' },
    { key: 'spread', label: '云团宽度', type: 'range', min: 0.5, max: 1.6, step: 0.05, default: 1 },
    { key: 'glow', label: '星云亮度', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.7 },
    { key: 'dustLanes', label: '暗尘带', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'stardust', label: '星尘密度', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.55, heavy: true },
    { key: 'twinkle', label: '星尘闪烁', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'orion',
      label: '猎户',
      elements: {
        bg: { paint: { type: 'solid', color: '#0a0a1a' } },
        cloud_outer: { paint: { type: 'solid', color: '#5b3a96' } },
        cloud_mid: { paint: { type: 'solid', color: '#c4507e' } },
        cloud_core: { paint: { type: 'solid', color: '#f3b9a0' } },
        dust_lane: { paint: { type: 'solid', color: '#06060f' }, opacity: 0.75 },
        stardust: { paint: { type: 'solid', color: '#d3cbef' } },
        stars: { paint: { type: 'solid', color: '#ffffff' } },
      },
    },
    {
      id: 'teal-veil',
      label: '青纱',
      elements: {
        bg: { paint: { type: 'solid', color: '#06141a' } },
        cloud_outer: { paint: { type: 'solid', color: '#1d6670' } },
        cloud_mid: { paint: { type: 'solid', color: '#46aa9f' } },
        cloud_core: { paint: { type: 'solid', color: '#e4d8a6' } },
        dust_lane: { paint: { type: 'solid', color: '#020a0d' }, opacity: 0.7 },
        stardust: { paint: { type: 'solid', color: '#bfe3dc' } },
        stars: { paint: { type: 'solid', color: '#f3fffb' } },
      },
      params: { form: 'arc', spread: 1.2 },
    },
    {
      id: 'ember',
      label: '余烬',
      elements: {
        bg: { paint: { type: 'solid', color: '#120a0b' } },
        cloud_outer: { paint: { type: 'solid', color: '#7f2b2a' } },
        cloud_mid: { paint: { type: 'solid', color: '#d27238' } },
        cloud_core: { paint: { type: 'solid', color: '#f6d48f' } },
        dust_lane: { paint: { type: 'solid', color: '#070304' }, opacity: 0.8 },
        stardust: { paint: { type: 'solid', color: '#f1d0b2' } },
        stars: { paint: { type: 'solid', color: '#fff6ea' } },
      },
      params: { form: 'bloom', angle: 30, dustLanes: 0.7 },
    },
    {
      id: 'iris',
      label: '鸢尾',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b0d20' } },
        cloud_outer: { paint: { type: 'solid', color: '#2c4192' } },
        cloud_mid: { paint: { type: 'solid', color: '#8a5dc6' } },
        cloud_core: { paint: { type: 'solid', color: '#e6b3da' } },
        dust_lane: { paint: { type: 'solid', color: '#05061a' }, opacity: 0.7 },
        stardust: { paint: { type: 'solid', color: '#c7d2f5' } },
        stars: { paint: { type: 'solid', color: '#ffffff' } },
      },
      params: { angle: 18, glow: 0.8 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['cloud_outer'],
    secondary: ['cloud_mid'],
    accent: ['cloud_core', 'stars'],
    detail: ['dust_lane', 'stardust'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const { q, Wv, Hv } = virt(W, H);
    const E = (id: string) => elements.get(id)!;
    const form = params.form === 'bloom' || params.form === 'arc' ? params.form : 'drift';
    // 走向相对长边：竖屏时整体转 90°，星云仍沿长边舒展
    const ang = (num(params, 'angle', -60, 60) * Math.PI) / 180 + (Hv > Wv && params.form !== 'arc' ? Math.PI / 2 : 0);
    const spread = num(params, 'spread', 0.5, 1.6);
    const glow = num(params, 'glow', 0.3, 1);
    const lanes = num(params, 'dustLanes', 0, 1);
    const dust = num(params, 'stardust', 0.1, 1);
    const twinkle = animate && params.twinkle === true;
    const r0 = Math.round;
    const S = Math.min(Wv, Hv);

    // ── 脊线 P(t) 与法向 N(t)；带低频摆动 ─────────────────────
    const ph1 = rng() * 6.28;
    const ph2 = rng() * 6.28;
    const wob = (t: number) => Math.sin(t * 5.2 + ph1) * 0.07 + Math.sin(t * 9.7 + ph2) * 0.035;
    const cx = Wv * (0.45 + rng() * 0.1);
    const cy = Hv * (0.45 + rng() * 0.1);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    let spine: (t: number) => { p: Pt; a: number; w: number };
    if (form === 'bloom') {
      // 中央团簇：沿走向拉长的短脊线，宽度中间最大
      const L = Math.max(Wv, Hv) * 0.42;
      spine = (t) => {
        const u = t - 0.5;
        const off = wob(t) * S;
        return { p: [cx + ca * u * L * 2 - sa * off, cy + sa * u * L * 2 + ca * off], a: ang, w: S * 0.2 * (1.2 - Math.abs(u) * 1.3) };
      };
    } else if (form === 'arc') {
      // 角落弧：圆心在画面左下外侧，弧线扫过画面
      const ox = -Wv * 0.15;
      const oy = Hv * 1.15;
      const R = Math.hypot(Wv, Hv) * 0.7;
      const a0 = -Math.PI / 2 - 0.15 + ang * 0.6;
      const a1 = 0.15 + ang * 0.6;
      spine = (t) => {
        const a = a0 + (a1 - a0) * t;
        const rr = R * (1 + wob(t));
        return { p: [ox + Math.cos(a) * rr, oy + Math.sin(a) * rr], a: a + Math.PI / 2, w: S * 0.13 * (0.7 + Math.sin(t * Math.PI) * 0.6) };
      };
    } else {
      const L = Math.hypot(Wv, Hv) * 1.05;
      spine = (t) => {
        const u = t - 0.5;
        const off = wob(t) * S * 1.6;
        return { p: [cx + ca * u * L - sa * off, cy + sa * u * L + ca * off], a: ang + wob(t) * 1.5, w: S * 0.12 * (0.75 + Math.sin(t * Math.PI) * 0.55) };
      };
    }

    // ── 渐变（每种元件色一个，色标透明度羽化）────────────────
    const soft = (key: string, hex: string, mid: number) =>
      api.radial({
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        key,
        stops: [
          { offset: 0, color: hex, opacity: 1 },
          { offset: 0.45, color: hex, opacity: mid },
          { offset: 1, color: hex, opacity: 0 },
        ],
      });

    let inner = '';
    const layer = (el: string, n: number, sizeLo: number, sizeHi: number, aLo: number, aHi: number, spreadK: number, mid: number) => {
      const e = E(el);
      const fill = e.visible ? soft(`neb-${el}`, hexOf(e), mid) : 'none';
      let m = '';
      for (let i = 0; i < n; i++) {
        const t = rng();
        const s = spine(t);
        const g1 = gauss(rng);
        const g2 = gauss(rng);
        const off = g1 * s.w * spread * spreadK;
        const x = s.p[0] - Math.sin(s.a) * off + Math.cos(s.a) * g2 * s.w * 0.4;
        const y = s.p[1] + Math.cos(s.a) * off + Math.sin(s.a) * g2 * s.w * 0.4;
        const rx = S * (sizeLo + rng() * (sizeHi - sizeLo)) * (0.7 + spread * 0.3);
        const ry = rx * (0.4 + rng() * 0.45);
        const rot = (s.a * 180) / Math.PI + (rng() - 0.5) * 50;
        const o = (aLo + rng() * (aHi - aLo)) * glow * e.opacity;
        m += `<ellipse rx="${r0(rx)}" ry="${r0(ry)}" fill-opacity="${op(o)}" transform="translate(${r0(x)} ${r0(y)})rotate(${r0(rot)})"/>`;
      }
      return `<g fill="${fill}">${m}</g>`;
    };

    // 整体底雾：一团极淡的外层色，让星云不至于「贴」在黑底上
    const outerEl = E('cloud_outer');
    const c0 = spine(0.5);
    if (outerEl.visible) inner += `<ellipse rx="${r0(S * 0.95 * spread)}" ry="${r0(S * 0.55 * spread)}" fill="${soft('neb-haze', hexOf(outerEl), 0.4)}" fill-opacity="${op(0.35 * glow * outerEl.opacity)}" transform="translate(${r0(c0.p[0])} ${r0(c0.p[1])})rotate(${r0((c0.a * 180) / Math.PI)})"/>`;

    let clouds = layer('cloud_outer', 22, 0.22, 0.42, 0.35, 0.6, 1.0, 0.45);
    clouds += layer('cloud_mid', 18, 0.12, 0.26, 0.35, 0.65, 0.7, 0.4);

    // 暗尘带：细长、沿脊线方向、略偏离中心
    const laneEl = E('dust_lane');
    const nLane = Math.round(lanes * 9);
    if (nLane > 0) {
      const lf = laneEl.visible ? soft('neb-lane', hexOf(laneEl), 0.4) : 'none';
      let lm = '';
      for (let i = 0; i < nLane; i++) {
        const t = 0.15 + rng() * 0.7;
        const s = spine(t);
        const off = gauss(rng) * s.w * 0.45 * spread;
        const x = s.p[0] - Math.sin(s.a) * off;
        const y = s.p[1] + Math.cos(s.a) * off;
        const rx = S * (0.18 + rng() * 0.22);
        const ry = rx * (0.12 + rng() * 0.14);
        const rot = (s.a * 180) / Math.PI + (rng() - 0.5) * 24;
        lm += `<ellipse rx="${r0(rx)}" ry="${r0(ry)}" fill-opacity="${op((0.45 + rng() * 0.35) * laneEl.opacity)}" transform="translate(${r0(x)} ${r0(y)})rotate(${r0(rot)})"/>`;
      }
      clouds += `<g fill="${lf}">${lm}</g>`;
    }
    clouds += layer('cloud_core', 16, 0.05, 0.13, 0.3, 0.6, 0.4, 0.18);
    const breathe = animate && params.twinkle === true ? api.keyframes('vw-neb-br', 'to{opacity:.78}') : '';
    inner += breathe ? `<g style="animation:${breathe} 9s ease-in-out infinite alternate">${clouds}</g>` : clouds;

    // ── 星尘（每颗固定 5 个随机数：t、两个高斯、档位、分组）────────
    const dustEl = E('stardust');
    const nDust = r0(dust * 1300 * ((Wv * Hv) / (V * V)));
    const pts: Array<{ p: Pt; t: number; g: number }> = [];
    for (let i = 0; i < nDust; i++) {
      const t = rng();
      const s = spine(t);
      const g1 = gauss(rng);
      const g2 = gauss(rng);
      const uni = rng();
      let p: Pt;
      if (uni < 0.3) {
        // 30% 均匀散布（复用随机数映射到全屏）
        p = [((t * 7919 + uni * 3.3) % 1) * Wv, (Math.abs(g1 * 0.37 + g2 * 0.61) % 1) * Hv];
      } else {
        const off = g1 * s.w * spread * 1.15;
        p = [s.p[0] - Math.sin(s.a) * off + Math.cos(s.a) * g2 * s.w * 0.5, s.p[1] + Math.cos(s.a) * off + Math.sin(s.a) * g2 * s.w * 0.5];
      }
      const u = rng();
      pts.push({ p, t: u < 0.7 ? 0 : u < 0.94 ? 1 : 2, g: Math.floor(u * 1000) % 3 });
    }
    const vis = pts.filter((s) => s.p[0] > -4 && s.p[0] < Wv + 4 && s.p[1] > -4 && s.p[1] < Hv + 4);
    const build = (k: number) => {
      const out = [0, 1, 2].map(() => [0, 1, 2].map(() => [] as Pt[]));
      for (let i = 0; i < k; i++) out[vis[i].t][vis[i].g].push(vis[i].p);
      return out.map((r) => r.map((a) => dotPath(a.sort((x, y) => x[0] - y[0]))));
    };
    const kFit = fitCount(vis.length, DUST_CAP, (k) => build(k).flat().reduce((a, d) => a + d.length + 12, 0));
    const dd = build(kFit);
    const TW = [
      { w: 1.6, o: 0.45 },
      { w: 2.5, o: 0.7 },
      { w: 3.6, o: 0.95 },
    ];
    const PER = [2.9, 4.1, 5.3];
    const tw = twinkle ? api.keyframes('vw-neb-tw', 'to{opacity:.2}') : '';
    let dm = '';
    TW.forEach((T, ti) => {
      let tm = '';
      dd[ti].forEach((d, gi) => {
        if (!d) return;
        const p = `<path d="${d}"/>`;
        tm += twinkle ? `<g style="animation:${tw} ${PER[gi]}s ease-in-out -${f1(PER[gi] * 0.43 * (gi + 1))}s infinite alternate">${p}</g>` : p;
      });
      if (tm) dm += `<g stroke-width="${T.w}" stroke-opacity="${op(dustEl.opacity * T.o)}">${tm}</g>`;
    });
    if (dm) inner += `<g fill="none" stroke="${dustEl.paintValue}" stroke-linecap="round">${dm}</g>`;

    // ── 亮星：十字星芒 + 柔光 ───────────────────────────
    const starEl = E('stars');
    const nStar = 6 + Math.floor(rng() * 5);
    let sp = '';
    let core = '';
    let halo = '';
    for (let i = 0; i < nStar; i++) {
      const near = i < nStar * 0.6;
      const s = spine(rng());
      const x = near ? s.p[0] + gauss(rng) * s.w : rng() * Wv;
      const y = near ? s.p[1] + gauss(rng) * s.w : rng() * Hv;
      const L = 9 + rng() * 16;
      sp += sparkle(x, y, L, L * 0.09);
      core += `M${r0(x)} ${r0(y)}h0`;
      halo += `<circle cx="${r0(x)}" cy="${r0(y)}" r="${r0(L * 0.7)}"/>`;
    }
    const sg = starEl.visible ? soft('neb-star', hexOf(starEl), 0.25) : 'none';
    inner +=
      `<path d="${sp}" fill="${starEl.paintValue}" fill-opacity="${op(starEl.opacity * 0.85)}"/>` +
      `<g fill="${sg}" fill-opacity="${op(starEl.opacity * 0.5)}">${halo}</g>` +
      `<path d="${core}" fill="none" stroke="${starEl.paintValue}" stroke-width="4" stroke-linecap="round" stroke-opacity="${op(starEl.opacity)}"/>`;

    const bg = E('bg');
    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
