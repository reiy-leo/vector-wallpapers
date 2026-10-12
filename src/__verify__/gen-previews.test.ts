import { describe, it } from 'vitest';

describe('生成预览产物', () => {
  it('渲染全部 pattern 为 SVG 文件', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const { ALL_PATTERN_DEFS } = await import('../patterns/index');
    const { createDefaultConfig, renderStandaloneSVG } = await import('../engine/render');

    const OUT = '/Users/apple/Documents/Playgrounds/vector-wallpapers/previews/';
    mkdirSync(OUT, { recursive: true });

    const CAT: Record<string, string> = {
      'A-lines': '极简线条',
      'B-repeat': '波点网格',
      'C-organic': '渐变流体',
      'D-pixel': '像素复古',
    };
    const report: any[] = [];

    for (const def of ALL_PATTERN_DEFS as any[]) {
      const cfg = createDefaultConfig(def, { width: 2560, height: 1440 });
      const svg = renderStandaloneSVG(def, cfg);
      writeFileSync(OUT + def.id + '.svg', svg, 'utf8');
      report.push({
        id: def.id,
        name: def.name,
        cat: CAT[def.category] ?? def.category,
        el: def.elements.length,
        bytes: Buffer.byteLength(svg, 'utf8'),
      });
    }

    console.log('PREVIEWS=' + JSON.stringify(report));
  });
});