import { describe, expect, it } from 'vitest';
import { attrString, countTopLevelNodes, el, esc, g, n, polygon } from './svg';

describe('n() 数值格式化', () => {
  it('保留两位小数并去尾零', () => {
    expect(n(1.005)).toBe('1');
    expect(n(1.567)).toBe('1.57');
    expect(n(100)).toBe('100');
    expect(n(0.1 + 0.2)).toBe('0.3');
  });

  it('非有限数与 -0 退化为 0', () => {
    expect(n(Number.NaN)).toBe('0');
    expect(n(Number.POSITIVE_INFINITY)).toBe('0');
    expect(n(-0.0001)).toBe('0');
    expect(n(-0)).toBe('0');
  });
});

describe('esc() 转义', () => {
  it('转义全部五个危险字符', () => {
    expect(esc('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('普通文本原样返回', () => {
    expect(esc('hello world')).toBe('hello world');
  });
});

describe('attrString()', () => {
  it('省略 undefined / null / 空串', () => {
    expect(attrString({ a: undefined, b: null, c: '' })).toBe('');
  });

  it('省略与 SVG 规范默认值相同的属性', () => {
    expect(attrString({ 'stroke-width': 1, opacity: 1, 'fill-opacity': 1 })).toBe('');
  });

  it('绝不省略 fill —— 默认值是黑色而非 none', () => {
    expect(attrString({ fill: 'none' })).toBe(' fill="none"');
  });

  it('key 排序保证输出稳定可 diff', () => {
    expect(attrString({ z: 1, a: 2 })).toBe(' a="2" z="1"');
  });

  it('数值走 n() 压缩', () => {
    expect(attrString({ d: 1.23456 })).toBe(' d="1.23"');
  });
});

describe('el() / g()', () => {
  it('无 children 时自闭合', () => {
    expect(el('rect', { width: 10 })).toBe('<rect width="10"/>');
  });

  it('有 children 时成对闭合', () => {
    expect(el('g', {}, '<rect/>')).toBe('<g><rect/></g>');
  });

  it('空串 children 视为自闭合', () => {
    expect(el('g', {}, '')).toBe('<g/>');
  });

  it('属性值中的引号被转义，杜绝属性注入', () => {
    const out = el('rect', { fill: '" onload="alert(1)' });
    expect(out).not.toContain('onload="alert');
    expect(out).toContain('&quot;');
  });

  it('polygon 序列化点列表，属性按 key 排序', () => {
    expect(polygon([[0, 0], [1.5, 2], [3, 0]], { fill: '#fff' })).toBe(
      '<polygon fill="#fff" points="0,0 1.5,2 3,0"/>',
    );
  });
});

describe('countTopLevelNodes()', () => {
  it('只数顶层元素，<g> 内部子孙不计', () => {
    const body = '<rect/><g><rect/><rect/></g><circle/>';
    expect(countTopLevelNodes(body)).toBe(3);
  });

  it('处理嵌套与自闭合混合', () => {
    expect(countTopLevelNodes('<g><g><rect/></g></g>')).toBe(1);
  });

  it('空串返回 0', () => {
    expect(countTopLevelNodes('')).toBe(0);
  });

  it('g() 包裹的内容整体算 1 个节点', () => {
    expect(countTopLevelNodes(g({}, '<rect/><rect/><rect/>'))).toBe(1);
  });
});