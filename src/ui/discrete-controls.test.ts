import { describe, it, expect } from 'vitest';
import { discreteValues, MAX_SEGMENTS } from './ControlChips';
import { ALL_PATTERN_DEFS as PATTERNS } from '../patterns';

describe('少取值 range → 分段单选', () => {
  it('取值按 step 生成、无浮点尾巴', () => {
    expect(discreteValues({ key: 'k', label: 'l', type: 'range', min: 3, max: 5, step: 1, default: 4 })).toEqual([3, 4, 5]);
    expect(discreteValues({ key: 'k', label: 'l', type: 'range', min: 0.1, max: 0.4, step: 0.1, default: 0.2 })).toBeNull(); // 小数步长不转
    expect(discreteValues({ key: 'k', label: 'l', type: 'range', min: 0, max: 30, step: 1, default: 8 })).toBeNull();
  });
  it('所有母题：分段项包含默认值', () => {
    const hits: string[] = [];
    for (const def of PATTERNS) {
      for (const c of def.controls) {
        const v = discreteValues(c);
        if (!v || c.type !== 'range') continue;
        expect(v.length).toBeLessThanOrEqual(MAX_SEGMENTS);
        expect(v).toContain(c.default);
        hits.push(`${def.id}.${c.key}(${v.join('/')})`);
      }
    }
    console.log('DISCRETE', hits.length, hits.join(' '));
    expect(hits.length).toBeGreaterThan(0);
  });
});
