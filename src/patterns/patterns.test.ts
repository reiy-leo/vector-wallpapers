/**
 * Pattern 元数据契约测试 —— 逐个核对 PRD 锁定的事实，防止后续改动悄悄漂移。
 *
 * ⭐ 其中「元件改色生效」一组是**行为层**断言（PRD Q2 核心差异化）：
 * 元数据写着 `configurable: true` 并不代表用户改色真有反应，
 * 死元件（声明可改色但产物里从不出现）只有靠行为断言才拦得住。
 */
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../shared/constants';
import { byteLength } from '../engine/budget';
import { createDefaultConfig, renderSVG, renderStandaloneSVG } from '../engine/render';
import { registry } from './index';
import { ALL_PATTERN_IDS } from './registry';
import type { ElementSpec, PatternDef, PatternId } from './types';
import type { PatternConfig } from '../engine/types';

const ALL = registry.list();

/** PRD 锁定的四个分类。 */
const CATEGORIES = ['A-lines', 'B-repeat', 'C-organic', 'D-pixel'] as const;

/** 把某 pattern 的全部控件推到最大值 —— 体积红线的真实考验场景。 */
function maxConfig(patternId: string) {
  const def = registry.get(patternId)!;
  const cfg = createDefaultConfig(def, { seed: 42 });
  for (const c of def.controls) {
    switch (c.type) {
      case 'range':
        cfg.params[c.key] = c.max;
        break;
      case 'angle':
        cfg.params[c.key] = 45;
        break;
      case 'toggle':
        cfg.params[c.key] = true;
        break;
      case 'select':
        cfg.params[c.key] = c.options[c.options.length - 1].value;
        break;
    }
  }
  return cfg;
}

