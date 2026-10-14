/**
 * 云层带 —— 宫崎骏式夏日积云（2026-10-14 从头重做）。
 *
 * Rei：「可以从头重新设计一下更好看的么，类似宫崎骏中的云」。
 * 参考《天空之城》《龙猫》《起风了》里的积云 / 积雨云：
 *   - 巨大、雕塑感：一朵云 = 许多「泡」逐层堆叠成塔，下宽上窄，顶上是花椰菜般的冠。
 *   - 受光面奶白，背光与底部是带天色的蓝紫冷灰阴影 —— 至少两层明暗 + 一层边缘高光。
 *   - 底部平：同一层云共享一条凝结高度（云底），用 clipPath 齐刷刷切平。
 *   - 天空是饱和清澈的蓝：天顶深、地平线浅。
 *   - 空气透视：远层云小而淡、贴近地平线；近处积云塔高大。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 结构：一朵云 = 自底向上 1~5 层「云团」，每团 = 一只核心大泡 + 上半圆冒出的 1~4 只小泡（花椰菜的一瓣）。
 *   底层团心压在云底线附近、两端团小且抬高 → 平底两角向上圆收；
 *   中段几乎不收、到冠才收拢 → 圆顶云塔，而非圆锥 / 方柱 / 香肠。
 *   同层团距 ≤ 1.5r，团团相咬，不漏天。
 *
 * 体积塑造（不用 filter —— Safari 光栅化重灾区），每团三笔、几何只写一次：
 *   1. 阴影体：`<g id>` 一串 `<circle>`，不带 fill → 继承本层的冷色竖向渐变（上浅下深、掺天色与蓝紫）。
 *   2. 边缘高光：`<use>` 朝光源平移 1.16t，奶白（仅近处云塔）。
 *   3. 受光体：`<use>` 朝光源平移 t，云色。
 *   ⇒ 背光一侧露出宽 t 的蓝紫月牙（底部最宽），迎光一侧露出一道亮边，中间是受光主体。
 *   绘制顺序：底层团先画、上层团后画 —— 上层团的阴影底压在下层团的亮顶上，一层层「翻涌」上去。
 *   t 逐团随机、低处大冠部小 → 阴影深浅错落，不排成鱼鳞。
 *   最底一层再盖一道「云底暗面」（渐变到透明），让平底沉下去；最后整层 clipPath 切出平直云底。
 *
 * 坐标：短边 = 1000 的虚拟坐标、全整数，外层 `scale(q)` 放大 → 体积与分辨率无关。
 *
 * ⭐ 三个云元件（远 / 中 / 近）在**任何参数下都必然绘制**（每层云数 ≥ 1），改色命中率 100%。
 *    `bands` 控制云量而不再删层。seeded 随机只来自 cfg.rng。
 */
import { mixHex } from '../../engine/colors';
import { circle, g, rect } from '../../engine/svg';
import type { PaintSpec, PatternDef, RenderApi, RenderResult, ResolvedConfig, ResolvedElement } from '../types';

/** 虚拟坐标：短边 = 1000。 */
const V = 1000;
/** 云层几何的字节预算（粗估），保证任何参数下整张 SVG 远低于 20KB。 */
const CLOUD_BUDGET = 15500;
/** 阴影里掺进的冷蓝紫（吉卜力的云影永远带天色）。 */
const SHADE = '#5b63a6';
/** 高光里掺进的奶白。 */
const CREAM = '#ffffff';

interface Puff {
  x: number;
  y: number;
  r: number;
}

/** 一朵云：若干泡团，数组顺序 = 绘制顺序（底层先、冠部后）。 */
interface Cloud {
  groups: Puff[][];
  /** 每团的阴影系数（与 groups 一一对应）：低处团沉在影里多、冠部受光多，且逐团随机 → 不排成鱼鳞 */
  shade: number[];
  /** 最底一层泡 —— 云底暗面用。 */
  base: Puff[];
  /** 光照方向（单位向量，指向光源，竖直分量恒为负 = 朝上）。 */
  lx: number;
  ly: number;
}

const R = Math.round;

/** 一团泡 → 一串整数 `<circle>`（不带 fill：由外层 g / use 决定颜色）。比等价的双弧 path 每圆省约 9B。 */
function circlesMarkup(ps: Puff[]): string {
  let d = '';
  for (const p of ps) d += `<circle cx="${R(p.x)}" cy="${R(p.y)}" r="${Math.max(1, R(p.r))}"/>`;
  return d;
}

