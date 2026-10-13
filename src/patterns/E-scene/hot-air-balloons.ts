/**
 * 热气球 —— E 风景 / 单幅构图。
 *
 * 构图要点：柔和天空 + 底部远山；条纹热气球分 3 个深度层（远小、中、近大），
 * 远层之后叠一层与天色同色的半透明「空气透视」薄幕 → 远处气球和远云自然褪色；
 * 气球为经典倒梨形：外形是三段三次贝塞尔（圆冠 → 收腰 → 窄口裙边），完全光滑；
 * 竖向气囊瓣的边界是同一条曲线按 x 缩放得到的弯曲子午线，按 sin(θ) 分布（越靠边越窄 → 立体感），
 * 瓣缝细线 + 一条径向渐变（左上高光、右下暗面）出球体感；下沿裙边换色，四根吊绳 + 梯形吊篮；
 * 平底扁云分远近两色。
 *
 * ⭐ 体积/节点策略：
 *   - 坐标系：短边 = 1000 的虚拟坐标，整体 `<g transform="scale(q)">` 放大；体积与分辨率解耦。
 *   - 4 款气球样式（不同瓣数 / 配色轮换 / 赤道色带款）各在 `<defs>` 里定义一次（单位高 100，一位小数），
 *     条纹/色带由共享 clipPath（气囊外形）裁齐，明暗共用一个 radialGradient；
 *     每只气球只是一个 `<use transform="translate scale">` ≈ 60B → 数量对体积几乎无影响。
 *   - 云：圆弧串成的平底云，每朵一个子路径，远 / 近各一条 path。
 * 动画（仅预览，cfg.animate 且「缓缓上飘」打开）：每个深度层整体匀速上升（近快远慢），
 * 层内容在下方用 `<use>` 补一份，周期 = 屏高 + 余量，循环无缝。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;

/**
 * 气囊外形（右半边）：单位高 100，三段三次贝塞尔，自顶点 (0,0) 起：
 *   冠部圆顶（顶点切线水平 → 赤道切线竖直）→ 倒梨形收腰 → 窄口裙边。
 * 子午线 u ∈ [-1,1] 就是把所有控制点的 x 乘 u —— x 方向线性缩放对贝塞尔精确成立，
 * 所以瓣的边界是真正贴着球面弯曲的曲线，而不是折线。
 */
type Pt = [number, number];
const OUTLINE: Array<[Pt, Pt, Pt]> = [
  [[24, 0], [43, 15], [43, 38]],
  [[43, 58], [30, 72], [15.5, 82.5]],
  [[12.5, 84.7], [10.8, 88.5], [10, 93]],
];
const NECK_Y = 93;
const SKIRT_Y = 84;

/** 曲线轮廓上 y 处的半宽（对贝塞尔逐段二分）。 */
const hwAt = (y: number): number => {
  let p0: Pt = [0, 0];
  for (const [c1, c2, p1] of OUTLINE) {
    if (y <= p1[1]) {
      let lo = 0;
      let hi = 1;
      const bz = (t: number, i: 0 | 1): number => {
        const m = 1 - t;
        return m * m * m * p0[i] + 3 * m * m * t * c1[i] + 3 * m * t * t * c2[i] + t * t * t * p1[i];
      };
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if (bz(mid, 1) < y) lo = mid;
        else hi = mid;
      }
      return bz((lo + hi) / 2, 0);
    }
    p0 = p1;
  }
  return OUTLINE[OUTLINE.length - 1][2][0];
};

/** 一位小数（defs 只定义一次，精度换平滑几乎不占体积）。 */
const g1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};
const pt = (x: number, y: number): string => `${g1(x)} ${g1(y)}`;

/** 子午线 u：自顶向下的 C 指令串（不含起点 M）。 */
const meridianDown = (u: number): string =>
  OUTLINE.map(([c1, c2, p1]) => `C${pt(c1[0] * u, c1[1])} ${pt(c2[0] * u, c2[1])} ${pt(p1[0] * u, p1[1])}`).join('');
/** 子午线 u：自底向上（逆序控制点）回到顶点。 */
const meridianUp = (u: number): string => {
  let d = '';
  for (let i = OUTLINE.length - 1; i >= 0; i--) {
    const [c1, c2] = OUTLINE[i];
    const p0: Pt = i === 0 ? [0, 0] : OUTLINE[i - 1][2];
    d += `C${pt(c2[0] * u, c2[1])} ${pt(c1[0] * u, c1[1])} ${pt(p0[0] * u, p0[1])}`;
  }
  return d;
};

/** 整个气囊外形（含裙边口，底边微弧）。 */
const ENVELOPE = `M0 0${meridianDown(1)}Q0 ${NECK_Y + 2.5} ${pt(-OUTLINE[2][2][0], NECK_Y)}${meridianUp(-1)}z`;

/** 子午线 u1、u2 之间的瓣（底部越过口沿，交给 clipPath 裁齐）。 */
const gore = (u1: number, u2: number): string =>
  `M0 0${meridianDown(u1)}L${pt(u1 * 12, 100)}L${pt(u2 * 12, 100)}L${pt(u2 * OUTLINE[2][2][0], NECK_Y)}${meridianUp(u2)}z`;

