/**
 * 欧普波格 —— I 光学错觉（Op Art）。
 *
 * 一张黑白（可配色）棋盘 / 条纹，被一个平滑的形变场推挤：
 *   - bulge 鼓起：中心格子被放大、四周被压扁，像棋盘下顶着一颗球（Vasarely 式）；
 *   - pinch 凹陷：反过来，中心收缩成漏斗；
 *   - wave  波动：横竖线各自按正弦起伏，整张网像被风吹动的布；
 *   - twin  双核：一侧鼓起、一侧凹陷，形成起伏的地形感。
 * 核心区（以场中心为圆心）的深色格子换成强调色，进一步强化体积。
 *
 * ⭐ 体积策略：
 *   - 棋盘 = 横向色带 + 纵向色带放进**同一条** path、`fill-rule="evenodd"`：
 *     两条色带重叠处被抵消 → 天然得到棋盘格，体积只等于「横线 + 竖线」而不是「格子数」；
 *   - 每条形变线按长度自适应采样，虚拟坐标（短边 = 1000）取整、相对 `l` 指令；
 *   - 墨色只写一次（body 内 `<defs><path id>`），主色与核心强调色各 `<use>` 一次，强调色用圆形裁剪。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { glowFill, hashStr, numParam } from './_helpers';

const V = 1000;
/** 每条线的初始采样间距（虚拟单位）；路径超出 PATH_CAP 时逐步放宽。 */
const SAMPLE = 44;
/** 墨色 path 数据字节上限（整张 SVG < 20KB 的余量）。 */
const PATH_CAP = 14500;

type Vec = [number, number];

