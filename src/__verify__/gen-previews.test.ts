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
      'F-ornament': '传统纹样',
      'G-botanical': '植物花卉',
      'H-cosmos': '宇宙天文',
      'I-optical': '光学错觉',
      'J-generative': '数学生成',
      'K-texture': '材质纹理',
      'L-architecture': '建筑空间',
      'M-movement': '设计流派',
      'N-animal': '动物形象',
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