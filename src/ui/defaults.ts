/**
 * 服务器默认值覆盖层（Rei 2026-10-14「批改模式」）。
 *
 * 内置默认（PatternDef）不动 —— 引擎与测试仍是纯的；这里在它之上叠一层「服务器覆盖」：
 *   - 新选一个母题 / 恢复默认 → `defaultConfigFor()`
 *   - 浅底 / 深底切换        → `applyToneDefaults()`：该底色有覆盖就用 Rei 上传的配色，否则沿用 applyTone
 * 分享链接 / 收藏的编解码（share.ts）仍以**内置默认**为基准 —— 链接说什么就渲染什么，不受覆盖影响。
 *
 * 覆盖只存「与内置默认不同」的元件 / 参数；还原 = 内置默认 + 覆盖（无损，见 recordFromConfig）。
 * 本模块不依赖 store（store 反过来依赖它），网络加载与批改模式在 admin-review.ts。
 */
import { useSyncExternalStore } from 'react';
import { createDefaultConfig, structuredCloneConfig } from '../engine/render';
import { clamp } from '../shared/guards';
import {
  mergeDefaults,
  type DefaultsMap,
  type ElementOverride,
  type ToneOverride,
} from '../shared/defaults-api';
import { applyTone, bgTone, type BgTone } from './coloring';
import type { ElementConfig, PatternConfig } from '../engine/types';
import type { ControlDef, PaintSpec, ParamValue, PatternDef } from '../patterns/types';

/* ── 纯函数 ───────────────────────────────────────────────────── */

/** 键顺序无关的结构比较（paint 对象可能来自不同构造路径）。 */
function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as object)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${k}:${canon((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v);
}

export const paintEqual = (a: PaintSpec, b: PaintSpec): boolean => canon(a) === canon(b);

/** 按控件定义校验 / 夹取一个覆盖值；不合法返回 undefined（沿用默认）。 */
export function validParam(c: ControlDef, v: ParamValue): ParamValue | undefined {
  if (c.type === 'toggle') return typeof v === 'boolean' ? v : undefined;
  if (c.type === 'select') return typeof v === 'string' && c.options.some((o) => o.value === v) ? v : undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
  return c.type === 'range' ? clamp(v, c.min, c.max) : v;
}

/** 控件默认值 + 覆盖（未知 key 忽略、越界夹取）。 */
export function paramsWith(def: PatternDef, over?: Record<string, ParamValue>): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const c of def.controls) {
    const o = over && Object.prototype.hasOwnProperty.call(over, c.key) ? validParam(c, over[c.key]) : undefined;
    out[c.key] = o ?? c.default;
  }
  return out;
}

/** 内置默认元件 + 某底色的覆盖（已不存在的元件 id 忽略；locked 沿用内置）。 */
export function elementsForTone(def: PatternDef, over: ToneOverride): ElementConfig[] {
  const byId = new Map(over.elements.map((e) => [e.id, e]));
  return def.elements.map((e) => {
    const o = byId.get(e.id);
    return {
      id: e.id,
      paint: o ? o.paint : e.paint,
      opacity: o ? clamp(o.opacity, 0, 1) : e.opacity,
      visible: o ? o.visible : e.visible,
      locked: e.locked ?? false,
    };
  });
}

/** 内置默认的底色。 */
export const builtinTone = (def: PatternDef): BgTone => bgTone(createDefaultConfig(def), def);

/**
 * 某母题在某底色下的「默认配色」（Rei 2026-10-14：浅底、深底各一套，都可打分、都进换一版）：
 * 该底色有上传覆盖 → 覆盖；是内置底色 → 内置；否则 = 内置默认切到该底色的结果（与用户点浅/深切换看到的一致）。
 */
export function defaultElementsFrom(map: DefaultsMap, def: PatternDef, tone: BgTone): ElementConfig[] {
  const over = map[def.id]?.tones?.[tone];
  if (over) return elementsForTone(def, over);
  const base = elementsForTone(def, { elements: [] });
  if (tone === builtinTone(def)) return base;
  const cfg = createDefaultConfig(def);
  cfg.elements = base;
  return applyTone(cfg, def, tone).elements;
}

const sameLook = (a: ElementConfig, b: ElementConfig): boolean =>
  paintEqual(a.paint, b.paint) && a.opacity === b.opacity && a.visible === b.visible;

/** cfg 的配色是否就是该底色的默认配色（不看参数）。 */
export function colorsMatchDefault(map: DefaultsMap, cfg: PatternConfig, def: PatternDef, tone: BgTone): boolean {
  const byId = new Map(defaultElementsFrom(map, def, tone).map((e) => [e.id, e]));
  return cfg.elements.every((e) => {
    const d = byId.get(e.id);
    return !d || sameLook(e, d);
  });
}

/** 把 cfg 的配色换成该底色的默认配色（锁定元件不动，参数不动）。 */
export function withDefaultColors(map: DefaultsMap, cfg: PatternConfig, def: PatternDef, tone: BgTone): PatternConfig {
  const src = new Map(defaultElementsFrom(map, def, tone).map((e) => [e.id, e]));
  const next = structuredCloneConfig(cfg);
  next.elements = next.elements.map((e) => {
    const d = src.get(e.id);
    return e.locked || !d ? e : { ...e, paint: d.paint, opacity: d.opacity, visible: d.visible };
  });
  return next;
}

