/**
 * 服务器默认值覆盖层：新选母题 / 恢复默认 / 浅底深底切换都用上传的配色（按底色分开），
 * 参数夹取、未知 id 忽略、分享链接仍按内置默认解析（数据契约）。
 * 基线一律取引擎真源 createDefaultConfig，不手搓默认值。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { createDefaultConfig } from '../engine/render';
import { allowedTones, applyTone, bgTone, type BgTone } from './coloring';
import {
  applyToneFrom,
  builtinTone,
  defaultConfigFrom,
  elementsForTone,
  paramsWith,
  recordFromConfig,
  setDefaultsOverlay,
  setServerDefaults,
} from './defaults';
import { decodeConfig, encodeConfig } from './share';
import { getConfig, refreshUntouchedDefault, resetConfig, selectPattern, setConfig } from './store';
import type { DefaultsMap } from '../shared/defaults-api';
import type { PatternDef } from '../patterns/types';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

/** 两种底色都允许、有 range 控件、至少 2 个元件且无锁定元件的母题（动态挑，不写死 id）。 */
const def: PatternDef = registry
  .list()
  .find(
    (d) =>
      allowedTones(d).length === 2 &&
      d.controls.some((c) => c.type === 'range') &&
      d.elements.length >= 2 &&
      d.elements.every((e) => !e.locked),
  )!;
const range = def.controls.find((c) => c.type === 'range') as Extract<PatternDef['controls'][number], { type: 'range' }>;
const home: BgTone = builtinTone(def);
const other: BgTone = home === 'light' ? 'dark' : 'light';
const [e0, e1] = def.elements;

const LIGHTISH = '#fafafa';
const DARKISH = '#0a0a0a';
const homeColor = home === 'light' ? LIGHTISH : DARKISH;
const otherColor = other === 'light' ? LIGHTISH : DARKISH;

/** 让每个元件的颜色足以把 bgTone 判成目标底色。 */
const toneElements = (color: string) =>
  def.elements.map((e) => ({ id: e.id, paint: { type: 'solid' as const, color }, opacity: 0.5, visible: true }));

const map: DefaultsMap = {
  [def.id]: {
    params: { [range.key]: range.max + 1000, unknown_key: 3 },
    tones: {
      [home]: { elements: [...toneElements(homeColor), { id: 'gone_element', paint: { type: 'solid', color: '#123456' }, opacity: 1, visible: true }] },
      [other]: { elements: toneElements(otherColor) },
    },
  },
};

beforeEach(() => {
  setServerDefaults({}, null);
  setDefaultsOverlay(null);
});

describe('纯函数', () => {
  it('挑到了测试母题（守卫自身有效）', () => {
    expect(def).toBeTruthy();
    expect(bgTone(createDefaultConfig(def), def)).toBe(home);
  });

  it('paramsWith：越界夹取、未知 key 忽略、未覆盖沿用 default', () => {
    const p = paramsWith(def, map[def.id].params);
    expect(p[range.key]).toBe(range.max);
    expect('unknown_key' in p).toBe(false);
    expect(Object.keys(p).sort()).toEqual(def.controls.map((c) => c.key).sort());
  });

  it('elementsForTone：未知元件 id 忽略，未覆盖的元件沿用内置', () => {
    const els = elementsForTone(def, { elements: [{ id: e0.id, paint: { type: 'solid', color: '#abcdef' }, opacity: 0.3, visible: false }] });
    expect(els.map((e) => e.id)).toEqual(def.elements.map((e) => e.id));
    expect(els[0]).toMatchObject({ paint: { type: 'solid', color: '#abcdef' }, opacity: 0.3, visible: false });
    expect(els[1].paint).toEqual(e1.paint);
  });

  it('recordFromConfig 只记差异，且还原后与原配置逐值一致（无损）', () => {
    const base = createDefaultConfig(def);
    expect(recordFromConfig(base, def)).toEqual({ params: {}, elements: [] });
    const edited = applyTone(base, def, other);
    edited.params = { ...edited.params, [range.key]: range.min };
    const rec = recordFromConfig(edited, def);
    expect(elementsForTone(def, { elements: rec.elements }).map(({ id, paint, opacity, visible }) => ({ id, paint, opacity, visible }))).toEqual(
      edited.elements.map(({ id, paint, opacity, visible }) => ({ id, paint, opacity, visible })),
    );
    expect(paramsWith(def, rec.params)).toEqual(edited.params);
  });

  it('defaultConfigFrom：无覆盖 = 内置默认；有覆盖 = 内置底色那一套 + 参数', () => {
    expect(defaultConfigFrom({}, def, { seed: 3 })).toEqual(createDefaultConfig(def, { seed: 3 }));
    const cfg = defaultConfigFrom(map, def);
    expect(cfg.params[range.key]).toBe(range.max);
    expect(cfg.elements.every((e) => e.paint.type === 'solid' && e.paint.color === homeColor && e.opacity === 0.5)).toBe(true);
    // 指定另一种底色 → 用那一套
    const o = defaultConfigFrom(map, def, {}, other);
    expect(o.elements.every((e) => e.paint.type === 'solid' && e.paint.color === otherColor)).toBe(true);
  });

  it('applyToneFrom：从默认配色切 → 目标底色有覆盖用上传的配色、参数不动；无覆盖 → 与 applyTone 一致', () => {
    const base = createDefaultConfig(def);
    const out = applyToneFrom(map, defaultConfigFrom(map, def), def, other);
    expect(out.elements.every((e) => e.paint.type === 'solid' && e.paint.color === otherColor)).toBe(true);
    expect(out.params).toEqual(defaultConfigFrom(map, def).params);
    expect(applyToneFrom({}, base, def, other)).toEqual(applyTone(base, def, other));
  });

  it('applyToneFrom：锁定元件不动', () => {
    const base = createDefaultConfig(def);
    base.elements[0] = { ...base.elements[0], locked: true };
    const out = applyToneFrom(map, base, def, other);
    expect(out.elements[0].paint).toEqual(base.elements[0].paint);
  });
});

