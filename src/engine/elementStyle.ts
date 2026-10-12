/**
 * 元件解析 —— 把用户的 `ElementConfig[]` 与 `PatternDef.elements` 按 **id** 对齐，
 * 并把 PaintSpec 编译成可直接赋给 fill/stroke 的字面量。
 *
 * ⭐ 按 id 匹配而非下标：pattern 增删元件后，历史分享链接里的
 * `cols` 数组不会发生错位配色（架构 §6.3 兼容铁律 2）。
 */
import { normalizeHex, normalizeStops } from './colors';
import { clamp } from '../shared/guards';
import type { DefsRegistry } from './defs';
import type { ElementRole, PaintSpec, PatternDef, ResolvedElement } from '../patterns/types';
import type { ElementConfig, PatternConfig } from './types';

/** 把 PaintSpec 编译为字面量：solid → hex，渐变 → `url(#id)`，none → 'none'。 */
export function paintToValue(paint: PaintSpec, defs: DefsRegistry, key: string): string {
  switch (paint.type) {
    case 'solid':
      return normalizeHex(paint.color);
    case 'linear':
      return defs.linear({ angle: paint.angle, stops: normalizeStops(paint.stops), key });
    case 'radial':
      return defs.radial({
        cx: paint.cx,
        cy: paint.cy,
        r: paint.r,
        stops: normalizeStops(paint.stops),
        key,
      });
    case 'none':
      return 'none';
  }
}

/** 非法 PaintSpec → 回落默认，绝不抛错。 */
function sanitizePaint(paint: PaintSpec | undefined, fallback: PaintSpec): PaintSpec {
  if (!paint || typeof paint !== 'object') return fallback;
  switch (paint.type) {
    case 'none':
      return { type: 'none' };
    case 'solid':
      return { type: 'solid', color: normalizeHex(paint.color) };
    case 'linear':
      return {
        type: 'linear',
        angle: Number.isFinite(paint.angle) ? paint.angle : 90,
        stops: normalizeStops(paint.stops),
      };
    case 'radial':
      return {
        type: 'radial',
        cx: Number.isFinite(paint.cx) ? paint.cx : 0.5,
        cy: Number.isFinite(paint.cy) ? paint.cy : 0.5,
        r: Number.isFinite(paint.r) ? paint.r : 0.5,
        stops: normalizeStops(paint.stops),
      };
    default:
      return fallback;
  }
}

/**
 * 对齐并编译全部元件。
 *
 * 返回的 Map **始终包含 `def.elements` 的每个 id**：
 *  - 可见元件 → paintValue 为 hex 或 `url(#…)`
 *  - 不可见元件 → paintValue 强制 'none'
 * 这样 pattern 侧可以无脑 `elements.get(id)!`，不必到处判空
 * （架构 §4.5「pattern 无需自行判空」），同时天然支持元件显隐。
 */
export function resolveElements(
  def: PatternDef,
  configs: readonly ElementConfig[] | undefined,
  defs: DefsRegistry,
): Map<string, ResolvedElement> {
  const byId = new Map<string, ElementConfig>();
  for (const c of configs ?? []) {
    if (c && typeof c.id === 'string' && !byId.has(c.id)) byId.set(c.id, c);
  }

  const out = new Map<string, ResolvedElement>();
  for (const spec of def.elements) {
    const user = byId.get(spec.id);
    const paint = sanitizePaint(user?.paint, spec.paint);
    const visible = (user?.visible ?? spec.visible) === true;
    const opacity = clamp(user?.opacity ?? spec.opacity, 0, 1);
    out.set(spec.id, {
      id: spec.id,
      label: spec.label,
      role: spec.role,
      configurable: spec.configurable,
      visible,
      locked: user?.locked ?? spec.locked ?? false,
      opacity,
      paint,
      paintValue: visible ? paintToValue(paint, defs, spec.id) : 'none',
    });
  }
  return out;
}

/**
 * 元件 → SVG 属性映射（架构 §4.5）。
 *
 * 渐变通过 `paintValue = 'url(#…)'` **透明地**接入同一套映射 ——
 * 这是 PaintSpec 抽象的关键收益：映射逻辑无需区分单色与渐变。
 */
export function paintToAttrs(e: ResolvedElement): Record<string, string | number> {
  return { fill: e.paintValue, 'fill-opacity': e.opacity };
}

/**
 * 描边属性 —— PRD 的 role 集合里没有 'line'，线条类元件用 `detail` role
 * 并在 pattern 内显式请求描边属性。
 */
export function paintToStrokeAttrs(
  e: ResolvedElement,
  width: number,
): Record<string, string | number> {
  return {
    fill: 'none',
    stroke: e.paintValue,
    'stroke-width': width,
    'stroke-opacity': e.opacity,
    'stroke-linecap': 'round',
  };
}
/**
 * role 批量改色（PRD P0-2：「点强调色 ×2 一次改多个同 role 元件」）。
 *
 * 消费方此前是空的 —— `paletteSlots` 只作为元数据存在，engine/ui 都没人读它。
 * 这里把它落成引擎能力，UI 只需传 role + 颜色，不必自己遍历元件表。
 *
 * 语义说明：
 *  - 走 `paletteSlots[role]` 而非直接按 `element.role` 过滤，
 *    因为槽位表是 pattern 作者显式声明的「这个 role 在本 pattern 里对应哪些元件」，
 *    二者不等价（例如 sun 在 dusk-ridges 里 role 是 accent，但槽位只声明了部分 role）。
 *  - 只改 paint，不动 opacity/visible —— 批量改色不应意外隐藏元件。
 *  - 返回**新的** PatternConfig，不修改入参（纯函数，便于 React 状态直接使用）。
 *
 * ⚠️ 语义提醒：**整体替换 paint，而不是改写色标**。
 * 若目标元件原本是渐变（linear/radial），传入单色会把整个渐变压成 solid。
 * 这是刻意选择 —— role 槽位的语义是「让这一组统一成一个颜色」，
 * 而非「把同一个色相注入渐变的某一站」。
 * PRD Q3 里 `bg` 本就是单色底色，当前 Lab 传入的也确实是 `{type:'solid'}`，
 * 因此现状无Bug；但**将来若把渐变元件纳入 role 槽位**，调用方需要意识到
 * 渐变结构会丢失，应改为对 `stops` 逐站操作。
 */
export function recolorByRole(
  def: PatternDef,
  cfg: PatternConfig,
  role: ElementRole,
  color: PaintSpec,
): PatternConfig {
  const targets = def.paletteSlots[role];
  if (!targets || targets.length === 0) return cfg;

  const idSet = new Set(targets);
  return {
    ...cfg,
    elements: cfg.elements.map((e) => (idSet.has(e.id) ? { ...e, paint: color } : e)),
  };
}

/**
 * 某pattern 在各 role 上的当前代表色（取该槽位第一个元件的颜色）。
 * UI 的 role 色块需要它来显示「这个 role 现在是什么颜色」。
 */
export function roleColors(def: PatternDef, cfg: PatternConfig): Partial<Record<ElementRole, PaintSpec>> {
  const out: Partial<Record<ElementRole, PaintSpec>> = {};
  for (const [role, members] of Object.entries(def.paletteSlots) as Array<[ElementRole, string[]]>) {
    const el = members.map((id) => cfg.elements.find((e: ElementConfig) => e.id === id)).find((e) => e !== undefined);
    if (el) out[role] = el.paint;
  }
  return out;
}
