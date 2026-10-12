/**
 * 星空银河 —— E 风景 / 单幅构图。
 *
 * 构图要点：深蓝夜空，斜贯画面的银河光带（宽柔光带 + 沿带散布的星云团 + 暗尘带 + 带内密集微星），
 * 大小不一的星星（远小暗密 → 少量亮星带光晕与十字星芒），地平线上三层山峦剪影（远浅近深），
 * 山后一抹地平辉光。
 *
 * ⭐ 体积/节点策略：
 *   - 虚拟坐标「短边 = 1000」，整体 `scale(q)` 放大，路径整数相对坐标。
 *   - 渐变只做「层」（光带 / 星云 / 辉光），全部元件本身是纯色；渐变色标取自元件色。
 *   - 星点：零长度子路径 + 圆头描边，每个「尺寸档 × 闪烁子组」一条 path（≈ 9B/颗），
 *     STAR_CAP 截断；山脊按字节降采样。
 * 动画（仅预览）：
 *   - 星星闪烁（cfg.animate && twinkle）：三个子组 opacity 往返，周期 / 相位错开；亮星光晕呼吸。
 *   - 流星（cfg.animate && meteor）：3 颗流星沿银河方向附近划过，长周期中只亮一瞬。
 */
import { g, path, rect } from '../../engine/svg';
import { encDots, encLine, f1, mix, noise1D, num, peakRange, virt } from './_scene';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;
/** 星点 path 数据字节上限。 */
const STAR_CAP = 7400;
/** 三层山脊 path 数据字节上限。 */
const RIDGE_CAP = 4200;

