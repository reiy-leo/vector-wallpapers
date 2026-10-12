import { describe, it, expect } from 'vitest';
import { ALL_PATTERN_DEFS } from '../patterns/index';
import type { PatternDef } from '../patterns/types';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import { countTopLevelNodes } from '../engine/svg';
import type { PatternConfig } from '../engine/types';

const REDLINE = 20480; // 20KB
const NODE_LIMIT = 60;

/** 体积报告的一行。显式建模而非 `any`，让数值字段参与类型检查。 */
interface SizeRow {
  id: string;
  cat: string;
  el: number;
  ctl: number;
  bytes: number;
  bytesMax: number;
  bytes4k: number;
  nodes: number;
  det: 'Y' | 'N';
  cssVar: 'YES' | 'no';
  verdict: 'OK' | 'FAIL';
}

/**
 * 构造默认配置。
 *
 * ⚠️ 必须复用引擎的 `createDefaultConfig`——它是「默认状态」的唯一真源。
 * 手写一份会与引擎漂移：早期版本在这里读 `e.defaultPaint` / `e.defaultColor`，
 * 而 ElementSpec 的真实字段是 `paint` / `opacity` / `visible`，
 * 结果所有元件都退化成黑色（`color: undefined` → normalizeHex 兜底 #000000），
 * 测出来的体积数偏小 86B，是**假绿**。
 */
function defaultConfigOf(def: PatternDef): PatternConfig {
  return createDefaultConfig(def, { width: 2560, height: 1440, seed: 42 });
}

/** 控件全部拉满后的配置（toggle 一律 true、select 取末项）。 */
function configAtMax(def: PatternDef, w: number, h: number): PatternConfig {
  const cfg = defaultConfigOf(def);
  cfg.width = w;
  cfg.height = h;
  for (const c of def.controls) {
    if (c.type === 'range') cfg.params[c.key] = c.max;
    else if (c.type === 'angle') cfg.params[c.key] = 45;
    else if (c.type === 'toggle') cfg.params[c.key] = true;
    else if (c.type === 'select') cfg.params[c.key] = c.options[c.options.length - 1].value;
  }
  return cfg;
}

