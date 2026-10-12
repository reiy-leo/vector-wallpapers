/**
 * @vitest-environment node
 *
 * 母题结构健康度门禁 —— 把 `docs/PATTERN-SELECTION.md` 的判据固化成可执行断言。
 *
 * 背景：审查发现 `liquid-mesh` 的 4 个元件**全部是渐变**（纯色占比 0%），
 * 导致它在产品层面的「元件级配色」实质失效 —— 用户能点到 4 个色块，
 * 但每次改色只染到画面的一半。这不是 bug，是母题设计的缺陷，
 * 因此**任何只测「有没有报错」的测试都发现不了它**。
 *
 * 本门禁的意义：让下一个新增母题的人，在写完 pattern 的第一秒就被告知
 * 「你这个母题撑不起元件级配色」，而不是上线后靠用户反馈才发现。
 */
import { describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { LIMITS } from '../shared/constants';
import { renderStandaloneSVG } from '../engine/render';

/**
 * 允许「纯色占比低于 50%」的母题白名单。
 *
 * 每一条都必须写明理由 —— 白名单本身是一种负债，
 * 允许无理由豁免就会退化成「所有母题都能豁免」。
 *
 * - `aurora-wave`：极光的物理本质就是渐变辉光，
 *   强行改成纯色会毁掉它（且此母题因用户反馈已做过一轮视觉重做）。
 *   但它仍有 1 个纯色元件（stars），换肤能力未归零。
 */
const GRADIENT_HEAVY_EXEMPT: Record<string, string> = {
  'aurora-wave': '极光本质为渐变辉光，改纯色会毁掉形态；仍有 stars 纯色元件',
};

interface Metrics {
  id: string;
  category: string;
  total: number;
  solids: number;
  gradients: number;
  solidRatio: number;
  configurable: number;
  bytes: number;
  nodes: number;
}

function metricsOf(id: string): Metrics {
  const def = registry.get(id)!;
  const svg = renderStandaloneSVG(def, {
    patternId: def.id,
    width: 1920,
    height: 1080,
    seed: 7,
    elements: def.elements.map((e) => ({
      id: e.id,
      paint: e.paint,
      opacity: e.opacity,
      visible: e.visible,
      locked: e.locked ?? false,
    })),
    params: Object.fromEntries(def.controls.map((c) => [c.key, c.default])),
  }, { skipBudget: true });

  const solids = def.elements.filter((e) => e.paint.type === 'solid').length;
  const gradients = def.elements.filter(
    (e) => e.paint.type === 'linear' || e.paint.type === 'radial',
  ).length;

  return {
    id: def.id,
    category: def.category,
    total: def.elements.length,
    solids,
    gradients,
    solidRatio: solids / def.elements.length,
    configurable: def.elements.filter((e) => e.configurable).length,
    bytes: new TextEncoder().encode(svg).length,
    nodes: (svg.match(/<(rect|circle|path|line|polygon|ellipse|g)\b/g) ?? []).length,
  };
}

const ALL = registry.list().map((d) => metricsOf(d.id));

describe('母题结构健康度（docs/PATTERN-SELECTION.md §3 的判据）', () => {
  it('扫描到了全部母题（确保下面的断言不是空跑）', () => {
    expect(ALL.length).toBe(registry.size);
    expect(ALL.length).toBeGreaterThan(0);
  });

  it('每个母题至少 2 个元件 —— 元件级配色至少要有两个可对比的区域', () => {
    const bad = ALL.filter((m) => m.total < 2).map((m) => `${m.id}(${m.total})`);
    expect(bad, `元件数不足 2 个，无法体现「独立设色」：${bad.join(', ')}`).toEqual([]);
  });

  it('纯色元件占比 ≥50%，或有明确豁免理由', () => {
    const bad = ALL.filter(
      (m) => m.solidRatio < 0.5 && !(m.id in GRADIENT_HEAVY_EXEMPT),
    ).map((m) => `${m.id}(纯色 ${m.solids}/${m.total})`);
    expect(
      bad,
      `以下母题纯色元件不足一半，「换肤」能力弱。\n` +
        `纯色元件改色=整块变色，渐变元件改色=只染一端，价值不在一个量级。\n` +
        `确需保留请加入 GRADIENT_HEAVY_EXEMPT 并写明理由：${bad.join(', ')}`,
    ).toEqual([]);
  });

  it('豁免白名单里的母题必须有理由，且理由非空', () => {
    for (const id of Object.keys(GRADIENT_HEAVY_EXEMPT)) {
      expect(registry.get(id), `豁免名单里的 ${id} 已不存在，请移除`).toBeDefined();
      expect(GRADIENT_HEAVY_EXEMPT[id].length).toBeGreaterThan(10);
    }
  });

  it('至少有一个纯色元件（否则连「染色」都做不到）', () => {
    const bad = ALL.filter((m) => m.solids === 0).map((m) => m.id);
    expect(bad, `零纯色元件的母题无法做任何可见的改色：${bad.join(', ')}`).toEqual([]);
  });

  it('全部元件对用户可配置 —— 不可配置的元件等于 UI 上会出现「点不动的色块」', () => {
    const bad = ALL.filter((m) => m.configurable !== m.total)
      .map((m) => `${m.id}(${m.configurable}/${m.total})`);
    expect(bad, `存在不可配置元件：${bad.join(', ')}`).toEqual([]);
  });

  it('体积均低于 20KB 红线', () => {
    const bad = ALL.filter((m) => m.bytes > LIMITS.MAX_SVG_BYTES)
      .map((m) => `${m.id}(${m.bytes}B)`);
    expect(bad, `超出体积红线 ${LIMITS.MAX_SVG_BYTES}B：${bad.join(', ')}`).toEqual([]);
  });

  it('节点数均低于 60 上限（平铺失效的信号）', () => {
    const bad = ALL.filter((m) => m.nodes > LIMITS.MAX_BODY_NODES)
      .map((m) => `${m.id}(${m.nodes})`);
    expect(bad, `超出节点上限 ${LIMITS.MAX_BODY_NODES}：${bad.join(', ')}`).toEqual([]);
  });

  it('每个母题都声明了 paletteSlots —— 否则「按角色批量设色」对它无效', () => {
    const bad = registry
      .list()
      .filter((d) => Object.keys(d.paletteSlots).length === 0)
      .map((d) => d.id);
    expect(bad, `缺少 paletteSlots 声明：${bad.join(', ')}`).toEqual([]);
  });
});

describe('结构健康度快照（失败时会打印，便于人工复核）', () => {
  it('打印全量指标', () => {
    const lines = ALL.map(
      (m) =>
        `${m.id} | ${m.category} | 元件${m.total} | 纯色${m.solids} | 渐变${m.gradients} | ` +
        `${(m.solidRatio * 100).toFixed(0)}% | ${m.bytes}B | ${m.nodes}节点`,
    );
    const solids = ALL.reduce((n, m) => n + m.solids, 0);
    const els = ALL.reduce((n, m) => n + m.total, 0);
    console.log(
      '\n' +
        lines.join('\n') +
        `\n合计 ${ALL.length} 母题 / ${els} 元件 / 纯色占比 ${((solids / els) * 100).toFixed(0)}%\n`,
    );
    // 断言仅为让快照测试有意义：任何一项退化都会在此之前失败
    expect(solids / els).toBeGreaterThan(0.7);
  });
});
