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
function pickSource(def: PatternDef, rng: () => number): Map<string, PaintSpec> {
  const base = new Map<string, PaintSpec>(def.elements.map((e) => [e.id, e.paint]));
  const choices = def.presets.length;
  const k = Math.floor(rng() * (choices + 1));
  if (k < choices) {
    for (const [id, o] of Object.entries(def.presets[k].elements)) base.set(id, o.paint);
  }
  return base;
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

  if (strategy === 'palette' && PALETTES.length > 0) {
    const pal = PALETTES[Math.floor(rng() * PALETTES.length) % PALETTES.length];
    const locked = new Set(cfg.elements.filter((e) => e.locked).map((e) => e.id));
    const slots: Record<string, string> = {};
    for (const [role, hex] of Object.entries(pal.slots)) slots[role] = hex;
    const applied = applyPaletteSlots(cfg, def, slots);
    applied.elements = applied.elements.map((e, i) => (locked.has(e.id) ? cfg.elements[i] : e));
    applied.seed = seed;
    return applied;
  }

  const next = structuredCloneConfig(cfg);
  next.seed = seed;
  const source = pickSource(def, rng);
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
  return next;
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