describe('独立验收：体积红线 / 节点上限 / 确定性 / 纯净度', () => {
  it('逐 pattern 实测并输出体积表', () => {
    const rows: SizeRow[] = [];

    for (const def of ALL_PATTERN_DEFS) {
      const cfg = defaultConfigOf(def);
      const svg = renderStandaloneSVG(def, cfg);
      const bytes = Buffer.byteLength(svg, 'utf8');

      const cfgMax = configAtMax(def, 2560, 1440);
      const svgMax = renderStandaloneSVG(def, cfgMax);
      const bytesMax = Buffer.byteLength(svgMax, 'utf8');

      const bytes4k = Buffer.byteLength(renderStandaloneSVG(def, configAtMax(def, 3840, 2160)), 'utf8');

      // 节点数必须用**引擎口径**：body 的顶层直接子节点。
      //
      // ⚠️ 两处曾经踩过的坑，都记在这里防止重犯：
      //  1. 「切出 body 后正则数所有标签」会把 `<defs>` 里的 gradient/stop/
      //     pattern 内部圆点也数进去（aurora-wave 被误报 91，实际只有 28）。
      //     defs 是**资源声明**而非绘制指令，必须先剥掉。
      //  2. 不能用 `renderSVG(..., { skipBudget: true }).nodes` ——
      //     skipBudget 会把 nodes 直接填成 0，红线形同虚设（曾导致全绿假象）。
      const afterSvgTag = svgMax.slice(svgMax.indexOf('>') + 1, svgMax.lastIndexOf('</svg>'));
      const defsEnd = afterSvgTag.lastIndexOf('</defs>');
      const bodyOnly = defsEnd >= 0 ? afterSvgTag.slice(defsEnd + '</defs>'.length) : afterSvgTag;
      const nodeCount = countTopLevelNodes(bodyOnly);

      // 确定性：同 config 渲染 3 次必须字节一致
      const det = renderStandaloneSVG(def, cfg) === svg && renderStandaloneSVG(def, cfg) === svg;

      // 纯净度：产物不得含 CSS 变量引用
      const cssVar = /var\(|currentColor/.test(svgMax);

      rows.push({
        id: def.id,
        cat: def.category,
        el: def.elements.length,
        ctl: def.controls.length,
        bytes,
        bytesMax,
        bytes4k,
        nodes: nodeCount,
        det: det ? 'Y' : 'N',
        cssVar: cssVar ? 'YES' : 'no',
        verdict:
          bytesMax <= REDLINE && nodeCount <= NODE_LIMIT && det && !cssVar ? 'OK' : 'FAIL',
      });
    }

    console.log('\n=== 逐 Pattern 实测体积（红线 ' + REDLINE + 'B / 节点上限 ' + NODE_LIMIT + '）===');
    // vitest 会吞掉 console.table，改用 JSON 便于阅读与存档
    console.log('MEASURED_SIZES=' + JSON.stringify(rows));

    const bad = rows.filter((r) => r.verdict === 'FAIL');
    if (bad.length > 0) {
      console.error('\n未达标项：', JSON.stringify(bad, null, 2));
    }
    console.log(
      `\n汇总：失败 ${bad.length} / ${rows.length}，最大体积 ${Math.max(...rows.map((r) => r.bytesMax))}B`
    );

    expect(bad).toEqual([]);
    expect(Math.max(...rows.map((r) => r.bytesMax))).toBeLessThan(REDLINE);
  });

  it('seed 敏感性：不同 seed 必得不同产物（seedable 的 pattern）', () => {
    const collisions: string[] = [];

    for (const def of ALL_PATTERN_DEFS) {
      if (def.seedable === false) {
        console.log(`  ${def.id.padEnd(16)} seedable=false（规则几何，跳过）`);
        continue;
      }
      const c1 = defaultConfigOf(def);
      const c2 = defaultConfigOf(def);
      c2.seed = 999;
      if (renderStandaloneSVG(def, c1) === renderStandaloneSVG(def, c2)) collisions.push(def.id);
      console.log(`  ${def.id.padEnd(16)} seedable=true  OK`);
    }

    console.log('\n撞图 pattern：', collisions);
    expect(collisions).toEqual([]);
  });

  it('导出产物不含 CSS 变量 / currentColor（脱离页面不会变黑）', () => {
    const offenders: string[] = [];
    for (const def of ALL_PATTERN_DEFS) {
      const svg = renderStandaloneSVG(def, configAtMax(def, 1920, 1080));
      if (/var\(--/.test(svg) || /currentColor/.test(svg)) offenders.push(def.id);
    }
    console.log('含 CSS 变量的 pattern：', offenders);
    expect(offenders).toEqual([]);
  });

  it('导出产物不含 <text> 与 foreignObject', () => {
    const offenders: string[] = [];
    for (const def of ALL_PATTERN_DEFS) {
      const svg = renderStandaloneSVG(def, configAtMax(def, 1920, 1080));
      if (/<text[\s>]/.test(svg) || /foreignObject/.test(svg)) offenders.push(def.id);
    }
    console.log('含 <text>/foreignObject 的 pattern：', offenders);
    expect(offenders).toEqual([]);
  });

  it('尺寸切换确实按比例推导（超宽与竖屏产物不同）', () => {
    const same: string[] = [];
    for (const def of ALL_PATTERN_DEFS) {
      const wide = renderStandaloneSVG(def, { ...defaultConfigOf(def), width: 3440, height: 1440 });
      const tall = renderStandaloneSVG(def, { ...defaultConfigOf(def), width: 1170, height: 2532 });
      if (wide === tall) same.push(def.id);
    }
    console.log('两种尺寸产物相同的 pattern：', same);
    expect(same).toEqual([]);
  });

  it('SVG 根标签带 xmlns 与 viewBox（脱离文件也能正常渲染）', () => {
    const bad: string[] = [];
    for (const def of ALL_PATTERN_DEFS) {
      const svg = renderStandaloneSVG(def, defaultConfigOf(def));
      // 属性按字母序序列化，故用不依赖顺序的匹配
      if (!/\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(svg)) bad.push(def.id + ' 缺 xmlns');
      if (!/\sviewBox="0 0 [\d.]+ [\d.]+"/.test(svg)) bad.push(def.id + ' 缺 viewBox');
      if (!/\swidth="\d+"/.test(svg)) bad.push(def.id + ' 缺 width');
      if (!/\sheight="\d+"/.test(svg)) bad.push(def.id + ' 缺 height');
    }
    console.log('根标签异常：', bad);
    expect(bad).toEqual([]);
  });
});