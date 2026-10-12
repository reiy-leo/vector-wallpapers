import { describe, expect, it } from 'vitest';
import { bell, chance, hashSeed, mulberry32, pick, randInt, randRange } from './rng';

describe('mulberry32()', () => {
  it('同 seed 连调三次输出完全一致', () => {
    const a = Array.from({ length: 8 }, mulberry32(42));
    const b = Array.from({ length: 8 }, mulberry32(42));
    const c = Array.from({ length: 8 }, mulberry32(42));
    expect(a).toEqual(b);
    expect(b).toEqual(c);
  });

  it('前5 个数落在 [0,1) 且跨多次调用不重复塌缩', () => {
    const rng = mulberry32(42);
    const first5 = [rng(), rng(), rng(), rng(), rng()];
    for (const v of first5) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(new Set(first5).size).toBe(5);
  });

  it('全部落在 [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 2000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('不同 seed 产生不同序列', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()]);
  });

  it('负数 seed 与小数 seed 被安全归一化，不抛错', () => {
    expect(() => mulberry32(-1)()).not.toThrow();
    expect(() => mulberry32(1.9)()).not.toThrow();
  });
});

describe('hashSeed()', () => {
  it('同输入同输出，不同输入不同输出', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });

  it('返回 32 位无符号整数', () => {
    const h = hashSeed('vw:seed');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('随机助手', () => {
  it('randInt 落在闭区间内且为整数', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 500; i++) {
      const v = randInt(rng, 1, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
    }
  });

  it('randInt 在 min === max 时返回该值', () => {
    expect(randInt(mulberry32(1), 5, 5)).toBe(5);
  });

  it('randRange 落在 [min, max) 内', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 200; i++) {
      const v = randRange(rng, -2, 8);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThan(8);
    }
  });

  it('chance 边界：p=0 恒 false，p=1 恒 true', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      expect(chance(rng, 0)).toBe(false);
      expect(chance(rng, 1)).toBe(true);
    }
  });

  it('pick 从数组取值，空数组返回 undefined', () => {
    const rng = mulberry32(9);
    expect(pick(rng, ['a', 'b', 'c'])).toBeDefined();
    expect(pick(rng, [])).toBeUndefined();
  });

  it('bell 输出落在约 [-1, 1]', () => {
    const rng = mulberry32(13);
    for (let i = 0; i < 300; i++) {
      const v = bell(rng);
      expect(v).toBeGreaterThanOrEqual(-1);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});