describe('接入 store', () => {
  it('新选母题 / 恢复默认 / 切底色都走覆盖', () => {
    setServerDefaults(map, '2026-10-14T00:00:00.000Z');
    selectPattern(def.id);
    expect(getConfig().elements[0].paint).toEqual({ type: 'solid', color: homeColor });
    // 切到另一底色后恢复默认：保留该底色，用该底色上传的配色
    setConfig(applyToneFrom(map, getConfig(), def, other));
    setConfig({ ...getConfig(), params: { ...getConfig().params, [range.key]: range.min } });
    resetConfig();
    expect(getConfig().elements[0].paint).toEqual({ type: 'solid', color: otherColor });
    expect(getConfig().params[range.key]).toBe(range.max);
  });

  it('批改模式的待上传叠层即时生效', () => {
    setDefaultsOverlay({ [def.id]: { tones: { [home]: { elements: [{ id: e0.id, paint: { type: 'solid', color: '#777777' }, opacity: 1, visible: true }] } } } });
    selectPattern(def.id);
    expect(getConfig().elements[0].paint).toEqual({ type: 'solid', color: '#777777' });
  });

  it('分享链接仍按内置默认编解码：覆盖不影响链接渲染的内容', () => {
    const builtIn = createDefaultConfig(def, { seed: 11 });
    const q = encodeConfig(builtIn);
    setServerDefaults(map, null);
    const decoded = decodeConfig(q).cfg!;
    expect(decoded.elements).toEqual(builtIn.elements);
    expect(decoded.params).toEqual(builtIn.params);
  });

  it('refreshUntouchedDefault：画布动过之后不再替换', () => {
    selectPattern(def.id); // 画布已不是首屏那张
    const before = getConfig();
    setServerDefaults(map, null);
    refreshUntouchedDefault();
    expect(getConfig()).toBe(before);
  });
});

describe('默认配色（浅底 / 深底各一套，Rei 2026-10-14）', () => {
  it('内置底色 = 内置；另一底色无覆盖 = 内置切过去；colorsMatchDefault / withDefaultColors 自洽', async () => {
    const { registry } = await import('../patterns');
    const { bgTone } = await import('./coloring');
    const { colorsMatchDefault, defaultElementsFrom, withDefaultColors, builtinTone } = await import('./defaults');
    const { createDefaultConfig } = await import('../engine/render');
    for (const def of registry.list()) {
      const home = builtinTone(def);
      const away = home === 'light' ? 'dark' : 'light';
      const { allowedTones } = await import('./coloring');
      if (!allowedTones(def).includes(away)) continue;
      const cfg = createDefaultConfig(def);
      expect(colorsMatchDefault({}, cfg, def, home)).toBe(true);
      const flipped = withDefaultColors({}, cfg, def, away);
      expect(colorsMatchDefault({}, flipped, def, away)).toBe(true);
      expect(defaultElementsFrom({}, def, away)).toHaveLength(def.elements.length);
      expect(bgTone(flipped, def)).toBe(away);
    }
  });
});

describe('浅/深切换：色板一一对应（Rei 2026-10-14）', () => {
  it('浅底不同色板切到深底得到不同配色；默认配色切到默认配色', async () => {
    const { registry } = await import('../patterns');
    const { allowedTones, applyPaletteSlots, bgTone } = await import('./coloring');
    const { applyToneFrom, builtinTone, colorsMatchDefault } = await import('./defaults');
    const { createDefaultConfig } = await import('../engine/render');
    const { PALETTES } = await import('../patterns/palettes');
    let checked = 0;
    for (const def of registry.list()) {
      if (allowedTones(def).length < 2 || def.rerollSchemes) continue;
      const home = builtinTone(def);
      const away = home === 'light' ? 'dark' : 'light';
      const base = createDefaultConfig(def);
      expect(colorsMatchDefault({}, applyToneFrom({}, base, def, away), def, away)).toBe(true);
      const outs = PALETTES.slice(0, 6)
        .map((p) => applyPaletteSlots(base, def, { ...p.slots }))
        .filter((c) => bgTone(c, def) === home && !colorsMatchDefault({}, c, def, home))
        .map((c) => applyToneFrom({}, c, def, away));
      for (const o of outs) expect(bgTone(o, def)).toBe(away);
      const keys = new Set(outs.map((o) => JSON.stringify(o.elements.map((e) => e.paint))));
      if (outs.length >= 2) {
        expect(keys.size).toBeGreaterThan(1);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(20);
  });
});