/**
 * 一个「云团」：一只核心大泡 + 上半圆上冒出的 2~4 只小泡（花椰菜的一瓣）。
 * 一团共享一次明暗 —— 小泡只在团的外轮廓上留下起伏，不各自描边，避免「一堆气泡」。
 */
function mass(x: number, y: number, r: number, rng: () => number, bumps: number): Puff[] {
  const ps: Puff[] = [{ x, y, r }];
  for (let i = 0; i < bumps; i++) {
    // 角度落在上半圆（−165°~−15°），按序铺开再抖动 → 不扎堆
    const a = -Math.PI * (0.1 + (0.8 * (i + 0.2 + rng() * 0.6)) / bumps);
    const br = r * (0.42 + rng() * 0.22);
    const d = r * (0.62 + rng() * 0.16);
    ps.push({ x: x + Math.cos(a) * d * 1.08, y: y + Math.sin(a) * d * 0.9, r: br });
  }
  return ps;
}

/**
 * 生成一朵积云：自底向上一层层叠「云团」，每层更窄、团更小，直到够到目标高度。
 * @param w     云底宽
 * @param h     目标高度（云底 → 云顶）
 * @param fat   团的数量系数（远云 <1 更扁平稀疏）
 * @param lean  云塔整体向一侧的倾斜（−1~1）
 * @param detail 每团冒出的小泡上限（远云 1~2 即可，近云 2~4；也是体积的主要旋钮）
 */
function cumulus(
  cx: number,
  baseY: number,
  w: number,
  h: number,
  fat: number,
  lean: number,
  detail: number,
  sun: [number, number],
  rng: () => number,
): Cloud {
  const groups: Puff[][] = [];
  const shade: number[] = [];
  let base: Puff[] = [];
  // 底层：2~4 个大团并排；两端团小且抬高 → 平底两角向上圆收，而不是一块切平的板
  const m0 = Math.max(1, Math.round((2.6 + rng() * 1.2) * fat));
  const r0 = (w / (m0 * 1.3 + 0.6)) * (0.95 + rng() * 0.1);
  const tw0 = Math.max(0, w - r0 * 1.9);
  // 层数由高宽比决定：扁云 1 层，云塔 3~5 层；顶层是一两只大团组成的冠
  const levels = Math.max(1, Math.min(5, Math.round((h - r0 * 0.4) / (r0 * 1.05))));
  for (let k = 0; k < levels; k++) {
    const t = levels === 1 ? 0 : k / (levels - 1); // 0 底 → 1 冠
    // 包络：中段几乎不收、到冠才收拢 → 圆顶云塔，而非圆锥 / 方柱
    const tw = tw0 * (1 - 0.66 * Math.pow(t, 1.4)) * (0.92 + rng() * 0.16);
    const r = r0 * (1 - 0.3 * t);
    const y = k === 0 ? baseY : baseY - r0 * 0.55 - (h - r0 * 0.55 - r * 1.25) * t;
    const tcx = cx + lean * r0 * 0.9 * t + (rng() - 0.5) * r0 * 0.25;
    // 团距 ≤ 1.5r：同层团团相咬，中间不漏天（否则读作两根柱子 / 「Λ」）
    const m = k === 0 ? m0 : Math.max(2, Math.ceil(tw / (r * 1.5)) + (tw > r * 0.8 ? 1 : 0));
    const level: Puff[][] = [];
    for (let i = 0; i < m; i++) {
      const u = m === 1 ? 0.5 : i / (m - 1);
      const env = Math.sin((0.15 + u * 0.7) * Math.PI); // 中间团大、高；肩部团小、低
      const rr = r * (0.68 + env * 0.4) * (0.88 + rng() * 0.24);
      const x = tcx - tw / 2 + tw * u + (rng() - 0.5) * r * 0.4;
      const yy = k === 0 ? baseY - rr * (0.58 + (1 - env) * 0.3) : y - env * r * 0.2 + (rng() - 0.5) * r * 0.25;
      level.push(mass(x, yy, rr, rng, Math.max(1, detail - 2) + Math.floor(rng() * 3)));
    }
    if (k === 0) base = level.map((ps) => ps[0]);
    // 同层左右谁压谁随机；层与层之间底层先画、上层后画（上层团的阴影底压在下层团的亮顶上）
    for (let i = level.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [level[i], level[j]] = [level[j], level[i]];
    }
    for (const grp of level) {
      groups.push(grp);
      shade.push((1.25 - 0.55 * t) * (0.7 + rng() * 0.6));
    }
  }
  // 光照方向：朝光源，但永远以「顶部受光」为主
  const vx = sun[0] - cx;
  const vy = sun[1] - (baseY - h / 2);
  const len = Math.hypot(vx, vy) || 1;
  let lx = (vx / len) * 0.7;
  let ly = -1;
  const l2 = Math.hypot(lx, ly);
  lx /= l2;
  ly /= l2;
  return { groups, shade, base, lx, ly };
}

