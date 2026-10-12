import { describe, expect, it } from 'vitest';
import { defaultParams, resolveControls, snapToStep } from './params';
import type { ControlDef } from '../patterns/types';

const RANGE: ControlDef = {
  key: 'density',
  label: '密度',
  type: 'range',
  min: 4,
  max: 60,
  step: 2,
  default: 18,
};
const TOGGLE: ControlDef = { key: 'stagger', label: '错位', type: 'toggle', default: true };
const SELECT: ControlDef = {
  key: 'mode',
  label: '模式',
  type: 'select',
  options: [
    { value: 'a', label: 'A' },
    { value: 'b', label: 'B' },
  ],
  default: 'a',
};
const ANGLE: ControlDef = { key: 'rotate', label: '旋转', type: 'angle', default: 0 };
const ALL = [RANGE, TOGGLE, SELECT, ANGLE];

describe('snapToStep()', () => {
  it('吸附到最近的 step 倍数', () => {
    expect(snapToStep(11, 4, 60, 2)).toBe(12);
    expect(snapToStep(10, 4, 60, 2)).toBe(10);
  });

  it('越界值先 clamp 再吸附', () => {
    expect(snapToStep(-100, 4, 60, 2)).toBe(4);
    expect(snapToStep(99999, 4, 60, 2)).toBe(60);
  });

  it('step ≤ 0 时退化为纯 clamp', () => {
    expect(snapToStep(11.5, 4, 60, 0)).toBe(11.5);
    expect(snapToStep(999, 4, 60, -1)).toBe(60);
  });

  it('消除浮点误差', () => {
    expect(snapToStep(0.3, 0, 1, 0.1)).toBe(0.3);
  });
});

describe('resolveControls()', () => {
  it('缺省时全部填默认值', () => {
    expect(resolveControls(ALL, undefined)).toEqual({ density: 18, stagger: true, mode: 'a', rotate: 0 });
  });

  it('clamp 越界数值', () => {
    expect(resolveControls(ALL, { density: 99999 }).density).toBe(60);
    expect(resolveControls(ALL, { density: -5 }).density).toBe(4);
  });

  it('density: 99999 → max（PRD 验收项）', () => {
    expect(resolveControls([RANGE], { density: 99999 }).density).toBe(60);
  });

  it('非法数值回落默认而非抛错', () => {
    expect(resolveControls(ALL, { density: Number.NaN }).density).toBe(18);
    expect(resolveControls(ALL, { density: 'abc' as never }).density).toBe(18);
    expect(resolveControls(ALL, { density: {} as never }).density).toBe(18);
  });

  it('字符串数字被接受（URL 解析友好）', () => {
    expect(resolveControls(ALL, { density: '30' }).density).toBe(30);
  });

  it('toggle 接受多种真值表示', () => {
    expect(resolveControls([TOGGLE], { stagger: false }).stagger).toBe(false);
    expect(resolveControls([TOGGLE], { stagger: '0' }).stagger).toBe(false);
    expect(resolveControls([TOGGLE], { stagger: '1' }).stagger).toBe(true);
    expect(resolveControls([TOGGLE], { stagger: 'false' }).stagger).toBe(false);
    expect(resolveControls([TOGGLE], { stagger: 'nonsense' }).stagger).toBe(true);
    expect(resolveControls([TOGGLE], { stagger: 0 }).stagger).toBe(false);
  });

  it('select 校验枚举，非法值回落默认', () => {
    expect(resolveControls([SELECT], { mode: 'b' }).mode).toBe('b');
    expect(resolveControls([SELECT], { mode: 'zzz' }).mode).toBe('a');
    expect(resolveControls([SELECT], { mode: 123 }).mode).toBe('a');
  });

  it('angle 归一化到 [0,360)', () => {
    expect(resolveControls([ANGLE], { rotate: 450 }).rotate).toBe(90);
    expect(resolveControls([ANGLE], { rotate: -90 }).rotate).toBe(270);
    expect(resolveControls([ANGLE], { rotate: 360 }).rotate).toBe(0);
  });

  it('丢弃未声明的 key（URL 污染隔离）', () => {
    const out = resolveControls(ALL, { density: 20, __proto__: 1, evil: 'x' } as never);
    expect(out).toEqual({ density: 20, stagger: true, mode: 'a', rotate: 0 });
    expect('evil' in out).toBe(false);
  });

  it('永不抛错：各种畸形输入', () => {
    expect(() => resolveControls(ALL, null as never)).not.toThrow();
    expect(() => resolveControls(ALL, 'garbage' as never)).not.toThrow();
    expect(() => resolveControls([], { a: 1 })).not.toThrow();
  });
});

describe('defaultParams()', () => {
  it('等价于无输入的 resolveControls', () => {
    expect(defaultParams(ALL)).toEqual(resolveControls(ALL, undefined));
  });
});