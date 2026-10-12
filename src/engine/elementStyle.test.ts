import { describe, expect, it } from 'vitest';
import { createDefsRegistry } from './defs';
import { paintToAttrs, paintToStrokeAttrs, paintToValue, recolorByRole, resolveElements, roleColors } from './elementStyle';
import { createDefaultConfig } from './render';
import type { PatternDef } from '../patterns/types';
import type { ElementConfig } from './types';

function makeDef(): PatternDef {
  return {
    // 测试夹具不属于 PRD 清单，用 as PatternId 显式标注这是「仅测试可见」的 id
    id: 'test-pattern' as PatternDef['id'],
    name: '测试',
    category: 'B-repeat',
    description: '',
    seedable: false,
    animatable: false,
    // 槽位表：primary 有两个成员，才能验证「一次改多个」
    paletteSlots: { bg: ['bg', 'sky'], primary: ['dot_a'], detail: ['gone'] },
    controls: [],
    presets: [],
    elements: [
      { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#ffffff' }, opacity: 1, visible: true, configurable: true },
      { id: 'dot_a', label: '点 A', role: 'primary', paint: { type: 'solid', color: '#ff0000' }, opacity: 1, visible: true, configurable: true },
      { id: 'sky', label: '天空', role: 'bg', paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] }, opacity: 1, visible: true, configurable: true },
      { id: 'gone', label: '隐藏', role: 'detail', paint: { type: 'solid', color: '#00ff00' }, opacity: 0.5, visible: true, configurable: false },
    ],
    render: () => ({ body: '' }),
  };
}

function cfg(id: string, patch: Partial<ElementConfig> = {}): ElementConfig {
  return { id, paint: { type: 'solid', color: '#123456' }, opacity: 1, visible: true, locked: false, ...patch };
}

