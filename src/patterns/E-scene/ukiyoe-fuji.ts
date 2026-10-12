/**
 * 浮世绘山 —— E 风景 / 单幅构图（扁平浮世绘风）。
 *
 * 构图要点：米色和纸底 + 天顶四级「暈し」色带（同色、不透明度递减的四条带，纯色叠出阶梯过渡）；
 * 一座平顶雪冠的富士山居中：凹曲线山坡（上陡下缓）、山顶火口有小起伏，
 * 右侧半面是暗色山影（向下微弯的分界线），雪冠下缘是长短交错的雪舌，雪冠右侧再压一层淡影；
 * 一轮大日轮（位置可调，可半掩在山后）；若干层「霞」——两条错位叠合的圆头长带组成的扁平云带，
 * 一层在天顶色带上、其余横过山腰与山脚；最前是一道起伏的前景山丘。
 *
 * ⭐ 体积/节点策略：
 *   - 坐标系：短边 = 1000 的虚拟坐标，整体 `<g transform="scale(q)">` 放大；体积与分辨率解耦。
 *   - 山体 / 山影 / 雪冠各一条整数相对 path；雪冠淡影用 clipPath（`<use>` 引用雪冠 path，不重复数据）。
 *   - 云带：每层一条 path（圆头带 = h + 两个半圆弧），每段 ≈ 45B；层数 ≤ 5，体积恒定在 ~6KB 内。
 * 动画（仅预览，cfg.animate 且「云带漂移」打开）：每层云带以不同周期 / 相位左右缓慢往返（视差：近层幅度大）。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;

/**
 * 云带层位：相对「山顶 → 山脚」的高度比例（负值在山顶以上），以及是否画在山后。
 * 层数 n 取前 n 项（按重要度排序），渲染时再按纵向位置排序。
 */
const CLOUD_LEVELS = [
  { f: 0.62, behind: false },
  { f: -0.62, behind: true },
  { f: 0.9, behind: false },
  { f: 0.34, behind: false },
  { f: -0.18, behind: true },
];

interface Pt {
  x: number;
  y: number;
}

function enc(pts: Pt[]): string {
  let px = Math.round(pts[0].x);
  let py = Math.round(pts[0].y);
  let d = `M${px} ${py}l`;
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round(pts[i].x);
    const y = Math.round(pts[i].y);
    const dx = x - px;
    const dy = y - py;
    if (dx === 0 && dy === 0) continue;
    d += `${first || dx < 0 ? '' : ' '}${dx}${dy < 0 ? '' : ' '}${dy}`;
    first = false;
    px = x;
    py = y;
  }
  return `${d}z`;
}