const def: PatternDef = {
  id: 'starry-night-sky',
  name: '星空银河',
  category: 'E-scene',
  description: '深蓝夜空中斜贯的银河光带，大小不一的星星，地平线上层叠的山峦剪影。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '夜空', role: 'bg', paint: { type: 'solid', color: '#0c1530' }, opacity: 1, visible: true, configurable: true },
    { id: 'sky_glow', label: '地平辉光', role: 'detail', paint: { type: 'solid', color: '#2b4373' }, opacity: 1, visible: true, configurable: true },
    { id: 'milky_way', label: '银河', role: 'secondary', paint: { type: 'solid', color: '#b7c5ea' }, opacity: 1, visible: true, configurable: true },
    { id: 'milky_core', label: '银河核心', role: 'accent', paint: { type: 'solid', color: '#f1dcc4' }, opacity: 1, visible: true, configurable: true },
    { id: 'stars', label: '星星', role: 'accent', paint: { type: 'solid', color: '#ffffff' }, opacity: 1, visible: true, configurable: true },
    { id: 'mountain_far', label: '山峦 · 远', role: 'secondary', paint: { type: 'solid', color: '#1e2c52' }, opacity: 1, visible: true, configurable: true },
    { id: 'mountain_near', label: '山峦 · 近', role: 'primary', paint: { type: 'solid', color: '#060a17' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'starDensity', label: '星星密度', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.55, heavy: true },
    { key: 'starSize', label: '星星大小', type: 'range', min: 0.6, max: 1.6, step: 0.1, default: 1 },
    { key: 'milkyAngle', label: '银河角度', type: 'range', min: -70, max: 70, step: 1, default: -32, unit: '°' },
    { key: 'milkyGlow', label: '银河亮度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'mountainHeight', label: '山峦高度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, heavy: true },
    { key: 'twinkle', label: '星星闪烁', type: 'toggle', default: false, group: '动画' },
    { key: 'meteor', label: '流星', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'midnight-blue',
      label: '午夜蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#0c1530' } },
        sky_glow: { paint: { type: 'solid', color: '#2b4373' } },
        milky_way: { paint: { type: 'solid', color: '#b7c5ea' } },
        milky_core: { paint: { type: 'solid', color: '#f1dcc4' } },
        stars: { paint: { type: 'solid', color: '#ffffff' } },
        mountain_far: { paint: { type: 'solid', color: '#1e2c52' } },
        mountain_near: { paint: { type: 'solid', color: '#060a17' } },
      },
    },
    {
      id: 'violet-night',
      label: '紫夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#171231' } },
        sky_glow: { paint: { type: 'solid', color: '#4f3466' } },
        milky_way: { paint: { type: 'solid', color: '#d5c5ea' } },
        milky_core: { paint: { type: 'solid', color: '#f3d2c6' } },
        stars: { paint: { type: 'solid', color: '#fff6f2' } },
        mountain_far: { paint: { type: 'solid', color: '#2b2149' } },
        mountain_near: { paint: { type: 'solid', color: '#0c0817' } },
      },
    },
    {
      id: 'polar-teal',
      label: '极地青',
      elements: {
        bg: { paint: { type: 'solid', color: '#0a1d24' } },
        sky_glow: { paint: { type: 'solid', color: '#1f5052' } },
        milky_way: { paint: { type: 'solid', color: '#bfe3dc' } },
        milky_core: { paint: { type: 'solid', color: '#e6efcf' } },
        stars: { paint: { type: 'solid', color: '#f2fffb' } },
        mountain_far: { paint: { type: 'solid', color: '#15343a' } },
        mountain_near: { paint: { type: 'solid', color: '#041014' } },
      },
      params: { milkyAngle: -48 },
    },
    {
      id: 'ink',
      label: '墨夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#111318' } },
        sky_glow: { paint: { type: 'solid', color: '#2a2e38' } },
        milky_way: { paint: { type: 'solid', color: '#c9ccd4' } },
        milky_core: { paint: { type: 'solid', color: '#e3dccd' } },
        stars: { paint: { type: 'solid', color: '#ffffff' } },
        mountain_far: { paint: { type: 'solid', color: '#20232b' } },
        mountain_near: { paint: { type: 'solid', color: '#07080b' } },
      },
      params: { milkyGlow: 0.5 },
    },
    {
      id: 'before-dawn',
      label: '黎明前',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f2b52' } },
        sky_glow: { paint: { type: 'solid', color: '#a86f78' } },
        milky_way: { paint: { type: 'solid', color: '#cdd5ee' } },
        milky_core: { paint: { type: 'solid', color: '#f5dfc8' } },
        stars: { paint: { type: 'solid', color: '#ffffff' } },
        mountain_far: { paint: { type: 'solid', color: '#3a3a62' } },
        mountain_near: { paint: { type: 'solid', color: '#141327' } },
      },
      params: { milkyGlow: 0.4, starDensity: 0.4, milkyAngle: -22 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['mountain_near'],
    secondary: ['milky_way', 'mountain_far'],
    accent: ['stars', 'milky_core'],
    detail: ['sky_glow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const density = num(params, 'starDensity', 0, 1);
    const starSize = num(params, 'starSize', 0.3, 3);
    const angle = num(params, 'milkyAngle', -90, 90);
    const glow = num(params, 'milkyGlow', 0, 1);
    const mh = num(params, 'mountainHeight', 0, 1);
    const twinkle = cfg.animate && params.twinkle === true;
    const meteor = cfg.animate && params.meteor === true;

    const { Wv, Hv, tf } = virt(W, H, V);
    const area = (Wv * Hv) / (V * V);
    const bg = elements.get('bg')!;
    const out: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const inner: string[] = [];

    // ── 随机布局（固定消耗顺序）────────────────────────────────
    const horizon = Hv * (0.9 - mh * 0.05);
    const cx = Wv * (0.42 + rng() * 0.16);
    const cy = Hv * (0.38 + rng() * 0.1);
    const diag = Math.hypot(Wv, Hv);
    const L = diag * 1.3;
    const bw = V * (0.46 + 0.08 * rng());

    // 地平辉光
    const sg = elements.get('sky_glow')!;
    if (sg.visible) {
      const fill =
        sg.paintValue.startsWith('#')
          ? api.linear({
              key: 'sns-glow',
              angle: 90,
              stops: [
                { offset: 0, color: sg.paintValue, opacity: 0 },
                { offset: 0.55, color: sg.paintValue, opacity: 0.35 },
                { offset: 1, color: sg.paintValue, opacity: 1 },
              ],
            })
          : sg.paintValue;
      inner.push(rect(0, Math.round(horizon - Hv * 0.42), Math.ceil(Wv), Math.round(Hv * 0.42 + 2), { fill, 'fill-opacity': sg.opacity }));
    }

    // ── 银河（旋转坐标系：x 沿带，y 垂直带）───────────────────────
    const mw = elements.get('milky_way')!;
    const core = elements.get('milky_core')!;
    const band: string[] = [];
    // 星云团 / 暗尘 / 带内微星的随机数总是消耗（不随可见性改变布局）
    const gauss = (): number => (rng() + rng() + rng() - 1.5) / 1.5;
    const clouds: Array<[number, number, number, number, number]> = [];
    for (let i = 0; i < 30; i++) clouds.push([(rng() - 0.5) * L * 0.9, gauss() * bw * 0.3, V * (0.1 + rng() * 0.16), V * (0.06 + rng() * 0.09), rng()]);
    const coreX = (rng() - 0.5) * Math.min(Wv, Hv) * 0.6;
    const cores: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 7; i++) cores.push([coreX + gauss() * V * 0.22, gauss() * bw * 0.12, V * (0.06 + rng() * 0.09), V * (0.02 + rng() * 0.035)]);
    const dust: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 9; i++) dust.push([coreX + (rng() - 0.5) * V * 1.6, bw * (0.03 + gauss() * 0.07), V * (0.1 + rng() * 0.16), V * (0.014 + rng() * 0.02)]);
    const bandStars: Array<[number, number]> = [];
    const nBand = Math.round(density * 640 * Math.min(1.8, diag / 2000 + 0.3));
    for (let i = 0; i < 1100; i++) {
      const p: [number, number] = [(rng() - 0.5) * L * 0.95, gauss() * bw * 0.36];
      if (i < nBand) bandStars.push(p);
    }

    const rad = (key: string, color: string, op: number): string =>
      api.radial({ key, cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color, opacity: op }, { offset: 0.55, color, opacity: op * 0.4 }, { offset: 1, color, opacity: 0 }] });
    const ell = (x: number, y: number, rx: number, ry: number, fill: string, op?: number): string =>
      `<ellipse cx="${Math.round(x)}" cy="${Math.round(y)}" rx="${Math.round(rx)}" ry="${Math.round(ry)}" fill="${fill}"${op === undefined ? '' : ` fill-opacity="${api.n(op)}"`}/>`;

    if (mw.visible && glow > 0 && mw.paintValue.startsWith('#')) {
      const c = mw.paintValue;
      const a = mw.opacity;
      const bandFill = api.linear({
        key: 'sns-band',
        angle: 90,
        stops: [
          { offset: 0, color: c, opacity: 0 },
          { offset: 0.25, color: c, opacity: 0.06 * glow * a },
          { offset: 0.5, color: c, opacity: 0.17 * glow * a },
          { offset: 0.75, color: c, opacity: 0.06 * glow * a },
          { offset: 1, color: c, opacity: 0 },
        ],
      });
      band.push(`<rect x="${Math.round(-L / 2)}" y="${Math.round(-bw / 2)}" width="${Math.round(L)}" height="${Math.round(bw)}" fill="${bandFill}"/>`);
      const cf = rad('sns-cloud', c, Math.min(1, 0.26 * glow * a));
      let cl = '';
      clouds.forEach(([x, y, rx, ry, k]) => {
        cl += ell(x, y, rx, ry * (0.8 + k * 0.4), cf);
      });
      band.push(cl);
    }
    if (core.visible && glow > 0 && core.paintValue.startsWith('#')) {
      const cf = rad('sns-core', core.paintValue, Math.min(1, 0.42 * glow * core.opacity));
      band.push(cores.map(([x, y, rx, ry]) => ell(x, y, rx, ry, cf)).join(''));
    }
    if (mw.visible && glow > 0 && bg.paintValue.startsWith('#')) {
      // 暗尘带：底色的细长柔团，切开光带
      const df = rad('sns-dust', bg.paintValue, 0.6);
      band.push(dust.map(([x, y, rx, ry]) => ell(x, y, rx, ry, df)).join(''));
    }

    // ── 星点 ─────────────────────────────────────────────
    const st = elements.get('stars')!;
    const nField = Math.round(density * 360 * area);
    const field: Array<{ x: number; y: number; s: number; grp: number }> = [];
    const maxField = Math.round(400 * area) + 1;
    for (let i = 0; i < maxField; i++) {
      const x = rng() * Wv;
      const y = rng() * horizon;
      const r = rng();
      const grp = Math.floor(rng() * 3);
      // 尺寸档：0 微 / 1 小 / 2 中 / 3 亮星
      const s = r < 0.62 ? 0 : r < 0.88 ? 1 : r < 0.975 ? 2 : 3;
      if (i < nField) field.push({ x, y, s, grp });
    }
    const SIZES = [1.3, 2.1, 3.1, 3.9].map((v) => v * starSize);
    const OPS = [0.5, 0.72, 0.92, 1];

    if (st.visible) {
      // 字节截断：按前缀减少颗数
      let nf = field.length;
      let nb = bandStars.length;
      const build = (): { groups: string[][]; bandD: string; bright: Array<[number, number]> } => {
        const buckets: Array<Array<Array<[number, number]>>> = [0, 1, 2].map(() => [[], [], [], []]);
        const bright: Array<[number, number]> = [];
        for (let i = 0; i < nf; i++) {
          const f = field[i];
          buckets[f.grp][f.s].push([f.x, f.y]);
          if (f.s === 3) bright.push([f.x, f.y]);
        }
        const groups = buckets.map((b) => b.map((pts) => encDots(pts)));
        return { groups, bandD: encDots(bandStars.slice(0, nb)), bright };
      };
      let b = build();
      const size = (): number => b.groups.flat().reduce((s, d) => s + d.length, 0) + b.bandD.length + b.bright.length * 14;
      for (let guard = 0; guard < 40 && size() > STAR_CAP; guard++) {
        nf = Math.floor(nf * 0.92);
        nb = Math.floor(nb * 0.9);
        b = build();
      }
      if (b.bandD !== '' && mw.visible) {
        band.push(`<path d="${b.bandD}" stroke="${st.paintValue}" stroke-width="${f1(1.5 * starSize)}" stroke-opacity="${api.n(0.6 * st.opacity)}"/>`);
      }
      const tw = twinkle ? api.keyframes('vw-sns-tw', 'to{opacity:.3}') : '';
      const PER = [2.7, 3.9, 5.3];
      let starsMarkup = '';
      b.groups.forEach((ds, gi) => {
        let s = '';
        ds.forEach((d, si) => {
          if (d === '') return;
          s += `<path d="${d}" stroke-width="${f1(SIZES[si])}" stroke-opacity="${api.n(OPS[si] * st.opacity)}"/>`;
        });
        if (s === '') return;
        starsMarkup += twinkle ? `<g style="animation:${tw} ${PER[gi]}s ease-in-out -${f1(PER[gi] * 0.37 * (gi + 1))}s infinite alternate">${s}</g>` : s;
      });
      // 亮星：光晕 + 十字星芒
      if (b.bright.length > 0) {
        const halo = encDots(b.bright);
        const arm = 7 * starSize;
        let cross = '';
        b.bright.slice(0, 10).forEach(([x, y]) => {
          cross += `M${Math.round(x - arm)} ${Math.round(y)}h${Math.round(arm * 2)}M${Math.round(x)} ${Math.round(y - arm)}v${Math.round(arm * 2)}`;
        });
        let hb = `<path d="${halo}" stroke-width="${f1(SIZES[3] * 3.2)}" stroke-opacity="${api.n(0.1 * st.opacity)}"/>`;
        if (twinkle) hb = `<g style="animation:${tw} 4.6s ease-in-out -1.3s infinite alternate">${hb}</g>`;
        starsMarkup += hb + `<path d="${cross}" stroke-width="${f1(0.7 * starSize)}" stroke-opacity="${api.n(0.45 * st.opacity)}"/>`;
      }
      inner.push(g({ stroke: st.paintValue, 'stroke-linecap': 'round', fill: 'none' }, starsMarkup));
    }

    if (band.length > 0) {
      inner.splice(inner.length - (st.visible ? 1 : 0), 0, `<g transform="translate(${Math.round(cx)} ${Math.round(cy)}) rotate(${f1(angle)})">${band.join('')}</g>`);
    }

    // ── 流星（仅动画）──────────────────────────────────────
    if (meteor && st.visible) {
      const mf = api.linear({ key: 'sns-met', angle: 0, stops: [{ offset: 0, color: st.paintValue, opacity: 0 }, { offset: 1, color: st.paintValue, opacity: 0.9 }] });
      const kf = api.keyframes('vw-sns-met', '0%{transform:translateX(0);opacity:0}1%{opacity:1}6%{transform:translateX(320px);opacity:0}100%{transform:translateX(320px);opacity:0}');
      const DUR = [11, 17, 23];
      let ms = '';
      for (let i = 0; i < 3; i++) {
        const x = Wv * (0.15 + rng() * 0.65);
        const y = horizon * (0.08 + rng() * 0.4);
        const a = angle + 180 + 25 + rng() * 30; // 斜向下
        ms +=
          `<g transform="translate(${Math.round(x)} ${Math.round(y)}) rotate(${f1(a)})"><g style="animation:${kf} ${DUR[i]}s linear -${f1(DUR[i] * (0.2 + 0.3 * i))}s infinite;opacity:0">` +
          `<path d="M-150 0L0-1.6L0 1.6z" fill="${mf}"/></g></g>`;
      }
      inner.push(ms);
    }

    // ── 山峦：远 → 中 → 近 ──────────────────────────────────
    const far = elements.get('mountain_far')!;
    const near = elements.get('mountain_near')!;
    const amp = V * (0.1 + mh * 0.2);
    const k = Wv / V;
    const R1 = peakRange(rng, { x0: -V * 0.2, x1: Wv + V * 0.2, count: Math.max(3, Math.round(k * 3.2)), height: amp * 1.25, slope: [0.45, 0.85], detail: amp * 0.16 });
    const R2 = peakRange(rng, { x0: -V * 0.2, x1: Wv + V * 0.2, count: Math.max(2, Math.round(k * 2.2)), height: amp * 0.7, slope: [0.25, 0.45], detail: amp * 0.1 });
    const R3 = noise1D(rng, Math.max(2, Math.round(k * 2)), 3, 0.45);
    const ridges = [
      (x: number): number => horizon - amp * 0.05 - R1(x),
      (x: number): number => horizon + amp * 0.12 - R2(x),
      (x: number): number => horizon + amp * 0.32 - amp * 0.12 * (R3(x / Wv) * 0.5 + 0.5),
    ];
    const fills = [mix(far.paintValue, mix(sg.paintValue, bg.paintValue, 0.4), 0.25), mix(far.paintValue, near.paintValue, 0.5), near.paintValue];
    const vis = [far.visible, far.visible && near.visible, near.visible];
    const ops = [far.opacity, (far.opacity + near.opacity) / 2, near.opacity];
    const bottom = Math.ceil(Hv) + 2;
    let step = 5;
    let ds: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      ds = ridges.map((f) => {
        const pts: Array<[number, number]> = [];
        for (let x = -step; x <= Wv + step; x += step) pts.push([x, f(x)]);
        return `${encLine(pts)}V${bottom}H${-step}z`;
      });
      if (ds.reduce((s, d) => s + d.length, 0) <= RIDGE_CAP) break;
      step *= 1.25;
    }
    ds.forEach((d, i) => {
      if (vis[i]) inner.push(path(d, { fill: fills[i], 'fill-opacity': ops[i] }));
    });

    out.push(`<g transform="${tf}">${inner.join('')}</g>`);
    return { body: out.join('') };
  },
};

export default def;
