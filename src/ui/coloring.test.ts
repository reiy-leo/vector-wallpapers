import { describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { createDefaultConfig } from '../engine/render';
import { contrastRatio, hexToHsl } from '../engine/colors';
import type { PatternConfig } from '../engine/types';
import type { PaintSpec } from '../patterns/types';
import { allowedTones, applyTone, bgTone, isScenic, nextSeed, randomizeColors, VIVID_MIN_CONTRAST, vividColors } from './coloring';

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
      for (let i = 0; i < 12; i++) cfg = randomizeColors(cfg, def, 'palette', nextSeed(cfg.seed));  // UI 只剩色板策略（2026-10-12）
      // 夜景类默认明暗跨度极大（深夜空 + 亮月），色板换色后 0.6 以上已足够有层次
      expect(lumSpread(cfg)).toBeGreaterThan(Math.min(baseSpread * 0.85, 0.6));
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

describe('浅底 / 深底：每张图都能切', () => {
  for (const def of registry.list()) {
    it(`${def.id}：切到相反底色后确实变了，再切回来也成立`, () => {
      const cfg = createDefaultConfig(def);
      const cur = bgTone(cfg, def);
      const other = cur === 'light' ? 'dark' : 'light';
      const flipped = applyTone(cfg, def, other);
      expect(bgTone(flipped, def)).toBe(other);
      expect(bgTone(applyTone(flipped, def, cur), def)).toBe(cur);
      expect(applyTone(cfg, def, cur)).toBe(cfg);
    });
  }
});

describe('换一版：保持用户选的浅底 / 深底', () => {
  for (const def of registry.list()) {
    it(`${def.id}：切到相反底色后连点换一版，底色类别不跳回`, () => {
      const base = createDefaultConfig(def);
      for (const tone of ['light', 'dark'] as const) {
        let cfg = applyTone(base, def, tone);
        for (const strategy of ['analogous', 'palette', 'full'] as const) {
          for (let i = 0; i < 4; i++) {
            cfg = randomizeColors(cfg, def, strategy, nextSeed(cfg.seed));
            expect(bgTone(cfg, def), `${strategy} 第 ${i + 1} 次`).toBe(tone);
          }
        }
      }
    });
  }
});

/** 元件画出来的全部颜色（纯色 1 个，渐变每个色标各 1 个）。 */
function colorsOf(cfg: PatternConfig, id: string): string[] {
  const p = cfg.elements.find((e) => e.id === id)?.paint;
  if (!p) return [];
  if (p.type === 'solid') return [p.color];
  if (p.type === 'linear' || p.type === 'radial') return p.stops.map((s) => s.color);
  return [];
}

/** 近白 / 近黑（饱和度没有意义的叠加色，如颗粒、高光）不计入饱和度统计。 */
const chromaticEnough = (hex: string) => {
  const { l } = hexToHsl(hex);
  return l > 0.1 && l < 0.9;
};

describe('换一版：配色要大胆鲜艳（「换一版的颜色都太保守了」）', () => {
  for (const tone of ['light', 'dark'] as const) {
    it(`${tone === 'light' ? '浅底' : '深底'}：连点换一版，非底色纯色的平均饱和度 > 0.55`, () => {
      const sats: number[] = [];
      for (const def of registry.list()) {
        let cfg = applyTone(createDefaultConfig(def), def, tone);
        for (let i = 0; i < 8; i++) {
          cfg = randomizeColors(cfg, def, 'analogous', nextSeed(cfg.seed));
          for (const e of def.elements) {
            if (e.role === 'bg') continue;
            const p = cfg.elements.find((x) => x.id === e.id)?.paint;
            if (p?.type === 'solid' && chromaticEnough(p.color)) sats.push(hexToHsl(p.color).s);
          }
        }
      }
      const mean = sats.reduce((a, b) => a + b, 0) / sats.length;
      expect(mean).toBeGreaterThan(0.55);
    });
  }

  it('全色域 / 色板 两档同样鲜艳', () => {
    for (const strategy of ['full', 'palette'] as const) {
      const sats: number[] = [];
      for (const def of registry.list()) {
        let cfg = createDefaultConfig(def);
        for (let i = 0; i < 6; i++) {
          cfg = randomizeColors(cfg, def, strategy, nextSeed(cfg.seed));
          for (const e of def.elements) {
            if (e.role === 'bg') continue;
            const p = cfg.elements.find((x) => x.id === e.id)?.paint;
            if (p?.type === 'solid' && chromaticEnough(p.color)) sats.push(hexToHsl(p.color).s);
          }
        }
      }
      expect(sats.reduce((a, b) => a + b, 0) / sats.length, strategy).toBeGreaterThan(0.5);
    }
  });

  for (const def of registry.list()) {
    it(`${def.id}：vivid 配色在浅底、深底下都保底色类别，前景与底色对比度达标且彼此不同`, () => {
      const base = createDefaultConfig(def);
      const scenic = isScenic(def);
      const bgIds = def.elements.filter((e) => e.role === 'bg').map((e) => e.id);
      for (const tone of ['light', 'dark'] as const) {
        const start = applyTone(base, def, tone);
        for (const kind of ['harmony', 'curated', 'free'] as const) {
          for (let seed = 1; seed <= 6; seed++) {
            const out = vividColors(start, def, seed * 7919, kind);
            const tag = `${tone}/${kind}/${seed}`;
            expect(bgTone(out, def), tag).toBe(tone);
            // 确定性：同 seed 同结果
            expect(vividColors(start, def, seed * 7919, kind), tag).toEqual(out);
            // 只出字面量 hex
            for (const e of out.elements) for (const c of colorsOf(out, e.id)) expect(c, tag).toMatch(/^#[0-9a-f]{6}$/i);
            // 渐变元件：色标数量 / offset / stop-opacity 与某套作者配色一致（只换颜色）
            for (const e of out.elements) {
              if (e.paint.type !== 'linear' && e.paint.type !== 'radial') continue;
              const shape = (p: PaintSpec | undefined) =>
                p && (p.type === 'linear' || p.type === 'radial') ? JSON.stringify(p.stops.map((s) => [s.offset, s.opacity])) : '';
              const authors = [def.elements.find((x) => x.id === e.id)?.paint, ...def.presets.map((pr) => pr.elements[e.id]?.paint)];
              const cur = start.elements.find((x) => x.id === e.id)?.paint;
              expect([...authors, cur].map(shape), tag).toContain(shape(e.paint));
            }
            if (scenic) continue;
            // 前景（非叠加层：叠加层保留作者原色）与每个底色色标的对比度
            const bgCols = bgIds.flatMap((id) => colorsOf(out, id));
            const fgFirst: string[] = [];
            for (const e of def.elements) {
              if (e.role === 'bg') continue;
              const oe = out.elements.find((x) => x.id === e.id)!;
              const src = start.elements.find((x) => x.id === e.id)!;
              if (JSON.stringify(oe.paint) === JSON.stringify(src.paint)) continue; // 未动
              const cols = colorsOf(out, e.id);
              if (cols.length === 0) continue;
              // 叠加层（颗粒、高光、阴影、细网格）保留作者原色，不参与对比度约束
              const meanL = cols.reduce((a, c) => a + hexToHsl(c).l, 0) / cols.length;
              if (((meanL >= 0.9 || meanL <= 0.08) && oe.opacity < 0.95) || (e.role === 'detail' && oe.opacity <= 0.4)) continue;
              for (const c of cols)
                for (const b of bgCols)
                  expect(contrastRatio(c, b), `${tag} ${e.id} ${c} vs ${b}`).toBeGreaterThanOrEqual(
                    VIVID_MIN_CONTRAST[tone] - 0.01,
                  );
              fgFirst.push(cols[0]);
            }
            // 不同元件颜色互不相同
            expect(new Set(fgFirst).size, tag).toBe(fgFirst.length);
          }
        }
      }
    });
  }
});

describe('单一底色母题：默认配色就落在允许的底色上', () => {
  for (const def of registry.list().filter((d) => allowedTones(d).length === 1)) {
    it(`${def.id}：默认 ${allowedTones(def)[0]}`, () => {
      expect(bgTone(createDefaultConfig(def), def)).toBe(allowedTones(def)[0]);
      for (let s = 1; s <= 4; s++) {
        const out = randomizeColors(createDefaultConfig(def), def, 'palette', s * 977);
        expect(bgTone(out, def)).toBe(allowedTones(def)[0]);
      }
    });
  }
});
