/**
 * 新增能力的行为测试：邻近色算法（PRD Q3）、PNG 尺寸守卫（PRD Q8）、合集与色板（PRD Q4/Q7）。
 */
import { describe, expect, it } from 'vitest';
import {
  analogousPalette,
  fullRangePalette,
  generateColors,
  pickFromPalette,
  isHexColor,
  relativeLuminance,
} from './colors';
import { mulberry32 } from './rng';
import { guardCanvasSize, EXPORT_SCALES } from '../shared/guards';
import { CURATED_SETS, getSet } from '../patterns/sets';
import { PALETTES, getPalette } from '../patterns/palettes';
import { registry } from '../patterns';
import { createDefaultConfig, renderSVG } from './render';

describe('邻近色算法 ⭐ PRD Q3 决策 C', () => {
  it('输出数量正确且全为字面量 hex', () => {
    for (const n of [1, 3, 5, 8]) {
      const out = analogousPalette('#3b82f6', n, mulberry32(1));
      expect(out).toHaveLength(n);
      expect(out.every(isHexColor)).toBe(true);
    }
  });

  it('按感知亮度从亮到暗排序（便于映射到底色→前景色的层级）', () => {
    // 必须用引擎的 relativeLuminance（WCAG 线性化 sRGB），
    // 不能用「未线性化的加权 RGB」——两者对蓝/黄的排序结论相反。
    const out = analogousPalette('#3b82f6', 6, mulberry32(9));
    const ls = out.map(relativeLuminance);
    for (let i = 1; i < ls.length; i++) expect(ls[i]).toBeLessThanOrEqual(ls[i - 1] + 1e-9);
  });

  it('同 seed 同结果，不同 seed 不同结果（确定性契约）', () => {
    const a = analogousPalette('#3b82f6', 5, mulberry32(42));
    const b = analogousPalette('#3b82f6', 5, mulberry32(42));
    const c = analogousPalette('#3b82f6', 5, mulberry32(43));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('基准色为灰时也能产出可用的一组色', () => {
    const out = analogousPalette('#808080', 4, mulberry32(5));
    expect(out).toHaveLength(4);
    expect(out.every(isHexColor)).toBe(true);
  });

  it('count=1 与 count=0 不崩溃', () => {
    expect(analogousPalette('#fff', 1, mulberry32(1))).toHaveLength(1);
    expect(analogousPalette('#fff', 0, mulberry32(1))).toHaveLength(0);
  });
});

describe('全色域 HSL 取色', () => {
  it('输出数量正确且全为 hex', () => {
    const out = fullRangePalette(6, mulberry32(3));
    expect(out).toHaveLength(6);
    expect(out.every(isHexColor)).toBe(true);
  });

  it('同 seed 确定性', () => {
    expect(fullRangePalette(4, mulberry32(7))).toEqual(fullRangePalette(4, mulberry32(7)));
  });

  it('count=1 不崩', () => {
    expect(fullRangePalette(1, mulberry32(1))).toHaveLength(1);
  });
});

describe('仅当前色板取色', () => {
  it('只从给定色板中取色', () => {
    const palette = ['#111111', '#eeeeee', '#ff0000'];
    const out = pickFromPalette(palette, 10, mulberry32(11));
    expect(out).toHaveLength(10);
    for (const c of out) expect(palette).toContain(c);
  });

  it('色板为空时回落到全色域（不返回空数组）', () => {
    expect(pickFromPalette([], 3, mulberry32(1))).toHaveLength(3);
  });
});

describe('generateColors() 三档模式统一入口', () => {
  // 用工厂而非常量对象：rng 是有状态的生成器，
  // 复用同一个实例会让第二次调用拿到不同的随机序列。
  const makeOpts = () => ({
    base: '#3b82f6',
    count: 4,
    palette: ['#000000'],
    rng: mulberry32(2),
  });

  it('三档模式各自可用且返回正确数量', () => {
    for (const s of ['palette', 'analogous', 'full'] as const) {
      expect(generateColors(s, makeOpts())).toHaveLength(4);
    }
  });

  it('未知模式回落到默认的 analogous（PRD Q3 默认档）', () => {
    expect(generateColors('nonsense' as never, makeOpts())).toEqual(
      generateColors('analogous', makeOpts()),
    );
  });
});

describe('guardCanvasSize() ⭐ PRD Q8', () => {
  it('EXPORT_SCALES 为 [1,2,3]', () => {
    expect([...EXPORT_SCALES]).toEqual([1, 2, 3]);
  });

  it('1920×1080 @1x / @2x 可行（3.7M / 8.3M px）', () => {
    const r1 = guardCanvasSize(1920, 1080, 1);
    expect(r1.ok).toBe(true);
    expect(r1.width).toBe(1920);

    const r2 = guardCanvasSize(1920, 1080, 2);
    expect(r2.ok).toBe(true);
    expect(r2.scale).toBe(2);
    expect(r2.width).toBe(3840);
    expect(r2.notice).toBeNull();
  });

  // 以下三条原按旧 16M（iOS 标定）上限写成降级断言；
  // 上限提到 64M 后它们全部落在安全区内，因此改为**放行**断言 ——
  // 这正是本次改动要消除的「桌面用户被 iOS 限制误伤」。
  it('1920×1080 @3x = 18.7M px，在 64M 上限内直接放行', () => {
    const r = guardCanvasSize(1920, 1080, 3);
    expect(r.ok).toBe(true);
    expect(r.scale).toBe(3);
    expect(r.notice).toBeNull();
  });

  it('3840×2160 @3x：受**单边上限**限制降到 @2x（面积 24.9M 其实已安全）', () => {
    // 11520 > MAX_EDGE(7680) → 单边就超了，与面积无关。
    // 这说明上限提到 64M 之后，4K@3x 的瓶颈从「面积」变成了「单边长度」。
    const r = guardCanvasSize(3840, 2160, 3);
    expect(r.ok).toBe(false);
    expect(r.scale).toBe(2);
    // @2x = 7680×4320 = 33.2M px，面积与单边都在 64M / 7680 内
    expect(r.width * r.height).toBeLessThanOrEqual(64_000_000);
  });

  it('3440×1440 @3x：同样受单边上限限制降到 @2x', () => {
    const r = guardCanvasSize(3440, 1440, 3);
    expect(r.ok).toBe(false);
    expect(r.scale).toBe(2);
  });

  it('超 64M 时仍会降级并给出 notice（守卫未被放宽到形同虚设）', () => {
    // 8160×8160 ≈ 66.6M > 64M，@1x 就超 → 必须降级/缩放并提示
    const r = guardCanvasSize(8160, 8160, 2);
    expect(r.ok).toBe(false);
    expect(r.notice).toBeTruthy();
    expect(r.pixels).toBeLessThanOrEqual(64_000_000);
  });

  it('降级后像素数必定在安全区间内', () => {
    for (const [w, h] of [
      [1920, 1080],
      [3840, 2160],
      [7680, 4320],
      [1170, 2532],
      [8000, 8000],
    ] as const) {
      for (const s of [1, 2, 3]) {
        const r = guardCanvasSize(w, h, s);
        expect(r.pixels, `${w}×${h}@${s}x → ${r.width}×${r.height}`).toBeLessThanOrEqual(64_000_000);
        expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(7680);
      }
    }
  });

  it('连 @1x 都超限时返回缩放结果而非 null（绝不静默失败）', () => {
    const r = guardCanvasSize(20000, 20000, 3);
    expect(r).not.toBeNull();
    expect(r.ok).toBe(false);
    expect(r.notice).toBeTruthy();
    expect(r.width).toBeGreaterThan(0);
    expect(r.height).toBeGreaterThan(0);
  });

  it('@1x 可行时保持原尺寸不变', () => {
    const r = guardCanvasSize(1920, 1080, 1);
    expect(r.ok).toBe(true);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
  });

  it('尺寸为零/负数时不崩', () => {
    expect(() => guardCanvasSize(0, 0, 3)).not.toThrow();
    expect(() => guardCanvasSize(-100, -100, 3)).not.toThrow();
  });
});

describe('预置色板 ⭐ PRD Q4（只内置，不做自建）', () => {
  it('至少 40 套，且包含 PRD 点名的全部 10 个', () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(40);
    const labels = PALETTES.map((p) => p.label);
    for (const required of ['极地', '灰调', '莫兰地', '落日', '苔原', '霓虹', '孟菲斯', '复古印刷', '夜航', '单色']) {
      expect(labels, `缺少色板 ${required}`).toContain(required);
    }
  });

  it('每套色板的 5 个 role 槽位齐全且为 hex', () => {
    for (const p of PALETTES) {
      for (const role of ['bg', 'primary', 'secondary', 'accent', 'detail'] as const) {
        expect(p.slots[role], `${p.id}/${role}`).toMatch(/^#[0-9a-f]{6}$/i);
      }
    }
  });

  it('id 唯一，getPalette 可反查', () => {
    const ids = PALETTES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getPalette('polar')!.label).toBe('极地');
    expect(getPalette('__不存在__')).toBeUndefined();
  });
});

describe('预置合集 ⭐ PRD Q7', () => {
  it('至少 6 套（决策要求 6–8 套）', () => {
    expect(CURATED_SETS.length).toBeGreaterThanOrEqual(6);
    expect(CURATED_SETS.length).toBeLessThanOrEqual(8);
  });

  it('套用了用户点名的 8 套', () => {
    const labels = CURATED_SETS.map((s) => s.label);
    for (const required of ['冷静办公', '暗黑开发', '童年游戏厅', '柔光卧室', '极地清晨', '落日公路', '莫兰迪', '单色高级灰']) {
      expect(labels, `缺少合集 ${required}`).toContain(required);
    }
  });

  it('每套至少 3 张壁纸', () => {
    for (const s of CURATED_SETS) {
      expect(s.items.length, s.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('引用的 patternId 全部已实现（否则合集会点出空图）', () => {
    for (const s of CURATED_SETS) {
      for (const item of s.items) {
        expect(registry.get(item.patternId), `${s.id} 引用了未实现的 ${item.patternId}`).toBeDefined();
      }
    }
  });

  it('colors 引用的 element id 全部存在', () => {
    for (const s of CURATED_SETS) {
      for (const item of s.items) {
        const def = registry.get(item.patternId)!;
        const ids = new Set(def.elements.map((e) => e.id));
        for (const id of Object.keys(item.colors)) {
          expect(ids.has(id), `${s.id}/${item.patternId} 引用了不存在的元件 ${id}`).toBe(true);
        }
      }
    }
  });

  it('params 引用的控件 key 全部已声明', () => {
    for (const s of CURATED_SETS) {
      for (const item of s.items) {
        const def = registry.get(item.patternId)!;
        const keys = new Set(def.controls.map((c) => c.key));
        for (const k of Object.keys(item.params ?? {})) {
          expect(keys.has(k), `${s.id}/${item.patternId} 引用了不存在的控件 ${k}`).toBe(true);
        }
      }
    }
  });

  it('所有颜色均为字面量 hex（含渐变色标）', () => {
    for (const s of CURATED_SETS) {
      for (const item of s.items) {
        for (const paint of Object.values(item.colors)) {
          const colors =
            paint.type === 'solid' ? [paint.color] : paint.type === 'none' ? [] : paint.stops.map((x) => x.color);
          for (const c of colors) expect(c, `${s.id}`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it('每个合集项都能真正渲染出不含 var() 的 SVG（合集不会白屏）', () => {
    for (const s of CURATED_SETS) {
      for (const item of s.items) {
        const def = registry.get(item.patternId)!;
        const cfg = createDefaultConfig(def, { seed: item.seed });
        for (const e of cfg.elements) {
          const paint = item.colors[e.id];
          if (paint) e.paint = paint;
        }
        if (item.params) Object.assign(cfg.params, item.params);
        const svg = renderSVG(def, cfg).svg;
        expect(svg, `${s.id}/${item.patternId}`).toContain('<svg');
        expect(svg, `${s.id}/${item.patternId}`).not.toContain('var(');
      }
    }
  });

  it('合集内所有 wallpaper 体积均 < 20KB', () => {
    for (const s of CURATED_SETS) {
      for (const item of s.items) {
        const def = registry.get(item.patternId)!;
        const cfg = createDefaultConfig(def, { seed: item.seed });
        for (const e of cfg.elements) {
          const paint = item.colors[e.id];
          if (paint) e.paint = paint;
        }
        if (item.params) Object.assign(cfg.params, item.params);
        expect(renderSVG(def, cfg).bytes, `${s.id}/${item.patternId}`).toBeLessThan(20480);
      }
    }
  });

  it('id 唯一，getSet 可反查', () => {
    const ids = CURATED_SETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(getSet('calm-office')!.label).toBe('冷静办公');
    expect(getSet('__不存在__')).toBeUndefined();
  });
});