/** 横向色带 y0..y1：上下沿都是随半宽变化的微弧（纬线透视），整宽，交给 clipPath 裁。 */
const band = (y0: number, y1: number): string => {
  const c0 = hwAt(y0) * 0.16;
  const c1 = hwAt(y1) * 0.16;
  return `M-50 ${g1(y0)}Q0 ${g1(y0 + c0 * 2)} 50 ${g1(y0)}V${g1(y1)}Q0 ${g1(y1 + c1 * 2)} -50 ${g1(y1)}z`;
};
/** 裙边：从收口处一直到底（不做下沿弧，clip 裁）。 */
const skirtBand = (): string => {
  const c0 = hwAt(SKIRT_Y) * 0.16;
  return `M-50 ${g1(SKIRT_Y)}Q0 ${g1(SKIRT_Y + c0 * 2)} 50 ${g1(SKIRT_Y)}V101H-50z`;
};

/** 深度层：气球高（相对短边）范围、数量占比、上升一屏的周期（秒）。 */
const DEPTHS = [
  { hMin: 0.055, hMax: 0.085, share: 0.45, dur: 150 },
  { hMin: 0.12, hMax: 0.17, share: 0.35, dur: 105 },
  { hMin: 0.23, hMax: 0.31, share: 0.2, dur: 72 },
];

const def: PatternDef = {
  id: 'hot-air-balloons',
  tones: ['light'],
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
    /** 竖瓣：n 瓣里隔一瓣上色，边界按 sin(θ) 分布（越靠边越窄 → 球面透视）。 */
    const uOf = (i: number, n: number): number => Math.sin(-Math.PI / 2 + (Math.PI * i) / n);
    const stripes = (n: number): string => {
      let d = '';
      for (let i = 1; i < n; i += 2) d += gore(uOf(i, n), uOf(i + 1, n));
      return d;
    };
    /** 瓣缝（加强带）：所有内部子午线，细线。 */
    const seams = (n: number): string => {
      let d = '';
      for (let i = 1; i < n; i++) d += `M0 0${meridianDown(uOf(i, n))}`;
      return d;
    };
    const hexOr = (v: string, fb: string): string => (/^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fb);
    const ink = hexOr(paint('basket'), '#000000');
    const clipId = `hb${seed}c`;
    const gradId = `hb${seed}g`;
    // 立体明暗：一条径向渐变 —— 左上高光（白）→ 中间透明 → 右下暗面（吊篮色）。
    const shadeK = vis('basket') ? el('basket').opacity : 0;
    const grad =
      `<radialGradient id="${gradId}" cx="0.36" cy="0.3" r="0.78" fx="0.3" fy="0.24">` +
      `<stop offset="0" stop-color="#ffffff" stop-opacity="0.34"/>` +
      `<stop offset="0.3" stop-color="#ffffff" stop-opacity="0"/>` +
      `<stop offset="0.58" stop-color="${ink}" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="${ink}" stop-opacity="${op(0.42 * shadeK)}"/>` +
      `</radialGradient>`;
    const clip = `<clipPath id="${clipId}"><path d="${ENVELOPE}"/></clipPath>`;
    const shadeMk = `<path d="${ENVELOPE}" fill="url(#${gradId})"/>`;
    const seamMk = (n: number): string =>
      vis('basket') ? `<path d="${seams(n)}" fill="none" stroke="${paint('basket')}" stroke-opacity="${fo('basket', 0.14)}" stroke-width="0.35"/>` : '';
    // 吊绳（口沿 → 篮沿，四根）+ 吊篮（微梯形、圆角底、上沿一道亮边）
    const basketMk = vis('basket')
      ? `<path d="M-9.3 93.6L-5.2 104M-3.6 94.6L-2.2 104M3.6 94.6L2.2 104M9.3 93.6L5.2 104" fill="none" stroke="${paint('basket')}" stroke-opacity="${fo('basket', 0.85)}" stroke-width="0.55" stroke-linecap="round"/>` +
        `<path d="M-6.2 103.6H6.2L5.3 112.6Q5.1 114 3.8 114H-3.8Q-5.1 114 -5.3 112.6Z" fill="${paint('basket')}" fill-opacity="${fo('basket')}"/>` +
        `<path d="M-6.6 103.4H6.6V105.4H-6.6Z" fill="#ffffff" fill-opacity="0.18"/>`
      : '';
    const body = (base: string, rest: string, n: number): string =>
      `${P(ENVELOPE, base)}<g clip-path="url(#${clipId})">${rest}${seamMk(n)}</g>${shadeMk}`;
    const styles: string[] = [
      body(A, P(stripes(8), Bc) + P(skirtBand(), C), 16),
      body(Bc, P(stripes(6), C) + P(skirtBand(), A), 12),
      body(C, P(stripes(10), A) + P(skirtBand(), Bc), 20),
      body(A, P(band(36, 52), Bc) + P(band(0, 13), C) + P(skirtBand(), C), 14),
    ].map((s) => s + basketMk);
    const sid = (k: number): string => `hb${seed}t${k}`;
    inner += `<defs>${grad}${clip}${styles.map((s, k) => `<g id="${sid(k)}">${s}</g>`).join('')}</defs>`;

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
