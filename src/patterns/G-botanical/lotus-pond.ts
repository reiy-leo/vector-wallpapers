/**
 * 荷塘 —— G 植物 / 俯视场景。
 *
 * 俯视一方荷塘：圆形荷叶（微波状叶缘、一道 V 形缺口、自叶心放射的叶脉）大小错落、偶有叠压，
 * 每片叶在水面投下一点偏移的影子；几朵盛开的荷花（三轮尖瓣 + 金色莲蓬与一圈花蕊）和花苞点缀其间；
 * 水面有几组同心的细涟漪。动画（仅预览）：涟漪自中心扩散并淡出。导出静态。
 *
 * ⭐ 体积：荷叶（叶面 + 叶脉）只定义一次（2 个叶缘变体），每片叶 = 影子 `<use>` + 叶片 `<use>`；
 * 叶面不带填色、叶脉不带描边色 → 由外层 `<g>` 继承，主 / 次叶色各一组。
 * 花朵 / 花苞带烘焙色，id 后缀取配色哈希，避免同页多张预览互相串色。
 * 坐标：短边 = 1000 的虚拟坐标，整体 scale(q)。
 */
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampN, fo, fx, scatterTorus, shortHash } from './_helpers';

const V = 1000;
const DEG = Math.PI / 180;
const NOTCH = 7; // 缺口半角（度）
const ri = Math.round;

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 单位荷叶（半径 100，缺口朝 -y）：波状叶缘 + 缺口。 */
function padPath(seed: number): string {
  const r = lcg(seed);
  const ph = r() * 6;
  const pts: Array<[number, number]> = [];
  const a0 = -90 + NOTCH;
  const a1 = 270 - NOTCH;
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const rr = 100 + 1.8 * Math.sin(i * 0.62 + ph) + 1.4 * Math.sin(i * 0.27 + ph * 2) - (i === 0 || i === steps ? 3 : 0);
    pts.push([Math.cos(a * DEG) * rr, Math.sin(a * DEG) * rr]);
  }
  let d = `M0 -6L${ri(pts[0][0])} ${ri(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    d += `Q${ri(pts[i][0])} ${ri(pts[i][1])} ${ri(m[0])} ${ri(m[1])}`;
  }
  const e = pts[pts.length - 1];
  d += `L${ri(e[0])} ${ri(e[1])}z`;
  return d.replace(/ -/g, '-');
}
const PADS = [padPath(3), padPath(17)];

/** 叶脉：自叶心放射，避开缺口；每条在 2/3 处分叉一次。 */
const VEIN_D: string = (() => {
  let d = '';
  const n = 17;
  for (let i = 0; i < n; i++) {
    const a = -90 + NOTCH + 8 + ((360 - 2 * NOTCH - 16) * i) / (n - 1);
    const c = Math.cos(a * DEG);
    const s = Math.sin(a * DEG);
    const x1 = c * 62;
    const y1 = s * 62;
    d += `M${ri(c * 7)} ${ri(s * 7)}L${ri(x1)} ${ri(y1)}`;
    for (const da of [-7, 7]) {
      const b = (a + da) * DEG;
      d += `M${ri(x1)} ${ri(y1)}L${ri(Math.cos(b) * 90)} ${ri(Math.sin(b) * 90)}`;
    }
  }
  return d.replace(/ -/g, '-');
})();

/** 单枚花瓣（基部在原点、尖端朝 -y，长 50）。 */
const PETAL_D = 'M0-6C-21-12-21-38 0-50C21-38 21-12 0-6z';

const def: PatternDef = {
  id: 'lotus-pond',
  name: '荷塘',
  category: 'G-botanical',
  description: '俯视荷塘：带缺口与放射叶脉的圆荷叶错落铺开，几朵盛开的荷花与花苞点缀其间，水面泛着细细的同心涟漪。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'water', label: '水面', role: 'bg', paint: { type: 'solid', color: '#2f5b59' }, opacity: 1, visible: true, configurable: true },
    { id: 'ripple', label: '涟漪', role: 'detail', paint: { type: 'solid', color: '#8db3ad' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'shade', label: '叶影', role: 'detail', paint: { type: 'solid', color: '#1f4141' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'pad', label: '荷叶 · 主', role: 'primary', paint: { type: 'solid', color: '#5e9a6c' }, opacity: 1, visible: true, configurable: true },
    { id: 'pad_alt', label: '荷叶 · 次', role: 'secondary', paint: { type: 'solid', color: '#88b47a' }, opacity: 1, visible: true, configurable: true },
    { id: 'vein', label: '叶脉', role: 'detail', paint: { type: 'solid', color: '#b6d6a4' }, opacity: 0.6, visible: true, configurable: true },
    { id: 'petal', label: '花瓣 · 外', role: 'accent', paint: { type: 'solid', color: '#f0aebf' }, opacity: 1, visible: true, configurable: true },
    { id: 'petal_inner', label: '花瓣 · 内', role: 'accent', paint: { type: 'solid', color: '#fbe0e6' }, opacity: 1, visible: true, configurable: true },
    { id: 'heart', label: '莲蓬', role: 'accent', paint: { type: 'solid', color: '#e9c25b' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'padDensity', label: '荷叶密度', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.55, heavy: true },
    { key: 'flowers', label: '花朵数量', type: 'range', min: 0, max: 9, step: 1, default: 4 },
    { key: 'padSize', label: '荷叶大小', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1, heavy: true },
    { key: 'ripples', label: '涟漪', type: 'toggle', default: true },
    { key: 'rippleAnim', label: '涟漪扩散', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'summer',
      label: '盛夏',
      elements: {
        water: { paint: { type: 'solid', color: '#2f5b59' } },
        ripple: { paint: { type: 'solid', color: '#8db3ad' }, opacity: 0.55 },
        shade: { paint: { type: 'solid', color: '#1f4141' }, opacity: 0.55 },
        pad: { paint: { type: 'solid', color: '#5e9a6c' } },
        pad_alt: { paint: { type: 'solid', color: '#88b47a' } },
        vein: { paint: { type: 'solid', color: '#b6d6a4' }, opacity: 0.6 },
        petal: { paint: { type: 'solid', color: '#f0aebf' } },
        petal_inner: { paint: { type: 'solid', color: '#fbe0e6' } },
        heart: { paint: { type: 'solid', color: '#e9c25b' } },
      },
    },
    {
      id: 'morning-mist',
      label: '晨雾',
      elements: {
        water: { paint: { type: 'solid', color: '#e2ebe5' } },
        ripple: { paint: { type: 'solid', color: '#a9c0b6' }, opacity: 0.6 },
        shade: { paint: { type: 'solid', color: '#c3d4cb' }, opacity: 0.7 },
        pad: { paint: { type: 'solid', color: '#86ad92' } },
        pad_alt: { paint: { type: 'solid', color: '#b0cba3' } },
        vein: { paint: { type: 'solid', color: '#e8f0e4' }, opacity: 0.65 },
        petal: { paint: { type: 'solid', color: '#eba9b8' } },
        petal_inner: { paint: { type: 'solid', color: '#f9dfe5' } },
        heart: { paint: { type: 'solid', color: '#dfba5c' } },
      },
      params: { padDensity: 0.45 },
    },
    {
      id: 'ink',
      label: '墨荷',
      elements: {
        water: { paint: { type: 'solid', color: '#ece7dc' } },
        ripple: { paint: { type: 'solid', color: '#b9b2a3' }, opacity: 0.6 },
        shade: { paint: { type: 'solid', color: '#d9d2c4' }, opacity: 0.8 },
        pad: { paint: { type: 'solid', color: '#3c4743' } },
        pad_alt: { paint: { type: 'solid', color: '#6e7b73' } },
        vein: { paint: { type: 'solid', color: '#ece7dc' }, opacity: 0.4 },
        petal: { paint: { type: 'solid', color: '#c46d7d' } },
        petal_inner: { paint: { type: 'solid', color: '#ecd3d4' } },
        heart: { paint: { type: 'solid', color: '#c8a14c' } },
      },
      params: { padDensity: 0.4, flowers: 3, padSize: 1.2 },
    },
    {
      id: 'night',
      label: '夜塘',
      elements: {
        water: { paint: { type: 'solid', color: '#13202b' } },
        ripple: { paint: { type: 'solid', color: '#3f5a6e' }, opacity: 0.7 },
        shade: { paint: { type: 'solid', color: '#0a121a' }, opacity: 0.6 },
        pad: { paint: { type: 'solid', color: '#2b4a44' } },
        pad_alt: { paint: { type: 'solid', color: '#3e6455' } },
        vein: { paint: { type: 'solid', color: '#6a9080' }, opacity: 0.55 },
        petal: { paint: { type: 'solid', color: '#e4c3d6' } },
        petal_inner: { paint: { type: 'solid', color: '#f7ebf1' } },
        heart: { paint: { type: 'solid', color: '#d9b864' } },
      },
      params: { flowers: 5 },
    },
  ],

  paletteSlots: {
    bg: ['water'],
    primary: ['pad'],
    secondary: ['pad_alt'],
    accent: ['petal', 'petal_inner', 'heart'],
    detail: ['vein', 'ripple', 'shade'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const density = clampN(params.padDensity, 0.1, 1, 0.55);
    const nFlowers = Math.round(clampN(params.flowers, 0, 9, 4));
    const size = clampN(params.padSize, 0.6, 1.5, 1);
    const ripplesOn = params.ripples === true;
    const anim = animate && ripplesOn && params.rippleAnim === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const E = (id: string) => elements.get(id)!;
    const water = E('water');
    const ripple = E('ripple');
    const shade = E('shade');
    const pad = E('pad');
    const padAlt = E('pad_alt');
    const vein = E('vein');
    const petal = E('petal');
    const petalIn = E('petal_inner');
    const heart = E('heart');

    // ── 荷叶布局：环面散点（画面边缘自然裁切）────────────────
    const area = (Wv * Hv) / (V * V);
    const nPads = Math.min(40, Math.round((7 + density * 20) * area / Math.pow(size, 1.6)));
    const radii: number[] = [];
    for (let i = 0; i < nPads; i++) radii.push(V * size * (0.055 + Math.pow(rng(), 1.6) * 0.085));
    radii.sort((a, b) => b - a);
    const spots = scatterTorus(rng, radii, Wv, Hv, 0.82 - density * 0.12, 20);
    interface Pad {
      x: number;
      y: number;
      r: number;
      a: number;
      v: number;
      alt: boolean;
    }
    const pads: Pad[] = spots.map((p) => ({ x: p.x, y: p.y, r: p.r, a: rng() * 360, v: rng() < 0.5 ? 0 : 1, alt: rng() < 0.32 }));
    // 叠压：小叶后画（浮在大叶上）→ 先大后小
    // ── 花：落在若干荷叶边缘 ──────────────────────────────
    interface Fl {
      x: number;
      y: number;
      s: number;
      a: number;
      bud: boolean;
    }
    const fls: Fl[] = [];
    const big = pads.slice(0, Math.max(1, Math.min(pads.length, 16)));
    // 打乱候选宿主叶，每朵花用不同的叶
    const hosts = big.map((p) => ({ p, k: rng() })).sort((a, b) => a.k - b.k).map((o) => o.p);
    for (let i = 0; i < nFlowers; i++) {
      const host = hosts[i % Math.max(1, hosts.length)];
      const ang = rng() * Math.PI * 2;
      const bud = i % 3 === 2;
      if (!host) break;
      fls.push({
        x: host.x + Math.cos(ang) * host.r * 0.85,
        y: host.y + Math.sin(ang) * host.r * 0.85,
        s: (bud ? 1.15 : 1.5 + rng() * 0.5) * size,
        a: rng() * 360,
        bud,
      });
    }
    // ── 涟漪：围绕花茎 + 少量零星水滴 ────────────────────────
    interface Rp {
      x: number;
      y: number;
      r: number;
    }
    const rps: Rp[] = [];
    if (ripplesOn) {
      fls.forEach((f) => rps.push({ x: f.x, y: f.y, r: V * 0.05 * f.s }));
      const extra = 3 + Math.round(area * 2);
      for (let i = 0; i < extra; i++) rps.push({ x: rng() * Wv, y: rng() * Hv, r: V * (0.025 + rng() * 0.03) });
    }

    // ── defs ────────────────────────────────────────────────
    const hash = shortHash([petal.paintValue, petalIn.paintValue, heart.paintValue, petal.opacity, petalIn.opacity, heart.opacity, petal.visible, petalIn.visible, heart.visible].join('|'));
    const fid = `vwlp-f${hash}`;
    const bid = `vwlp-b${hash}`;
    let defs =
      `<path id="vwlp-p0" d="${PADS[0]}"/><path id="vwlp-p1" d="${PADS[1]}"/><path id="vwlp-v" d="${VEIN_D}" fill="none"/>` +
      `<path id="vwlp-q" d="${PETAL_D}"/>`;
    const ring = (n: number, sc: number, off: number): string => {
      let s = '';
      for (let k = 0; k < n; k++) s += `<use href="#vwlp-q" transform="rotate(${ri(off + (k * 360) / n)})${sc !== 1 ? `scale(${sc})` : ''}"/>`;
      return s;
    };
    if (fls.length > 0) {
      const pv = petal.visible;
      const iv = petalIn.visible;
      let fl = '';
      if (pv) fl += `<g fill="${petal.paintValue}" fill-opacity="${fo(petal.opacity)}" stroke="${petalIn.paintValue}" stroke-width="1.2">${ring(9, 1, 0)}</g>`;
      if (iv) fl += `<g fill="${petalIn.paintValue}" fill-opacity="${fo(petalIn.opacity)}" stroke="${petal.paintValue}" stroke-opacity="0.5" stroke-width="1">${ring(8, 0.78, 20)}${ring(6, 0.55, 5)}</g>`;
      if (heart.visible) {
        // 花蕊一圈 + 莲蓬
        let st = '';
        for (let k = 0; k < 16; k++) {
          const a = (k * 22.5 + 6) * DEG;
          st += `M${fx(Math.cos(a) * 9)} ${fx(Math.sin(a) * 9)}L${fx(Math.cos(a) * 16)} ${fx(Math.sin(a) * 16)}`;
        }
        let holes = 'M0 0h0';
        for (let k = 0; k < 6; k++) {
          const a = (k * 60 + 30) * DEG;
          holes += `M${fx(Math.cos(a) * 5.2)} ${fx(Math.sin(a) * 5.2)}h0`;
        }
        fl +=
          `<path d="${st.replace(/ -/g, '-')}" stroke="${heart.paintValue}" stroke-opacity="${fo(heart.opacity * 0.9)}" stroke-width="1.4" stroke-linecap="round"/>` +
          `<circle r="9" fill="${heart.paintValue}" fill-opacity="${fo(heart.opacity)}"/>` +
          `<path d="${holes}" stroke="${pv ? petal.paintValue : '#000000'}" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>`;
      }
      defs += `<g id="${fid}">${fl}</g>`;
      // 花苞（俯视）：外瓣两枚包裹 + 内瓣一枚
      let bd = '';
      if (pv) bd += `<g fill="${petal.paintValue}" fill-opacity="${fo(petal.opacity)}" stroke="${petalIn.paintValue}" stroke-width="1.2"><use href="#vwlp-q" transform="translate(0 24)rotate(-14)scale(0.95 1)"/><use href="#vwlp-q" transform="translate(0 24)rotate(14)scale(0.95 1)"/></g>`;
      if (iv) bd += `<use href="#vwlp-q" transform="translate(0 22)scale(0.55 0.8)" fill="${petalIn.paintValue}" fill-opacity="${fo(petalIn.opacity)}"/>`;
      defs += `<g id="${bid}">${bd}</g>`;
    }

    // ── 组装 ────────────────────────────────────────────────
    let inner = '';
    const tf = (p: Pad, dx = 0, dy = 0): string => `translate(${ri(p.x + dx)} ${ri(p.y + dy)})rotate(${ri(p.a)})scale(${api.n(p.r / 100)})`;
    // 叶影
    if (shade.visible && pads.length > 0) {
      inner += `<g fill="${shade.paintValue}" fill-opacity="${fo(shade.opacity)}">${pads.map((p) => `<use href="#vwlp-p${p.v}" transform="${tf(p, p.r * 0.09, p.r * 0.12)}"/>`).join('')}</g>`;
    }
    // 涟漪（压在叶下）
    if (rps.length > 0 && ripple.visible) {
      let rm = '';
      const kf = anim ? api.keyframes('vw-lprip', 'from{transform:scale(.35);opacity:1}to{transform:scale(1.55);opacity:0}') : '';
      rps.forEach((r, i) => {
        if (anim) {
          let cs = '';
          for (let k = 0; k < 3; k++) cs += `<circle r="${ri(r.r * 1.4)}" style="animation:${kf} 6s linear -${(i * 0.9 + k * 2) % 6}s infinite"/>`;
          rm += `<g transform="translate(${ri(r.x)} ${ri(r.y)})">${cs}</g>`;
        } else {
          rm += `<g transform="translate(${ri(r.x)} ${ri(r.y)})"><circle r="${ri(r.r)}"/><circle r="${ri(r.r * 1.55)}" stroke-opacity="0.6"/><circle r="${ri(r.r * 2.2)}" stroke-opacity="0.3"/></g>`;
        }
      });
      inner += `<g fill="none" stroke="${ripple.paintValue}" stroke-opacity="${fo(ripple.opacity)}" stroke-width="1.6">${rm}</g>`;
    }
    // 荷叶：按大小先后（大先画），主 / 次色连续段分组，叶脉随叶
    let run = '';
    let runAlt: boolean | null = null;
    const flush = (): void => {
      if (run === '' || runAlt === null) return;
      const e = runAlt ? padAlt : pad;
      const vs = vein.visible ? ` stroke="${vein.paintValue}" stroke-opacity="${fo(vein.opacity)}" stroke-width="1.6" stroke-linecap="round"` : '';
      inner += `<g fill="${e.paintValue}" fill-opacity="${fo(e.opacity)}"${vs}>${run}</g>`;
      run = '';
    };
    for (const p of pads) {
      const e = p.alt ? padAlt : pad;
      if (!e.visible) continue;
      if (runAlt !== p.alt) {
        flush();
        runAlt = p.alt;
      }
      run += `<use href="#vwlp-p${p.v}" transform="${tf(p)}" stroke="none"/>`;
      if (vein.visible) run += `<use href="#vwlp-v" transform="${tf(p)}"/>`;
    }
    flush();
    // 花与花苞（带阴影）
    if (fls.length > 0) {
      let fm = '';
      let sm = '';
      for (const f of fls) {
        const t = `translate(${ri(f.x)} ${ri(f.y)})rotate(${ri(f.a)})scale(${api.n(f.s)})`;
        fm += `<use href="#${f.bud ? bid : fid}" transform="${t}"/>`;
        sm += `<circle cx="${ri(f.x + 7 * f.s)}" cy="${ri(f.y + 10 * f.s)}" r="${ri((f.bud ? 22 : 46) * f.s)}"/>`;
      }
      if (shade.visible) inner += `<g fill="${shade.paintValue}" fill-opacity="${fo(shade.opacity * 0.7)}">${sm}</g>`;
      inner += fm;
    }

    const body =
      `<rect width="${W}" height="${H}" fill="${water.paintValue}" fill-opacity="${fo(water.opacity)}"/>` +
      `<defs>${defs}</defs><g transform="scale(${q})">${inner}</g>`;
    return { body };
  },
};

export default def;
