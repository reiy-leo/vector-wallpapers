/**
 * 确定性随机源。
 *
 * ⚠️ 纯函数层铁律：engine / patterns 内不得出现 `Math.random()`。
 * 一切随机必须经由 `mulberry32(seed)` 派生 —— 这是「同 seed 同结果」的前提，
 * 也是自动化视觉回归测试能够成立的基础。
 */

/** 32 位整数哈希（FNV-1a 变体）—— 用于把任意 key 折成稳定 seed。 */
export function hashSeed(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * mulberry32 —— 32 位状态的快速确定性 PRNG。
 * 返回 [0, 1) 区间的浮点数。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** [min, max] 闭区间整数。 */
export function randInt(rng: () => number, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** [min, max) 区间浮点。 */
export function randRange(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** 以概率 p 返回 true。 */
export function chance(rng: () => number, p: number): boolean {
  return rng() < p;
}

/** 从数组中确定性地取一个元素；空数组返回 undefined。 */
export function pick<T>(rng: () => number, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.floor(rng() * items.length) % items.length];
}

/**
 * 近似正态（Irwin–Hall n=3）：比均匀分布更自然，适合做有机形态的抖动。
 * 返回约 [-1, 1] 的值。
 */
export function bell(rng: () => number): number {
  return (rng() + rng() + rng()) / 1.5 - 1;
}