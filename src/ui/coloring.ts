/**
 * 随机配色（PRD Q3：默认邻近色，另有「仅当前色板」「全色域」两档）。
 *
 * ⚠️ 全部走 seeded RNG（`mulberry32`）—— 绝不使用 `Math.random()`。
 * 原因：同一 seed + 同一当前配色必须产出同一结果，否则「分享链接」
 * 会指向一个用户自己都复现不出来的画面。
 */
import { contrastRatio, hexToHsl, hexToRgb, hslToHex, type ColorStrategy } from '../engine/colors';
import { mulberry32 } from '../engine/rng';
import { PALETTES, VIVID_PALETTES, type Palette } from '../patterns/palettes';
import { structuredCloneConfig } from '../engine/render';
import type { ElementConfig, PatternConfig } from '../engine/types';
import type { PaintSpec, PatternDef } from '../patterns/types';

/**
 * 取一个不与当前 seed 相同的新 seed。
 *
 * 用 seeded RNG 而非随机数，保证「换一版」这条交互本身也是可复现的：
 * 同一 seed 连点两次会得到同一张图 —— 这在调试分享链接时很重要。
 */
export function nextSeed(current: number): number {
  const rng = mulberry32(current + 17);
  return (current + 1 + Math.floor(rng() * 9999)) % 1_000_000;
}

/**
 * 「换一版」的配色来源：作者调过的一套配色（默认配色或某个 preset）。
 *
 * ⚠️ 为什么不从「当前配色」推导：旧实现以当前底色为基准抖动 s/l，
 * 连点几次就是一次随机游走，饱和度被反复乘 0.72~1.27、明度被压向底色，
 * 最后所有元件都挤成同一片灰（用户反馈「点了之后灰蒙蒙的」）。
 * 改为每次都回到作者的配色骨架：明暗关系与对比度是作者调好的，
 * 换一版只换色相/饱和度，永远不会越点越灰。
 */
function pickSource(def: PatternDef, rng: () => number, tone: BgTone): Map<string, PaintSpec> {
  // 只从与当前浅/深底一致的作者配色里挑：换一版不应把用户选的底色明暗换掉
  const all = authorSources(def);
  const same = all.filter((m) => toneOf(m, def) === tone);
  const pool = same.length > 0 ? same : all;
  return pool[Math.floor(rng() * pool.length) % pool.length];
}

/** 作者调过的全部配色：默认配色 + 每个 preset（preset 未覆盖的元件沿用默认）。 */
function authorSources(def: PatternDef): Map<string, PaintSpec>[] {
  const defaults = new Map<string, PaintSpec>(def.elements.map((e) => [e.id, e.paint]));
  SOURCE_OPACITY.set(defaults, new Map(def.elements.map((e) => [e.id, e.opacity])));
  const out = [defaults];
  for (const pr of def.presets) {
    const m = new Map(defaults);
    const op = new Map(def.elements.map((e) => [e.id, e.opacity]));
    for (const [id, o] of Object.entries(pr.elements)) {
      if (o.paint) m.set(id, o.paint);
      if (typeof o.opacity === 'number') op.set(id, o.opacity);
    }
    SOURCE_OPACITY.set(m, op);
    out.push(m);
  }
  return out;
}

/** 每套作者配色对应的不透明度：浅/深底配色常配不同透明度（浅底线条要更实），切换时一起带上。 */
const SOURCE_OPACITY = new WeakMap<Map<string, PaintSpec>, Map<string, number>>();

/** 对一种颜色做「保明度」的重新着色。 */
function recolorHex(
  hex: string,
  hueShift: number,
  satScale: number,
  satFloor: number,
): string {
  const { h, s, l } = hexToHsl(hex);
  // 近乎无彩的颜色（米白、炭黑）只给一点点色倾，不硬染成彩色
  const neutral = s < 0.08;
  const ns = neutral
    ? Math.min(0.12, s + 0.04)
    : Math.min(0.78, Math.max(satFloor, s * satScale));
  return hslToHex((((h + hueShift) % 360) + 360) % 360, ns, l);
}

function mapPaint(paint: PaintSpec, fn: (hex: string) => string): PaintSpec {
  if (paint.type === 'solid') return { type: 'solid', color: fn(paint.color) };
  if (paint.type === 'linear' || paint.type === 'radial') {
    return { ...paint, stops: paint.stops.map((st) => ({ ...st, color: fn(st.color) })) };
  }
  return paint;
}