const def: PatternDef = {
  id: 'op-wave-grid',
  name: '欧普波格',
  category: 'I-optical',
  description: '棋盘或条纹被平滑形变场推挤，鼓起、凹陷或起伏，平面上浮出立体的欧普艺术错觉。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '浅格', role: 'bg', paint: { type: 'solid', color: '#ece6da' }, opacity: 1, visible: true, configurable: true },
    { id: 'ink', label: '深格', role: 'primary', paint: { type: 'solid', color: '#2b2d33' }, opacity: 1, visible: true, configurable: true },
    { id: 'core', label: '核心色', role: 'accent', paint: { type: 'solid', color: '#b5543c' }, opacity: 1, visible: true, configurable: true },
    { id: 'shade', label: '体积阴影', role: 'detail', paint: { type: 'solid', color: '#1a1b20' }, opacity: 0.35, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'field',
      label: '形变场',
      type: 'select',
      default: 'bulge',
      options: [
        { value: 'bulge', label: '鼓起' },
        { value: 'pinch', label: '凹陷' },
        { value: 'wave', label: '波动' },
        { value: 'twin', label: '双核' },
      ],
    },
    {
      key: 'mode',
      label: '纹样',
      type: 'select',
      default: 'checker',
      options: [
        { value: 'checker', label: '棋盘' },
        { value: 'stripes', label: '条纹' },
      ],
    },
    { key: 'cells', label: '格数（短边）', type: 'range', min: 8, max: 20, step: 1, default: 13, heavy: true },
    { key: 'strength', label: '形变强度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.7 },
    { key: 'core', label: '核心区大小', type: 'range', min: 0, max: 0.6, step: 0.02, default: 0.22 },
    { key: 'offset', label: '中心偏移', type: 'range', min: 0, max: 1, step: 0.05, default: 0.3 },
  ],

  presets: [
    {
      id: 'vega',
      label: '织女星',
      elements: {
        bg: { paint: { type: 'solid', color: '#ece6da' } },
        ink: { paint: { type: 'solid', color: '#2b2d33' } },
        core: { paint: { type: 'solid', color: '#b5543c' } },
        shade: { paint: { type: 'solid', color: '#1a1b20' }, opacity: 0.35 },
      },
    },
    {
      id: 'riley-current',
      label: '流',
      elements: {
        bg: { paint: { type: 'solid', color: '#f0ece4' } },
        ink: { paint: { type: 'solid', color: '#34465a' } },
        core: { paint: { type: 'solid', color: '#7d8fa3' } },
        shade: { paint: { type: 'solid', color: '#20242c' }, opacity: 0.2 },
      },
      params: { field: 'wave', mode: 'stripes', cells: 16, strength: 0.8, core: 0.3 },
    },
    {
      id: 'midnight-dome',
      label: '夜穹',
      elements: {
        bg: { paint: { type: 'solid', color: '#252b3a' } },
        ink: { paint: { type: 'solid', color: '#141822' } },
        core: { paint: { type: 'solid', color: '#c9a35f' } },
        shade: { paint: { type: 'solid', color: '#06080c' }, opacity: 0.5 },
      },
      params: { cells: 12, strength: 0.85, core: 0.26, offset: 0.5 },
    },
    {
      id: 'sage-terrain',
      label: '苔原',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe2d3' } },
        ink: { paint: { type: 'solid', color: '#56685a' } },
        core: { paint: { type: 'solid', color: '#a9784f' } },
        shade: { paint: { type: 'solid', color: '#2b3329' }, opacity: 0.3 },
      },
      params: { field: 'twin', cells: 14, strength: 0.75, core: 0.18, offset: 0.2 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['ink'], accent: ['core'], detail: ['shade'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const field = String(params.field);
    const checker = params.mode !== 'stripes';
    const cells = Math.round(numParam(params, 'cells', 8, 20));
    const strength = numParam(params, 'strength', 0, 1);
    const coreR = numParam(params, 'core', 0, 0.6);
    const offset = numParam(params, 'offset', 0, 1);

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const landscape = Wv >= Hv;
    const cs = V / cells;

    // 场中心：沿长边从正中向「黄金分割点」偏移
    const c1: Vec = landscape ? [Wv / 2 - offset * Wv * 0.18, Hv / 2] : [Wv / 2, Hv / 2 - offset * Hv * 0.18];
    const c2: Vec = landscape ? [Wv - c1[0], Hv / 2] : [Wv / 2, Hv - c1[1]];
    const R = V * 0.38; // 鼓包特征半径

    /** 径向形变：f(ρ) = ρ·(1 + k·e^(−ρ²/R²))；k < 2.2 时单调 → 线不会自交。 */
    const radial = (p: Vec, c: Vec, k: number, rr: number): Vec => {
      const dx = p[0] - c[0];
      const dy = p[1] - c[1];
      const s = 1 + k * Math.exp(-(dx * dx + dy * dy) / (rr * rr));
      return [c[0] + dx * s, c[1] + dy * s];
    };
    const lam = V * 0.9;
    const map = (p: Vec): Vec => {
      switch (field) {
        case 'pinch':
          return radial(p, c1, -0.85 * strength, R * 1.1);
        case 'wave': {
          const A = (lam / (2 * Math.PI)) * 0.8 * strength;
          return [p[0] + A * Math.sin((p[1] / lam) * 2 * Math.PI + 0.6), p[1] + A * 0.9 * Math.sin((p[0] / lam) * 2 * Math.PI)];
        }
        case 'twin':
          return radial(radial(p, c1, 1.5 * strength, R * 0.85), c2, -0.75 * strength, R * 0.8);
        default:
          return radial(p, c1, 1.9 * strength, R);
      }
    };

    // ── 源网格（未形变）：对齐场中心，四周留余量保证形变后仍盖满画面 ──
    const margin = cs * 2 + V * 0.1;
    const gx0 = c1[0] - Math.ceil((c1[0] + margin) / cs) * cs;
    const gy0 = c1[1] - Math.ceil((c1[1] + margin) / cs) * cs;
    const gx1 = Wv + margin;
    const gy1 = Hv + margin;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let x = gx0; x <= gx1 + cs; x += cs) xs.push(x);
    for (let y = gy0; y <= gy1 + cs; y += cs) ys.push(y);

    const r0 = Math.round;
    /** 一条形变线（从 a 采样到 b），返回取整后的点列。 */
    let sample = SAMPLE;
    const lineAlong = (a: Vec, b: Vec): Vec[] => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const k = Math.max(2, Math.ceil(len / sample));
      const pts: Vec[] = [];
      for (let i = 0; i <= k; i++) {
        const t = i / k;
        const m = map([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        pts.push([r0(m[0]), r0(m[1])]);
      }
      return pts;
    };
    /** 两条线围成的色带（正向 + 反向），用相对指令输出。 */
    const band = (top: Vec[], bottom: Vec[]): string => {
      const ring = [...top, ...bottom.slice().reverse()];
      let d = `M${ring[0][0]} ${ring[0][1]}`;
      let [px, py] = ring[0];
      let first = true;
      for (let i = 1; i < ring.length; i++) {
        const dx = ring[i][0] - px;
        const dy = ring[i][1] - py;
        if (dx === 0 && dy === 0) continue;
        d += `${first ? 'l' : dx < 0 ? '' : ' '}${dx}${dy < 0 ? '' : ' '}${dy}`;
        first = false;
        px = ring[i][0];
        py = ring[i][1];
      }
      return `${d}z`;
    };

    const build = (): string => {
      let out = '';
      // 横向色带：第 0-1、2-3 … 条横线之间
      for (let j = 0; j + 1 < ys.length; j += 2) {
        out += band(lineAlong([gx0, ys[j]], [gx1, ys[j]]), lineAlong([gx0, ys[j + 1]], [gx1, ys[j + 1]]));
      }
      if (checker) {
        for (let i = 0; i + 1 < xs.length; i += 2) {
          out += band(lineAlong([xs[i], gy0], [xs[i], gy1]), lineAlong([xs[i + 1], gy0], [xs[i + 1], gy1]));
        }
      }
      return out;
    };
    let d = build();
    for (let g = 0; g < 8 && d.length > PATH_CAP; g++) {
      sample *= 1.15;
      d = build();
    }

    const bg = elements.get('bg')!;
    const ink = elements.get('ink')!;
    const core = elements.get('core')!;
    const shade = elements.get('shade')!;
    const n = api.n;

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const pid = `ow${hashStr(d)}`;
    let inner = `<defs><path id="${pid}" d="${d}" fill-rule="evenodd"/></defs>`;
    if (ink.visible) inner += `<use href="#${pid}" fill="${ink.paintValue}" fill-opacity="${n(ink.opacity)}"/>`;
    if (core.visible && coreR > 0) {
      // 核心区：圆半径按形变后的尺度给（鼓起时更大）
      const cr = V * coreR * (field === 'bulge' || field === 'twin' ? 1 + strength * 0.6 : 1);
      const cc = field === 'wave' ? ([Wv / 2, Hv / 2] as Vec) : c1;
      const clip = api.clip(`ow${hashStr(`${r0(cc[0])}-${r0(cc[1])}-${r0(cr)}-${q}`)}`, `<circle cx="${r0(cc[0])}" cy="${r0(cc[1])}" r="${r0(cr)}"/>`);
      inner += `<use href="#${pid}" fill="${core.paintValue}" fill-opacity="${n(core.opacity)}" clip-path="${clip}"/>`;
    }
    parts.push(`<g transform="scale(${q})">${inner}</g>`);

    // ── 体积阴影：鼓包外缘压暗（中心透明 → 外圈渐暗），波动场改为整幅暗角 ──
    if (shade.visible) {
      if (shade.paintValue.startsWith('#')) {
        const cx = field === 'wave' ? 0.5 : c1[0] / Wv;
        const cy = field === 'wave' ? 0.5 : c1[1] / Hv;
        const g = api.radial({
          cx,
          cy,
          r: field === 'wave' ? 0.75 : 0.6,
          key: 'ow-shade',
          stops: [
            { offset: 0, color: shade.paintValue, opacity: 0 },
            { offset: 0.35, color: shade.paintValue, opacity: shade.opacity * 0.15 },
            { offset: 1, color: shade.paintValue, opacity: shade.opacity },
          ],
        });
        parts.push(rect(0, 0, W, H, { fill: g }));
      } else {
        const gf = glowFill(api, shade, { cx: 0.5, cy: 0.5, r: 0.7 }, 'ow-shade');
        parts.push(rect(0, 0, W, H, { fill: gf.fill, 'fill-opacity': gf.opacity }));
      }
    }
    return { body: parts.join('') };
  },
};

export default def;
