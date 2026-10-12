/**
 * 海浪月夜 —— E 风景 / 单幅构图。
 *
 * 构图要点：上方夜空 + 月亮（可调月相，暗面留一点地照）+ 月晕；下方多层平滑海浪由远及近：
 * 远层浪小而密、近层浪大而疏（透视：层距按幂次拉开），每层浪顶有断续的浪花描边；
 * 月光在海面上碎成一条竖向的光带（逐层的横向短光斑，越近越宽越长），水面上一层柔和的月光倒影辉光。
 *
 * ⭐ 体积/节点策略：
 *   - 虚拟坐标「短边 = 1000」，整体 `scale(q)`；浪线用二次贝塞尔中点法 + 整数相对坐标。
 *   - 浪花：复用浪线 d 作描边，`stroke-dasharray` 打断成碎段（零额外几何）。
 *   - 光斑：每层两条 path（闪烁子组），横向短线 + 圆头描边。
 *   - WAVE_CAP：浪线采样按字节逐级放疏。
 * 动画（仅预览，cfg.animate && swell）：每层浪左右往返平移（远慢小、近快大）并轻微起伏，
 * 光斑两组交替闪烁；光带本身留在月亮正下方不随浪移动。
 */
import { g, path, rect } from '../../engine/svg';
import { encDashes, encDots, encSmooth, f1, mix, num, virt } from './_scene';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;
const WAVE_CAP = 9000;
const GLINT_CAP = 3600;

