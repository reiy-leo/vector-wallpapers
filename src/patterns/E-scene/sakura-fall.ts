/**
 * 樱花飘落 —— E 风景 / 单幅构图。
 *
 * 构图要点：一根樱枝从画面上角斜向伸入（主枝微曲带节疤式折角，逐级分出侧枝与细梢），
 * 枝上成簇开着五瓣樱花（凹口花瓣 + 深色花蕊）与圆形花苞；
 * 花分前后两层：后层花色更浅、略小，压在枝干下面；前层花压在枝干上面 → 有前后关系。
 * 背景是几颗很淡的大光斑；空中飘着大小、朝向、透视压扁程度各异的花瓣，
 * 分 3 个深度层：远小淡密 → 近大实疏，另有极少数「近焦」大花瓣（低不透明度）。
 *
 * ⭐ 体积/节点策略：
 *   - 坐标系：所有几何画在「短边 = 1000」的虚拟坐标里，整体 `<g transform="scale(q)">` 放大；
 *     体积与分辨率解耦。右上角构图 = 左上角构图整体水平镜像（一个 matrix）。
 *   - 枝干：每根枝一个闭合多边形（左缘 + 右缘），全部合并为一条 path。
 *   - 花朵：五瓣花只定义一次（`<defs>` 内的 `<g>`，花瓣不带 fill → 由 `<use>` 继承前 / 后层花色），
 *     每朵一个 `<use transform>`；花苞 = 零长度子路径 + 圆头描边。
 *   - 飘落花瓣：每片 = 两段相对二次曲线（≈ 30B），每「深度层 × 子组」一条 path；超出 PETAL_CAP 按前缀截断
 *     （每片固定消耗随机数，密度只决定取前多少片）。
 * 动画（仅预览，cfg.animate 且「花瓣飘落」打开）：各深度层下落周期 / 风向漂移 / 摆幅不同（视差），
 * 层内 3 个子组周期与相位错开；`<use>` 在上风方向补副本，一屏平移无缝循环。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;
/** 飘落花瓣 path 数据字节上限。 */
const PETAL_CAP = 6200;
/** 密度 = 1 时每「短边见方」的花瓣数。 */
const PETALS_PER_SCREEN = 130;
/** 枝干分支数上限（体积可控）。 */
const MAX_BRANCHES = 26;
/** 花朵数上限（每朵一个 `<use>` ≈ 60B）。 */
const MAX_FLOWERS = 84;

