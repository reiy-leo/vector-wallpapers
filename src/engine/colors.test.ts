import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  darken,
  hexToHsl,
  hexToRgb,
  hslToHex,
  isDark,
  isGradient,
  isHexColor,
  lighten,
  mixHex,
  normalizeHex,
  normalizeStops,
  paintColors,
  relativeLuminance,
  rgbToHex,
} from './colors';

describe('isHexColor()', () => {
  it('接受 3 位与 6 位 hex', () => {
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#FFFFFF')).toBe(true);
    expect(isHexColor('#0a1b2c')).toBe(true);
  });

  it('拒绝 CSS 变量 / currentColor / rgb() / 非法长度', () => {
    expect(isHexColor('var(--x)')).toBe(false);
    expect(isHexColor('currentColor')).toBe(false);
    expect(isHexColor('rgb(1,2,3)')).toBe(false);
    expect(isHexColor('#12345')).toBe(false);
    expect(isHexColor('red')).toBe(false);
  });
});

describe('normalizeHex() ⭐ 导出正确性的关键防线', () => {
  it('3 位展开为 6 位并转小写', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('#F0A')).toBe('#ff00aa');
  });

  it('剥离空白与大小写差异', () => {
    expect(normalizeHex('  #FF00AA  ')).toBe('#ff00aa');
  });

  it('CSS 变量一律退化为兜底色，绝不进入 SVG 属性', () => {
    expect(normalizeHex('var(--vw-brand)')).toBe('#000000');
    expect(normalizeHex('currentColor')).toBe('#000000');
    expect(normalizeHex('url(#grad)')).toBe('#000000');
  });

  it('非字符串输入安全降级', () => {
    expect(normalizeHex(undefined)).toBe('#000000');
    expect(normalizeHex(null)).toBe('#000000');
    expect(normalizeHex(123)).toBe('#000000');
    expect(normalizeHex({}, '#abcdef')).toBe('#abcdef');
  });

  it('输出永远是 6 位小写 hex 字面量', () => {
    for (const input of ['#FFF', '#abcdef', 'var(--x)', 'currentColor', 'rgb(0,0,0)']) {
      expect(normalizeHex(input)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe('hex↔ rgb ↔ hsl 转换', () => {
  it('hexToRgb 正确解析', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('#000')).toEqual({ r: 0, g: 0, b: 0 });
  });

  it('rgbToHex 补零并 clamp', () => {
    expect(rgbToHex(255, 255, 255)).toBe('#ffffff');
    expect(rgbToHex(-20, 300, 8)).toBe('#00ff08');
  });

  it('hex → hsl → hex 往返稳定', () => {
    for (const hex of ['#ff0000', '#00ff00', '#0000ff', '#123456', '#fedcba', '#808080']) {
      const { h, s, l } = hexToHsl(hex);
      expect(hslToHex(h, s, l)).toBe(hex);
    }
  });

  it('灰阶的饱和度为 0', () => {
    expect(hexToHsl('#808080').s).toBe(0);
  });

  it('hsl 亮度边界正确', () => {
    expect(hexToHsl('#ffffff').l).toBeCloseTo(1, 5);
    expect(hexToHsl('#000000').l).toBeCloseTo(0, 5);
  });
});

describe('颜色运算', () => {
  it('mixHex 端点精确、中间线性', () => {
    expect(mixHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });

  it('mixHex 的 t 被 clamp 到 [0,1]', () => {
    expect(mixHex('#000000', '#ffffff', -5)).toBe('#000000');
    expect(mixHex('#000000', '#ffffff', 5)).toBe('#ffffff');
  });

  it('lighten / darken 改变亮度', () => {
    const base = '#808080';
    expect(relativeLuminance(lighten(base, 0.3))).toBeGreaterThan(relativeLuminance(base));
    expect(relativeLuminance(darken(base, 0.3))).toBeLessThan(relativeLuminance(base));
  });

  it('contrastRatio：黑白 21:1，同色 1:1', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 4);
    expect(contrastRatio('#123456', '#123456')).toBeCloseTo(1, 5);
  });

  it('isDark 判定暗色', () => {
    expect(isDark('#000000')).toBe(true);
    expect(isDark('#ffffff')).toBe(false);
  });
});

describe('normalizeStops()', () => {
  it('按 offset 升序排列', () => {
    const out = normalizeStops([
      { offset: 1, color: '#FFFFFF' },
      { offset: 0, color: '#000000' },
    ]);
    expect(out[0].offset).toBe(0);
    expect(out[0].color).toBe('#000000');
    expect(out[1].color).toBe('#ffffff');
  });

  it('offset clamp 到 [0,1]，颜色转字面量 hex', () => {
    const out = normalizeStops([
      { offset: -3, color: 'var(--x)' },
      { offset: 9, color: '#ABC' },
    ]);
    expect(out[0].offset).toBe(0);
    expect(out[1].offset).toBe(1);
    expect(out.every((s) => isHexColor(s.color))).toBe(true);
  });

  it('单色标复制为 0/1 两端（语义上等价纯色）', () => {
    const out = normalizeStops([{ offset: 0.5, color: '#ff0000' }]);
    expect(out).toEqual([
      { offset: 0, color: '#ff0000' },
      { offset: 1, color: '#ff0000' },
    ]);
  });

  it('空数组原样返回', () => {
    expect(normalizeStops([])).toEqual([]);
  });
});

describe('paintColors() / isGradient()', () => {
  it('solid 返回单色，none 返回空', () => {
    expect(paintColors({ type: 'solid', color: '#ABC' })).toEqual(['#aabbcc']);
    expect(paintColors({ type: 'none' })).toEqual([]);
  });

  it('渐变展开全部色标', () => {
    expect(
      paintColors({
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#ffffff' },
        ],
      }),
    ).toEqual(['#000000', '#ffffff']);
  });

  it('isGradient 区分单色与渐变', () => {
    expect(isGradient({ type: 'solid', color: '#fff' })).toBe(false);
    expect(isGradient({ type: 'none' })).toBe(false);
    expect(isGradient({ type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [] })).toBe(true);
  });
});