/**
 * 随机配色（PRD Q3：默认邻近色，另有「仅当前色板」「全色域」两档）。
 *
 * ⚠️ 全部走 seeded RNG（`mulberry32`）—— 绝不使用 `Math.random()`。
 * 原因：同一 seed + 同一当前配色必须产出同一结果，否则「分享链接」
 * 会指向一个用户自己都复现不出来的画面。
 */
import { hexToHsl, hslToHex, type ColorStrategy } from '../engine/colors';
import { mulberry32 } from '../engine/rng';
import { PALETTES } from '../patterns/palettes';
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
  const out = [defaults];
  for (const pr of def.presets) {
    const m = new Map(defaults);
    for (const [id, o] of Object.entries(pr.elements)) m.set(id, o.paint);
    out.push(m);
  }
  return out;
}

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
    : Math.min(0.5, Math.max(satFloor, s * satScale));
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
 * - `analogous`（默认）：取作者的一套配色，整体旋转色相、微调饱和度，**明度不动**
 *   → 对比度与层次和作者原稿一致。
 * - `palette`：随机套一个内置色板（按 paletteSlots），不引入新颜色。
 * - `full`：每个元件各自随机色相，但明度仍沿用作者配色，避免糊成一片。
 *
 * 跳过 `locked` 元件（「锁定」的全部意义）；渐变元件的每个色标一起变，保持渐变内部关系。
 */
export function randomizeColors(
  cfg: PatternConfig,
  def: PatternDef,
  strategy: ColorStrategy,
  seed: number,
): PatternConfig {
  const rng = mulberry32(seed);
  const tone = bgTone(cfg, def);

  if (strategy === 'palette' && PALETTES.length > 0) {
    const pal = PALETTES[Math.floor(rng() * PALETTES.length) % PALETTES.length];
    const locked = new Set(cfg.elements.filter((e) => e.locked).map((e) => e.id));
    const slots: Record<string, string> = {};
    for (const [role, hex] of Object.entries(pal.slots)) slots[role] = hex;
    const applied = applyPaletteSlots(cfg, def, slots);
    applied.elements = applied.elements.map((e, i) => (locked.has(e.id) ? cfg.elements[i] : e));
    applied.seed = seed;
    return keepTone(applied, def, tone);
  }

  const next = structuredCloneConfig(cfg);
  next.seed = seed;
  const source = pickSource(def, rng, tone);
  // 色相整体转 40°~320°：太小看不出「换了一版」，正好 360° 又等于没换
  const hueShift = 40 + rng() * 280;
  const satScale = 0.85 + rng() * 0.35;

  for (const e of next.elements) {
    const spec = def.elements.find((d) => d.id === e.id);
    if (e.locked || spec?.configurable === false) continue;
    const src = source.get(e.id) ?? e.paint;
    const isBg = spec?.role === 'bg';
    if (strategy === 'full') {
      const shift = rng() * 360;
      e.paint = mapPaint(src, (hex) => recolorHex(hex, shift, 1 + rng() * 0.4, isBg ? 0 : 0.25));
    } else {
      e.paint = mapPaint(src, (hex) => recolorHex(hex, hueShift, satScale, isBg ? 0 : 0.18));
    }
  }
  return keepTone(next, def, tone);
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
    for (const e of next.elements) {
      if (e.locked) continue;
      const p = best.get(e.id);
      if (p) e.paint = p;
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