/**
 * 换一版：换 seed + 重新配色。
 *
 * 大部分点击走 vivid（高饱和、和谐、对比度有保证，见 `vividFromScheme`）；
 * 少数点击回到作者配色骨架（同样提了饱和度），让作者的成品配色仍有机会出现。
 *
 * - `analogous`（默认）：82% vivid（生成式色相和声 / 精选高饱和色板），否则取作者的一套配色
 *   整体旋转色相、提饱和度，**明度不动**。
 * - `palette`：70% 套一个精选高饱和色板（按当前浅/深底重排明度），否则套 PRD 内置色板。
 * - `full`：85% vivid 全色域（色相按黄金角铺开），否则每个元件各自随机色相、明度沿用作者配色。
 *
 * 跳过 `locked` 元件（「锁定」的全部意义）；渐变元件的每个色标一起变，保持渐变内部关系。
 */
export function randomizeColors(
  cfg: PatternConfig,
  def: PatternDef,
  strategy: ColorStrategy,
  seed: number,
): PatternConfig {
  return randomizeColorsWithPalette(cfg, def, strategy, seed).cfg;
}

/** 「换一版」的结果 + 这一版取自哪套色板（评分用；生成式和声 / 作者配色骨架为 null）。 */
export interface RerollResult {
  cfg: PatternConfig;
  paletteId: string | null;
}

const NO_EXCLUDE: ReadonlySet<string> = new Set();

/**
 * 去掉被排除的色板；全部被排除时返回空数组（由调用方决定退路）。
 * 不排除任何色板时返回**原数组**：抽签下标与旧实现逐位一致，同 seed 同结果。
 */
function withoutExcluded(list: readonly Palette[], exclude: ReadonlySet<string>): readonly Palette[] {
  return exclude.size === 0 ? list : list.filter((p) => !exclude.has(p.id));
}

/**
 * 与 `randomizeColors` 相同，但：
 *  - 返回这一版用到的色板 id（「色板 × 母题」评分的对象）；
 *  - `exclude`：本母题里用户评过 👎 的色板，不会被抽到。
 *    某个池子被排除光时退到另一个池子；两个池子都被排除光则忽略排除（总得给出一版）。
 */
export function randomizeColorsWithPalette(
  cfg: PatternConfig,
  def: PatternDef,
  strategy: ColorStrategy,
  seed: number,
  exclude: ReadonlySet<string> = NO_EXCLUDE,
): RerollResult {
  const rng = mulberry32(seed);
  if (def.rerollSchemes && def.rerollSchemes.length > 0) {
    return ownScheme(cfg, def, def.rerollSchemes, seed, rng, exclude);
  }
  const tone = bgTone(cfg, def);
  // 先掷一次骰子决定这一版走「高饱和生成」还是「作者配色骨架」：
  // 用户反馈「换一版的颜色都太保守」→ 大部分点击给出鲜艳配色，作者配色只偶尔出现。
  const roll = rng();
  let vividPool = withoutExcluded(VIVID_PALETTES, exclude);
  let plainPool = withoutExcluded(PALETTES, exclude);
  if (vividPool.length === 0 && plainPool.length === 0) {
    vividPool = VIVID_PALETTES;
    plainPool = PALETTES;
  }

  if (strategy === 'palette') {
    if (vividPool.length > 0 && (roll < VIVID_SHARE.palette || plainPool.length === 0)) {
      const pal = vividPool[Math.floor(rng() * vividPool.length) % vividPool.length];
      return { cfg: vividFromScheme(cfg, def, seed, rng, curatedScheme(pal, rng)), paletteId: pal.id };
    }
    if (plainPool.length > 0) {
      const pal = plainPool[Math.floor(rng() * plainPool.length) % plainPool.length];
      const locked = new Set(cfg.elements.filter((e) => e.locked).map((e) => e.id));
      const slots: Record<string, string> = {};
      for (const [role, hex] of Object.entries(pal.slots)) slots[role] = hex;
      const applied = applyPaletteSlots(cfg, def, slots);
      applied.elements = applied.elements.map((e, i) => (locked.has(e.id) ? cfg.elements[i] : e));
      applied.seed = seed;
      return { cfg: keepTone(applied, def, tone), paletteId: pal.id };
    }
  }

  if (strategy === 'full' && roll < VIVID_SHARE.full) {
    return { cfg: vividFromScheme(cfg, def, seed, rng, freeScheme(rng)), paletteId: null };
  }
  if (strategy === 'analogous' && roll < VIVID_SHARE.analogous) {
    // 生成和声 : 精选色板 ≈ 5 : 3
    if (rng() < 0.62 || vividPool.length === 0) {
      return { cfg: vividFromScheme(cfg, def, seed, rng, harmonyScheme(rng)), paletteId: null };
    }
    const pal = vividPool[Math.floor(rng() * vividPool.length) % vividPool.length];
    return { cfg: vividFromScheme(cfg, def, seed, rng, curatedScheme(pal, rng)), paletteId: pal.id };
  }

  return { cfg: authorRecolor(cfg, def, strategy, seed, rng, tone), paletteId: null };
}