const def: PatternDef = {
  id: 'ocean-moon',
  tones: ['dark'],
  name: '海浪月夜',
  category: 'E-scene',
  description: '夜空中的月亮与月晕，多层平滑海浪由远及近，月光在浪间碎成一条闪烁的光带。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '夜空', role: 'bg', paint: { type: 'solid', color: '#14223f' }, opacity: 1, visible: true, configurable: true },
    { id: 'sky_glow', label: '天际辉光', role: 'detail', paint: { type: 'solid', color: '#34507d' }, opacity: 1, visible: true, configurable: true },
    { id: 'moon_glow', label: '月晕', role: 'detail', paint: { type: 'solid', color: '#c8d5ef' }, opacity: 1, visible: true, configurable: true },
    { id: 'moon', label: '月亮', role: 'accent', paint: { type: 'solid', color: '#f5edd8' }, opacity: 1, visible: true, configurable: true },
    { id: 'sea_far', label: '海面 · 远', role: 'secondary', paint: { type: 'solid', color: '#2a4470' }, opacity: 1, visible: true, configurable: true },
    { id: 'sea_near', label: '海面 · 近', role: 'primary', paint: { type: 'solid', color: '#0a1530' }, opacity: 1, visible: true, configurable: true },
    { id: 'crest', label: '浪花', role: 'secondary', paint: { type: 'solid', color: '#91a9d3' }, opacity: 1, visible: true, configurable: true },
    { id: 'glint', label: '月光碎影', role: 'accent', paint: { type: 'solid', color: '#f7eed4' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'waveLayers', label: '浪层数', type: 'range', min: 3, max: 9, step: 1, default: 6, heavy: true },
    { key: 'waveHeight', label: '浪高', type: 'range', min: 0.3, max: 1.6, step: 0.05, default: 1 },
    { key: 'moonPhase', label: '月相', type: 'range', min: 0.1, max: 1, step: 0.02, default: 0.84 },
    { key: 'moonSize', label: '月亮大小', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'glintAmount', label: '月光反射', type: 'range', min: 0, max: 1, step: 0.05, default: 0.7 },
    { key: 'swell', label: '浪涌', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'moonlit-navy',
      label: '月夜蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#14223f' } },
        sky_glow: { paint: { type: 'solid', color: '#34507d' } },
        moon_glow: { paint: { type: 'solid', color: '#c8d5ef' } },
        moon: { paint: { type: 'solid', color: '#f5edd8' } },
        sea_far: { paint: { type: 'solid', color: '#2a4470' } },
        sea_near: { paint: { type: 'solid', color: '#0a1530' } },
        crest: { paint: { type: 'solid', color: '#91a9d3' } },
        glint: { paint: { type: 'solid', color: '#f7eed4' } },
      },
    },
    {
      id: 'teal-sea',
      label: '青海',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f2a33' } },
        sky_glow: { paint: { type: 'solid', color: '#2b5f66' } },
        moon_glow: { paint: { type: 'solid', color: '#c0e1da' } },
        moon: { paint: { type: 'solid', color: '#eff4e6' } },
        sea_far: { paint: { type: 'solid', color: '#1e4d55' } },
        sea_near: { paint: { type: 'solid', color: '#061f25' } },
        crest: { paint: { type: 'solid', color: '#80b4ad' } },
        glint: { paint: { type: 'solid', color: '#f0f6e7' } },
      },
    },
    {
      id: 'dusk-mauve',
      label: '暮霭',
      elements: {
        bg: { paint: { type: 'solid', color: '#3a3558' } },
        sky_glow: { paint: { type: 'solid', color: '#8b6f8d' } },
        moon_glow: { paint: { type: 'solid', color: '#f0cbc2' } },
        moon: { paint: { type: 'solid', color: '#fbeadb' } },
        sea_far: { paint: { type: 'solid', color: '#4b4b74' } },
        sea_near: { paint: { type: 'solid', color: '#1c1c39' } },
        crest: { paint: { type: 'solid', color: '#a69ec6' } },
        glint: { paint: { type: 'solid', color: '#fde9d6' } },
      },
      params: { moonPhase: 0.36, waveHeight: 0.8 },
    },
    {
      id: 'silver',
      label: '银灰',
      elements: {
        bg: { paint: { type: 'solid', color: '#22252c' } },
        sky_glow: { paint: { type: 'solid', color: '#474c57' } },
        moon_glow: { paint: { type: 'solid', color: '#d6d9df' } },
        moon: { paint: { type: 'solid', color: '#f3f3ef' } },
        sea_far: { paint: { type: 'solid', color: '#363b45' } },
        sea_near: { paint: { type: 'solid', color: '#101217' } },
        crest: { paint: { type: 'solid', color: '#8d939f' } },
        glint: { paint: { type: 'solid', color: '#f5f5f0' } },
      },
      params: { moonPhase: 1, waveLayers: 7 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['sea_near'],
    secondary: ['sea_far', 'crest'],
    accent: ['moon', 'glint'],
    detail: ['sky_glow', 'moon_glow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const layers = Math.round(num(params, 'waveLayers', 3, 9));
    const wh = num(params, 'waveHeight', 0.2, 2);
    const phase = num(params, 'moonPhase', 0.05, 1);
    const msize = num(params, 'moonSize', 0.3, 2);
    const glintAmt = num(params, 'glintAmount', 0, 1);
    const swell = cfg.animate && params.swell === true;

    const { Wv, Hv, tf } = virt(W, H, V);
    const portrait = Hv > Wv;
    const horizon = Hv * (portrait ? 0.5 : 0.56);
    const bottom = Math.ceil(Hv) + 4;
    const el = (id: string) => elements.get(id)!;
    const bg = el('bg');
    const out: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const inner: string[] = [];
    const hex = (v: string): boolean => v.startsWith('#');

    // ── 月亮位置（先抽随机，布局与可见性无关）──────────────────
    const mx = Wv * (portrait ? 0.5 + (rng() - 0.5) * 0.2 : 0.6 + rng() * 0.14);
    const my = horizon * (0.34 + rng() * 0.12);
    const mr = V * 0.058 * msize;

    // 天际辉光
    const sg = el('sky_glow');
    if (sg.visible) {
      const fill = hex(sg.paintValue)
        ? api.linear({ key: 'om-sky', angle: 90, stops: [{ offset: 0, color: sg.paintValue, opacity: 0 }, { offset: 1, color: sg.paintValue, opacity: 0.85 }] })
        : sg.paintValue;
      inner.push(rect(0, Math.round(horizon * 0.35), Math.ceil(Wv), Math.round(horizon * 0.65 + 1), { fill, 'fill-opacity': sg.opacity }));
    }

    // 稀疏星点（月光色，远而淡）
    const gl = el('glint');
    const stars: Array<[number, number]> = [];
    const ns = Math.round(70 * (Wv / V));
    for (let i = 0; i < ns; i++) {
      const x = rng() * Wv;
      const y = rng() * horizon * 0.8;
      if (Math.hypot(x - mx, y - my) > mr * 4) stars.push([x, y]);
    }
    if (gl.visible && stars.length > 0) {
      inner.push(`<path d="${encDots(stars)}" stroke="${gl.paintValue}" stroke-linecap="round" stroke-width="2" stroke-opacity="${api.n(0.45 * gl.opacity)}"/>`);
    }

    // 月晕
    const mg = el('moon_glow');
    if (mg.visible && hex(mg.paintValue)) {
      const halo = api.radial({
        key: 'om-halo',
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: mg.paintValue, opacity: 0.42 * mg.opacity * (0.4 + 0.6 * phase) },
          { offset: 0.25, color: mg.paintValue, opacity: 0.16 * mg.opacity * (0.4 + 0.6 * phase) },
          { offset: 1, color: mg.paintValue, opacity: 0 },
        ],
      });
      inner.push(`<circle cx="${Math.round(mx)}" cy="${Math.round(my)}" r="${Math.round(mr * 6)}" fill="${halo}"/>`);
    }

    // 月亮：暗面地照 + 亮面（明暗交界线为半椭圆）
    const mo = el('moon');
    if (mo.visible) {
      const rx = mr * Math.abs(2 * phase - 1);
      const sweep = phase >= 0.5 ? 1 : 0;
      const r0 = f1(mr);
      const lit =
        phase >= 0.99
          ? `<circle r="${r0}"/>`
          : `<path d="M0 ${f1(-mr)}A${r0} ${r0} 0 0 1 0 ${r0}A${f1(rx)} ${r0} 0 0 ${sweep} 0 ${f1(-mr)}z"/>`;
      inner.push(
        `<g transform="translate(${Math.round(mx)} ${Math.round(my)}) rotate(-24)" fill="${mo.paintValue}" fill-opacity="${api.n(mo.opacity)}">` +
          (phase < 0.99 ? `<circle r="${r0}" fill-opacity="0.09"/>` : '') +
          lit +
          `</g>`,
      );
    }

    // ── 海浪几何 ──────────────────────────────────────────
    const far = el('sea_far');
    const near = el('sea_near');
    const crest = el('crest');
    interface Wave {
      y: number;
      a: number;
      lam: number;
      p: number;
      ph: number[];
      d: string;
    }
    const waves: Wave[] = [];
    const seaH = Hv - horizon;
    for (let i = 0; i <= layers; i++) {
      const p = i / layers; // 0 = 地平线，1 = 最近
      const y = horizon + seaH * (i === 0 ? 0 : 0.04 + 0.86 * Math.pow(p, 1.55));
      const depth = (y - horizon) / seaH;
      waves.push({
        y,
        a: V * wh * (0.003 + 0.075 * Math.pow(depth, 1.3)),
        lam: V * (0.07 + 0.55 * Math.pow(depth, 1.2)),
        p: depth,
        ph: [rng() * 6.283, rng() * 6.283, rng() * 6.283, 0.8 + rng() * 0.4],
        d: '',
      });
    }
    const pad = V * 0.12;
    const wy = (w: Wave, x: number): number => {
      const k = (6.283 / w.lam) * w.ph[3];
      // 尖峰圆谷：两组正弦 + 指数整形
      const s = 0.62 * Math.sin(k * x + w.ph[0]) + 0.38 * Math.sin(k * 1.73 * x + w.ph[1]) + 0.18 * Math.sin(k * 0.37 * x + w.ph[2]);
      const u = (s + 1.18) / 2.36; // 0..1
      return w.y - w.a * (Math.pow(u, 1.8) * 2 - 0.6);
    };
    let density = 4; // 每个波长采样点数
    for (let guard = 0; guard < 8; guard++) {
      waves.forEach((w, i) => {
        if (i === 0) {
          w.d = '';
          return;
        }
        const step = w.lam / density;
        const pts: Array<[number, number]> = [];
        for (let x = -pad; x <= Wv + pad + step; x += step) pts.push([x, wy(w, x)]);
        w.d = encSmooth(pts);
      });
      if (waves.reduce((s, w) => s + w.d.length, 0) * 1.05 <= WAVE_CAP) break;
      density *= 0.85;
    }

    // 远海底色（地平线 → 底部）
    if (far.visible) inner.push(rect(0, Math.round(horizon), Math.ceil(Wv), Math.ceil(seaH + 4), { fill: far.paintValue, 'fill-opacity': far.opacity }));
    // 地平线一线微光
    if (mg.visible) inner.push(rect(0, Math.round(horizon), Math.ceil(Wv), 2, { fill: mg.paintValue, 'fill-opacity': api.n(0.25 * mg.opacity) }));
    // 水面月光辉光柱
    if (mg.visible && hex(mg.paintValue) && glintAmt > 0) {
      const col = api.radial({
        key: 'om-col',
        cx: 0.5,
        cy: 0,
        r: 0.5,
        stops: [
          { offset: 0, color: mg.paintValue, opacity: 0.34 * glintAmt * mg.opacity },
          { offset: 0.5, color: mg.paintValue, opacity: 0.1 * glintAmt * mg.opacity },
          { offset: 1, color: mg.paintValue, opacity: 0 },
        ],
      });
      const crx = V * 0.2 * msize + V * 0.06;
      inner.push(rect(Math.round(mx - crx), Math.round(horizon), Math.round(crx * 2), Math.ceil(seaH + 4), { fill: col }));
    }

    // 月光碎影：逐层生成（每层两组，交替闪烁）
    const glints: string[][] = waves.map(() => ['', '']);
    {
      const segs: Array<Array<Array<[number, number, number]>>> = waves.map(() => [[], []]);
      waves.forEach((w, i) => {
        const nxt = waves[i + 1];
        const y0 = i === 0 ? horizon + 2 : w.y;
        const y1 = nxt ? nxt.y : Hv;
        const half = V * (0.012 + 0.16 * w.p) * (0.6 + msize * 0.4);
        const cnt = Math.round((6 + 30 * Math.sqrt(w.p + 0.02)) * glintAmt);
        for (let k = 0; k < 40; k++) {
          const g1 = rng();
          const g2 = rng();
          const g3 = rng();
          const g4 = rng();
          if (k >= cnt) continue;
          const off = (g1 + g2 - 1) * half; // 三角分布 → 中间密
          const len = V * (0.004 + 0.032 * w.p) * (0.35 + g3) * (1 - (Math.abs(off) / half) * 0.65);
          const y = y0 + (y1 - y0) * (i === 0 ? 0.05 + 0.9 * g4 : 0.05 + 0.55 * g4 * g4);
          segs[i][k % 2].push([mx + off - len / 2, y, len]);
        }
      });
      let total = 0;
      waves.forEach((_, i) =>
        [0, 1].forEach((s) => {
          const d = encDashes(segs[i][s]);
          if (total + d.length <= GLINT_CAP) {
            glints[i][s] = d;
            total += d.length;
          }
        }),
      );
    }
    const shimmer = swell ? api.keyframes('vw-om-sh', 'to{opacity:.25}') : '';
    const glintMarkup = (i: number, w: Wave): string => {
      if (!gl.visible) return '';
      let s = '';
      glints[i].forEach((d, k) => {
        if (d === '') return;
        const sw = f1(Math.max(1.2, V * (0.0012 + 0.0038 * w.p)));
        const p = `<path d="${d}" stroke-width="${sw}"${k === 1 ? ' stroke-opacity="0.55"' : ''}/>`;
        s += swell ? `<g style="animation:${shimmer} ${f1(1.6 + k * 0.9 + i * 0.13)}s ease-in-out -${f1(i * 0.37 + k * 0.8)}s infinite alternate">${p}</g>` : p;
      });
      return s === '' ? '' : `<g stroke="${gl.paintValue}" stroke-linecap="round" stroke-opacity="${api.n(0.72 * gl.opacity)}">${s}</g>`;
    };
    inner.push(glintMarkup(0, waves[0]));

    // 逐层：浪体 + 浪花 + 本层光斑
    waves.forEach((w, i) => {
      if (i === 0) return;
      const t = Math.pow(w.p, 0.75);
      const fillC = near.visible ? mix(far.paintValue, near.paintValue, t) : far.paintValue;
      const op = far.opacity + (near.opacity - far.opacity) * t;
      const body = `${w.d}V${bottom}H${Math.round(-pad)}z`;
      // 浪花描边直接画在浪体 path 上：两侧与底边都在画外，只有浪顶可见（省一份几何）
      const attrs: Record<string, string | number> = { fill: fillC, 'fill-opacity': op };
      if (crest.visible) {
        const lam = w.lam;
        Object.assign(attrs, {
          stroke: crest.paintValue,
          'stroke-width': f1(Math.max(1, w.a * 0.06 + 0.9)),
          'stroke-linecap': 'round',
          'stroke-opacity': api.n(crest.opacity * (0.22 + 0.2 * (1 - w.p))),
          'stroke-dasharray': `${f1(lam * 2.6)} ${f1(lam * 0.7)} ${f1(lam * 1.4)} ${f1(lam * 0.45)}`,
          'stroke-dashoffset': f1(lam * w.ph[2]),
        });
      }
      let layer = path(body, attrs);
      if (swell) {
        const amp = Math.max(2, Math.round(w.lam * 0.12));
        const bob = Math.max(1, Math.round(w.a * 0.35));
        // 名字带上数值：同页多张 SVG 的 <style> 共享全局命名空间
        const kf = api.keyframes(`vw-om-w${amp}-${bob}`, `from{transform:translate(-${amp}px,0)}to{transform:translate(${amp}px,${bob}px)}`);
        const dur = f1(9 - 5 * w.p);
        layer = `<g style="animation:${kf} ${dur}s ease-in-out -${f1(i * 1.7)}s infinite alternate">${layer}</g>`;
      }
      inner.push(layer + glintMarkup(i, w));
    });

    out.push(g({ transform: tf }, inner.join('')));
    return { body: out.join('') };
  },
};

export default def;
