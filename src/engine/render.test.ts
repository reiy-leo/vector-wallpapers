/**
 * 渲染引擎的端到端契约测试 —— 这些断言直接对应 PRD 的硬性约束。
 */
import { describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { applyPreset, createDefaultConfig, renderSVG, renderStandaloneSVG, structuredCloneConfig } from './render';
import type { PatternConfig } from './types';

const ALL = registry.list();

function withPattern(id: string, patch: (c: PatternConfig) => void = () => {}): { def: (typeof ALL)[number]; cfg: PatternConfig } {
  const def = registry.get(id)!;
  const cfg = createDefaultConfig(def, { seed: 42 });
  patch(cfg);
  return { def, cfg };
}

describe('renderSVG 纯函数性 ⭐ PRD P0-2', () => {
  it('同 config 连调 3 次返回字节级相同的字符串（全部 pattern）', () => {
    for (const def of ALL) {
      const cfg = createDefaultConfig(def, { seed: 7 });
      const a = renderSVG(def, cfg).svg;
      const b = renderSVG(def, cfg).svg;
      const c = renderSVG(def, cfg).svg;
      expect(a).toBe(b);
      expect(b).toBe(c);
    }
  });

  it('同 seed 两次渲染字节一致；seedable:false 的 pattern 换 seed 也不变', () => {
    for (const def of ALL) {
      const s1 = renderSVG(def, createDefaultConfig(def, { seed: 1 })).svg;
      const s2 = renderSVG(def, createDefaultConfig(def, { seed: 1 })).svg;
      expect(s1, def.id).toBe(s2);
      if (!def.seedable) {
        const s3 = renderSVG(def, createDefaultConfig(def, { seed: 999 })).svg;
        expect(s3, `${def.id} 标为不可 seed`).toBe(s1);
      }
    }
  });

  it('渲染不修改传入的 config（无副作用）', () => {
    const def = registry.get('dusk-ridges')!;
    const cfg = createDefaultConfig(def, { seed: 5 });
    const before = JSON.stringify(cfg);
    renderSVG(def, cfg);
    expect(JSON.stringify(cfg)).toBe(before);
  });
});

describe('产物纯净度 ⭐ 导出正确性的关键', () => {
  it('全部 pattern 的产物都不含 var() / currentColor', () => {
    for (const def of ALL) {
      const svg = renderSVG(def, createDefaultConfig(def, { seed: 3 })).svg;
      expect(svg, `${def.id} 含 var()`).not.toContain('var(');
      expect(svg, `${def.id} 含 currentColor`).not.toContain('currentColor');
    }
  });

  it('全部产物都不含 <text>（字体依赖会破坏导出纯净度）', () => {
    for (const def of ALL) {
      const svg = renderSVG(def, createDefaultConfig(def, { seed: 3 })).svg;
      expect(svg, `${def.id} 含 <text>`).not.toContain('<text');
    }
  });

  it('全部产物都不含 <foreignObject>（iOS Safari canvas 污染源）', () => {
    for (const def of ALL) {
      const svg = renderSVG(def, createDefaultConfig(def, { seed: 3 })).svg;
      expect(svg, `${def.id} 含 <foreignObject>`).not.toContain('<foreignObject');
    }
  });

  it('即使配置里塞入 CSS 变量，产物也被归一化为字面量 hex', () => {
    const { def, cfg } = withPattern('polka-dots');
    cfg.elements[1].paint = { type: 'solid', color: 'var(--vw-brand)' };
    const svg = renderSVG(def, cfg).svg;
    expect(svg).not.toContain('var(');
    expect(svg).toContain('#000000');
  });
});

describe('根标签不变量（Safari drawImage 坑 1）', () => {
  it('width / height / viewBox / xmlns 齐备', () => {
    for (const def of ALL) {
      const cfg = createDefaultConfig(def, { width: 1920, height: 1080, seed: 1 });
      const svg = renderSVG(def, cfg).svg;
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('width="1920"');
      expect(svg).toContain('height="1080"');
      expect(svg).toContain('viewBox="0 0 1920 1080"');
    }
  });

  it('D-pixel 类自动带 shape-rendering="crispEdges"', () => {
    for (const def of ALL.filter((d) => d.category === 'D-pixel')) {
      const svg = renderSVG(def, createDefaultConfig(def)).svg;
      expect(svg, `${def.id} 缺 crispEdges`).toContain('shape-rendering="crispEdges"');
    }
  });

  it('非 D-pixel 类不带 crispEdges', () => {
    const svg = renderSVG(registry.get('polka-dots')!, createDefaultConfig(registry.get('polka-dots')!)).svg;
    expect(svg).not.toContain('crispEdges');
  });
});

describe('尺寸无关性', () => {
  it('21:9 与 9:19.5 下均能正常渲染且无变形拉伸', () => {
    for (const def of ALL) {
      const wide = renderSVG(def, createDefaultConfig(def, { width: 3440, height: 1440, seed: 4 })).svg;
      const tall = renderSVG(def, createDefaultConfig(def, { width: 1170, height: 2532, seed: 4 })).svg;
      expect(wide).toContain('viewBox="0 0 3440 1440"');
      expect(tall).toContain('viewBox="0 0 1170 2532"');
    }
  });

  it('非法尺寸被 clamp 而非抛错', () => {
    const def = registry.get('polka-dots')!;
    expect(renderSVG(def, createDefaultConfig(def, { width: -100, height: 99999 })).svg).toContain('width="64"');
  });
});

describe('渐变编译到 <defs>', () => {
  it('dusk-ridges 的天空渐变生成 linearGradient', () => {
    const def = registry.get('dusk-ridges')!;
    const out = renderSVG(def, createDefaultConfig(def));
    expect(out.defs).toContain('<linearGradient');
    expect(out.svg).toContain('url(#g-');
  });

  it('相同渐变被DefsRegistry 去重，只生成一份', () => {
    const def = registry.get('dusk-ridges')!;
    const out = renderSVG(def, createDefaultConfig(def));
    const ids = out.defs.match(/id="g-[a-z0-9]+"/g) ?? [];
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('元件显隐', () => {
  it('visible:false 的元件 paintValue 为 none', () => {
    const { def, cfg } = withPattern('polka-dots');
    cfg.elements[1].visible = false;
    const out = renderSVG(def, cfg);
    expect(out.elements.get('dot_l')!.paintValue).toBe('none');
  });

  it('隐藏元件后产物体积不增反减', () => {
    const def = registry.get('polka-dots')!;
    const full = renderSVG(def, createDefaultConfig(def));
    const cfg = createDefaultConfig(def);
    for (const e of cfg.elements) e.visible = false;
    const hidden = renderSVG(def, cfg);
    expect(hidden.bytes).toBeLessThanOrEqual(full.bytes);
  });
});

describe('动画', () => {
  it('animate:false 时产物不含任何 animation 标记', () => {
    for (const def of ALL.filter((d) => d.animatable)) {
      const cfg = createDefaultConfig(def, { seed: 2 });
      // 打开 pattern 内的动画开关
      for (const key of Object.keys(cfg.params)) {
        const c = def.controls.find((x) => x.key === key);
        if (c?.type === 'toggle') cfg.params[key] = true;
      }
      const svg = renderSVG(def, cfg, { animate: false }).svg;
      expect(svg, `${def.id} 含@keyframes`).not.toContain('@keyframes');
      expect(svg, `${def.id} 含 animation:`).not.toContain('animation:');
      expect(svg, `${def.id} 含<animate`).not.toContain('<animate');
    }
  });

  it('animate:true 时产物含动画声明', () => {
    const def = registry.get('flow-lines')!;
    const cfg = createDefaultConfig(def, { seed: 2 });
    cfg.params.drift = true;
    expect(renderSVG(def, cfg, { animate: true }).svg).toContain('@keyframes');
  });

  it('animatable:false 的 pattern 即使传 animate:true 也不产动画', () => {
    const def = registry.get('polka-dots')!;
    const cfg = createDefaultConfig(def);
    cfg.params.rotate = 45;
    expect(renderSVG(def, cfg, { animate: true }).svg).not.toContain('@keyframes');
  });
});

describe('createDefaultConfig()', () => {
  it('从 PatternDef 派生的默认配置可渲染且等于 preset 未应用态', () => {
    for (const def of ALL) {
      const cfg = createDefaultConfig(def);
      expect(cfg.patternId).toBe(def.id);
      expect(cfg.elements).toHaveLength(def.elements.length);
      expect(() => renderSVG(def, cfg)).not.toThrow();
    }
  });
});

describe('applyPreset()', () => {
  it('每个 pattern 的每套 preset 都可应用且产生不同结果', () => {
    for (const def of ALL) {
      expect(def.presets.length).toBeGreaterThanOrEqual(2);
      const rendered = def.presets.map((p) => renderSVG(def, applyPreset(def, p.id)).svg);
      for (let i = 1; i < rendered.length; i++) {
        expect(rendered[i], `${def.id} 的 preset 之间应产生差异`).not.toBe(rendered[i - 1]);
      }
    }
  });

  it('未知 presetId 返回未修改的配置', () => {
    const def = registry.get('polka-dots')!;
    expect(applyPreset(def, '__nope__')).toEqual(createDefaultConfig(def));
  });

  it('applyPreset 不修改入参', () => {
    const def = registry.get('polka-dots')!;
    const base = createDefaultConfig(def);
    const before = JSON.stringify(base);
    applyPreset(def, def.presets[0].id, base);
    expect(JSON.stringify(base)).toBe(before);
  });
});

describe('structuredCloneConfig()', () => {
  it('深拷贝渐变色标，修改副本不影响原对象', () => {
    const def = registry.get('dusk-ridges')!;
    const cfg = createDefaultConfig(def);
    const copy = structuredCloneConfig(cfg);
    const src = cfg.elements[0].paint;
    if (src.type === 'linear') src.stops[0].color = '#000000';
    expect(copy.elements[0].paint).not.toBe(cfg.elements[0].paint);
  });
});

describe('renderStandaloneSVG()', () => {
  it('返回完整可打开的 SVG 文本', () => {
    const def = registry.get('polka-dots')!;
    const svg = renderStandaloneSVG(def, createDefaultConfig(def));
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });
});

/**
 * ⭐ `skipBudget` 只跳过抛错，**不得跳过测量**（引擎层 footgun 回归网）
 *
 * 背景：这个选项曾经直接返回 `nodes: 0`，于是
 * `renderSVG(def, cfg, { skipBudget: true }).nodes` 永远拿到 0，
 * 节点红线形同虚设 —— 而且**体积照常报得出来**，只有 nodes 一项静默失效，
 * 测试还会全绿。`verify.test.ts` 真的踩过一次（aurora-wave 节点数读成 0）。
 *
 * 契约：`skipBudget` 只关掉「抛错 / warn」，测量必须照常进行。
 */
describe('skipBudget 只跳过抛错，不跳过测量', () => {
  it('nodes 必须是真实测量值，而不是 0', () => {
    const def = registry.get('polka-dots')!;
 const out = renderSVG(def, createDefaultConfig(def), { skipBudget: true });
    expect(out.nodes).toBeGreaterThan(0);
  });

  it('全部 pattern 在 skipBudget 下 nodes 均非 0', () => {
    for (const def of ALL) {
      const out = renderSVG(def, createDefaultConfig(def), { skipBudget: true });
      expect(out.nodes, `${def.id} 的 nodes 为 0`).toBeGreaterThan(0);
    }
  });

  it('skipBudget 与正常路径的测量结果完全一致', () => {
    const def = registry.get('memphis-grid')!;
    const cfg = createDefaultConfig(def);
    const measured = renderSVG(def, cfg, { skipBudget: true });
    const normal = renderSVG(def, cfg, { isDev: false });
    expect(measured.bytes).toBe(normal.bytes);
    expect(measured.nodes).toBe(normal.nodes);
  });

  it('skipBudget 时 violations 被清空（既不抛错也不 warn）', () => {
    const def = registry.get('polka-dots')!;
 const out = renderSVG(def, createDefaultConfig(def), { skipBudget: true });
    expect(out.violations).toEqual([]);
  });
});