/**
 * 热气球 —— E 风景 / 单幅构图。
 *
 * 构图要点：柔和天空 + 底部远山；条纹热气球分 3 个深度层（远小、中、近大），
 * 远层之后叠一层与天色同色的半透明「空气透视」薄幕 → 远处气球和远云自然褪色；
 * 气球为经典倒水滴外形，竖向气囊瓣按 sin(θ) 分布（越靠边越窄 → 立体感），
 * 右侧压一层淡影，下沿裙边换色，吊绳 + 吊篮；平底扁云分远近两色。
 *
 * ⭐ 体积/节点策略：
 *   - 坐标系：短边 = 1000 的虚拟坐标，整体 `<g transform="scale(q)">` 放大；体积与分辨率解耦。
 *   - 4 款气球样式（不同瓣数 / 配色轮换 / 赤道色带款）各在 `<defs>` 里定义一次（单位高 100 的整数坐标），
 *     每只气球只是一个 `<use transform="translate scale">` ≈ 60B → 数量对体积几乎无影响。
 *   - 云：圆弧串成的平底云，每朵一个子路径，远 / 近各一条 path。
 * 动画（仅预览，cfg.animate 且「缓缓上飘」打开）：每个深度层整体匀速上升（近快远慢），
 * 层内容在下方用 `<use>` 补一份，周期 = 屏高 + 余量，循环无缝。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;

/** 气囊外形：单位高 100，(y, 半宽)。顶部圆、下部收成口。 */
const PROFILE: Array<[number, number]> = [
  [0, 0],
  [2, 15],
  [6, 25],
  [12, 33],
  [20, 39],
  [30, 42],
  [40, 42.5],
  [50, 41],
  [60, 37],
  [70, 30.5],
  [79, 23],
  [87, 15.5],
  [93, 11],
  [96, 10],
];
const SKIRT_Y = 84;

/** 深度层：气球高（相对短边）范围、数量占比、上升一屏的周期（秒）。 */
const DEPTHS = [
  { hMin: 0.055, hMax: 0.085, share: 0.45, dur: 150 },
  { hMin: 0.12, hMax: 0.17, share: 0.35, dur: 105 },
  { hMin: 0.23, hMax: 0.31, share: 0.2, dur: 72 },
];