/**
 * 母题自带配色池（`PatternDef.rerollSchemes`）：抽一套、整体轻微抖动色相 / 饱和度。
 * 与当前配色相同的那套跳过，保证每次点击都「换了」。锁定元件不动。
 */
function ownScheme(
  cfg: PatternConfig,
  def: PatternDef,
  schemes: NonNullable<PatternDef['rerollSchemes']>,
  seed: number,
  rng: () => number,
  exclude: ReadonlySet<string>,
): RerollResult {
  let pool = schemes.filter((s) => !exclude.has(s.id));
  if (pool.length === 0) pool = [...schemes];
  const same = (s: (typeof schemes)[number]): boolean =>
    Object.entries(s.elements).every(([id, p]) => {
      const cur = cfg.elements.find((e) => e.id === id)?.paint;
      return cur !== undefined && stopsOf(cur)[0] !== undefined && hueNear(stopsOf(cur)[0], stopsOf(p)[0]);
    });
  let idx = Math.floor(rng() * pool.length) % pool.length;
  if (pool.length > 1 && same(pool[idx])) idx = (idx + 1 + Math.floor(rng() * (pool.length - 1))) % pool.length;
  const pick = pool[idx];
  const hueShift = (rng() - 0.5) * 16; // ±8°
  const satScale = 0.92 + rng() * 0.16;
  const next = structuredCloneConfig(cfg);
  next.seed = seed;
  for (const e of next.elements) {
    const src = pick.elements[e.id];
    const spec = def.elements.find((d) => d.id === e.id);
    if (!src || e.locked || spec?.configurable === false) continue;
    e.paint = mapPaint(src, (hex) => {
      const { h, s, l } = hexToHsl(hex);
      return hslToHex((((h + hueShift) % 360) + 360) % 360, clamp(s * satScale, 0, 1), l);
    });
  }
  // 用户切过浅/深底时保持其底色类别（keepTone 翻转明度，不行就退回作者同色调配色）
  return { cfg: keepTone(next, def, bgTone(cfg, def)), paletteId: pick.id };
}

function hueNear(a: string, b: string): boolean {
  const ha = hexToHsl(a);
  const hb = hexToHsl(b);
  const d = Math.abs(ha.h - hb.h) % 360;
  return Math.min(d, 360 - d) < 14 && Math.abs(ha.l - hb.l) < 0.12;
}

/** 作者配色骨架整体转色相 / 提饱和度（`randomizeColors` 的非 vivid 分支）。 */
function authorRecolor(
  cfg: PatternConfig,
  def: PatternDef,
  strategy: ColorStrategy,
  seed: number,
  rng: () => number,
  tone: BgTone,
): PatternConfig {
  const next = structuredCloneConfig(cfg);
  next.seed = seed;
  const source = pickSource(def, rng, tone);
  // 色相整体转 40°~320°：太小看不出「换了一版」，正好 360° 又等于没换
  const hueShift = 40 + rng() * 280;
  const satScale = 1.1 + rng() * 0.45;

  for (const e of next.elements) {
    const spec = def.elements.find((d) => d.id === e.id);
    if (e.locked || spec?.configurable === false) continue;
    const src = source.get(e.id) ?? e.paint;
    const isBg = spec?.role === 'bg';
    if (strategy === 'full') {
      const shift = rng() * 360;
      e.paint = mapPaint(src, (hex) => recolorHex(hex, shift, 1.2 + rng() * 0.5, isBg ? 0 : 0.4));
    } else {
      e.paint = mapPaint(src, (hex) => recolorHex(hex, hueShift, satScale, isBg ? 0 : 0.32));
    }
  }
  return keepTone(next, def, tone);
}

/* ─────────────────────────────────────────────────────────────────
 * 高饱和「vivid」配色：色相和声 + 明度骨架 + 对比度兜底
 * ───────────────────────────────────────────────────────────────── */

/** 各策略里走 vivid 的概率；其余点击回到作者配色骨架（同样提了饱和度）。 */
const VIVID_SHARE = { analogous: 0.82, full: 0.85, palette: 0.7 } as const;

