/**
 * 换一版 × 评分：
 *  - 评过 👎 的色板在该母题的换一版里不再抽到（用真实 registry + createDefaultConfig，不手搓配置）；
 *  - 不排除时与旧 `randomizeColors` 逐字节一致（同 seed 同结果，分享链接可复现）；
 *  （ratings.ts 运行时 —— 本地队列、批量提交、排除合并 —— 见 rating-runtime.test.ts）
 */
import { describe, expect, it } from 'vitest';
import { createDefaultConfig } from '../engine/render';
import { registry } from '../patterns';
import { PALETTES, VIVID_PALETTES } from '../patterns/palettes';
import { nextSeed, randomizeColors, randomizeColorsWithPalette } from './coloring';

const ALL_IDS = [...PALETTES, ...VIVID_PALETTES].map((p) => p.id);
const defs = registry.list().slice(0, 6);
const cfgOf = (id: string) => createDefaultConfig(registry.get(id)!, { width: 640, height: 400, seed: 7 });

describe('randomizeColorsWithPalette', () => {
  it('不排除时与 randomizeColors 结果一致，且 palette 策略一定报告色板 id', () => {
    for (const def of defs) {
      let cfg = cfgOf(def.id);
      for (let i = 0; i < 8; i++) {
        const seed = nextSeed(cfg.seed);
        const a = randomizeColors(cfg, def, 'palette', seed);
        const b = randomizeColorsWithPalette(cfg, def, 'palette', seed);
        expect(JSON.stringify(b.cfg)).toBe(JSON.stringify(a));
        expect(ALL_IDS).toContain(b.paletteId);
        cfg = a;
      }
    }
  });

  it('被排除的色板绝不抽到（排除掉除 3 套外的全部，连点 40 次）', () => {
    const keep = new Set([PALETTES[1].id, VIVID_PALETTES[2].id, VIVID_PALETTES[5].id]);
    const exclude = new Set(ALL_IDS.filter((id) => !keep.has(id)));
    for (const def of defs) {
      let cfg = cfgOf(def.id);
      const seen = new Set<string>();
      for (let i = 0; i < 40; i++) {
        const out = randomizeColorsWithPalette(cfg, def, 'palette', nextSeed(cfg.seed), exclude);
        expect(out.paletteId, `${def.id} 第 ${i} 次抽到了被排除的色板`).not.toBeNull();
        expect(exclude.has(out.paletteId!)).toBe(false);
        seen.add(out.paletteId!);
        cfg = out.cfg;
      }
      expect(seen.size).toBeGreaterThan(1); // 不是退化成永远同一套
    }
  });

  it('高饱和池被排除光：退到展示色板池（反之亦然）', () => {
    const def = defs[0];
    const cfg = cfgOf(def.id);
    const noVivid = new Set(VIVID_PALETTES.map((p) => p.id));
    const noPlain = new Set(PALETTES.map((p) => p.id));
    for (let s = 1; s < 30; s++) {
      expect(PALETTES.map((p) => p.id)).toContain(randomizeColorsWithPalette(cfg, def, 'palette', s, noVivid).paletteId);
      expect(VIVID_PALETTES.map((p) => p.id)).toContain(randomizeColorsWithPalette(cfg, def, 'palette', s, noPlain).paletteId);
    }
  });

  it('全部色板都被排除：忽略排除，仍给出一版', () => {
    const def = defs[0];
    const out = randomizeColorsWithPalette(cfgOf(def.id), def, 'palette', 123, new Set(ALL_IDS));
    expect(ALL_IDS).toContain(out.paletteId);
  });
});

