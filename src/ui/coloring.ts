/**
 * 随机配色（PRD Q3：默认邻近色，另有「仅当前色板」「全色域」两档）。
 *
 * ⚠️ 全部走 seeded RNG（`mulberry32`）—— 绝不使用 `Math.random()`。
 * 原因：同一 seed + 同一当前配色必须产出同一结果，否则「分享链接」
 * 会指向一个用户自己都复现不出来的画面。
 */
import { generateColors, type ColorStrategy } from '../engine/colors';
import { mulberry32 } from '../engine/rng';
import { PALETTES } from '../patterns/palettes';
import { structuredCloneConfig } from '../engine/render';
import type { ElementConfig, PatternConfig } from '../engine/types';
import type { PaintSpec, PatternDef } from '../patterns/types';

/** 全部内置色板的颜色汇总，作为「仅当前色板」策略的取色池。 */
const ALL_PALETTE_HEXES: readonly string[] = Object.freeze(
  PALETTES.flatMap((p) => Object.values(p.slots)),
);

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

/** 找一个底色元件，作为邻近色推导的基准。 */
function findBaseColor(cfg: PatternConfig, def: PatternDef): string {
  const bgEl = cfg.elements.find(
    (e) => def.elements.find((d) => d.id === e.id)?.role === 'bg',
  );
  if (bgEl && bgEl.paint.type === 'solid') return bgEl.paint.color;
  return '#5b8cff';
}

/**
 * 对配置做一次随机配色。
 *
 * 跳过 `locked` 元件 —— 这是「锁定」这个功能的全部意义。
 * 渐变元件只重写**第一个色标**，保留渐变类型与其它参数：
 * 把渐变整体压成单色会毁掉构图，而只改一端色则保持了原有明暗关系。
 */
export function randomizeColors(
  cfg: PatternConfig,
  def: PatternDef,
  strategy: ColorStrategy,
  seed: number,
): PatternConfig {
  const next = structuredCloneConfig(cfg);
  next.seed = seed;
  const rng = mulberry32(seed);

  const targets = next.elements.filter((e) => {
    const spec = def.elements.find((d) => d.id === e.id);
    return !e.locked && spec?.configurable !== false && spec?.visible !== false;
  });
  if (targets.length === 0) return next;

  const colors = generateColors(strategy, {
    base: findBaseColor(cfg, def),
    count: targets.length,
    palette: ALL_PALETTE_HEXES,
    rng,
  });

  targets.forEach((e, i) => {
    e.paint = retargetPaint(e.paint, colors[i]);
  });
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