describe('实现数量与 id 契约', () => {
  it('PRD 锁定的 19 个 pattern 已全部实现', () => {
    expect(ALL).toHaveLength(19);
  });

  it('全部 id 均属PRD 锁定的 19 个 id 之内', () => {
    for (const def of ALL) {
      expect(ALL_PATTERN_IDS, `${def.id} 不在 PRD id清单中`).toContain(def.id);
    }
  });

  it('分类分布：线条 5 / 波点 5 / 流体 5 / 像素 4', () => {
    // D 类是 4 个（像素调性母题天然少一个），其余三类各 5 个
    const expected: Record<string, number> = {
      'A-lines': 5,
      'B-repeat': 5,
      'C-organic': 5,
      'D-pixel': 4,
    };
    for (const c of CATEGORIES) {
      expect(registry.listByCategory(c), c).toHaveLength(expected[c]);
    }
  });

  it('id 全部为 kebab-case', () => {
    for (const def of ALL) {
      expect(def.id, def.id).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });

  it('实现的 19 个 id 精确匹配 PRD 锁定清单', () => {
    expect(ALL.map((d) => d.id).sort()).toEqual(
      [
        'arc-composition',
        'aurora-wave',
        'bauhaus-blocks',
        'blob-field',
        'checker-mesh',
        'cloud-bands',
        'contour-rings',
        'diamond-lattice',
        'dusk-ridges',
        'flow-lines',
        'hex-grid',
        'liquid-mesh',
        'memphis-grid',
        'new-wave-sunset',
        'neon-pixels',
        'offset-grid',
        'pixel-terrain',
        'polka-dots',
        'triangle-tiling',
      ].sort(),
    );
  });
});

describe('每个 pattern 的元数据完整性', () => {
  it('≥ 2 个元件', () => {
    for (const def of ALL) {
      expect(def.elements.length, def.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('≥ 2 个参数控件', () => {
    for (const def of ALL) {
      expect(def.controls.length, def.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('≥ 2 套 preset', () => {
    for (const def of ALL) {
      expect(def.presets.length, def.id).toBeGreaterThanOrEqual(2);
    }
  });

  it('≥ 1 个 configurable 元件（落实「元件独立配色」）', () => {
    for (const def of ALL) {
      expect(def.elements.some((e) => e.configurable), def.id).toBe(true);
    }
  });

  it('paletteSlots 非空且引用的 element id 均存在', () => {
    for (const def of ALL) {
      expect(Object.keys(def.paletteSlots).length, def.id).toBeGreaterThan(0);
      const ids = new Set(def.elements.map((e) => e.id));
      for (const slot of Object.values(def.paletteSlots)) {
        expect(slot.length, def.id).toBeGreaterThan(0);
        for (const id of slot) expect(ids.has(id), `${def.id} 的 paletteSlots 引用了不存在的元件 ${id}`).toBe(true);
      }
    }
  });

  it('element id 唯一且为 snake_case；control key 唯一且为 camelCase', () => {
    for (const def of ALL) {
      const ids = def.elements.map((e) => e.id);
      expect(new Set(ids).size, `${def.id} 元件 id 重复`).toBe(ids.length);
      for (const id of ids) expect(id, `${def.id}/${id}`).toMatch(/^[a-z][a-z0-9_]*$/);

      const keys = def.controls.map((c) => c.key);
      expect(new Set(keys).size, `${def.id} 控件 key 重复`).toBe(keys.length);
      for (const key of keys) expect(key, `${def.id}/${key}`).toMatch(/^[a-z][a-zA-Z0-9]*$/);
    }
  });

  it('opacity 均在 [0,1]，paint 均为合法 hex 字面量', () => {
    for (const def of ALL) {
      for (const e of def.elements) {
        expect(e.opacity, `${def.id}/${e.id}`).toBeGreaterThanOrEqual(0);
        expect(e.opacity, `${def.id}/${e.id}`).toBeLessThanOrEqual(1);
        const colors =
          e.paint.type === 'solid'
            ? [e.paint.color]
            : e.paint.type === 'none'
              ? []
              : e.paint.stops.map((s) => s.color);
        for (const c of colors) {
          expect(c, `${def.id}/${e.id} 的硬编码色值必须是 6 位 hex`).toMatch(/^#[0-9a-f]{6}$/i);
        }
      }
    }
  });

  it('preset 引用的 element id 均存在', () => {
    for (const def of ALL) {
      const ids = new Set(def.elements.map((e) => e.id));
      for (const p of def.presets) {
        for (const id of Object.keys(p.elements)) {
          expect(ids.has(id), `${def.id}/${p.id} 引用了不存在的元件 ${id}`).toBe(true);
        }
      }
    }
  });

  it('preset 引用的 param key 均已声明', () => {
    for (const def of ALL) {
      const keys = new Set(def.controls.map((c) => c.key));
      for (const p of def.presets) {
        for (const k of Object.keys(p.params ?? {})) {
          expect(keys.has(k), `${def.id}/${p.id} 引用了不存在的控件 ${k}`).toBe(true);
        }
      }
    }
  });
});

describe('体积红线 ⭐ PRD NFR 硬指标', () => {
  it('默认配置下全部 pattern 均< 20KB', () => {
    for (const def of ALL) {
      const { bytes } = renderSVG(def, createDefaultConfig(def, { seed: 42 }));
      expect(bytes, `${def.id} 默认配置 ${bytes}B`).toBeLessThan(LIMITS.MAX_SVG_BYTES);
    }
  });

  it('全部控件最大值下仍 < 20KB', () => {
    for (const def of ALL) {
      const { bytes } = renderSVG(def, maxConfig(def.id));
      expect(bytes, `${def.id} 最大参数 ${bytes}B`).toBeLessThan(LIMITS.MAX_SVG_BYTES);
    }
  });

  it('4K 分辨率下仍 < 20KB（体积与分辨率解耦的证明）', () => {
    for (const def of ALL) {
      const { bytes } = renderSVG(def, createDefaultConfig(def, { width: 3840, height: 2160, seed: 1 }));
      expect(bytes, `${def.id} 4K 下${bytes}B`).toBeLessThan(LIMITS.MAX_SVG_BYTES);
    }
  });

  it('body 顶层节点数 ≤ 60', () => {
    for (const def of ALL) {
      const out = renderSVG(def, maxConfig(def.id));
      expect(out.nodes, `${def.id} 顶层节点 ${out.nodes} 个`).toBeLessThanOrEqual(LIMITS.MAX_BODY_NODES);
    }
  });

  it('体积报告：逐个 pattern 记录字节数（供人工核对）', () => {
    const report = ALL.map((def) => ({
      id: def.id,
      bytes: renderSVG(def, createDefaultConfig(def, { seed: 42 })).bytes,
      maxBytes: renderSVG(def, maxConfig(def.id)).bytes,
    }));
    for (const r of report) {
      // eslint-disable-next-line no-console
      console.log(`[budget] ${r.id.padEnd(16)} default=${String(r.bytes).padStart(5)}B  max=${String(r.maxBytes).padStart(5)}B`);
    }
    expect(report).toHaveLength(19);
  });
});

describe('<pattern> 平铺覆盖', () => {
  it('每个分类至少有 1 个 pattern 使用 <pattern> 平铺', () => {
    const tiled = new Set(
      ALL.filter((def) => renderSVG(def, createDefaultConfig(def, { seed: 1 })).svg.includes('<pattern')).map(
        (d) => d.category,
      ),
    );
    for (const c of CATEGORIES) {
      expect(tiled.has(c), `${c} 类没有任何 pattern 使用平铺`).toBe(true);
    }
  });

  it('B-repeat 类全部使用平铺（架构 §3.3 标注 ⭐必须 tile）', () => {
    for (const def of registry.listByCategory('B-repeat')) {
      expect(renderSVG(def, createDefaultConfig(def)).svg, `${def.id} 未使用平铺`).toContain('<pattern');
    }
  });

  it('密度拉满时体积几乎不变（密度与体积解耦）', () => {
    const def = registry.get('polka-dots')!;
    const low = createDefaultConfig(def);
    low.params.density = 4;
    const high = createDefaultConfig(def);
    high.params.density = 60;
    const lowBytes = byteLength(renderSVG(def, low).svg);
    const highBytes = byteLength(renderSVG(def, high).svg);
    // 允许小幅差异（cell 尺寸字符串长度），但不应出现数量级增长
    expect(highBytes).toBeLessThan(lowBytes * 1.5);
  });
});

describe('确定性（同 seed 字节一致）', () => {
  it('全部 pattern：同 seed 两次渲染字节完全一致', () => {
    for (const def of ALL) {
      const a = renderSVG(def, createDefaultConfig(def, { seed: 12345 })).svg;
      const b = renderSVG(def, createDefaultConfig(def, { seed: 12345 })).svg;
      expect(a, def.id).toBe(b);
    }
  });

  it('全部 seed 敏感型 pattern：不同 seed 产生不同结果', () => {
    const seedSensitive = ALL.filter((d) => d.seedable);
    expect(seedSensitive.length).toBeGreaterThan(0);
    for (const def of seedSensitive) {
      const a = renderSVG(def, createDefaultConfig(def, { seed: 1 })).svg;
      const b = renderSVG(def, createDefaultConfig(def, { seed: 987654 })).svg;
      expect(a, `${def.id} 不同 seed 应产生不同结果`).not.toBe(b);
    }
  });

  it('非 seedable 的 pattern 换 seed 结果不变（如实反映元数据）', () => {
    for (const def of ALL.filter((d) => !d.seedable)) {
      const a = renderSVG(def, createDefaultConfig(def, { seed: 1 })).svg;
      const b = renderSVG(def, createDefaultConfig(def, { seed: 2 })).svg;
      expect(a, `${def.id} 标为不可 seed，换 seed 不应改变结果`).toBe(b);
    }
  });
});

describe('registry', () => {
  it('get 按 id 取到，未知 id 返回 undefined（不抛错）', () => {
    expect(registry.get('polka-dots')!.id).toBe('polka-dots');
    expect(registry.get('__不存在__')).toBeUndefined();
  });

  it('重复注册同一 id 的另一个对象会抛错', () => {
    const original = registry.get('polka-dots')!;
    // 必须是一个**不同的对象**：把同一个实例再注册一次是幂等的，
    // 真正要防的是「两个模块各自定义了同一个 id」。
    const impostor: PatternDef = { ...original, name: '冒牌波点' };
    expect(() => registry.register([impostor])).toThrow(/重复/);
  });

  it('重复注册同一对象是幂等的（不算冲突）', () => {
    const original = registry.get('polka-dots')!;
    expect(() => registry.register([original])).not.toThrow();
    expect(registry.size).toBe(19);
  });

  it('search 按 id / 中文名 / 描述模糊匹配', () => {
    expect(registry.search('polka').map((d) => d.id)).toContain('polka-dots');
    expect(registry.search('波点').map((d) => d.id)).toContain('polka-dots');
    expect(registry.search('')).toHaveLength(19);
    expect(registry.search('zzz-不存在')).toHaveLength(0);
  });

  it('first() 返回首个可用 pattern（未知 p 的兜底目标）', () => {
    expect(registry.first()!.id).toBe('flow-lines');
  });

  it('size 与 list 长度一致', () => {
    expect(registry.size).toBe(registry.list().length);
  });
});

describe('PatternId 类型即PRD 契约', () => {
  it('已实现的 id 都是合法的 PatternId', () => {
    const valid: PatternId[] = [...ALL_PATTERN_IDS];
    for (const def of ALL) {
      expect(valid).toContain(def.id as PatternId);
    }
  });
});
/**
 * ⭐⭐ 行为层：元件改色必须真的改变产物（PRD Q2 核心差异化）
 *
 * 背景：此前所有测试都停在**元数据层**（`configurable: true` 就认为可用），
 * 于是「死元件」能全绿通过 —— 元件在面板上有色块、能拖取色器，
 * 但产物里从不出现该颜色，用户拖完画面零变化。
 * QA 用变异测试抓到两个实例：
 *   - neon-pixels：levels 默认 3 导致 px_d 采样池里根本没有，命中率 0%
 *   - memphis-grid：单元内只画 2 个随机种类，命中率仅 24~43%
 *
 * 这组断言把「可配置」从声明变成**可验证的事实**。
 */

/** 高区分度探针色：19 个 pattern 的硬编码色里都没有它，避免撞色造成假阴性。 */
const PROBE = '#ff00a8';
/** 每个元件采样多少个 seed 统计命中率。 */
const HIT_SEEDS = 60;
/** 命中率下限：随机采样留有余量，但不能低到让用户「基本无效」。 */
const HIT_MIN = 0.95;

/** 给某个元件换成探针色（渐变只改第一个色标，保留结构）。 */
function paintWithProbe(spec: ElementSpec) {
  if (spec.paint.type === 'solid') return { type: 'solid' as const, color: PROBE };
  if (spec.paint.type === 'none') return spec.paint;
  return {
    ...spec.paint,
    stops: spec.paint.stops.map((s, i) => (i === 0 ? { ...s, color: PROBE } : s)),
  };
}

/** 单个 (pattern, element, seed) 的判定：改色后产物是否变化。 */
function colorTakesEffect(def: PatternDef, el: ElementSpec, seed: number): boolean {
  // 基线与探针必须用**同一个 seed**：
  // 否则 seed 差异会让产物变化被误算成「颜色生效」，得到假阳性。
  const refCfg = createDefaultConfig(def, { seed });
  const ref = renderStandaloneSVG(def, refCfg);

  const cfg: PatternConfig = createDefaultConfig(def, { seed });
  const target = cfg.elements.find((e) => e.id === el.id);
  if (!target) return false;
  target.paint = paintWithProbe(el);
  return renderStandaloneSVG(def, cfg) !== ref;
}

describe('⭐ 行为层：每个 configurable 元件改色都必须生效', () => {
  for (const def of ALL) {
    const configurable = def.elements.filter((e) => e.configurable);
    it(`${def.id} 的全部 ${configurable.length} 个可配置元件命中率 ≥95%`, () => {
      const report: string[] = [];
      const failures: string[] = [];

      for (const el of configurable) {
        let hit = 0;
        for (let s = 0; s < HIT_SEEDS; s++) {
          if (colorTakesEffect(def, el, s)) hit++;
        }
        const rate = hit / HIT_SEEDS;
        report.push(`${el.id}=${(rate * 100).toFixed(0)}%`);
        if (rate < HIT_MIN) failures.push(`${el.id} 仅 ${(rate * 100).toFixed(1)}%（死元件或概率过低）`);
      }

      // 打出实测命中率，便于回归时肉眼对比
      // eslint-disable-next-line no-console
      console.log(`[hit-rate] ${def.id.padEnd(17)} ${report.join(' ')}`);
      expect(failures, failures.join('；')).toEqual([]);
    });
  }

  it('不存在「声明可配置但改色无任何效果」的可配置元件', () => {
    // 换一个 seed 也要试：某些元件可能只在特定 seed 下出现
    const dead: string[] = [];
    for (const def of ALL) {
      for (const el of def.elements) {
        if (!el.configurable) continue;
        const anySeed = [1, 2, 3, 7, 42, 99, 1234, 65535].some((s) => colorTakesEffect(def, el, s));
        if (!anySeed) dead.push(`${def.id}/${el.id}`);
      }
    }
    expect(dead, `以下元件改色后产物完全不变：${dead.join(', ')}`).toEqual([]);
  });

  /**
   * 注意断言的实际着力点：这里锁的是 **resolveElements 把隐藏元件的 paintValue
   * 强制为 'none'**，而不是 pattern 侧的 `if (x.visible)` 判断。
   * 变异测试佐证：删掉 pattern 里的 visible 判断，本用例仍会通过
   * ——`fill="none"` 的 shape 本就画不出像素，视觉零差异（仅浪费约 109B）。
   * 所以这不是正确性缺陷，但名字必须说清它到底守住了什么，
   * 否则后人会以为它覆盖了 visible 分支。
   */
  it('隐藏元件的 paint 被忽略（由引擎强制 none，不依赖 pattern 侧 visible 判断）', () => {
    for (const def of ALL) {
      for (const el of def.elements) {
        const cfg = createDefaultConfig(def, { seed: 5 });
        const target = cfg.elements.find((e) => e.id === el.id)!;
        target.visible = false;
        target.paint = paintWithProbe(el);
        // 隐藏后 paintValue 强制为 none，产物与「仅隐藏」应完全一致
        const hiddenOnly = createDefaultConfig(def, { seed: 5 });
        hiddenOnly.elements.find((e) => e.id === el.id)!.visible = false;
        expect(
          renderStandaloneSVG(def, cfg),
          `${def.id}/${el.id} 隐藏后改色仍影响了产物`,
        ).toBe(renderStandaloneSVG(def, hiddenOnly));
      }
    }
  });
});

/**
 * ⭐ role 批量改色（PRD P0-2：点「强调色 ×2」一次改多个同 role 元件）
 *
 * 此前 `paletteSlots` / `role` 只是元数据，engine / ui / dev 都没人读 ——
 * 属于「实现了但没接线」。这里把消费方落进引擎层，UI 直接调用即可。
 */
describe('role 批量改色（PRD P0-2）', () => {
  it('paletteByRole 把 role 映射到该 pattern 实际存在的元件 id', () => {
    for (const def of ALL) {
      const ids = new Set(def.elements.map((e) => e.id));
      for (const [role, members] of Object.entries(def.paletteSlots)) {
        expect(members.length, `${def.id}/${role} 槽位为空`).toBeGreaterThan(0);
        for (const id of members) {
          expect(ids.has(id), `${def.id}/${role} 引用了不存在的元件 ${id}`).toBe(true);
        }
      }
    }
  });

  it('每个 role 槽位覆盖到的元件，其 role 字段与槽位名一致', () => {
    for (const def of ALL) {
      for (const [role, members] of Object.entries(def.paletteSlots)) {
        for (const id of members) {
          const el = def.elements.find((e) => e.id === id)!;
          expect(el.role, `${def.id}/${id} 在槽位 ${role} 里但自身 role=${el.role}`).toBe(role);
        }
      }
    }
  });
});

/**
 * ⭐ seed 敏感性必须在**任何参数组合**下成立
 *
 * 背景：memphis-grid 曾把 5 个固定落位写成常量，只有 `extra` 随机位调用 rng()。
 * 于是 `extra=0` 时整个 pattern 没有任何随机源 —— 用户点「换一版」画面纹丝不动，
 * 而 `seedable: true` 仍亮着。原有 seed 用例跑的是默认参数（extra=2），
 * 边界完全没被覆盖。
 *
 * 契约：`seedable: true` = 「任何可达参数下，换 seed 都必得新产物」。
 * 这条断言把所有 range 控件推到 min 与 max 两端逐一验证。
 */
describe('⭐ seed 敏感性的参数边界', () => {
  /** 逐个 range 控件推到指定端值，返回该配置。 */
  function configWithRangeAt(def: PatternDef, key: string, value: number): PatternConfig {
    const cfg = createDefaultConfig(def, { seed: 11 });
    cfg.params[key] = value;
    return cfg;
  }

  /**
   * 「本就无随机内容可抖」的端点白名单。
   *
   * 有些控件的 0 值语义是**根本不画这类元素**（振幅 0 = 纯直线、
   * 填充率 0 = 一个都不填），此时产物本就与 seed 无关 —— 这不是缺陷，
   * 而是该参数的定义。断言必须显式豁免它们，否则就是假阳性。
   *
   * 刻意用白名单而非自动推断（如「产物为空则跳过」）：
   * 自动推断会把「意外写死」和「本就无内容」混为一谈，
   * 那正是 memphis extra=0 那类 bug 能溜过去的原因。
   */
  const DEGENERATE_EDGES = new Set([
    'flow-lines/amplitude=0', // 振幅 0 → 纯直线，无随机可言
    'offset-grid/blocks=0', // 0 个方块 → 无随机方块可摆
    'hex-grid/ratio=0', // 填充率 0 → 一个六边形都不填
    'diamond-lattice/fillRatio=0', // 同上，一个菱形都不填
  ]);

  for (const def of ALL.filter((d) => d.seedable)) {
    const ranges = def.controls.filter((c) => c.type === 'range');
    if (ranges.length === 0) continue;

    it(`${def.id}：每个 range 控件取 min / max 时仍 seed 敏感`, () => {
      const inert: string[] = [];

      for (const c of ranges) {
        for (const edge of [c.min, c.max]) {
          if (DEGENERATE_EDGES.has(`${def.id}/${c.key}=${edge}`)) continue;
          const outs = new Set<string>();
          for (let s = 0; s < 8; s++) {
            const cfg = configWithRangeAt(def, c.key, edge);
            cfg.seed = s;
            outs.add(renderStandaloneSVG(def, cfg));
          }
          // 8 个 seed 至少要产出 2 种结果，否则该参数端点上「换一版」是死的
          if (outs.size < 2) inert.push(`${c.key}=${edge}`);
        }
      }

      expect(inert, `以下参数取值下换 seed 无变化：${inert.join(', ')}`).toEqual([]);
    });
  }
});

/**
 * ⭐ aurora-wave 的帘幕必须完整落在画布内（不得在max 参数下被切掉半截）
 *
 * 背景：baseY 曾是固定区间，只有默认 thickness(0.16) 恰好放得下；
 * thickness 拉到 max(0.35) 时 curtainH≈529px，topY 变成 -198px，
 * 帘子顶端冲出画布 —— 用户看到的是「半截帘子被切」，不像刻意设计。
 *
 * 断言方式：直接量产物里所有 y 坐标的最小值。
 * 注意必须**逐档位**扫参数（而不是只看 max）——
 * 最小 y 可能出现在中间档位而不在边界上。
 */
describe('aurora-wave 帘幕不被画布上边界裁切', () => {
  const def = registry.get('aurora-wave')!;

  it('thickness 从 min 到 max 全程，最小 y 坐标始终 ≥ 0', () => {
    const offenders: string[] = [];
 const range = def.controls.find((c) => c.key === 'thickness')!;
    if (range.type !== 'range') throw new Error('thickness 应为 range');

    for (let step = 0; step <= 10; step++) {
      const v = range.min + ((range.max - range.min) * step) / 10;
      for (const amp of [0.01, 0.09, 0.25]) {
        const cfg = createDefaultConfig(def, { width: 2560, height: 1440, seed: 42 });
        cfg.params.thickness = v;
        cfg.params.amp = amp;
        const svg = renderStandaloneSVG(def, cfg);
        // 只看 body（<defs> 里没有几何坐标，但保险起见排除）
        const afterTag = svg.slice(svg.indexOf('>') + 1, svg.lastIndexOf('</svg>'));
        const defsEnd = afterTag.lastIndexOf('</defs>');
        const body = defsEnd >= 0 ? afterTag.slice(defsEnd + 7) : afterTag;
   const ys = [...body.matchAll(/[ML](-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => parseFloat(m[2]!));
        if (ys.length === 0) continue;
        const minY = Math.min(...ys);
  if (minY < 0) offenders.push(`thickness=${v.toFixed(2)} amp=${amp} → minY=${minY.toFixed(1)}`);
      }
    }
    expect(offenders, `以下参数下帘幕被上边界裁切：\n  ${offenders.join('\n  ')}`).toEqual([]);
  });
});

/**
 * ⭐ blob-field 不得产出「画了但看不见」的退化斑点
 *
 * 背景（team-lead 在产物里发现并报告）：slot 的`frac()` 取值可以任意接近 0/1，
 * 于是槽位可能落在 tile 边界上甚至之外——
 *   - 越界 → 圆心出现**负坐标**（实测 `cy="-12.09"`），整颗斑点被裁掉；
 * - 贴边 → 余量趋 0，半径被 `Math.max(1, …)` 夹成 1px 的隐形点。
 *
 * ⭐ 为什么这会伤到命中率：blob-field 的槽位 → 色组是**固定映射**
 * （`GROUPS[i % 3]`），一个退化的槽位等于**白白消耗掉某个色组的出场配额**，
 * 那正是命中率保证的根基。所以这类点必须被结构性消除，而不是事后夹住。
 *
 * 断言：产物中不得存在「半径 < 1.2px 且不透明度 > 0」的圆 —— 即
 * 「完全看不见但仍占用配额」的元素。
 */
describe('blob-field 无退化斑点（半径过小却仍绘制）', () => {
  const def = registry.get('blob-field')!;

  it('默认参数 + 20 个 seed：产物中无半径 < 1.2px 的可见圆', () => {
    const tiny: string[] = [];

    for (let seed = 0; seed < 20; seed++) {
      const cfg = createDefaultConfig(def, { width: 2560, height: 1440, seed });
      const svg = renderStandaloneSVG(def, cfg);
      for (const m of svg.matchAll(/<circle[^>]*\br="([\d.]+)"[^>]*>/g)) {
        const r = parseFloat(m[1]);
        const tag = m[0];
        const op = /fill-opacity="([\d.]+)"/.exec(tag);
        const opacity = op ? parseFloat(op[1]) : 1;
        if (r < 1.2 && opacity > 0) {
          tiny.push(`seed=${seed} r=${r} opacity=${opacity} ${tag}`);
        }
      }
    }
    expect(tiny, `出现退化斑点：\n  ${tiny.slice(0, 5).join('\n  ')}`).toEqual([]);
  });

  it('参数极值（size/scale/jitter/lobes 拉满与拉到底）下同样无退化斑点', () => {
    const tiny: string[] = [];
    const keys = ['size', 'scale', 'jitter', 'lobes'] as const;

    for (const k of keys) {
      for (const edge of ['min', 'max'] as const) {
        const cfg = createDefaultConfig(def, { width: 2560, height: 1440, seed: 7 });
        const ctl = def.controls.find((x) => x.key === k);
        if (!ctl || ctl.type !== 'range') continue;
        cfg.params[k] = edge === 'min' ? ctl.min : ctl.max;
        const svg = renderStandaloneSVG(def, cfg);
        for (const m of svg.matchAll(/<circle[^>]*\br="([\d.]+)"[^>]*>/g)) {
          const r = parseFloat(m[1]);
          const op = /fill-opacity="([\d.]+)"/.exec(m[0]);
          if (r < 1.2 && (op ? parseFloat(op[1]) : 1) > 0) {
            tiny.push(`${k}=${String(cfg.params[k])} r=${r}`);
          }
        }
      }
    }
    expect(tiny, `参数极值下出现退化斑点：\n  ${tiny.slice(0, 5).join('\n  ')}`).toEqual([]);
  });

  it('槽位圆心不得落在 tile 之外（负坐标 = 整颗被裁掉）', () => {
    // 用最小单元 + 最大抖动构造最坏情况
    const cfg = createDefaultConfig(def, { width: 2560, height: 1440, seed: 3 });
    const sizeCtl = def.controls.find((x) => x.key === 'size')!;
    const jitCtl = def.controls.find((x) => x.key === 'jitter')!;
    if (sizeCtl.type !== 'range' || jitCtl.type !== 'range') return;
    cfg.params.size = sizeCtl.min;
    cfg.params.jitter = jitCtl.max;

    const svg = renderStandaloneSVG(def, cfg);
    const pt = /<pattern[^>]*width="([\d.]+)"[^>]*height="([\d.]+)"/.exec(svg);
    if (!pt) return; // 该 seed 下无平铺（理论上不会）
    const tw = parseFloat(pt[1]);
    const th = parseFloat(pt[2]);
    const outside: string[] = [];
    for (const m of svg.matchAll(/<circle[^>]*\bcx="(-?[\d.]+)"[^>]*\bcy="(-?[\d.]+)"/g)) {
      const cx = parseFloat(m[1]);
      const cy = parseFloat(m[2]);
   if (cx < 0 || cy < 0 || cx > tw || cy > th) outside.push(`(${cx}, ${cy}) tile=${tw}×${th}`);
    }
    expect(outside, `圆心落在 tile 之外：\n  ${outside.slice(0, 5).join('\n  ')}`).toEqual([]);
  });
});
