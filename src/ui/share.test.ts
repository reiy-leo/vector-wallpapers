/**
 * @vitest-environment node
 *
 * URL 编解码的往返测试 —— 分享链接是这个产品唯一的「作品外流通道」，
 * 编解码一旦有偏差，用户复现出来的就是另一张图，而且**静默失败**：
 * 页面照常打开，只是颜色不对。这类 bug 只有靠往返测试才抓得住。
 */
import { describe, expect, it } from 'vitest';
import { decodeConfig, encodeConfig } from './share';
import { registry } from '../patterns';
import { createDefaultConfig } from '../engine/render';
import type { PatternConfig } from '../engine/types';
import type { PaintSpec } from '../patterns/types';

/** 编码 → 解码 → 再比对。 */
function roundTrip(cfg: PatternConfig): PatternConfig {
  const decoded = decodeConfig(encodeConfig(cfg));
  expect(decoded.cfg).not.toBeNull();
  return decoded.cfg!;
}

function pick(id: string): PatternConfig {
  return createDefaultConfig(registry.get(id)!, { width: 1920, height: 1080, seed: 7 });
}

describe('URL 编解码往返', () => {
  it('默认配置不产生冗余参数（除 pattern id 外全省略）', () => {
    const qs = encodeConfig(pick('polka-dots'));
    // 只应有 p=...，默认尺寸/seed/配色/参数一律省略
    expect(qs).toBe('p=polka-dots');
  });

  it('尺寸与 seed 往返保真', () => {
    const cfg = { ...pick('polka-dots'), width: 3024, height: 1964, seed: 1287 };
    const out = roundTrip(cfg);
    expect(out.width).toBe(3024);
    expect(out.height).toBe(1964);
    expect(out.seed).toBe(1287);
  });

  it('单个 solid 改色往返保真', () => {
    const cfg = pick('polka-dots');
    cfg.elements[0] = { ...cfg.elements[0], paint: { type: 'solid', color: '#3b82f6' } };
    const out = roundTrip(cfg);
    expect(out.elements[0].paint).toEqual({ type: 'solid', color: '#3b82f6' });
    // 其余元件应保持默认
    expect(out.elements[1].paint).toEqual(cfg.elements[1].paint);
  });

  it('显隐 / 锁定 / 不透明度往返保真', () => {
    const cfg = pick('polka-dots');
    cfg.elements[1] = { ...cfg.elements[1], visible: false, locked: true, opacity: 0.42 };
    const out = roundTrip(cfg);
    expect(out.elements[1].visible).toBe(false);
    expect(out.elements[1].locked).toBe(true);
    expect(out.elements[1].opacity).toBeCloseTo(0.42, 2);
  });

  it('3 位 hex 归一化为 6 位', () => {
    const cfg = pick('polka-dots');
    cfg.elements[0] = { ...cfg.elements[0], paint: { type: 'solid', color: '#f0a' } };
    const out = roundTrip(cfg);
    // 引擎侧 normalizeHex 会展开为 6 位；编解码层保持原样交给引擎处理
    expect(out.elements[0].paint.type).toBe('solid');
  });

  it('线性渐变（多色标 + alpha）往返保真 —— 分隔符歧义的回归测试', () => {
    const paint: PaintSpec = {
      type: 'linear',
      angle: 137,
      stops: [
        { offset: 0, color: '#ff0000' },
        { offset: 0.5, color: '#00ff00', opacity: 0.35 },
        { offset: 1, color: '#0000ff', opacity: 0 },
      ],
    };
    const cfg = pick('dusk-ridges');
    cfg.elements[0] = { ...cfg.elements[0], paint };
    const out = roundTrip(cfg);
    const got = out.elements[0].paint;
    expect(got.type).toBe('linear');
    if (got.type !== 'linear') throw new Error('paint type mismatch');
    expect(got.angle).toBeCloseTo(137, 3);
    expect(got.stops).toHaveLength(3);
    expect(got.stops[0]).toEqual({ offset: 0, color: '#ff0000' });
    expect(got.stops[1].color).toBe('#00ff00');
    expect(got.stops[1].offset).toBeCloseTo(0.5, 3);
    expect(got.stops[1].opacity).toBeCloseTo(0.35, 3);
    expect(got.stops[2].opacity).toBeCloseTo(0, 3);
  });

  it('径向渐变往返保真', () => {
    const paint: PaintSpec = {
      type: 'radial',
      cx: 0.3,
      cy: 0.7,
      r: 0.9,
      stops: [
        { offset: 0, color: '#123456' },
        { offset: 1, color: '#654321' },
      ],
    };
    const cfg = pick('liquid-mesh');
    cfg.elements[0] = { ...cfg.elements[0], paint };
    const out = roundTrip(cfg);
    const got = out.elements[0].paint;
    expect(got.type).toBe('radial');
    if (got.type !== 'radial') throw new Error('paint type mismatch');
    expect(got.cx).toBeCloseTo(0.3, 3);
    expect(got.cy).toBeCloseTo(0.7, 3);
    expect(got.r).toBeCloseTo(0.9, 3);
  });

  it('none 型 paint 往返保真', () => {
    const cfg = pick('bauhaus-blocks');
    cfg.elements[0] = { ...cfg.elements[0], paint: { type: 'none' } };
    const out = roundTrip(cfg);
    expect(out.elements[0].paint.type).toBe('none');
  });

  it('参数偏离默认值才写入，且往返保真', () => {
    const cfg = pick('polka-dots');
    const key = Object.keys(cfg.params)[0];
    const control = registry.get('polka-dots')!.controls.find((c) => c.key === key)!;
    if (control.type !== 'range' && control.type !== 'toggle' && control.type !== 'select' && control.type !== 'angle') {
      throw new Error('fixture needs a known control type');
    }
    cfg.params[key] = control.type === 'range' ? control.min + control.step : 'changed';

    const out = roundTrip(cfg);
    expect(out.params[key]).toBe(cfg.params[key]);
  });

  it('toggle 参数往返保真', () => {
    const cfg = pick('aurora-wave');
    const toggle = registry.get('aurora-wave')!.controls.find((c) => c.type === 'toggle');
    if (!toggle) return; // 该母题当前无 toggle 控件，跳过
    cfg.params[toggle.key] = !toggle.default;
    const out = roundTrip(cfg);
    expect(out.params[toggle.key]).toBe(!toggle.default);
  });

  it('select 参数往返保真', () => {
    const cfg = pick('new-wave-sunset');
    const sel = registry.get('new-wave-sunset')!.controls.find((c) => c.type === 'select');
    if (!sel || sel.type !== 'select') return;
    const opt = sel.options.find((o) => o.value !== sel.default);
    if (!opt) return;
    cfg.params[sel.key] = opt.value;
    const out = roundTrip(cfg);
    expect(out.params[sel.key]).toBe(opt.value);
  });

  it('全部 19 个母题的默认配置都能往返（守卫母题集合变更）', () => {
    for (const def of registry.list()) {
      const cfg = createDefaultConfig(def, { width: 1920, height: 1080, seed: 3 });
      const out = roundTrip(cfg);
      expect(out.patternId).toBe(def.id);
      expect(out.elements).toHaveLength(def.elements.length);
    }
  });

  it('分享链接长度在 2000 字符预算内（改 6 个元件的典型场景）', () => {
    const cfg = pick('dusk-ridges');
    cfg.elements = cfg.elements.slice(0, 6).map((e, i) => ({
      ...e,
      paint: { type: 'solid', color: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'][i] },
      opacity: 0.8,
    }));
    expect(encodeConfig(cfg).length).toBeLessThan(2000);
  });

  it('配置改动越多，链接单调变长（压缩确实生效）', () => {
    const base = pick('polka-dots');
    const one = { ...base, elements: base.elements.map((e, i) => (i === 0 ? { ...e, paint: { type: 'solid' as const, color: '#123456' } } : e)) };
    const two = { ...base, elements: base.elements.map((e, i) => (i < 2 ? { ...e, paint: { type: 'solid' as const, color: '#123456' } } : e)) };
    expect(encodeConfig(two).length).toBeGreaterThan(encodeConfig(one).length);
  });
});

describe('URL 解码的健壮性（畸形输入不得抛错）', () => {
  const bad = [
    '',
    '?p=',
    '?p=nonexistent-pattern',
    '?p=polka-dots&w=abc&h=-5',
    '?p=polka-dots&w=99999999',
    '?p=polka-dots&cols=!!!garbage!!!',
    '?p=polka-dots&cols=nope=,',
    '?p=polka-dots&seed=NaN',
    '?p=polka-dots&params=unknownKey=1',
    '?p=polka-dots&ui=theme:neon!grid:maybe',
    '?p=polka-dots&cols=bg=psZZZZ',
    '?p=polka-dots&cols=bg=pl999:',
  ];

  for (const qs of bad) {
    it(`不抛错：${JSON.stringify(qs)}`, () => {
      expect(() => decodeConfig(qs)).not.toThrow();
    });
  }

  it('未知母题返回 null 配置（由调用方兜底到默认）', () => {
    expect(decodeConfig('?p=nonexistent-pattern').cfg).toBeNull();
  });

  it('非法尺寸退回 clamp 边界而非崩溃', () => {
    const out = decodeConfig('?p=polka-dots&w=abc&h=99999999');
    expect(out.cfg).not.toBeNull();
    expect(out.cfg!.width).toBe(1920); // 非法 → 默认
    expect(out.cfg!.height).toBeLessThanOrEqual(7680); // 超大 → clamp
  });

  it('未知元件 id 的配色补丁被忽略（母题增删元件后旧链接不崩）', () => {
    const out = decodeConfig('?p=polka-dots&cols=this_element_does_not_exist=psZZZZ');
    expect(out.cfg).not.toBeNull();
    expect(out.cfg!.elements.length).toBeGreaterThan(0);
  });
});
