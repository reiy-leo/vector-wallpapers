/**
 * 动画开关回归门禁（2026-10-12 bug：所有「闪烁 / 漂移 / 摇曳 / 滚动」开关在预览里无效）。
 *
 * 根因不在 pattern，而在预览调用 `renderStandaloneSVG` 时没传 `animate: true`
 * （它默认 animate:false → stripAnimation 整段剥离）。本文件守两件事：
 *  1. 引擎层：animate:true + 开关打开 → 产物里每个 `animation:NAME` 都有同名 `@keyframes NAME`；
 *     开关关闭 → 产物与 animate:false 无差异（开关是唯一的动画来源）。
 *  2. 预览层：CanvasStage 的主画布与聚焦预览都必须以 animate:true 渲染（读真实源码）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { createDefaultConfig, renderStandaloneSVG } from './render';
import type { PatternDef } from '../patterns/types';

const ANIMATABLE = registry.list().filter((d) => d.animatable);

/** 动画类开关：toggle 且归在「动画」分组。 */
function animToggles(def: PatternDef): string[] {
  return def.controls
    .filter((c) => c.type === 'toggle' && (c as { group?: string }).group === '动画')
    .map((c) => c.key);
}

function keyframeNames(svg: string): Set<string> {
  return new Set(Array.from(svg.matchAll(/@keyframes\s+([\w-]+)/g), (m) => m[1]));
}

function animationRefs(svg: string): string[] {
  return Array.from(svg.matchAll(/animation:\s*([\w-]+)/g), (m) => m[1]);
}

describe('动画开关在预览渲染路径生效', () => {
  it('至少有一个带「动画」开关的母题（否则本门禁空转）', () => {
    expect(ANIMATABLE.filter((d) => animToggles(d).length > 0).length).toBeGreaterThan(0);
  });

  for (const def of ANIMATABLE) {
    const toggles = animToggles(def);
    if (toggles.length === 0) continue;

    it(`${def.id}：开关打开 + animate:true → 动画声明与 @keyframes 名称一一对应`, () => {
      const cfg = createDefaultConfig(def, { seed: 7 });
      for (const k of toggles) cfg.params[k] = true;
      const svg = renderStandaloneSVG(def, cfg, { skipBudget: true, animate: true });
      const names = keyframeNames(svg);
      const refs = animationRefs(svg);
      expect(names.size, `${def.id} 无 @keyframes`).toBeGreaterThan(0);
      expect(refs.length, `${def.id} 无 animation: 声明`).toBeGreaterThan(0);
      for (const r of refs) expect(names.has(r), `${def.id} animation:${r} 无对应 @keyframes`).toBe(true);
      // 与静态导出必须不同 —— 否则开关在画布上等于无效
      const still = renderStandaloneSVG(def, cfg, { skipBudget: true });
      expect(svg).not.toBe(still);
    });

    it(`${def.id}：开关关闭时 animate:true 不产生动画`, () => {
      const cfg = createDefaultConfig(def, { seed: 7 });
      for (const k of toggles) cfg.params[k] = false;
      const svg = renderStandaloneSVG(def, cfg, { skipBudget: true, animate: true });
      expect(svg).not.toContain('@keyframes');
      expect(svg).not.toContain('animation:');
    });
  }
});

describe('预览层必须以 animate:true 渲染', () => {
  it('CanvasStage 的每一处 renderStandaloneSVG 调用都带 animate: true', () => {
    const src = readFileSync(join(process.cwd(), 'src/ui/CanvasStage.tsx'), 'utf8');
    const calls = Array.from(src.matchAll(/renderStandaloneSVG\(([^;]*?)\);/g), (m) => m[1]);
    expect(calls.length).toBeGreaterThanOrEqual(2); // 主画布 + 聚焦预览
    for (const c of calls) expect(c, `调用缺 animate:true：${c}`).toMatch(/animate:\s*true/);
  });
});
