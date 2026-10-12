/**
 * @vitest-environment node
 *
 * liquid-mesh 换肤能力回归测试 —— 锁住 2026-10-12 结构审查的那次修正。
 *
 * 修正前：4 个元件全是渐变（纯色 0/4），改色只染到画面一半。
 * 修正后：底色与颗粒为纯色，改色能真正改变整张图的调性。
 *
 * 这类「产品能力」很容易在后续重构中被无意破坏（例如有人为了视觉效果
 * 把 bg 改回渐变），因此用测试把它钉住。
 */
import { describe, expect, it } from 'vitest';
import { registry } from '../index';
import { createDefaultConfig, renderStandaloneSVG } from '../../engine/render';

const def = registry.get('liquid-mesh')!;

function render(overrides: Record<string, { paint?: unknown; opacity?: number }> = {}): string {
  const cfg = createDefaultConfig(def, { width: 1200, height: 800, seed: 7 });
  if (Object.keys(overrides).length > 0) {
    cfg.elements = cfg.elements.map((e) => {
      const o = overrides[e.id];
      return o ? { ...e, ...(o as typeof e) } : e;
    });
  }
  return renderStandaloneSVG(def, cfg, { skipBudget: true });
}

describe('liquid-mesh：底色可换肤', () => {
  it('bg 是纯色而非渐变 —— 这是换肤能力的前提', () => {
    const bg = def.elements.find((e) => e.id === 'bg')!;
    expect(bg.paint.type, '底色若为渐变，改色只会染到画面一半').toBe('solid');
  });

  it('底色不出现在任何 preset 的渐变覆盖里', () => {
    for (const preset of def.presets) {
      const bgPatch = preset.elements['bg'];
      if (!bgPatch) continue;
      expect(
        bgPatch.paint.type,
        `preset「${preset.label}」把底色覆盖成了渐变，套用后换肤能力又没了`,
      ).toBe('solid');
    }
  });

  it('改底色后，SVG 里主背景矩形的 fill 就是新颜色', () => {
    const svg = render({ bg: { paint: { type: 'solid', color: '#ff0000' } } });
    // 第一个 <rect> 是铺满画布的背景层
    expect(svg).toMatch(/<rect[^>]*fill="#ff0000"/);
  });

  it('底色与三个渐变团互不影响：只改底色时渐变团颜色保持原样', () => {
    const base = render();
    const changed = render({ bg: { paint: { type: 'solid', color: '#ff0000' } } });
    // 渐变团 A 的首色标不应因改底色而变化
    expect(base).toContain('#f472b6');
    expect(changed).toContain('#f472b6');
  });
});

describe('liquid-mesh：颗粒层独立可控', () => {
  it('grain 是独立的纯色元件', () => {
    const grain = def.elements.find((e) => e.id === 'grain');
    expect(grain, '缺少 grain 元件').toBeDefined();
    expect(grain!.paint.type).toBe('solid');
  });

  it('grain 声明在 paletteSlots 的 detail 槽位（否则批量设色管不到它）', () => {
    expect(def.paletteSlots.detail).toContain('grain');
  });

  it('grain 的颜色与底色无关 —— 底色改浅时颗粒不会跟着消失', () => {
    const svg = render({ bg: { paint: { type: 'solid', color: '#ffffff' } } });
    // 颗粒层必须仍用自己的白色，而不是变成白色后看不见
    const grainEl = def.elements.find((e) => e.id === 'grain')!;
    expect(svg).toContain('#ffffff');
    expect(grainEl.paint).toEqual({ type: 'solid', color: '#ffffff' });
  });

  it('把 grain 的不透明度调到 0 后颗粒层消失（可被用户关掉）', () => {
    const withGrain = render();
    const withoutGrain = render({ grain: { opacity: 0 } });
    expect(withGrain).toContain('<pattern');
    expect(withoutGrain).not.toContain('<pattern');
  });
});

describe('liquid-mesh：整体结构健康度', () => {
  it('纯色元件占比达到该品类的合理下限（≥2 个纯色）', () => {
    const solids = def.elements.filter((e) => e.paint.type === 'solid');
    expect(solids.length, '纯色元件不足 2 个，换肤能力不可用').toBeGreaterThanOrEqual(2);
  });

  it('元件数从 4 增加到 5，且全部可配置', () => {
    expect(def.elements).toHaveLength(5);
    expect(def.elements.every((e) => e.configurable)).toBe(true);
  });

  it('体积仍在 20KB 红线内', () => {
    const svg = render();
    expect(new TextEncoder().encode(svg).length).toBeLessThan(20 * 1024);
  });
});
