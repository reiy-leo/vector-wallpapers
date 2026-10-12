import { describe, it } from 'vitest';
import { ALL_PATTERN_DEFS } from '../patterns/index';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import { writeFileSync, mkdirSync } from 'node:fs';

/**
 * 一次性诊断脚本：渲染 aurora-wave 的 max 参数产物，用于人工看图。
 * 不是测试套件的永久成员，仅本轮验收用。
 */
describe('aurora max 参数诊断', () => {
  it('生成 max 参数与 16:10 尺寸的对比产物', () => {
    const OUT = '/Users/apple/Documents/Playgrounds/vector-wallpapers/previews/aurora-check/';
    mkdirSync(OUT, { recursive: true });

    const def = ALL_PATTERN_DEFS.find((d) => d.id === 'aurora-wave') as any;
    const report: any[] = [];

    const cases: Array<[string, Record<string, any>]> = [
      ['default', {}],
      ['max', {}],
      ['thick-only', { thickness: 0.35 }],
      ['amp-only', { amp: 0.25 }],
      ['both-max', { thickness: 0.35, amp: 0.25 }],
      ['bands-max', { bands: 6 }],
    ];

    for (const [name, over] of cases) {
      const params: Record<string, any> = {};
      for (const c of def.controls) {
        params[c.key] =
          name === 'max' ? c.max : name === 'default' ? c.default : (over[c.key] ?? c.default);
      }
      // max 档：所有 range/toggle 都拉满
      if (name === 'max') {
        for (const c of def.controls) {
          params[c.key] = c.type === 'toggle' ? true : c.max;
        }
      }

      for (const [label, size] of [
        ['16x9', [2560, 1440]],
        ['16x10', [3456, 2234]],
      ] as Array<[string, number[]]>) {
        const cfg = createDefaultConfig(def, { width: size[0], height: size[1] });
        cfg.params = params;
        cfg.seed = 2026;
        const svg = renderStandaloneSVG(def, cfg);

        const file = `${OUT}${name}-${label}.svg`;
        writeFileSync(file, svg, 'utf8');

        // 量出所有 y 坐标，判断是否越界（负值 = 顶端冲出画布）
        const ys = [...svg.matchAll(/[ML]\s*[\d.]+\s+(-?[\d.]+)/g)].map((m) => parseFloat(m[1]));
        const minY = ys.length ? Math.min(...ys) : 0;
        const maxY = ys.length ? Math.max(...ys) : 0;

        report.push({
          case: `${name}/${label}`,
          bytes: Buffer.byteLength(svg, 'utf8'),
          size: `${size[0]}×${size[1]}`,
          minY: Math.round(minY),
          maxY: Math.round(maxY),
          overflowTop: minY < 0 ? 'YES 冲出顶部' : 'no',
          overflowBottom: maxY > size[1] ? `YES 超出 ${Math.round(maxY - size[1])}px` : 'no',
        });
      }
    }

    console.log('AURORA_CHECK=' + JSON.stringify(report, null, 1));
  });
});