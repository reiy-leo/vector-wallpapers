import { describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { createDefaultConfig } from '../engine/render';
import { hexToHsl } from '../engine/colors';
import type { PatternConfig } from '../engine/types';
import { nextSeed, randomizeColors } from './coloring';

function firstHex(cfg: PatternConfig, id: string): string | null {
  const p = cfg.elements.find((e) => e.id === id)?.paint;
  if (!p) return null;
  if (p.type === 'solid') return p.color;
  if (p.type === 'linear' || p.type === 'radial') return p.stops[0]?.color ?? null;
  return null;
}

function lumSpread(cfg: PatternConfig): number {
  const ls = cfg.elements.map((e) => firstHex(cfg, e.id)).filter((h): h is string => !!h).map((h) => hexToHsl(h).l);
  return Math.max(...ls) - Math.min(...ls);
}

describe('换一版：连点不会越来越灰', () => {
  for (const def of registry.list()) {
    it(`${def.id}：连点 12 次后明暗层次不塌、不变成无彩`, () => {
      const base = createDefaultConfig(def);
      // 换一版的明暗骨架来自作者配色（默认或某个 preset），取其中最小的层次作为下限
      const sources = [base, ...def.presets.map((pr) => ({
        ...base,
        elements: base.elements.map((e) => (pr.elements[e.id] ? { ...e, paint: pr.elements[e.id].paint } : e)),
      }))];
      const baseSpread = Math.min(...sources.map(lumSpread));
      let cfg = base;
      for (let i = 0; i < 12; i++) cfg = randomizeColors(cfg, def, 'analogous', nextSeed(cfg.seed));
      expect(lumSpread(cfg)).toBeGreaterThan(baseSpread * 0.85);
      const sats = def.elements
        .filter((e) => e.role !== 'bg')
        .map((e) => firstHex(cfg, e.id))
        .filter((h): h is string => !!h)
        .map((h) => hexToHsl(h).s);
      if (sats.length) expect(Math.max(...sats)).toBeGreaterThan(0.1);
    });
  }

  it('锁定的元件不变', () => {
    const def = registry.get('polka-dots')!;
    const cfg = createDefaultConfig(def);
    cfg.elements[0] = { ...cfg.elements[0], locked: true };
    const next = randomizeColors(cfg, def, 'analogous', 123);
    expect(next.elements[0].paint).toEqual(cfg.elements[0].paint);
  });
});