/** 单位花：半径 10，五枚凹口花瓣（模块级常量，确定性）。 */
const FLOWER_D: string = (() => {
  // 一枚朝上（-y）的花瓣：基部 → 左侧鼓出 → 左尖 → 凹口 → 右尖 → 右侧回到基部
  const petal: Array<[string, number[]]> = [
    ['M', [0, -1.4]],
    ['C', [-3.7, -2.6, -4.6, -7.6, -2.3, -10]],
    ['L', [0, -8.7]],
    ['L', [2.3, -10]],
    ['C', [4.6, -7.6, 3.7, -2.6, 0, -1.4]],
  ];
  const f = (v: number): string => {
    const r = Math.round(v * 10) / 10;
    return Object.is(r, -0) ? '0' : String(r);
  };
  let d = '';
  for (let k = 0; k < 5; k++) {
    const a = (k * 72 * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (const [cmd, xs] of petal) {
      const out: string[] = [];
      for (let i = 0; i < xs.length; i += 2) out.push(`${f(xs[i] * c - xs[i + 1] * s)} ${f(xs[i] * s + xs[i + 1] * c)}`);
      d += cmd + out.join(' ');
    }
    d += 'z';
  }
  return d;
})();

/** 花蕊外圈 5 粒花药（位于相邻花瓣之间，半径 4.2）。 */
const ANTHER_D: string = (() => {
  let d = '';
  for (let k = 0; k < 5; k++) {
    const a = ((k * 72 + 36 - 90) * Math.PI) / 180;
    d += `M${Math.round(Math.cos(a) * 42) / 10} ${Math.round(Math.sin(a) * 42) / 10}h0`;
  }
  return d;
})();

interface Pt {
  x: number;
  y: number;
}

interface Petal {
  layer: number;
  sub: number;
  x: number;
  y: number;
  ang: number;
  flat: number;
  size: number;
}

/** 飘落花瓣深度层：粒径、不透明度、数量权重、下落周期（秒）、摆幅、横向漂移（相对屏高）。 */
const PL = [
  { s: 0.55, op: 0.5, w: 0.48, dur: 46, amp: 6, sway: 8.5 },
  { s: 0.95, op: 0.8, w: 0.33, dur: 31, amp: 12, sway: 6.6 },
  { s: 1.45, op: 0.95, w: 0.15, dur: 21, amp: 20, sway: 5.2 },
  { s: 3.2, op: 0.3, w: 0.04, dur: 14, amp: 28, sway: 4.1 },
];
const SUBS = [
  { t: 1, b: 0 },
  { t: 1.16, b: 0.41 },
  { t: 0.87, b: 0.73 },
];

const def: PatternDef = {
  id: 'sakura-fall',
  name: '樱花飘落',
  category: 'E-scene',
  description: '一枝樱花从画面一角斜伸入画，枝上花簇有前后层次，空中飘着大小、朝向各异的花瓣。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天色', role: 'bg', paint: { type: 'solid', color: '#f4ebe6' }, opacity: 1, visible: true, configurable: true },
    { id: 'bokeh', label: '远景光斑', role: 'detail', paint: { type: 'solid', color: '#efcdd3' }, opacity: 0.4, visible: true, configurable: true },
    { id: 'branch', label: '枝干', role: 'primary', paint: { type: 'solid', color: '#4d3b3f' }, opacity: 1, visible: true, configurable: true },
    { id: 'blossom_back', label: '樱花 · 后', role: 'detail', paint: { type: 'solid', color: '#f8dbe2' }, opacity: 1, visible: true, configurable: true },
    { id: 'blossom', label: '樱花 · 前', role: 'secondary', paint: { type: 'solid', color: '#f2b6c4' }, opacity: 1, visible: true, configurable: true },
    { id: 'stamen', label: '花蕊', role: 'accent', paint: { type: 'solid', color: '#c4566f' }, opacity: 1, visible: true, configurable: true },
    { id: 'petal', label: '飘落花瓣', role: 'accent', paint: { type: 'solid', color: '#f0aebe' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'petalDensity', label: '花瓣密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'petalSize', label: '花瓣大小', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'bloom', label: '花量', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.75, heavy: true },
    {
      key: 'corner',
      label: '枝条方位',
      type: 'select',
      options: [
        { value: 'tl', label: '左上' },
        { value: 'tr', label: '右上' },
      ],
      default: 'tl',
    },
    { key: 'falling', label: '花瓣飘落', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'spring',
      label: '春霁',
      elements: {
        bg: { paint: { type: 'solid', color: '#f4ebe6' } },
        bokeh: { paint: { type: 'solid', color: '#efcdd3' }, opacity: 0.4 },
        branch: { paint: { type: 'solid', color: '#4d3b3f' } },
        blossom_back: { paint: { type: 'solid', color: '#f8dbe2' } },
        blossom: { paint: { type: 'solid', color: '#f2b6c4' } },
        stamen: { paint: { type: 'solid', color: '#c4566f' } },
        petal: { paint: { type: 'solid', color: '#f0aebe' } },
      },
    },
    {
      id: 'blue-hour',
      label: '暮蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#2d3a55' } },
        bokeh: { paint: { type: 'solid', color: '#5a6a8c' }, opacity: 0.35 },
        branch: { paint: { type: 'solid', color: '#151b2b' } },
        blossom_back: { paint: { type: 'solid', color: '#b48ea3' } },
        blossom: { paint: { type: 'solid', color: '#efc0cd' } },
        stamen: { paint: { type: 'solid', color: '#8e3c58' } },
        petal: { paint: { type: 'solid', color: '#e8b4c3' } },
      },
    },
    {
      id: 'sky',
      label: '晴空',
      elements: {
        bg: { paint: { type: 'solid', color: '#cfe3ee' } },
        bokeh: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.45 },
        branch: { paint: { type: 'solid', color: '#4a3c3a' } },
        blossom_back: { paint: { type: 'solid', color: '#f6e1e6' } },
        blossom: { paint: { type: 'solid', color: '#f3bccb' } },
        stamen: { paint: { type: 'solid', color: '#b9516c' } },
        petal: { paint: { type: 'solid', color: '#f7cfd9' } },
      },
      params: { corner: 'tr' },
    },
    {
      id: 'ink',
      label: '水墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#efede6' } },
        bokeh: { paint: { type: 'solid', color: '#dcd8cc' }, opacity: 0.4 },
        branch: { paint: { type: 'solid', color: '#2b2a2a' } },
        blossom_back: { paint: { type: 'solid', color: '#e7d2d2' } },
        blossom: { paint: { type: 'solid', color: '#d98f9c' } },
        stamen: { paint: { type: 'solid', color: '#7a2f3d' } },
        petal: { paint: { type: 'solid', color: '#d9a0aa' } },
      },
      params: { petalDensity: 0.35 },
    },
    {
      id: 'night',
      label: '夜樱',
      elements: {
        bg: { paint: { type: 'solid', color: '#1e1a26' } },
        bokeh: { paint: { type: 'solid', color: '#4a3550' }, opacity: 0.4 },
        branch: { paint: { type: 'solid', color: '#0d0b12' } },
        blossom_back: { paint: { type: 'solid', color: '#8b6a82' } },
        blossom: { paint: { type: 'solid', color: '#e8b9c9' } },
        stamen: { paint: { type: 'solid', color: '#6b2a44' } },
        petal: { paint: { type: 'solid', color: '#d9a6ba' } },
      },
      params: { petalDensity: 0.6 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['branch'],
    secondary: ['blossom'],
    accent: ['petal', 'stamen'],
    detail: ['blossom_back', 'bokeh'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate, seed } = cfg;
    const num = (k: string, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number(params[k])));
    const density = num('petalDensity', 0, 1);
    const pSize = num('petalSize', 0.3, 3);
    const bloom = num('bloom', 0.1, 1);
    const mirror = params.corner === 'tr';
    const falling = animate && params.falling === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const op = (v: number): string => api.n(Math.max(0, Math.min(1, v)));
    const r0 = Math.round;

    const bg = elements.get('bg')!;
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';

    // ── 远景光斑：远离枝条一侧的几颗大圆 ─────────────────
    const bokeh = elements.get('bokeh')!;
    const bk: string[] = [];
    for (let i = 0; i < 7; i++) {
      const x = Wv * (0.3 + rng() * 0.75);
      const y = Hv * (0.25 + rng() * 0.8);
      const r = V * (0.06 + rng() * 0.12);
      bk.push(`<circle cx="${r0(mirror ? Wv - x : x)}" cy="${r0(y)}" r="${r0(r)}"/>`);
    }
    if (bokeh.visible) inner += `<g fill="${bokeh.paintValue}" fill-opacity="${op(bokeh.opacity)}">${bk.join('')}</g>`;

    // ── 枝干（左上角构图；右上角整体镜像）──────────────────
    // 场景尺度：横屏按高、竖屏按宽，枝条始终伸到画面中部附近
    const reach = Math.min(Wv * 0.72, Hv * 1.15, V * 1.25);
    const branchesPolys: string[] = [];
    const flowerSpots: Array<Pt & { w: number }> = [];
    const budSpots: Pt[] = [];
    let branchCount = 0;

    const grow = (x: number, y: number, ang: number, len: number, w0: number, depth: number): void => {
      if (branchCount >= MAX_BRANCHES) return;
      branchCount++;
      const steps = Math.max(4, Math.round(len / (V * 0.045)));
      const pts: Array<Pt & { w: number }> = [];
      let a = ang;
      let px = x;
      let py = y;
      const bend = (rng() - 0.5) * 0.5;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        pts.push({ x: px, y: py, w: Math.max(V * 0.0018, w0 * (1 - t * 0.88)) });
        a += bend / steps + (rng() - 0.5) * 0.32; // 折角感
        const seg = len / steps;
        px += Math.cos(a) * seg;
        py += Math.sin(a) * seg;
      }
      // 多边形：左缘自根到梢 → 尖 → 右缘回到根
      const L: Array<[number, number]> = [];
      const R: Array<[number, number]> = [];
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q2 = pts[Math.min(pts.length - 1, i + 1)];
        const p0 = pts[Math.max(0, i - 1)];
        const dx = q2.x - p0.x;
        const dy = q2.y - p0.y;
        const m = Math.hypot(dx, dy) || 1;
        const nx = -dy / m;
        const ny = dx / m;
        L.push([p.x + nx * p.w * 0.5, p.y + ny * p.w * 0.5]);
        R.push([p.x - nx * p.w * 0.5, p.y - ny * p.w * 0.5]);
      }
      const last = pts[pts.length - 1];
      const tipA = Math.atan2(last.y - pts[pts.length - 2].y, last.x - pts[pts.length - 2].x);
      const poly = [...L, [last.x + Math.cos(tipA) * V * 0.012, last.y + Math.sin(tipA) * V * 0.012] as [number, number], ...R.reverse()];
      let d = `M${r0(poly[0][0])} ${r0(poly[0][1])}l`;
      let cx = r0(poly[0][0]);
      let cy = r0(poly[0][1]);
      poly.slice(1).forEach(([X, Y], i) => {
        const nx2 = r0(X);
        const ny2 = r0(Y);
        const ddx = nx2 - cx;
        const ddy = ny2 - cy;
        d += `${i === 0 || ddx < 0 ? '' : ' '}${ddx}${ddy < 0 ? '' : ' '}${ddy}`;
        cx = nx2;
        cy = ny2;
      });
      branchesPolys.push(`${d}z`);

      // 花位：外段（t > 0.3）沿枝分布 + 梢端
      for (let i = 1; i < pts.length; i++) {
        const t = i / (pts.length - 1);
        if (t > (depth === 0 ? 0.45 : 0.2) && rng() < 0.55 + depth * 0.15) flowerSpots.push(pts[i]);
      }
      flowerSpots.push(last, last);
      budSpots.push({ x: last.x + Math.cos(tipA) * V * 0.02, y: last.y + Math.sin(tipA) * V * 0.02 });

      if (depth >= 3) return;
      // 侧枝：沿枝等距左右交替
      const kids = depth === 0 ? 5 : depth === 1 ? 3 : 2;
      for (let k = 0; k < kids; k++) {
        const t = 0.22 + (k + rng() * 0.6) * (0.7 / kids);
        const i = Math.min(pts.length - 2, Math.max(1, Math.round(t * (pts.length - 1))));
        const p = pts[i];
        const side = (k + depth) % 2 === 0 ? 1 : -1;
        const pa = Math.atan2(pts[i + 1].y - p.y, pts[i + 1].x - p.x);
        grow(p.x, p.y, pa + side * (0.45 + rng() * 0.5), len * (0.32 + rng() * 0.22) * (1 - t * 0.35), p.w * 0.72, depth + 1);
      }
    };
    const startY = Hv * (0.04 + rng() * 0.12);
    // 竖屏：枝条更陡地向下伸，填满纵向空间
    const steep = Hv > Wv ? Math.min(0.45, (Hv / Wv - 1) * 0.6) : 0;
    grow(-V * 0.03, startY, 0.42 + steep + rng() * 0.2, reach * (1 + steep * 0.5), V * 0.042, 0);

    // ── 花：每个花位 1~3 朵，前后层交替；超量时均匀抽稀 ────────
    interface Fl {
      x: number;
      y: number;
      a: number;
      s: number;
      back: boolean;
    }
    const flowers: Fl[] = [];
    flowerSpots.forEach((p) => {
      const n = 1 + Math.floor(rng() * 2.6);
      for (let k = 0; k < n; k++) {
        const off = V * 0.026 * (0.4 + rng());
        const oa = rng() * Math.PI * 2;
        flowers.push({
          x: p.x + Math.cos(oa) * off,
          y: p.y + Math.sin(oa) * off * 0.8,
          a: rng() * 72,
          s: 3.3 * (0.7 + rng() * 0.45),
          back: rng() < 0.38,
        });
      }
    });
    const keepN = Math.min(MAX_FLOWERS, Math.round(flowers.length * bloom));
    const step = flowers.length / Math.max(1, keepN);
    const kept: Fl[] = [];
    for (let i = 0; i < keepN; i++) kept.push(flowers[Math.floor(i * step)]);

    const fid = `sk${seed}f`;
    const stamen = elements.get('stamen')!;
    const flowerDef =
      `<defs><g id="${fid}"><path d="${FLOWER_D}"/>` +
      (stamen.visible
        ? `<circle r="1.9" fill="${stamen.paintValue}" fill-opacity="${op(stamen.opacity)}"/>` +
          `<path d="${ANTHER_D}" fill="none" stroke="${stamen.paintValue}" stroke-opacity="${op(stamen.opacity * 0.8)}" stroke-width="1.3" stroke-linecap="round"/>`
        : '') +
      `</g></defs>`;
    const useOf = (f: Fl, sc: number): string =>
      `<use href="#${fid}" transform="translate(${r0(f.x)} ${r0(f.y)})rotate(${r0(f.a)})scale(${api.n(f.s * sc)})"/>`;

    const blBack = elements.get('blossom_back')!;
    const blFront = elements.get('blossom')!;
    const branch = elements.get('branch')!;
    let scene = '';
    const backMk = kept.filter((f) => f.back).map((f) => useOf(f, 0.86)).join('');
    if (blBack.visible && backMk !== '') scene += `<g fill="${blBack.paintValue}" fill-opacity="${op(blBack.opacity)}">${backMk}</g>`;
    if (branch.visible) scene += path(branchesPolys.join(''), { fill: branch.paintValue, 'fill-opacity': branch.opacity });
    const frontMk = kept.filter((f) => !f.back).map((f) => useOf(f, 1)).join('');
    if (blFront.visible) {
      if (frontMk !== '') scene += `<g fill="${blFront.paintValue}" fill-opacity="${op(blFront.opacity)}">${frontMk}</g>`;
      // 花苞：零长度子路径 + 圆头描边
      let bd = '';
      budSpots.forEach((b, i) => {
        if (i % 2 === 1 && bloom < 0.5) return;
        bd += `M${r0(b.x)} ${r0(b.y)}h0`;
      });
      if (bd !== '') scene += `<path d="${bd}" fill="none" stroke="${blFront.paintValue}" stroke-opacity="${op(blFront.opacity)}" stroke-width="${r0(V * 0.013)}" stroke-linecap="round"/>`;
    }
    if (scene !== '') inner += flowerDef + (mirror ? `<g transform="matrix(-1 0 0 1 ${r0(Wv)} 0)">${scene}</g>` : scene);

    // ── 飘落花瓣（每片固定 6 个随机数）──────────────────────
    const petalEl = elements.get('petal')!;
    const count = Math.round(density * PETALS_PER_SCREEN * ((Wv * Hv) / (V * V)));
    const petals: Petal[] = [];
    for (let i = 0; i < count; i++) {
      const u = rng();
      let layer = PL.length - 1;
      let acc = 0;
      for (let k = 0; k < PL.length; k++) {
        acc += PL[k].w;
        if (u < acc) {
          layer = k;
          break;
        }
      }
      petals.push({
        layer,
        sub: Math.floor(rng() * SUBS.length) % SUBS.length,
        x: rng() * Wv,
        y: rng() * Hv,
        ang: rng() * Math.PI * 2,
        flat: 0.35 + rng() * 0.65,
        size: 0.8 + rng() * 0.4,
      });
    }
    const base = V * 0.019 * pSize;
    const buildPetals = (n: number): string[][] => {
      const out = PL.map(() => SUBS.map(() => ''));
      const groups = PL.map(() => SUBS.map(() => [] as Petal[]));
      for (let i = 0; i < n; i++) groups[petals[i].layer][petals[i].sub].push(petals[i]);
      groups.forEach((subs, li) =>
        subs.forEach((list, si) => {
          list.sort((a, b) => a.x - b.x);
          let d = '';
          let px = 0;
          let py = 0;
          for (const p of list) {
            const len = Math.max(3, base * PL[li].s * p.size);
            const wd = len * 0.62 * p.flat;
            const c = Math.cos(p.ang);
            const s = Math.sin(p.ang);
            // 局部坐标：基部 (0,0)，尖端 (len,0)，两侧控制点 (len*0.55, ±wd)
            const tx = r0(len * c);
            const ty = r0(len * s);
            const c1x = r0(len * 0.55 * c - wd * s);
            const c1y = r0(len * 0.55 * s + wd * c);
            const c2x = r0(len * 0.55 * c + wd * s) - tx;
            const c2y = r0(len * 0.55 * s - wd * c) - ty;
            const x = r0(p.x);
            const y = r0(p.y);
            d += d === '' ? `M${x} ${y}` : `m${x - px} ${y - py}`;
            d += `q${c1x} ${c1y} ${tx} ${ty}q${c2x} ${c2y} ${-tx} ${-ty}`;
            px = x;
            py = y;
          }
          out[li][si] = d.replace(/ -/g, '-');
        }),
      );
      return out;
    };
    let n = count;
    let pds = buildPetals(n);
    for (let g = 0; g < 40 && pds.flat().reduce((a, d) => a + d.length, 0) > PETAL_CAP && n > 0; g++) {
      n = Math.floor(n * 0.92);
      pds = buildPetals(n);
    }
    if (petalEl.visible && n > 0) {
      const drift = r0(Hv * 0.32) * (mirror ? -1 : 1);
      const fallName = falling ? api.keyframes(`vw-skfall-${drift}-${r0(Hv)}`, `to{transform:translate(${drift}px,${r0(Hv)}px)}`) : '';
      let pm = '';
      PL.forEach((L, li) => {
        let lm = '';
        SUBS.forEach((S, si) => {
          const d = pds[li][si];
          if (d === '') return;
          const id = `sk${seed}p${li}${si}`;
          if (falling) {
            const dur = Math.round(L.dur * S.t * 10) / 10;
            const delay = Math.round(dur * S.b * 10) / 10;
            lm +=
              `<g style="animation:${fallName} ${dur}s linear${delay > 0 ? ` -${delay}s` : ''} infinite">` +
              `<path id="${id}" d="${d}"/><use href="#${id}" x="${-drift}" y="${-r0(Hv)}"/></g>`;
          } else {
            lm += `<path d="${d}"/>`;
          }
        });
        if (lm === '') return;
        const o = op(petalEl.opacity * L.op);
        if (falling) {
          const sw = api.keyframes(`vw-sksway${li}`, `from{transform:translateX(-${L.amp}px)}to{transform:translateX(${L.amp}px)}`);
          pm += `<g fill-opacity="${o}" style="animation:${sw} ${L.sway}s ease-in-out -${Math.round(L.sway * 0.3 * (li + 1) * 10) / 10}s infinite alternate">${lm}</g>`;
        } else {
          pm += `<g fill-opacity="${o}">${lm}</g>`;
        }
      });
      // 近焦大花瓣层放在最上面，其余层位于花枝之下更有前后感 → 这里按层序全部置顶，保持简单一致
      inner += `<g fill="${petalEl.paintValue}">${pm}</g>`;
    }

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