/**
 * 某张配置相对内置默认的差异（要上传的部分）：与控件 default 不同的参数、与内置元件不同的元件。
 * 还原 `elementsForTone(def, {elements})` / `paramsWith(def, params)` 与 cfg 逐值相同。
 */
export function recordFromConfig(cfg: PatternConfig, def: PatternDef): { params: Record<string, ParamValue>; elements: ElementOverride[] } {
  const params: Record<string, ParamValue> = {};
  for (const c of def.controls) {
    const v = cfg.params[c.key];
    if (v !== undefined && v !== c.default) params[c.key] = v;
  }
  const elements: ElementOverride[] = [];
  for (const e of cfg.elements) {
    const spec = def.elements.find((d) => d.id === e.id);
    if (!spec) continue;
    if (!paintEqual(e.paint, spec.paint) || e.opacity !== spec.opacity || e.visible !== spec.visible) {
      elements.push({ id: e.id, paint: e.paint, opacity: e.opacity, visible: e.visible });
    }
  }
  return { params, elements };
}

/**
 * 叠加覆盖后的默认配置。
 * `tone`：想要的底色（恢复默认时传当前底色）。该底色有覆盖 → 用它；
 * 否则用内置默认底色的覆盖（有的话）；都没有 → 内置默认配色。参数覆盖与底色无关。
 */
export function defaultConfigFrom(
  map: DefaultsMap,
  def: PatternDef,
  size: { width?: number; height?: number; seed?: number } = {},
  tone?: BgTone,
): PatternConfig {
  const base = createDefaultConfig(def, size);
  const entry = map[def.id];
  if (!entry) return base;
  const tones = entry.tones ?? {};
  const pick = (tone && tones[tone]) || tones[bgTone(base, def)];
  return {
    ...base,
    params: entry.params ? paramsWith(def, entry.params) : base.params,
    elements: pick ? elementsForTone(def, pick) : base.elements,
  };
}

/**
 * 浅底 / 深底切换：目标底色有覆盖 → 套 Rei 上传的配色（锁定元件不动、参数不动）；否则走 applyTone。
 */
export function applyToneFrom(map: DefaultsMap, cfg: PatternConfig, def: PatternDef, tone: BgTone): PatternConfig {
  const over = map[def.id]?.tones?.[tone];
  if (!over) return applyTone(cfg, def, tone);
  if (bgTone(cfg, def) === tone) return cfg;
  const src = new Map(elementsForTone(def, over).map((e) => [e.id, e]));
  const next = structuredCloneConfig(cfg);
  next.elements = next.elements.map((e) => {
    const s = src.get(e.id);
    return e.locked || !s ? e : { ...e, paint: s.paint, opacity: s.opacity, visible: s.visible };
  });
  return next;
}

/* ── 运行时：服务器副本 + 批改模式的待上传叠层 ────────────────── */

let server: DefaultsMap = {};
let serverUpdatedAt: string | null = null;
/** 批改模式开着时 = 待上传的改动（让 Rei 切底色 / 恢复默认时看到自己刚改的）。 */
let overlay: DefaultsMap | null = null;
let effective: DefaultsMap = server;
let version = 0;
/** 只随服务器副本变化（不随批改模式的待上传叠层变化）—— 母题库缩略图用它，免得每改一下就重渲染。 */
let serverVersion = 0;
const listeners = new Set<() => void>();

function recompute(): void {
  effective = overlay ? mergeDefaults(server, overlay) : server;
  version++;
  listeners.forEach((l) => l());
}

export function setServerDefaults(map: DefaultsMap, updatedAt: string | null): void {
  server = map;
  serverUpdatedAt = updatedAt;
  serverVersion++;
  recompute();
}

export function setDefaultsOverlay(map: DefaultsMap | null): void {
  overlay = map && Object.keys(map).length > 0 ? map : null;
  recompute();
}

export const getServerDefaults = (): DefaultsMap => server;
export const getServerDefaultsUpdatedAt = (): string | null => serverUpdatedAt;
export const getEffectiveDefaults = (): DefaultsMap => effective;

export function subscribeDefaults(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** 覆盖变化的版本号（缩略图等据此重算）。 */
export function useDefaultsVersion(): number {
  return useSyncExternalStore(subscribeDefaults, () => version, () => 0);
}

export function useServerDefaultsVersion(): number {
  return useSyncExternalStore(subscribeDefaults, () => serverVersion, () => 0);
}

export function defaultConfigFor(
  def: PatternDef,
  size: { width?: number; height?: number; seed?: number } = {},
  tone?: BgTone,
): PatternConfig {
  return defaultConfigFrom(effective, def, size, tone);
}

export function applyToneDefaults(cfg: PatternConfig, def: PatternDef, tone: BgTone): PatternConfig {
  return applyToneFrom(effective, cfg, def, tone);
}