/** 前景元件与底色的最低 WCAG 对比度（按画出来的颜色算，不计不透明度）。 */
export const VIVID_MIN_CONTRAST: Record<BgTone, number> = { light: 1.8, dark: 2.5 };

interface HueSat {
  h: number;
  s: number;
}

/** 一套 vivid 配色方案：底色色倾 + 按角色顺序排列的前景色相。明度不在这里定。 */
export interface VividScheme {
  bg: HueSat;
  fg: HueSat[];
  /** 渐变色标之间的色相漂移（度），让渐变内部也有色彩流动而不是单色深浅。 */
  drift: number;
}

const wrapHue = (h: number): number => ((h % 360) + 360) % 360;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** 色相和声：互补 / 分裂互补 / 三角 / 邻近 / 四方。数组第 0 个给 primary。 */
const HARMONIES: readonly (readonly number[])[] = [
  [0, 180, 30, 210], // complementary
  [0, 150, 210, 60], // split-complementary
  [0, 120, 240, 60], // triadic
  [0, 35, 70, -35], // analogous（高饱和邻近，依旧够跳）
  [0, 90, 180, 270], // square
];

/** 生成式和声：随机基色相 + 一种和声，前景饱和度 0.7~0.95。 */
export function harmonyScheme(rng: () => number): VividScheme {
  const base = rng() * 360;
  const kind = HARMONIES[Math.floor(rng() * HARMONIES.length) % HARMONIES.length];
  const fg = kind.map((d) => ({ h: wrapHue(base + d + (rng() - 0.5) * 14), s: 0.72 + rng() * 0.23 }));
  // 底色色倾：互补（最跳）> 同色系（单色调）> 第三色
  const r = rng();
  const bgH = r < 0.5 ? base + 180 : r < 0.8 ? base : base + kind[2];
  return { bg: { h: wrapHue(bgH + (rng() - 0.5) * 20), s: 0 }, fg, drift: (rng() < 0.5 ? -1 : 1) * (18 + rng() * 30) };
}

/** 「全色域」：前景色相按黄金角铺开，互不相近，饱和度拉满。 */
export function freeScheme(rng: () => number): VividScheme {
  let h = rng() * 360;
  const fg: HueSat[] = [];
  for (let i = 0; i < 5; i++) {
    fg.push({ h: wrapHue(h), s: 0.75 + rng() * 0.22 });
    h += 137.508 + (rng() - 0.5) * 30;
  }
  return { bg: { h: rng() * 360, s: 0 }, fg, drift: (rng() < 0.5 ? -1 : 1) * (25 + rng() * 40) };
}

/** 精选高饱和色板 → 方案：只取色相与饱和度（饱和度至少 0.7），明度由当前底色类别决定。 */
export function curatedScheme(pal: Palette, rng: () => number): VividScheme {
  const order: (keyof Palette['slots'])[] = ['primary', 'secondary', 'accent', 'detail'];
  const fg = order.map((k) => {
    const { h, s } = hexToHsl(pal.slots[k]);
    return { h: wrapHue(h + (rng() - 0.5) * 10), s: clamp(Math.max(s, 0.7), 0, 0.97) };
  });
  return { bg: { h: hexToHsl(pal.slots.bg).h, s: 0 }, fg, drift: (rng() < 0.5 ? -1 : 1) * (15 + rng() * 25) };
}