/** 取 PaintSpec 的代表色（实色直取；渐变取首色标）。 */
function colorOf(paint: PaintSpec, fallback: string): string {
  if (paint.type === 'solid') return paint.color;
  if (paint.type === 'none' || paint.stops.length === 0) return fallback;
  return paint.stops[0].color;
}

/** 字符串 → 短 hash（clip id 用：同内容同 id，不同内容不撞）。 */
function hashStr(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** 每层云的风格参数（远 → 近）。 */
interface Layer {
  id: 'cloud_hi' | 'cloud_mid' | 'cloud_low';
  /** 云底高度（占画面高） */
  base: number;
  /** 空气透视：向地平线天色混合的比例 */
  haze: number;
  /** 受光内切比例（越大背光月牙越宽） */
  s: number;
  hi: boolean;
}
const LAYERS: Layer[] = [
  { id: 'cloud_hi', base: 0.885, haze: 0.45, s: 0.32, hi: false },
  { id: 'cloud_mid', base: 0.83, haze: 0.14, s: 0.42, hi: false },
  { id: 'cloud_low', base: 0.775, haze: 0, s: 0.5, hi: true },
];

const sky3 = (a: string, b: string, c: string): PaintSpec => ({
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: a },
    { offset: 0.55, color: b },
    { offset: 1, color: c },
  ],
});
const sun2 = (a: string, b: string, o = 0.9): PaintSpec => ({
  type: 'radial',
  cx: 0.5,
  cy: 0.5,
  r: 0.5,
  stops: [
    { offset: 0, color: a, opacity: o },
    { offset: 0.35, color: a, opacity: o * 0.35 },
    { offset: 1, color: b, opacity: 0 },
  ],
});
const solid = (color: string): PaintSpec => ({ type: 'solid', color });

