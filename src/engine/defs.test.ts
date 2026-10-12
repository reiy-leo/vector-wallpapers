import { describe, expect, it } from 'vitest';
import { createDefsRegistry, stripAnimation } from './defs';

const RED = '#ff0000';
const BLUE = '#0000ff';

describe('DefsRegistry 渐变', () => {
  it('同内容重复注册返回同一 id（去重生效）', () => {
    const d = createDefsRegistry();
    const a = d.linear({ angle: 90, stops: [{ offset: 0, color: RED }, { offset: 1, color: BLUE }], key: 'x' });
    const b = d.linear({ angle: 90, stops: [{ offset: 0, color: RED }, { offset: 1, color: BLUE }], key: 'x' });
    expect(a).toBe(b);
    expect(d.count).toBe(1);
  });

  it('不同内容自动分配不同 id', () => {
    const d = createDefsRegistry();
    const a = d.linear({ angle: 90, stops: [{ offset: 0, color: RED }, { offset: 1, color: BLUE }], key: 'x' });
    const b = d.linear({ angle: 0, stops: [{ offset: 0, color: RED }, { offset: 1, color: BLUE }], key: 'x' });
    expect(a).not.toBe(b);
    expect(d.count).toBe(2);
  });

  it('linear 输出正确格式的 <linearGradient> 与字面量hex', () => {
    const d = createDefsRegistry();
    d.linear({ angle: 0, stops: [{ offset: 0, color: '#FFF' }, { offset: 1, color: '#000' }], key: 'k' });
    const out = d.serialize();
    expect(out).toContain('<linearGradient');
    // 0° = 从左到右
    expect(out).toContain('x1="0"');
    expect(out).toContain('x2="1"');
    // 色标必须是字面量 hex，不能是 CSS 变量
    expect(out).toContain('stop-color="#ffffff"');
    expect(out).not.toContain('var(--');
  });

  it('radial 输出 cx/cy/r，且 r 有下限保护', () => {
    const d = createDefsRegistry();
    d.radial({ cx: 0.25, cy: 0.75, r: 0, stops: [{ offset: 0, color: RED }], key: 'k' });
    const out = d.serialize();
    expect(out).toContain('<radialGradient');
    expect(out).toContain('cx="0.25"');
    expect(out).toContain('cy="0.75"');
    // 下限必须是 n() 能如实表示的值：0.001 会被两位小数舍入回 0，
    // 而 r="0" 的径向渐变什么都不画
    expect(out).toContain('r="0.01"');
  });

  it('返回可直接赋给 fill 的 url(#id)', () => {
    const d = createDefsRegistry();
    const url = d.radial({ cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: RED }], key: 'k' });
    expect(url).toMatch(/^url\(#[a-z]-[a-z0-9]+\)$/);
  });
});

describe('DefsRegistry tile()', () => {
  it('同内容 tile 去重，不同内容不合并', () => {
    const d = createDefsRegistry();
    const a = d.tile({ w: 10, h: 10, content: '<rect/>', key: 'k' });
    const b = d.tile({ w: 10, h: 10, content: '<rect/>', key: 'k' });
    const c = d.tile({ w: 20, h: 10, content: '<rect/>', key: 'k' });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('输出 userSpaceOnUse 的 <pattern>，尺寸异常时有下限保护', () => {
    const d = createDefsRegistry();
    d.tile({ w: 0, h: -5, content: '<rect/>', key: 'k' });
    const out = d.serialize();
    expect(out).toContain('patternUnits="userSpaceOnUse"');
    // width="0" 的 pattern 不会被绘制，必须夹在两位小数可表示的下限上
    expect(out).toContain('width="0.01"');
    expect(out).toContain('height="0.01"');
  });

  it('patternTransform 仅在提供时输出', () => {
    const d = createDefsRegistry();
    d.tile({ w: 4, h: 4, content: '<rect/>', key: 'a' });
    expect(d.serialize()).not.toContain('patternTransform');
    const d2 = createDefsRegistry();
    d2.tile({ w: 4, h: 4, content: '<rect/>', key: 'a', transform: 'rotate(45)' });
    expect(d2.serialize()).toContain('patternTransform="rotate(45)"');
  });
});

describe('DefsRegistry clip()', () => {
  it('同 id 同 shape 只注册一次', () => {
    const d = createDefsRegistry();
    const a = d.clip('sun', '<circle r="10"/>');
    const b = d.clip('sun', '<circle r="10"/>');
    expect(a).toBe(b);
    expect(d.count).toBe(1);
  });

  it('非法字符从 id 中剔除', () => {
    const d = createDefsRegistry();
    const url = d.clip('a b/c', '<rect/>');
    expect(url).not.toContain(' ');
    expect(url).not.toContain('/');
  });
});

describe('DefsRegistry serialize()', () => {
  it('未注册任何内容时返回空串（不留空 <defs>）', () => {
    expect(createDefsRegistry().serialize()).toBe('');
  });

  it('keyframes 汇总进单个 <style>', () => {
    const d = createDefsRegistry();
    d.keyframes('a', 'from{opacity:0}');
    d.keyframes('b', 'from{opacity:1}');
    d.keyframes('a', 'from{opacity:0}');
    const out = d.serialize();
    expect(out).toContain('@keyframes a{from{opacity:0}}');
    expect(out).toContain('@keyframes b{from{opacity:1}}');
    expect(out.match(/<style/g)).toHaveLength(1);
  });
});

describe('stripAnimation()', () => {
  it('移除自闭合的 SMIL 元素', () => {
    expect(stripAnimation('<rect><animateTransform attributeName="x"/></rect>')).toBe('<rect></rect>');
    expect(stripAnimation('<animate attributeName="x"/>')).toBe('');
  });

  it('移除带 children 的 SMIL 元素', () => {
    expect(stripAnimation('<g><animate>x</animate></g>')).toBe('<g></g>');
  });

  it('移除 <set> 与 <style>', () => {
    expect(stripAnimation('<rect/><set to="1"/><style>a{}</style>')).toBe('<rect/>');
  });

  it('不误伤普通内容', () => {
    const body = '<rect fill="#fff"/><circle r="4"/>';
    expect(stripAnimation(body)).toBe(body);
  });

  it('幂等：重复剥离结果不变', () => {
    const once = stripAnimation('<animate attributeName="x"/><rect/>');
    expect(stripAnimation(once)).toBe(once);
  });
});