const def: PatternDef = {
  id: 'ukiyoe-fuji',
  tones: ['light'],
  name: '浮世绘山',
  category: 'E-scene',
  description: '扁平浮世绘风的富士山：平顶雪冠、半面山影、大日轮与横过山腰的霞状云带，和纸底色配天顶靛蓝色带。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '和纸', role: 'bg', paint: { type: 'solid', color: '#ede1c6' }, opacity: 1, visible: true, configurable: true },
    { id: 'sky_band', label: '天顶色带', role: 'detail', paint: { type: 'solid', color: '#3d5d78' }, opacity: 1, visible: true, configurable: true },
    { id: 'sun', label: '日轮', role: 'accent', paint: { type: 'solid', color: '#c9583f' }, opacity: 1, visible: true, configurable: true },
    { id: 'mountain', label: '山体', role: 'primary', paint: { type: 'solid', color: '#46627a' }, opacity: 1, visible: true, configurable: true },
    { id: 'mountain_shade', label: '山影', role: 'secondary', paint: { type: 'solid', color: '#2e455b' }, opacity: 1, visible: true, configurable: true },
    { id: 'snow', label: '雪冠', role: 'accent', paint: { type: 'solid', color: '#f6f1e6' }, opacity: 1, visible: true, configurable: true },
    { id: 'cloud', label: '霞云', role: 'detail', paint: { type: 'solid', color: '#f7efdc' }, opacity: 1, visible: true, configurable: true },
    { id: 'hills', label: '前景山丘', role: 'primary', paint: { type: 'solid', color: '#4c6656' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cloudLayers', label: '云带层数', type: 'range', min: 1, max: 5, step: 1, default: 3 },
    { key: 'sunPos', label: '日轮位置', type: 'range', min: 0, max: 1, step: 0.01, default: 0.74 },
    { key: 'sunSize', label: '日轮大小', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: 'snowLine', label: '雪线', type: 'range', min: 0.18, max: 0.5, step: 0.01, default: 0.3 },
    { key: 'drift', label: '云带漂移', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'hokusai',
      label: '北斋蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#ede1c6' } },
        sky_band: { paint: { type: 'solid', color: '#3d5d78' } },
        sun: { paint: { type: 'solid', color: '#c9583f' } },
        mountain: { paint: { type: 'solid', color: '#46627a' } },
        mountain_shade: { paint: { type: 'solid', color: '#2e455b' } },
        snow: { paint: { type: 'solid', color: '#f6f1e6' } },
        cloud: { paint: { type: 'solid', color: '#f7efdc' } },
        hills: { paint: { type: 'solid', color: '#4c6656' } },
      },
    },
    {
      id: 'red-fuji',
      label: '赤富士',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9dcc0' } },
        sky_band: { paint: { type: 'solid', color: '#36557a' } },
        sun: { paint: { type: 'solid', color: '#e2b04f' } },
        mountain: { paint: { type: 'solid', color: '#a8493a' } },
        mountain_shade: { paint: { type: 'solid', color: '#7c3329' } },
        snow: { paint: { type: 'solid', color: '#f4eee2' } },
        cloud: { paint: { type: 'solid', color: '#f5ecd8' } },
        hills: { paint: { type: 'solid', color: '#3f5a4a' } },
      },
      params: { sunPos: 0.22 },
    },
    {
      id: 'dusk',
      label: '暮霭',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8c9a8' } },
        sky_band: { paint: { type: 'solid', color: '#6a5577' } },
        sun: { paint: { type: 'solid', color: '#d9704f' } },
        mountain: { paint: { type: 'solid', color: '#5e5a78' } },
        mountain_shade: { paint: { type: 'solid', color: '#433f5c' } },
        snow: { paint: { type: 'solid', color: '#f5ead9' } },
        cloud: { paint: { type: 'solid', color: '#f3dcc0' } },
        hills: { paint: { type: 'solid', color: '#3b3a52' } },
      },
      params: { sunPos: 0.5, cloudLayers: 4 },
    },
    {
      id: 'moon-night',
      label: '月夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f2c40' } },
        sky_band: { paint: { type: 'solid', color: '#121b2a' } },
        sun: { paint: { type: 'solid', color: '#efe3bf' } },
        mountain: { paint: { type: 'solid', color: '#34506a' } },
        mountain_shade: { paint: { type: 'solid', color: '#263c52' } },
        snow: { paint: { type: 'solid', color: '#dfe6ec' } },
        cloud: { paint: { type: 'solid', color: '#3c5068' } },
        hills: { paint: { type: 'solid', color: '#16212f' } },
      },
      params: { sunPos: 0.18, sunSize: 0.7 },
    },
    {
      id: 'matcha',
      label: '抹茶',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4e2cc' } },
        sky_band: { paint: { type: 'solid', color: '#7f9a7a' } },
        sun: { paint: { type: 'solid', color: '#d48a5a' } },
        mountain: { paint: { type: 'solid', color: '#6f8a83' } },
        mountain_shade: { paint: { type: 'solid', color: '#506b65' } },
        snow: { paint: { type: 'solid', color: '#f7f5ea' } },
        cloud: { paint: { type: 'solid', color: '#f4f2e2' } },
        hills: { paint: { type: 'solid', color: '#46604f' } },
      },
      params: { cloudLayers: 2 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['mountain', 'hills'],
    secondary: ['mountain_shade'],
    accent: ['sun', 'snow'],
    detail: ['sky_band', 'cloud'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate, seed } = cfg;
    const num = (k: string, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number(params[k])));
    const layers = Math.round(num('cloudLayers', 1, 5));
    const sunPos = num('sunPos', 0, 1);
    const sunSize = num('sunSize', 0.3, 2);
    const snowLine = num('snowLine', 0.1, 0.7);
    const drifting = animate && params.drift === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const S = Math.min(Hv, V * 1.2);
    const B = Math.ceil(Hv) + 2;
    const r0 = Math.round;
    const op = (v: number): string => api.n(Math.max(0, Math.min(1, v)));
    const fill = (id: string, extra = 1): Record<string, string | number> => {
      const e = elements.get(id)!;
      return { fill: e.paintValue, 'fill-opacity': op(e.opacity * extra) };
    };

    const bg = elements.get('bg')!;
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';

    // ── 天顶暈し：同色四级带 ───────────────────────────
    if (elements.get('sky_band')!.visible) {
      [
        [0.08, 1],
        [0.13, 0.6],
        [0.18, 0.32],
        [0.23, 0.14],
      ].forEach(([f, o]) => {
        inner += path(`M0 0H${Math.ceil(Wv)}V${r0(Hv * f)}H0z`, fill('sky_band', o));
      });
    }

    // ── 山体几何 ────────────────────────────────────
    const cx = Wv * (0.5 + (rng() - 0.5) * 0.06);
    const topY = Hv - S * 0.64;
    const baseY = Hv - S * 0.02;
    const hw = Math.min(S * 0.98, Wv * 0.64);
    const pw = S * 0.065; // 火口半宽
    const N = 14;
    /** 山坡 x 偏移（t：0 = 山顶，1 = 山脚）：上陡下缓的凹曲线。 */
    const off = (t: number): number => pw + (hw - pw) * Math.pow(t, 1.75);
    const yAt = (t: number): number => topY + (baseY - topY) * t;
    // 火口小起伏
    const crater: Pt[] = [];
    const bumps = 4;
    for (let i = 1; i < bumps * 2; i++) {
      const x = cx - pw + (pw * 2 * i) / (bumps * 2);
      crater.push({ x, y: topY + (i % 2 === 1 ? -S * (0.004 + rng() * 0.008) : S * (0.004 + rng() * 0.005)) });
    }
    const left: Pt[] = [];
    const right: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const jl = i > 0 && i < N ? (rng() - 0.5) * S * 0.006 : 0;
      const jr = i > 0 && i < N ? (rng() - 0.5) * S * 0.006 : 0;
      left.push({ x: cx - off(t) + jl, y: yAt(t) });
      right.push({ x: cx + off(t) + jr, y: yAt(t) });
    }
    const mountainPts: Pt[] = [{ x: cx - hw, y: B }, ...left.slice().reverse(), ...crater, ...right, { x: cx + hw, y: B }];
    const mountainD = enc(mountainPts);

    // 山影：右半面，分界线自火口右侧向下微弯到山脚偏右
    const shadePts: Pt[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      shadePts.push({ x: cx + pw * 0.35 + hw * 0.22 * Math.pow(t, 1.3) + Math.sin(t * Math.PI) * hw * 0.05, y: yAt(t) });
    }
    const shadeD = enc([...shadePts, { x: shadePts[N].x, y: B }, { x: cx + hw, y: B }, ...right.slice().reverse(), ...crater.filter((p) => p.x > shadePts[0].x)]);

    // 雪冠：沿两侧山坡下到雪线，下缘长短交错的雪舌
    const ts = snowLine;
    const ki = Math.max(1, Math.round(ts * N));
    const ys = yAt(ts);
    const xl = cx - off(ts);
    const xr = cx + off(ts);
    const fingers = 8;
    const tongue: Pt[] = [];
    const span = (xr - xl) / (fingers * 2);
    for (let i = 0; i <= fingers * 2; i++) {
      const u = i / (fingers * 2);
      const jitter = i > 0 && i < fingers * 2 ? (rng() - 0.5) * span * 0.7 : 0;
      const x = xl + (xr - xl) * u + jitter;
      // 中部雪舌更长、长短差异大；奇数点为舌尖、偶数点为舌根
      const mid = 1 - Math.abs(u - 0.5) * 1.3;
      const y = i % 2 === 1 ? ys + S * (0.015 + Math.pow(rng(), 1.6) * 0.13) * (0.45 + mid) : ys - S * (0.004 + rng() * 0.018);
      tongue.push({ x, y });
    }
    const snowPts: Pt[] = [
      ...left.slice(0, ki).reverse(),
      ...crater,
      ...right.slice(0, ki),
      { x: xr, y: ys },
      ...tongue.slice(1, -1).reverse(),
      { x: xl, y: ys },
    ];
    const snowD = enc(snowPts);

    // ── 日轮 ──────────────────────────────────────
    const sr = S * 0.12 * sunSize;
    const sx = Wv * (0.1 + sunPos * 0.8);
    const sy = Math.max(sr + Hv * 0.06, topY - S * 0.06 - Math.sin(sunPos * Math.PI) * S * 0.08 + Math.abs(sunPos - 0.5) * S * 0.12);

    // ── 霞云带 ─────────────────────────────────────
    interface Band {
      y: number;
      behind: boolean;
      d: string;
      amp: number;
    }
    const bands: Band[] = CLOUD_LEVELS.slice(0, layers).map((L, li) => {
      const y = L.f < 0 ? Math.max(Hv * 0.07, topY + (topY - Hv * 0.1) * L.f * 0.9) : topY + (baseY - topY) * L.f * 0.88;
      const h = S * (0.036 + rng() * 0.014) * (L.f > 0.7 ? 1.2 : 1);
      // 每层 2~3 簇，每簇 = 上短下长两条错位圆头带
      const groups = 2 + Math.floor(rng() * 2);
      let d = '';
      for (let g = 0; g < groups; g++) {
        const gx = Wv * ((g + 0.15 + rng() * 0.7) / groups) - Wv * 0.08;
        const lenA = Math.min(Wv * 0.3, V * (0.18 + rng() * 0.16));
        const lenB = lenA * (1.25 + rng() * 0.5);
        const ox = (rng() - 0.3) * lenA * 0.6;
        const strips = [
          { x: gx + ox, y: y - h * 0.62, len: lenA },
          { x: gx, y: y + h * 0.3, len: lenB },
        ];
        if (rng() < 0.5) strips.push({ x: gx + lenB * (0.3 + rng() * 0.4), y: y + h * 1.22, len: lenA * 0.7 });
        for (const s of strips) {
          const r = h / 2;
          const L2 = Math.max(1, r0(s.len - h));
          d += `M${r0(s.x + r)} ${r0(s.y - r)}h${L2}a${r0(r)} ${r0(r)} 0 0 1 0 ${r0(h)}h${-L2}a${r0(r)} ${r0(r)} 0 0 1 0 ${-r0(h)}z`;
        }
      }
      return { y, behind: L.behind, d, amp: r0(V * (0.02 + 0.012 * li)) };
    });
    bands.sort((a, b) => a.y - b.y);
    const cloud = elements.get('cloud')!;
    const bandMk = (b: Band, i: number): string => {
      if (!cloud.visible) return '';
      if (!drifting) return path(b.d, fill('cloud'));
      const name = api.keyframes(`vw-ukdrift-${b.amp}`, `from{transform:translateX(-${b.amp}px)}to{transform:translateX(${b.amp}px)}`);
      const dur = 19 + i * 6;
      return `<path d="${b.d}" fill="${cloud.paintValue}" fill-opacity="${op(cloud.opacity)}" style="animation:${name} ${dur}s ease-in-out -${r0(dur * (0.3 + 0.17 * i))}s infinite alternate"/>`;
    };

    // ── 绘制顺序：日轮 → 山后云 → 山体 / 山影 / 雪冠 → 山前云 → 前景山丘 → 最近一层云 ──
    if (elements.get('sun')!.visible) inner += `<circle cx="${r0(sx)}" cy="${r0(sy)}" r="${r0(sr)}" ${attrs(fill('sun'))}/>`;
    bands.forEach((b, i) => {
      if (b.behind) inner += bandMk(b, i);
    });
    if (elements.get('mountain')!.visible) inner += path(mountainD, fill('mountain'));
    if (elements.get('mountain_shade')!.visible) inner += path(shadeD, fill('mountain_shade'));
    const snow = elements.get('snow')!;
    if (snow.visible) {
      const sid = `uk${seed}s`;
      inner += `<path id="${sid}" d="${snowD}" ${attrs(fill('snow'))}/>`;
      const shade = elements.get('mountain_shade')!;
      if (shade.visible) {
        const clip = api.clip(`uk${seed}c`, `<use href="#${sid}"/>`);
        inner += path(shadeD, { fill: shade.paintValue, 'fill-opacity': op(shade.opacity * 0.16), 'clip-path': clip });
      }
    }
    const front = bands.filter((b) => !b.behind);
    const nearest = front.length > 1 ? front[front.length - 1] : null;
    bands.forEach((b, i) => {
      if (!b.behind && b !== nearest) inner += bandMk(b, i);
    });

    // 前景山丘：一道缓缓起伏的实色山脊
    const hills = elements.get('hills')!;
    if (hills.visible) {
      const ridge = (yBase: number, amp: number, waves: number): string => {
        const seg = Wv / waves;
        let d = `M0 ${B}V${r0(yBase + (rng() - 0.5) * amp)}`;
        for (let i = 0; i < waves; i++) {
          const x1 = seg * (i + 0.5);
          const x2 = seg * (i + 1);
          d += `Q${r0(x1)} ${r0(yBase - amp * (0.4 + rng() * 0.8))} ${r0(x2 + 1)} ${r0(yBase + (rng() - 0.5) * amp)}`;
        }
        return `${d}V${B}z`;
      };
      inner += path(ridge(Hv - S * 0.08, S * 0.05, 3), fill('hills'));
    }
    if (nearest) inner += bandMk(nearest, bands.indexOf(nearest));

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

function attrs(a: Record<string, string | number>): string {
  return Object.keys(a)
    .map((k) => `${k}="${a[k]}"`)
    .join(' ');
}

export default def;