const def: PatternDef = {
  id: 'cloud-bands',
  tones: ['light'],
  name: '云层带',
  category: 'E-scene',
  description: '宫崎骏式的夏日积云：清澈的蓝天下，奶白受光、蓝紫背光的云塔层层堆起，远云贴着地平线。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'sky', label: '天空', role: 'bg', paint: sky3('#1b55b8', '#4a93e4', '#cfe9f7'), opacity: 1, visible: true, configurable: true },
    { id: 'glow', label: '日光', role: 'accent', paint: sun2('#fffbe8', '#fff4cf'), opacity: 0.85, visible: true, configurable: true },
    { id: 'cloud_hi', label: '远云', role: 'secondary', paint: solid('#f6f8fc'), opacity: 0.92, visible: true, configurable: true },
    { id: 'cloud_mid', label: '中云', role: 'primary', paint: solid('#f8f5ee'), opacity: 1, visible: true, configurable: true },
    { id: 'cloud_low', label: '积云塔', role: 'detail', paint: solid('#fdf9f0'), opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'bands', label: '云量', type: 'range', min: 1, max: 5, step: 1, default: 3, heavy: true },
    { key: 'scale', label: '云团尺度', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: 'spread', label: '云塔高度', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.7 },
    { key: 'glowX', label: '日光横向', type: 'range', min: 0, max: 1, step: 0.01, default: 0.74 },
    { key: 'glowY', label: '日光纵向', type: 'range', min: 0.05, max: 0.7, step: 0.01, default: 0.16 },
  ],

  presets: [
    {
      id: 'daybreak',
      label: '朝霞',
      elements: {
        sky: { paint: sky3('#33427f', '#c9789f', '#ffd9b0') },
        glow: { paint: sun2('#fff3df', '#ffb27a', 0.95) },
        cloud_hi: { paint: solid('#ffd9c6') },
        cloud_mid: { paint: solid('#ffe6d4') },
        cloud_low: { paint: solid('#fff0e2') },
      },
      params: { glowY: 0.5 },
    },
    {
      id: 'storm',
      label: '积雨云',
      elements: {
        sky: { paint: sky3('#283a5c', '#5d7596', '#b6c3d2') },
        glow: { paint: sun2('#f2f5fa', '#c8d3e2', 0.6) },
        cloud_hi: { paint: solid('#d7dee8') },
        cloud_mid: { paint: solid('#e6ebf2') },
        cloud_low: { paint: solid('#f1f4f8') },
      },
      params: { spread: 1, scale: 1.2 },
    },
    {
      id: 'mint',
      label: '青空',
      elements: {
        sky: { paint: sky3('#0d6f8f', '#3fb4c9', '#dcf5ee') },
        glow: { paint: sun2('#fbfff6', '#e6fff2') },
        cloud_hi: { paint: solid('#effaf7') },
        cloud_mid: { paint: solid('#fbfffb') },
        cloud_low: { paint: solid('#fffffa') },
      },
    },
  ],

  paletteSlots: {
    bg: ['sky'],
    accent: ['glow'],
    secondary: ['cloud_hi'],
    primary: ['cloud_mid'],
    detail: ['cloud_low'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const amount = Math.max(1, Math.min(5, Math.round(Number(params.bands))));
    const scale = Math.max(0.3, Number(params.scale));
    const spread = Math.max(0.1, Number(params.spread));
    const gx = Number(params.glowX);
    const gy = Number(params.glowY);

    // 虚拟坐标：短边 = 1000
    const q = Math.min(W, H) / V;
    const VW = W / q;
    const VH = H / q;
    const sun: [number, number] = [VW * gx, VH * gy];

    const sky = elements.get('sky')!;
    const glow = elements.get('glow')!;
    // 天色参与云影与空气透视；天空隐藏时退回默认天色（隐藏元件的颜色不得泄漏进产物）
    const sp: PaintSpec = sky.visible ? sky.paint : _def.elements[0].paint;
    const horizon = sp.type === 'linear' || sp.type === 'radial' ? sp.stops[sp.stops.length - 1].color : colorOf(sp, '#cfe9f7');
    const skyMid = sp.type === 'linear' || sp.type === 'radial' ? sp.stops[Math.floor(sp.stops.length / 2)].color : horizon;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];
    if (glow.visible) {
      parts.push(circle(W * gx, H * gy, Math.max(W, H) * 0.42, { fill: glow.paintValue, 'fill-opacity': glow.opacity }));
    }

    // ── 先把三层云的几何全部抽完（与可见性无关 → 隐藏某层不改变其它层的形） ──
    const aspect = VW / VH; // 横屏 >1
    const plans: Cloud[][] = [];
    // 远云：几朵扁平的小积云，贴地平线
    {
      const L = LAYERS[0];
      const c = Math.min(6, Math.max(1, Math.round((1.2 + amount * 0.8) * Math.max(0.6, Math.min(1.6, aspect * 0.7)))));
      const list: Cloud[] = [];
      for (let i = 0; i < c; i++) {
        const cx = VW * ((i + 0.15 + rng() * 0.7) / c);
        const w = (90 + rng() * 90) * scale;
        list.push(cumulus(cx, VH * L.base, w, w * (0.22 + rng() * 0.16), 0.8, (rng() - 0.5) * 0.6, 2, sun, rng));
      }
      plans.push(list);
    }
    // 中云：几朵中等积云
    {
      const L = LAYERS[1];
      const c = Math.min(4, Math.max(1, Math.round((0.5 + amount * 0.5) * Math.max(0.8, Math.min(1.6, aspect * 0.7)))));
      const list: Cloud[] = [];
      for (let i = 0; i < c; i++) {
        const cx = VW * ((i + 0.2 + rng() * 0.6) / c);
        const w = (200 + rng() * 120) * scale;
        const h = w * (0.4 + rng() * 0.2) * (0.7 + spread * 0.45);
        list.push(cumulus(cx, VH * L.base, w, h, 0.9, (rng() - 0.5) * 0.8, 3, sun, rng));
      }
      plans.push(list);
    }
    // 近处积云塔：1~2 座，高大
    {
      const L = LAYERS[2];
      const c = amount >= 4 && aspect > 1.2 ? 2 : 1;
      const list: Cloud[] = [];
      const side = rng() < 0.5 ? -1 : 1;
      for (let i = 0; i < c; i++) {
        const big = i === 0;
        const baseY = VH * L.base;
        // 竖屏：云塔按短边放宽，免得被细高的画幅压成一根柱子
        const fw = aspect < 1 ? 1.5 : 1;
        const w = Math.min(VW * 0.86, (big ? 460 : 320) * fw * scale * (0.9 + rng() * 0.2));
        const center = c === 1 ? 0.5 + side * (0.06 + rng() * 0.16) : (i === 0 ? 0.3 : 0.74) + (rng() - 0.5) * 0.1;
        const cx = Math.max(w * 0.62, Math.min(VW - w * 0.62, VW * center));
        const maxH = baseY - VH * 0.07;
        const h = Math.min(maxH, VH * (big ? 0.66 : 0.46) * spread * (0.9 + rng() * 0.15));
        list.push(cumulus(cx, baseY, w, Math.max(w * 0.45, Math.min(h, w * 1.3)), big ? 1.1 : 0.9, (rng() - 0.5) * 1.2, big ? 4 : 2, sun, rng));
      }
      plans.push(list);
    }

    /**
     * 体积预算：粗估每圆 ≈ 31B、每团 ≈ 140B（g + 两个 use）。超出时从远/中层末尾轮流摘云（各层至少留 1 朵），
     * 近处云塔不动。几何已全部抽完，摘云不改变其余云的形状。极端参数（云量 5 + 塔高 1 + 超宽屏）下才会触发。
     */
    const cost = (cl: Cloud): number => cl.groups.reduce((acc, grp) => acc + 140 + grp.length * 31, 0) + cl.base.length * 31;
    let total = plans.reduce((acc, list) => acc + list.reduce((x, cl) => x + cost(cl), 0), 0);
    for (let turn = 0; total > CLOUD_BUDGET && (plans[0].length > 1 || plans[1].length > 1); turn++) {
      const list = plans[turn % 2 === 0 ? 1 : 0];
      if (list.length > 1) total -= cost(list.pop()!);
    }

    // ── 绘制：远 → 近 ──
    const layerOut: string[] = [];
    for (let li = 0; li < LAYERS.length; li++) {
      const L = LAYERS[li];
      const e: ResolvedElement = elements.get(L.id)!;
      if (!e.visible) continue;
      const base = colorOf(e.paint, '#ffffff');
      const lit = L.haze > 0 ? mixHex(base, horizon, L.haze) : base;
      const litFill = L.haze > 0 ? lit : e.paintValue;
      // 阴影：云色 × 天色 × 冷蓝紫；远层更接近天色
      const shadeMid = mixHex(mixHex(base, skyMid, 0.42), SHADE, 0.3);
      const shTop = mixHex(mixHex(base, shadeMid, 0.55), horizon, L.haze);
      const shBot = mixHex(shadeMid, horizon, L.haze * 0.8);
      const shFill = api.linear({
        angle: 90,
        key: `cb-sh-${L.id}`,
        stops: [
          { offset: 0, color: shTop },
          { offset: 1, color: shBot },
        ],
      });
      const underFill = api.linear({
        angle: 90,
        key: `cb-un-${L.id}`,
        stops: [
          { offset: 0.3, color: shBot, opacity: 0 },
          { offset: 0.72, color: shBot, opacity: 0.85 },
        ],
      });
      const hiColor = mixHex(base, CREAM, 0.85);

      // 每团三笔：阴影体（继承 g 的 fill）→ 边缘高光 → 受光体；见文件头「体积塑造」
      let body = '';
      for (const cl of plans[li]) {
        for (let gi = 0; gi < cl.groups.length; gi++) {
          const grp = cl.groups[gi];
          const d = circlesMarkup(grp);
          const id = `c${hashStr(`${L.id}|${d}`)}`;
          const t = grp[0].r * L.s * cl.shade[gi];
          // use 的 x / y 就是平移，比 transform="translate()" 每个省 13B
          const tr = (k: number): string => `x="${R(cl.lx * t * k)}" y="${R(cl.ly * t * k)}"`;
          body += `<g id="${id}">${d}</g>`;
          if (L.hi && t > 9) body += `<use href="#${id}" fill="${hiColor}" ${tr(1.16)}/>`;
          body += `<use href="#${id}" fill="${litFill}" ${tr(1)}/>`;
        }
        body += g({ fill: underFill }, circlesMarkup(cl.base));
      }
      // 云底切平：同层共享一条凝结高度
      const by = R(VH * L.base);
      const clip = api.clip(`cb${hashStr(`${by}|${body}`)}`, `<rect width="${R(VW)}" height="${by}"/>`);
      layerOut.push(g({ 'clip-path': clip, fill: shFill, opacity: e.opacity }, body));
    }
    if (layerOut.length > 0) {
      parts.push(g({ transform: `scale(${api.n(q)})` }, layerOut.join('')));
    }
    return { body: parts.join('') };
  },
};

export default def;