/** 纯色相（s=1, l=0.5）的相对亮度：黄 ≈ 0.93、蓝 ≈ 0.07。用于把色相分给明暗不同的元件。 */
function hueLum(h: number): number {
  const { r, g, b } = hexToRgb(hslToHex(h, 1, 0.5));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const ROLE_RANK: Record<string, number> = { primary: 0, secondary: 1, accent: 2, detail: 3, bg: 9 };

function stopsOf(paint: PaintSpec): string[] {
  if (paint.type === 'solid') return [paint.color];
  if (paint.type === 'linear' || paint.type === 'radial') return paint.stops.map((st) => st.color);
  return [];
}

/** 用一组新颜色（与色标一一对应）重写 paint；色标 offset / stop-opacity 原样保留。 */
function withColors(paint: PaintSpec, colors: string[]): PaintSpec {
  if (paint.type === 'solid') return { type: 'solid', color: colors[0] };
  if (paint.type === 'linear' || paint.type === 'radial') {
    return { ...paint, stops: paint.stops.map((st, i) => ({ ...st, color: colors[i] ?? st.color })) };
  }
  return paint;
}

function rgbDist(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
}

/**
 * 叠加层（颗粒、高光、阴影、扫描线、星点、白云这类）：近白/近黑且半透明，或低不透明度的 detail。
 * 它们靠「白/黑 + 透明度」起作用，染成鲜艳色会破坏质感 → 原样保留，也不参与对比度约束。
 */
function isOverlay(paint: PaintSpec, opacity: number, role: string): boolean {
  const cols = stopsOf(paint);
  if (cols.length === 0) return true;
  const l = cols.reduce((a, c) => a + hexToHsl(c).l, 0) / cols.length;
  if ((l >= 0.9 || l <= 0.08) && opacity < 0.95) return true;
  return role === 'detail' && opacity <= 0.4;
}

/**
 * 按方案生成一版 vivid 配色。
 *
 * - 明度骨架取自作者的同色调配色（保留「谁亮谁暗」的层次，如浮雕的受光面/背光面），
 *   但在纯色底母题里拉伸到鲜艳色最好看的明度区间，再逐个推离底色直到对比度达标。
 * - 底色：浅底 → 淡彩（l 0.92~0.96），深底 → 深而饱和（l 0.07~0.14）。
 * - 底色是大跨度渐变（天空、落日）的「场景型」母题：每个色标保留作者明度、只换色相饱和度，
 *   否则日落会被压成一片平色。
 * - 渐变元件：每个色标都重新上色（色相沿 drift 漂移），色标间的明度差与 stop-opacity 保持。
 * - 锁定 / 不可配置元件不动；不透明度不动；全部确定性（同 seed 同结果）。
 */
function vividFromScheme(
  cfg: PatternConfig,
  def: PatternDef,
  seed: number,
  rng: () => number,
  scheme: VividScheme,
): PatternConfig {
  const tone = bgTone(cfg, def);
  const source = pickSource(def, rng, tone);
  const bgSet = new Set(bgIds(def));
  const specOf = (id: string) => def.elements.find((d) => d.id === id);
  const editable = (e: ElementConfig) => !e.locked && specOf(e.id)?.configurable !== false;

  const bgL = tone === 'dark' ? 0.07 + rng() * 0.07 : 0.92 + rng() * 0.04;
  // 深底避开黄/橙色相：压暗后是橄榄褐、泥色，一点也不「深而饱和」→ 转到互补的蓝紫一侧
  if (tone === 'dark' && wrapHue(scheme.bg.h) > 25 && wrapHue(scheme.bg.h) < 85) {
    scheme = { ...scheme, bg: { ...scheme.bg, h: wrapHue(scheme.bg.h + 180) } };
  }
  const bgS = tone === 'dark' ? 0.5 + rng() * 0.4 : 0.45 + rng() * 0.45;
  const fgSatJitter = cfg.elements.map(() => rng());

  // 场景型：底色渐变明度跨度大
  const bgSrc = cfg.elements.filter((e) => bgSet.has(e.id)).map((e) => source.get(e.id) ?? e.paint);
  const bgSpan = Math.max(
    0,
    ...bgSrc.map((p) => {
      const ls = stopsOf(p).map((c) => hexToHsl(c).l);
      return ls.length ? Math.max(...ls) - Math.min(...ls) : 0;
    }),
  );
  const scenic = bgSpan > 0.2;

  const build = (adj: number): PatternConfig => {
    const next = structuredCloneConfig(cfg);
    next.seed = seed;

    // 1) 底色
    for (const e of next.elements) {
      if (!bgSet.has(e.id) || !editable(e)) continue;
      const src = source.get(e.id) ?? e.paint;
      const ls = stopsOf(src).map((c) => hexToHsl(c).l);
      const mean = ls.reduce((a, b) => a + b, 0) / Math.max(1, ls.length);
      e.paint = withColors(
        src,
        ls.map((l, i) => {
          const h = scheme.bg.h + i * scheme.drift;
          if (scenic) return hslToHex(h, clamp(0.6 + bgS * 0.35, 0, 0.95), l);
          // adj > 0（整体明暗判到另一边时）把底色也往极端推一点
          const bl = tone === 'dark' ? Math.max(0.04, bgL - adj * 0.35) : Math.min(0.975, bgL + adj * 0.15);
          return hslToHex(h, bgS, clamp(bl + (l - mean), 0.03, 0.98));
        }),
      );
    }
    const bgColors = next.elements.filter((e) => bgSet.has(e.id)).flatMap((e) => stopsOf(e.paint));

    // 2) 叠加层回到作者原样（白/黑 + 透明度），不染色
    for (const e of next.elements) {
      if (bgSet.has(e.id) || !editable(e)) continue;
      const src = source.get(e.id) ?? e.paint;
      if (isOverlay(src, e.opacity, specOf(e.id)?.role ?? 'detail')) e.paint = src;
    }

    // 3) 前景常规元件：按角色排序分配色相
    const fgs = next.elements
      .map((e, idx) => ({ e, idx, spec: specOf(e.id), src: source.get(e.id) ?? e.paint }))
      .filter(({ e }) => !bgSet.has(e.id))
      .filter(({ e, spec, src }) => editable(e) && !isOverlay(src, e.opacity, spec?.role ?? 'detail'))
      .sort((a, b) => (ROLE_RANK[a.spec?.role ?? 'detail'] ?? 5) - (ROLE_RANK[b.spec?.role ?? 'detail'] ?? 5) || a.idx - b.idx);

    const meanL = (p: PaintSpec) => {
      const ls = stopsOf(p).map((c) => hexToHsl(c).l);
      return ls.reduce((a, b) => a + b, 0) / Math.max(1, ls.length);
    };
    const srcLs = fgs.map((f) => meanL(f.src));
    const minL = Math.min(...srcLs);
    const maxL = Math.max(...srcLs);
    const [lo, hi] = tone === 'light' ? [Math.min(0.5, 0.25 + adj), 0.66] : [0.42, Math.max(0.5, 0.76 - adj)];
    const T = VIVID_MIN_CONTRAST[tone];
    const used: string[] = [...bgColors];

    // 目标明度：场景型保留作者明度；纯色底按作者明暗顺序拉伸到 [lo, hi]
    const targets = fgs.map((_, i) => {
      const m = srcLs[i];
      if (scenic) return m;
      if (maxL - minL < 0.04) return fgs.length > 1 ? lo + ((hi - lo) * (i % 3)) / 2 : (lo + hi) / 2;
      return lo + ((m - minL) / (maxL - minL)) * (hi - lo);
    });
    // 色相按「天生亮度」分给元件：最暗的元件拿蓝/紫/红，最亮的拿黄/青。
    // 否则黄、橙被压到低明度就成了土褐色 —— 正是「保守、脏」的来源。
    const n = scheme.fg.length;
    const huePlan = fgs.map((_, i) => ({ ...scheme.fg[i % n], h: scheme.fg[i % n].h + Math.floor(i / n) * 24 }));
    const byHueLum = [...huePlan].sort((a, b) => hueLum(a.h) - hueLum(b.h));
    const byTarget = fgs.map((_, i) => i).sort((a, b) => targets[a] - targets[b] || a - b);
    const assigned: HueSat[] = new Array(fgs.length);
    byTarget.forEach((fi, rank) => (assigned[fi] = byHueLum[rank]));

    fgs.forEach((f, i) => {
      const hs = assigned[i];
      let h = hs.h;
      const s = clamp(hs.s + (fgSatJitter[f.idx] - 0.5) * 0.08, 0.62, 0.98);
      const srcStops = stopsOf(f.src).map((c) => hexToHsl(c).l);
      const m = srcLs[i];
      const target = targets[i];

      const colorsAt = (hh: number, base: number) =>
        srcStops.map((l, k) => hslToHex(hh + k * scheme.drift * 0.5, s, clamp(base + (l - m), 0.04, 0.97)));
      const okContrast = (cols: string[]) =>
        scenic || cols.every((c) => bgColors.every((b) => contrastRatio(c, b) >= T));

      let best = colorsAt(h, target);
      for (let attempt = 0; attempt < 6; attempt++) {
        let base = target;
        let cols = colorsAt(h, base);
        // 推离底色直到对比度达标（浅底往暗推，深底往亮推）
        for (let k = 0; k < 40 && !okContrast(cols); k++) {
          base = clamp(base + (tone === 'light' ? -0.02 : 0.02), 0.04, 0.97);
          cols = colorsAt(h, base);
        }
        best = cols;
        // 与已用颜色（含底色、其它元件）过近 → 转一点色相再来
        if (used.every((u) => rgbDist(u, cols[0]) >= 46)) break;
        h += 29;
      }
      used.push(best[0]);
      f.e.paint = withColors(f.src, best);
    });
    return next;
  };

  // 前景元件多的母题（如孟菲斯 5 个前景）可能把整体明暗判到另一边
  // → 逐步收窄前景明度区间（深底压低上限、浅底抬高下限），仍不行再交给 keepTone 兜底
  let out = build(0);
  for (let adj = 0.05; bgTone(out, def) !== tone && adj <= 0.3; adj += 0.05) out = build(adj);
  return keepTone(out, def, tone);
}

/**
 * 直接取一版 vivid 配色（不经「换一版」的概率分流）。供测试与调试用。
 * `kind`：harmony = 生成式和声，curated = 精选色板，free = 全色域。
 */
export function vividColors(
  cfg: PatternConfig,
  def: PatternDef,
  seed: number,
  kind: 'harmony' | 'curated' | 'free' = 'harmony',
): PatternConfig {
  const rng = mulberry32(seed ^ 0x5f3759df);
  const scheme =
    kind === 'free'
      ? freeScheme(rng)
      : kind === 'curated' && VIVID_PALETTES.length > 0
        ? curatedScheme(VIVID_PALETTES[Math.floor(rng() * VIVID_PALETTES.length) % VIVID_PALETTES.length], rng)
        : harmonyScheme(rng);
  return vividFromScheme(cfg, def, seed, rng, scheme);
}

/** 该母题的底色是否为大跨度渐变（天空 / 落日这类「场景型」）：vivid 时保留作者明度、不做对比度约束。 */
export function isScenic(def: PatternDef): boolean {
  return authorSources(def).some((m) =>
    bgIds(def).some((id) => {
      const p = m.get(id);
      const ls = p ? stopsOf(p).map((c) => hexToHsl(c).l) : [];
      return ls.length > 0 && Math.max(...ls) - Math.min(...ls) > 0.2;
    }),
  );
}

/** 换色后若浅/深底被改变（色板、无同色调配色等情况），按明度翻转回原来的底色类别。 */
function keepTone(cfg: PatternConfig, def: PatternDef, tone: BgTone): PatternConfig {
  if (bgTone(cfg, def) === tone) return cfg;
  const flipped = flipLightness(cfg, def, tone);
  // 翻转仍不达标（前景占比大的母题）→ 退回作者的同色调配色，保证底色类别一定不跳
  return bgTone(flipped, def) === tone ? flipped : applyTone(cfg, def, tone);
}

/** 只重写 solid 的颜色；渐变则重写首个色标，其余保持不变。 */
function retargetPaint(paint: PaintSpec, color: string): PaintSpec {
  if (paint.type === 'solid') return { type: 'solid', color };
  if (paint.type === 'linear' || paint.type === 'radial') {
    return {
      ...paint,
      stops: paint.stops.map((s, i) => (i === 0 ? { ...s, color } : s)),
    };
  }
  return paint;
}

/**
 * 把一套内置色板套到某个 pattern 上。
 *
 * 走 `def.paletteSlots`（作者显式声明的 role → 元件映射），
 * 而不是直接按 `element.role` 过滤 —— 二者不等价。
 * 渐变元件只替换第一个色标，与 `randomizeColors` 保持同一套语义。
 */
export function applyPaletteSlots(
  cfg: PatternConfig,
  def: PatternDef,
  slots: Record<string, string>,
): PatternConfig {
  const next = structuredCloneConfig(cfg);
  for (const [role, hex] of Object.entries(slots)) {
    const members = def.paletteSlots[role];
    if (!members) continue;
    const idSet = new Set(members);
    next.elements = next.elements.map((e) =>
      idSet.has(e.id) ? { ...e, paint: retargetPaint(e.paint, hex) } : e,
    );
  }
  return next;
}

/** 只保留指定元件的显隐/锁定状态，其余重置 —— 供「清理」快捷操作使用。 */
export function resetElements(
  cfg: PatternConfig,
  def: PatternDef,
): PatternConfig {
  const next = structuredCloneConfig(cfg);
  next.elements = next.elements.map((e) => {
    const spec = def.elements.find((d) => d.id === e.id);
    return {
      ...e,
      opacity: spec?.opacity ?? e.opacity,
      visible: spec?.visible ?? e.visible,
      locked: spec?.locked ?? false,
    };
  });
  return next;
}

export type { ElementConfig };

/* ─────────────────────────────────────────────────────────────────
 * 浅底 / 深底（每张图都能切）
 * ───────────────────────────────────────────────────────────────── */

export type BgTone = 'light' | 'dark';

/** 母题允许的底色；缺省两种都行。 */
export function allowedTones(def: PatternDef): readonly BgTone[] {
  return def.tones && def.tones.length > 0 ? def.tones : (['light', 'dark'] as const);
}

function paintLightness(paint: PaintSpec): number | null {
  if (paint.type === 'solid') return hexToHsl(paint.color).l;
  if (paint.type === 'linear' || paint.type === 'radial') {
    if (paint.stops.length === 0) return null;
    return paint.stops.reduce((a, st) => a + hexToHsl(st.color).l, 0) / paint.stops.length;
  }
  return null;
}

function bgIds(def: PatternDef): string[] {
  const ids = def.elements.filter((e) => e.role === 'bg').map((e) => e.id);
  return ids.length > 0 ? ids : def.elements.slice(0, 1).map((e) => e.id);
}

/**
 * 画面整体是浅还是深。底色权重 2、主/次色权重 1：
 * 有些母题的 bg 只是细缝（pyramid-facets、raised-tiles），只看 bg 会把一张浅色图判成深色。
 */
function toneOf(paints: Map<string, PaintSpec>, def: PatternDef): BgTone {
  const bg = new Set(bgIds(def));
  let sum = 0;
  let w = 0;
  for (const e of def.elements) {
    const weight = bg.has(e.id) ? 2 : e.role === 'primary' || e.role === 'secondary' ? 1 : 0;
    if (!weight) continue;
    const p = paints.get(e.id);
    const l = p ? paintLightness(p) : null;
    if (l === null) continue;
    sum += l * weight;
    w += weight;
  }
  return (w ? sum / w : 1) < 0.5 ? 'dark' : 'light';
}

/** 当前画面是浅底还是深底（按底色元件的平均明度判断）。 */
export function bgTone(cfg: PatternConfig, def: PatternDef): BgTone {
  return toneOf(new Map(cfg.elements.map((e) => [e.id, e.paint])), def);
}

/**
 * 切换浅底 / 深底。
 *
 * 1. 优先用作者调过的同色调配色（默认配色或 preset）：明暗关系、对比度都是人工调好的，
 *    多套候选时选底色色相离当前最近的一套，尽量保留用户选的色系。
 * 2. 没有现成配色时，按明度翻转：底色压到很暗 / 很亮，前景元件 l → 1 − l
 *    并夹在可读区间，色相与饱和度不动。
 *
 * 锁定元件不改；形态参数不改（只换颜色，不换构图）。
 */
export function applyTone(cfg: PatternConfig, def: PatternDef, tone: BgTone): PatternConfig {
  if (bgTone(cfg, def) === tone) return cfg;
  const next = structuredCloneConfig(cfg);
  const bgSet = new Set(bgIds(def));

  const sources = authorSources(def);
  const matching = sources.filter((m) => toneOf(m, def) === tone);

  const firstHue = (p: PaintSpec | undefined): number | null => {
    if (!p) return null;
    const hex = p.type === 'solid' ? p.color : (p.type === 'linear' || p.type === 'radial') ? p.stops[0]?.color : undefined;
    return hex ? hexToHsl(hex).h : null;
  };
  const curHue = firstHue(cfg.elements.find((e) => bgSet.has(e.id))?.paint);

  if (matching.length > 0) {
    let best = matching[0];
    if (curHue !== null && matching.length > 1) {
      const dist = (m: Map<string, PaintSpec>) => {
        const h = firstHue(m.get([...bgSet][0]));
        if (h === null) return 999;
        const d = Math.abs(h - curHue) % 360;
        return Math.min(d, 360 - d);
      };
      best = [...matching].sort((a, b) => dist(a) - dist(b))[0];
    }
    const op = SOURCE_OPACITY.get(best);
    for (const e of next.elements) {
      if (e.locked) continue;
      const p = best.get(e.id);
      if (p) e.paint = p;
      const o = op?.get(e.id);
      if (typeof o === 'number') e.opacity = o;
    }
    return next;
  }
  return flipLightness(cfg, def, tone);
}

/** 按明度翻转到目标底色：底色压到很暗 / 很亮，前景 l → 1 − l，色相饱和度不动；锁定元件不改。 */
function flipLightness(cfg: PatternConfig, def: PatternDef, tone: BgTone): PatternConfig {
  const next = structuredCloneConfig(cfg);
  const bgSet = new Set(bgIds(def));
  for (const e of next.elements) {
    if (e.locked) continue;
    const isBg = bgSet.has(e.id);
    e.paint = mapPaint(e.paint, (hex) => {
      const { h, s, l } = hexToHsl(hex);
      if (isBg) {
        const nl = tone === 'dark' ? 0.06 + (1 - l) * 0.25 : 0.88 + (1 - l) * 0.1;
        return hslToHex(h, Math.min(s, 0.35), Math.min(0.97, Math.max(0.04, nl)));
      }
      const nl = Math.min(0.85, Math.max(0.22, 1 - l));
      return hslToHex(h, s, nl);
    });
  }
  return next;
}
