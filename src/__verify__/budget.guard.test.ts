/**
 * 体积预算门禁 —— 所有 pattern 的「控件拉满」极限都必须在线内。
 *
 * ⭐ 存在理由：`verify.test.ts` 只测**默认配置**的体积，而用户可以
 * 把控件全部拉到最大。art-deco-fan 就因此长期超线：
 * 默认 9094B（看起来完全正常）→ 全拉满 20965B（**超红线 485B**）。
 * 这类缺陷在「只看默认截图」或「只跑默认测试」时**永远不会暴露**。
 *
 * ⚠️ 本文件刻意不复用 verify 的测法：verify 测单点，
 * 这里测**所有控件同时取极值** —— 体积是各控件的**乘积效应**，
 * 单独测每个控件都可能不超线，叠在一起就超。
 */
import { describe, expect, it } from 'vitest';
import { LIMITS } from '../shared/constants';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import { countTopLevelNodes } from '../engine/svg';
import { registry } from '../patterns';
import type { PatternDef } from '../patterns/types';
import type { ParamValue } from '../patterns/types';
import type { PatternConfig } from '../engine/types';

/** 取「体积最坏」配置：所有 range 取 max、所有 toggle 取 true、seed 取固定值。 */
function worstCase(def: PatternDef, w: number, h: number): PatternConfig {
  const base = createDefaultConfig(def, { width: w, height: h, seed: 7 });
  const params: Record<string, ParamValue> = { ...base.params };
  for (const c of def.controls) {
    if (c.type === 'range') params[c.key] = c.max;
    else if (c.type === 'angle') params[c.key] = 359;
    else if (c.type === 'toggle') params[c.key] = true;
    // select 取第一个选项：通常是最"满"的那个，但无法通用判断，故保持默认
  }
  return { ...base, params: params as PatternConfig['params'] };
}

describe('体积预算 · 控件拉满', () => {
  const CASES = [
    { w: 3840, h: 2160, label: '4K' },
    { w: 5120, h: 2880, label: '5K' },
    { w: 1170, h: 2532, label: '竖屏' },
  ] as const;

  it('扫描到了所有母题（确保不是空跑）', () => {
    expect(registry.size).toBeGreaterThan(15);
  });

  for (const { w, h, label } of CASES) {
    it(`${label} ${w}×${h}：所有控件拉满时体积仍 < ${LIMITS.MAX_SVG_BYTES}B`, () => {
      const over: string[] = [];
      const rows: string[] = [];
      for (const def of registry.list()) {
        const svg = renderStandaloneSVG(def, worstCase(def, w, h), { skipBudget: true });
        const bytes = new TextEncoder().encode(svg).length;
        const pct = ((bytes / LIMITS.MAX_SVG_BYTES) * 100).toFixed(0);
        rows.push(`${def.id} ${bytes}B (${pct}%)`);
        if (bytes >= LIMITS.MAX_SVG_BYTES) {
          over.push(`${def.id} = ${bytes}B（超 ${bytes - LIMITS.MAX_SVG_BYTES}B）`);
        }
      }
      expect(
        over,
        `控件拉满即超红线 —— 用户把滑块拖到底就会炸：\n${over.join('\n')}\n\n全部：\n${rows.join('\n')}`,
      ).toEqual([]);
    });
  }

  it('顶层节点数同样要在控件拉满时 ≤ 60', () => {
    /**
     * ⚠️ 必须用引擎自己的 `countTopLevelNodes(body)`，不能用裸正则。
     * 裸正则会把 `<pattern>` / `<g>` **内部**的节点也算进去 ——
     * 而节点上限的真实语义是「body 的**顶层**子节点」，
     * 因为 `<pattern>` 内部无论多少节点，最终都只渲染成 1 个引用。
     *
     * 这与 structure.guard.test.ts 里的注释是同一个坑：
     * `countTopLevelNodes(body)` vs 全文正则数，结论可以差一个数量级。
     * 第一版门禁用了正则，于是 art-deco-fan（158）/glitch-rgb（177）被误判超限，
     * 而引擎真源下它们都在 60 以内。
     */
    const over: string[] = [];
    const rows: string[] = [];
    for (const def of registry.list()) {
      const out = renderStandaloneSVG(def, worstCase(def, 3840, 2160), { skipBudget: true });
      const bodyOnly = out.replace(/<defs>[\s\S]*?<\/defs>/, '');
      const nodes = countTopLevelNodes(bodyOnly);
      rows.push(`${def.id} ${nodes}`);
      if (nodes > LIMITS.MAX_BODY_NODES) over.push(`${def.id} = ${nodes}（超 ${nodes - LIMITS.MAX_BODY_NODES}）`);
    }
    expect(over, `顶层节点超限：\n${over.join('\n')}\n\n全部：\n${rows.join('  ')}`).toEqual([]);
  });

  it('产物纯净：拉满时也不得出现 NaN / text / foreignObject / CSS 变量', () => {
    const bad: string[] = [];
    for (const def of registry.list()) {
      const svg = renderStandaloneSVG(def, worstCase(def, 3840, 2160), { skipBudget: true });
      if (/NaN|undefined|Infinity/.test(svg)) bad.push(`${def.id}: 含 NaN/undefined`);
      if (/<text|foreignObject/.test(svg)) bad.push(`${def.id}: 含 <text>/foreignObject`);
      if (/var\(--|currentColor/.test(svg)) bad.push(`${def.id}: 含 CSS 变量`);
    }
    expect(bad, `产物不纯：\n${bad.join('\n')}`).toEqual([]);
  });

  it('确定性：拉满配置下同 seed 仍必得同一产物', () => {
    for (const def of registry.list()) {
      const a = renderStandaloneSVG(def, worstCase(def, 2560, 1440), { skipBudget: true });
      const b = renderStandaloneSVG(def, worstCase(def, 2560, 1440), { skipBudget: true });
      expect(a, `${def.id} 拉满配置下不确定`).toBe(b);
    }
  });

  it('振幅为 0 / 密度最小等边界值不产生退化产物', () => {
    for (const def of registry.list()) {
      const base = createDefaultConfig(def, { width: 2560, height: 1440, seed: 7 });
      const min: Record<string, ParamValue> = {};
      for (const c of def.controls) {
        if (c.type === 'range') min[c.key] = c.min;
        else if (c.type === 'toggle') min[c.key] = false;
      }
      const cfg: PatternConfig = { ...base, params: { ...base.params, ...min } as PatternConfig['params'] };
      const svg = renderStandaloneSVG(def, cfg, { skipBudget: true });
      expect(svg, `${def.id} 在控件最小值时产出异常`).not.toMatch(/NaN|undefined|Infinity/);
    }
  });
});