const hwAt = (y: number): number => {
  for (let i = 1; i < PROFILE.length; i++) {
    if (y <= PROFILE[i][0]) {
      const [y0, w0] = PROFILE[i - 1];
      const [y1, w1] = PROFILE[i];
      return w0 + ((w1 - w0) * (y - y0)) / (y1 - y0);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
};

const f1 = (v: number): string => {
  const r = Math.round(v);
  return Object.is(r, -0) ? '0' : String(r);
};

/** 子午线 u ∈ [-1,1] 与 v 之间的瓣（多边形，自顶向下再折回）。 */
function gore(u1: number, u2: number, yFrom = 0, yTo = 96): string {
  const ys = PROFILE.map((p) => p[0]).filter((y) => y > yFrom && y < yTo);
  const pts: Array<[number, number]> = [];
  const col = [yFrom, ...ys, yTo];
  col.forEach((y) => pts.push([u1 * hwAt(y), y]));
  col
    .slice()
    .reverse()
    .forEach((y) => pts.push([u2 * hwAt(y), y]));
  return `M${pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join(' ')}z`;
}

/** 横向色带：y0..y1 之间的整宽环带。 */
const band = (y0: number, y1: number): string => gore(-1, 1, y0, y1);

const def: PatternDef = {
  id: 'hot-air-balloons',
  name: '热气球',
  category: 'E-scene',
  description: '柔和天空里大小不一的条纹热气球，远小近大，远处被薄雾淡化，配平底软云与远山。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天空', role: 'bg', paint: { type: 'solid', color: '#d6e5e9' }, opacity: 1, visible: true, configurable: true },
    { id: 'land', label: '远山', role: 'detail', paint: { type: 'solid', color: '#b3cac1' }, opacity: 1, visible: true, configurable: true },
    { id: 'cloud_far', label: '云 · 远', role: 'detail', paint: { type: 'solid', color: '#eaf2f3' }, opacity: 1, visible: true, configurable: true },
    { id: 'cloud', label: '云 · 近', role: 'secondary', paint: { type: 'solid', color: '#fbfdfd' }, opacity: 1, visible: true, configurable: true },
    { id: 'balloon_a', label: '气球 · 主色', role: 'primary', paint: { type: 'solid', color: '#d27f68' }, opacity: 1, visible: true, configurable: true },
    { id: 'balloon_b', label: '气球 · 条纹', role: 'secondary', paint: { type: 'solid', color: '#f0d4a4' }, opacity: 1, visible: true, configurable: true },
    { id: 'balloon_c', label: '气球 · 点缀', role: 'accent', paint: { type: 'solid', color: '#6f9e93' }, opacity: 1, visible: true, configurable: true },
    { id: 'basket', label: '吊篮与暗面', role: 'detail', paint: { type: 'solid', color: '#57463d' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '气球数量', type: 'range', min: 3, max: 18, step: 1, default: 9 },
    { key: 'size', label: '气球大小', type: 'range', min: 0.7, max: 1.4, step: 0.05, default: 1 },
    { key: 'clouds', label: '云量', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'haze', label: '空气透视', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'rising', label: '缓缓上飘', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'morning',
      label: '晨空',
      elements: {
        bg: { paint: { type: 'solid', color: '#d6e5e9' } },
        land: { paint: { type: 'solid', color: '#b3cac1' } },
        cloud_far: { paint: { type: 'solid', color: '#eaf2f3' } },
        cloud: { paint: { type: 'solid', color: '#fbfdfd' } },
        balloon_a: { paint: { type: 'solid', color: '#d27f68' } },
        balloon_b: { paint: { type: 'solid', color: '#f0d4a4' } },
        balloon_c: { paint: { type: 'solid', color: '#6f9e93' } },
        basket: { paint: { type: 'solid', color: '#57463d' } },
      },
    },
    {
      id: 'sunset',
      label: '落日',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1cfb0' } },
        land: { paint: { type: 'solid', color: '#c99d8e' } },
        cloud_far: { paint: { type: 'solid', color: '#f6dec8' } },
        cloud: { paint: { type: 'solid', color: '#fff3e8' } },
        balloon_a: { paint: { type: 'solid', color: '#b65a4b' } },
        balloon_b: { paint: { type: 'solid', color: '#f4e3c3' } },
        balloon_c: { paint: { type: 'solid', color: '#5f7f8c' } },
        basket: { paint: { type: 'solid', color: '#4a3530' } },
      },
    },
    {
      id: 'vintage',
      label: '复古',
      elements: {
        bg: { paint: { type: 'solid', color: '#eee5d1' } },
        land: { paint: { type: 'solid', color: '#cfc3a5' } },
        cloud_far: { paint: { type: 'solid', color: '#f5efe2' } },
        cloud: { paint: { type: 'solid', color: '#fbf8f0' } },
        balloon_a: { paint: { type: 'solid', color: '#b4553e' } },
        balloon_b: { paint: { type: 'solid', color: '#e8c36b' } },
        balloon_c: { paint: { type: 'solid', color: '#2f6d70' } },
        basket: { paint: { type: 'solid', color: '#4b3b2f' } },
      },
      params: { count: 7 },
    },
    {
      id: 'lavender',
      label: '薰衣草',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4e0ee' } },
        land: { paint: { type: 'solid', color: '#c3bdd6' } },
        cloud_far: { paint: { type: 'solid', color: '#efedf5' } },
        cloud: { paint: { type: 'solid', color: '#fbfaff' } },
        balloon_a: { paint: { type: 'solid', color: '#8b7bb5' } },
        balloon_b: { paint: { type: 'solid', color: '#f3dfe6' } },
        balloon_c: { paint: { type: 'solid', color: '#e2a49a' } },
        basket: { paint: { type: 'solid', color: '#4c4258' } },
      },
    },
    {
      id: 'dusk-blue',
      label: '暮蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#3a4a6e' } },
        land: { paint: { type: 'solid', color: '#2b3858' } },
        cloud_far: { paint: { type: 'solid', color: '#4d5d82' } },
        cloud: { paint: { type: 'solid', color: '#66769a' } },
        balloon_a: { paint: { type: 'solid', color: '#df8f6d' } },
        balloon_b: { paint: { type: 'solid', color: '#f2d7a7' } },
        balloon_c: { paint: { type: 'solid', color: '#8fb3ae' } },
        basket: { paint: { type: 'solid', color: '#1c2236' } },
      },
      params: { haze: 0.35 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['balloon_a'],
    secondary: ['balloon_b', 'cloud'],
    accent: ['balloon_c'],
    detail: ['basket', 'land', 'cloud_far'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate, seed } = cfg;
    const num = (k: string, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number(params[k])));
    const count = Math.round(num('count', 1, 30));
    const sizeK = num('size', 0.3, 3);
    const cloudAmt = num('clouds', 0, 1);
    const haze = num('haze', 0, 1);
    const rising = animate && params.rising === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const r0 = Math.round;
    const op = (v: number): string => api.n(Math.max(0, Math.min(1, v)));
    const el = (id: string) => elements.get(id)!;
    const paint = (id: string): string => el(id).paintValue;
    const fo = (id: string, k = 1): string => op(el(id).opacity * k);

    const bg = el('bg');
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';

    // ── 4 款气球样式（defs，单位高 100）──────────────────
    const A = 'balloon_a';
    const Bc = 'balloon_b';
    const C = 'balloon_c';
    const vis = (id: string): boolean => el(id).visible;
    const P = (d: string, id: string, k = 1): string => (vis(id) ? `<path d="${d}" fill="${paint(id)}" fill-opacity="${fo(id, k)}"/>` : '');
    const stripes = (n: number): string => {
      let d = '';
      for (let i = 1; i < n; i += 2) {
        const t1 = -Math.PI / 2 + (Math.PI * i) / n;
        const t2 = -Math.PI / 2 + (Math.PI * (i + 1)) / n;
        d += gore(Math.sin(t1), Math.sin(t2));
      }
      return d;
    };
    const envelope = gore(-1, 1);
    const skirt = band(SKIRT_Y, 96);
    const shade = gore(0.42, 1);
    const basketMk = vis('basket')
      ? `<path d="M-10 96L-6 106M10 96L6 106" fill="none" stroke="${paint('basket')}" stroke-opacity="${fo('basket')}" stroke-width="1.2"/>` +
        `<rect x="-7" y="105" width="14" height="10" rx="2" fill="${paint('basket')}" fill-opacity="${fo('basket')}"/>`
      : '';
    const shadeMk = P(shade, 'basket', 0.16);
    const styles: string[] = [
      P(envelope, A) + P(stripes(8), Bc) + P(skirt, C),
      P(envelope, Bc) + P(stripes(6), C) + P(skirt, A),
      P(envelope, C) + P(stripes(10), A) + P(skirt, Bc),
      P(envelope, A) + P(band(36, 52), Bc) + P(band(0, 13), C) + P(skirt, C),
    ].map((s) => s + shadeMk + basketMk);
    const sid = (k: number): string => `hb${seed}t${k}`;
    inner += `<defs>${styles.map((s, k) => `<g id="${sid(k)}">${s}</g>`).join('')}</defs>`;

    // ── 远山（两道缓坡）──────────────────────────────
    const B = Math.ceil(Hv) + 2;
    const landD = (yBase: number, amp: number, waves: number): string => {
      const seg = Wv / waves;
      let d = `M0 ${B}V${r0(yBase)}`;
      for (let i = 0; i < waves; i++) {
        d += `Q${r0(seg * (i + 0.5))} ${r0(yBase - amp * (0.3 + rng() * 0.9))} ${r0(seg * (i + 1) + 1)} ${r0(yBase + (rng() - 0.5) * amp * 0.6)}`;
      }
      return `${d}V${B}z`;
    };
    const landFar = landD(Hv - V * 0.1, V * 0.05, 3);
    const landNear = landD(Hv - V * 0.045, V * 0.035, 4);

    // ── 云（平底：沿顶部串圆弧）───────────────────────
    const cloudD = (n: number, wMin: number, wMax: number): string => {
      let d = '';
      for (let i = 0; i < n; i++) {
        const w = V * (wMin + rng() * (wMax - wMin));
        const x0 = rng() * (Wv + w) - w;
        const y0 = Hv * (0.15 + rng() * 0.75);
        const bumps = 3 + Math.floor(rng() * 3);
        const seg = w / bumps;
        d += `M${r0(x0)} ${r0(y0)}`;
        let py = y0;
        for (let k = 0; k < bumps; k++) {
          const mid = 1 - Math.abs((k + 0.5) / bumps - 0.5) * 1.6;
          const ny = k === bumps - 1 ? y0 : y0 - seg * (0.15 + rng() * 0.35) * (0.4 + mid);
          const rr = r0(seg * (0.55 + rng() * 0.15));
          d += `a${rr} ${rr} 0 0 1 ${r0(seg)} ${r0(ny - py)}`;
          py = ny;
        }
        d += 'z';
      }
      return d;
    };
    const area = (Wv * Hv) / (V * V);
    const nFar = Math.round(cloudAmt * 5 * area);
    const nNear = Math.round(cloudAmt * 2.2 * area);
    const farClouds = nFar > 0 ? cloudD(nFar, 0.12, 0.24) : '';
    const nearClouds = nNear > 0 ? cloudD(nNear, 0.25, 0.42) : '';

    // ── 气球布局：逐层拒绝采样，避免同层重叠 ─────────────
    interface Bal {
      x: number;
      y: number;
      s: number;
      style: number;
    }
    const placed: Array<{ x: number; y: number; r: number }> = [];
    const layers: Bal[][] = DEPTHS.map((D, li) => {
      const n = li === 2 ? Math.max(1, Math.round(count * D.share)) : Math.round(count * D.share);
      const out: Bal[] = [];
      for (let i = 0; i < n; i++) {
        const h = V * (D.hMin + rng() * (D.hMax - D.hMin)) * sizeK;
        const style = Math.floor(rng() * 4) % 4;
        let best: { x: number; y: number } | null = null;
        let bestGap = -Infinity;
        for (let t = 0; t < 24; t++) {
          const x = Wv * (0.05 + rng() * 0.9);
          const y = Hv * 0.05 + rng() * Math.max(1, Hv * 0.8 - h * 1.15);
          let gap = Infinity;
          for (const p of placed) gap = Math.min(gap, Math.hypot(p.x - x, (p.y - y) * 1.2) - p.r - h * 0.5);
          if (gap > bestGap) {
            bestGap = gap;
            best = { x, y };
          }
          if (gap > h * 0.5) break;
        }
        placed.push({ x: best!.x, y: best!.y + h * 0.5, r: h * 0.5 });
        out.push({ x: best!.x, y: best!.y, s: h / 115, style });
      }
      return out;
    });

    // ── 输出 ─────────────────────────────────────────
    const riseName = (P2: number): string => api.keyframes(`vw-hbrise-${P2}`, `to{transform:translateY(-${P2}px)}`);
    const layerMk = (li: number): string => {
      const bals = layers[li];
      if (bals.length === 0) return '';
      const content = bals
        .map((b) => `<use href="#${sid(b.style)}" transform="translate(${r0(b.x)} ${r0(b.y)})scale(${api.n(b.s)})"/>`)
        .join('');
      if (!rising) return content;
      const P2 = r0(Hv + V * DEPTHS[li].hMax * sizeK * 1.4);
      const id = `hb${seed}l${li}`;
      return `<g style="animation:${riseName(P2)} ${DEPTHS[li].dur}s linear -${r0(DEPTHS[li].dur * (0.2 + 0.3 * li))}s infinite"><g id="${id}">${content}</g><use href="#${id}" y="${P2}"/></g>`;
    };

    if (vis('land')) inner += path(landFar, { fill: paint('land'), 'fill-opacity': fo('land', 0.6) });
    if (vis('cloud_far') && farClouds !== '') inner += path(farClouds, { fill: paint('cloud_far'), 'fill-opacity': fo('cloud_far') });
    inner += layerMk(0);
    // 空气透视薄幕：与天色同色，远层之上
    if (haze > 0) inner += `<rect width="${Math.ceil(Wv)}" height="${B}" fill="${bg.paintValue}" fill-opacity="${op(haze * 0.5)}"/>`;
    if (vis('land')) inner += path(landNear, { fill: paint('land'), 'fill-opacity': fo('land') });
    inner += layerMk(1);
    inner += layerMk(2);
    if (vis('cloud') && nearClouds !== '') inner += path(nearClouds, { fill: paint('cloud'), 'fill-opacity': fo('cloud', 0.92) });

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