describe('paintToValue() 四种 PaintSpec 形态', () => {
  it('solid → 字面量 hex', () => {
    const v = paintToValue({ type: 'solid', color: '#ABC' }, createDefsRegistry(), 'k');
    expect(v).toBe('#aabbcc');
  });

  it('solid 的 CSS 变量被归一化，绝不输出 var()', () => {
    const v = paintToValue({ type: 'solid', color: 'var(--x)' }, createDefsRegistry(), 'k');
    expect(v).toBe('#000000');
    expect(v).not.toContain('var(');
  });

  it('linear → url(#id)，且 defs 中确有对应渐变', () => {
    const defs = createDefsRegistry();
    const v = paintToValue({ type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff' }] }, defs, 'k');
    expect(v).toMatch(/^url\(#g-[a-z0-9]+\)$/);
    expect(defs.serialize()).toContain('<linearGradient');
  });

  it('radial → url(#id)，且 defs 中确有对应渐变', () => {
    const defs = createDefsRegistry();
    const v = paintToValue({ type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] }, defs, 'k');
    expect(v).toMatch(/^url\(#g-[a-z0-9]+\)$/);
    expect(defs.serialize()).toContain('<radialGradient');
  });

  it('none → 字面量 none', () => {
    expect(paintToValue({ type: 'none' }, createDefsRegistry(), 'k')).toBe('none');
  });

  it('任何形态的输出都不是 CSS 变量', () => {
    const defs = createDefsRegistry();
    const values = [
      paintToValue({ type: 'solid', color: 'currentColor' }, defs, 'a'),
      paintToValue({ type: 'linear', angle: 0, stops: [{ offset: 0, color: 'var(--q)' }] }, defs, 'b'),
      paintToValue({ type: 'radial', cx: 0, cy: 0, r: 1, stops: [{ offset: 1, color: 'var(--q)' }] }, defs, 'c'),
      paintToValue({ type: 'none' }, defs, 'd'),
    ];
    for (const v of values) {
      expect(v).not.toContain('var(');
      expect(v).not.toContain('currentColor');
    }
  });
});

describe('resolveElements() ⭐ 按 id 对齐而非下标', () => {
  const def = makeDef();

  it('配置缺项 → 用默认值补齐', () => {
    const m = resolveElements(def, [cfg('bg')], createDefsRegistry());
    expect(m.size).toBe(4);
    expect(m.get('dot_a')!.paintValue).toBe('#ff0000');
  });

  it('配置多项 / 未知项 → 未知项被丢弃', () => {
    const m = resolveElements(def, [cfg('bg'), cfg('nope')], createDefsRegistry());
    expect(m.has('nope')).toBe(false);
    expect(m.size).toBe(4);
  });

  it('顺序颠倒 → 仍按 id 正确还原（若按下标匹配这里必然错位）', () => {
    // 每个配置给一个**可区分**的颜色：若引擎按下标而非 id 匹配，颜色会串位
    const reversed = [
      cfg('gone', { paint: { type: 'solid', color: '#aaaaaa' } }),
      cfg('sky', { paint: { type: 'solid', color: '#bbbbbb' } }),
      cfg('dot_a', { paint: { type: 'solid', color: '#cccccc' } }),
      cfg('bg', { paint: { type: 'solid', color: '#dddddd' } }),
    ];
    const m = resolveElements(def, reversed, createDefsRegistry());
    expect(m.get('bg')!.paintValue).toBe('#dddddd');
    expect(m.get('dot_a')!.paintValue).toBe('#cccccc');
    // sky 是渐变，被单色覆盖后应按 id 命中 bg 组之外的那一项
    expect(m.get('sky')!.paintValue).toBe('#bbbbbb');
    expect(m.get('gone')!.paintValue).toBe('#aaaaaa');
    expect(Array.from(m.keys())).toEqual(['bg', 'dot_a', 'sky', 'gone']);
  });

  it('配置为 undefined 时全用默认值', () => {
    const m = resolveElements(def, undefined, createDefsRegistry());
    expect(m.get('bg')!.paintValue).toBe('#ffffff');
  });

  it('visible:false → paintValue 强制 none（pattern 无需判空）', () => {
    const m = resolveElements(def, [cfg('dot_a', { visible: false })], createDefsRegistry());
    expect(m.get('dot_a')!.visible).toBe(false);
    expect(m.get('dot_a')!.paintValue).toBe('none');
  });

  it('opacity 被 clamp 到 [0,1]', () => {
    const m = resolveElements(def, [cfg('bg', { opacity: 5 })], createDefsRegistry());
    expect(m.get('bg')!.opacity).toBe(1);
    const m2 = resolveElements(def, [cfg('bg', { opacity: -3 })], createDefsRegistry());
    expect(m2.get('bg')!.opacity).toBe(0);
  });

  it('locked 可被用户配置覆盖', () => {
    const m = resolveElements(def, [cfg('bg', { locked: true })], createDefsRegistry());
    expect(m.get('bg')!.locked).toBe(true);
  });

  it('保留原始 PaintSpec 供 UI 编辑渐变', () => {
    const m = resolveElements(def, undefined, createDefsRegistry());
    expect(m.get('sky')!.paint.type).toBe('linear');
  });

  it('非法 PaintSpec 回落默认而非抛错', () => {
    const m = resolveElements(
      def,
      [cfg('bg', { paint: { type: 'bogus' } as never }), cfg('sky', { paint: null as never })],
      createDefsRegistry(),
    );
    expect(m.get('bg')!.paintValue).toBe('#ffffff');
    expect(m.get('sky')!.paint.type).toBe('linear');
  });

  it('保留 configurable 标记，供 UI 决定是否可改色', () => {
    const m = resolveElements(def, undefined, createDefsRegistry());
    expect(m.get('bg')!.configurable).toBe(true);
    expect(m.get('gone')!.configurable).toBe(false);
  });
});

describe('属性映射', () => {
  it('paintToAttrs 输出 fill + fill-opacity', () => {
    const m = resolveElements(makeDef(), undefined, createDefsRegistry());
    expect(paintToAttrs(m.get('dot_a')!)).toEqual({ fill: '#ff0000', 'fill-opacity': 1 });
  });

  it('paintToStrokeAttrs 输出描边且 fill 为 none', () => {
    const m = resolveElements(makeDef(), undefined, createDefsRegistry());
    const attrs = paintToStrokeAttrs(m.get('dot_a')!, 2);
    expect(attrs.fill).toBe('none');
    expect(attrs.stroke).toBe('#ff0000');
    expect(attrs['stroke-width']).toBe(2);
  });
});
describe('role 批量改色 ⭐ PRD P0-2 消费方', () => {
  const def = makeDef();
  const solid = (color: string) => ({ type: 'solid' as const, color });

  it('一次改掉该 role 下的全部元件（bg槽位含 bg + sky 两个成员）', () => {
    const cfg = createDefaultConfig(def);
    const next = recolorByRole(def, cfg, 'bg', solid('#123456'));
    expect(next.elements.find((e) => e.id === 'bg')!.paint).toEqual(solid('#123456'));
    // sky 是渐变，批量改色会整体替换为单色（槽位语义是「统一这个 role」）
    expect(next.elements.find((e) => e.id === 'sky')!.paint).toEqual(solid('#123456'));
    // 不在槽位里的元件保持原样
    expect(next.elements.find((e) => e.id === 'dot_a')!.paint).toEqual({ type: 'solid', color: '#ff0000' });
  });

  it('槽位表里没有的 role 返回原对象（不改任何东西）', () => {
    const cfg = createDefaultConfig(def);
    expect(recolorByRole(def, cfg, 'accent', solid('#123456'))).toBe(cfg);
  });

  it('不修改入参（纯函数）', () => {
    const cfg = createDefaultConfig(def);
    const before = JSON.stringify(cfg);
    recolorByRole(def, cfg, 'primary', solid('#abcdef'));
    expect(JSON.stringify(cfg)).toBe(before);
  });

  it('只改 paint，不动 opacity / visible', () => {
    const cfg = createDefaultConfig(def);
    cfg.elements.find((e) => e.id === 'dot_a')!.opacity = 0.3;
    const next = recolorByRole(def, cfg, 'primary', solid('#abcdef'));
    const e = next.elements.find((x) => x.id === 'dot_a')!;
    expect(e.paint).toEqual(solid('#abcdef'));
    expect(e.opacity).toBe(0.3);
    expect(e.visible).toBe(true);
  });

  it('roleColors 返回每个 role 的代表色', () => {
    const cfg = createDefaultConfig(def);
    const colors = roleColors(def, cfg);
    expect(colors.bg).toBeDefined();
    expect(colors.primary).toBeDefined();
  });
});
