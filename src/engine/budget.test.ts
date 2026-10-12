import { describe, expect, it } from 'vitest';
import { BudgetError, assertBudget, byteLength, measure } from './budget';

describe('byteLength()', () => {
  it('按 UTF-8 字节计数而非字符数', () => {
    expect(byteLength('abc')).toBe(3);
    expect(byteLength('中文')).toBe(6);
    expect(byteLength('')).toBe(0);
  });
});

describe('measure()', () => {
  it('正常体积无违规', () => {
    const r = measure('<svg><rect/></svg>', '<rect/>');
    expect(r.violations).toEqual([]);
    expect(r.byteLimit).toBe(20480);
    expect(r.nodeLimit).toBe(60);
  });

  it('超过 20KB 报告体积违规', () => {
    const big = `<svg>${'x'.repeat(21 * 1024)}</svg>`;
    const r = measure(big, '');
    expect(r.violations.some((v) => v.includes('体积'))).toBe(true);
  });

  it('超过 60 个顶层节点报告节点违规', () => {
    const body = '<rect/>'.repeat(61);
    const r = measure(`<svg>${body}</svg>`, body);
    expect(r.violations.some((v) => v.includes('顶层节点'))).toBe(true);
  });
});

describe('assertBudget() 分级门禁', () => {
  const okSvg = '<svg><rect/></svg>';
  const bigSvg = `<svg>${'x'.repeat(21 * 1024)}</svg>`;

  it('dev 下超限抛错（阻断开发）', () => {
    expect(() => assertBudget('p', bigSvg, '', true)).toThrow(BudgetError);
  });

  it('prod 下超限仅 warn不抛错（不阻断用户体验）', () => {
    const orig = console.warn;
    let warned = false;
    console.warn = () => {
      warned = true;
    };
    try {
      expect(() => assertBudget('p', bigSvg, '', false)).not.toThrow();
      expect(warned).toBe(true);
    } finally {
      console.warn = orig;
    }
  });

  it('未超限时两种模式均正常返回', () => {
    expect(assertBudget('p', okSvg, '<rect/>', true).violations).toEqual([]);
    expect(assertBudget('p', okSvg, '<rect/>', false).violations).toEqual([]);
  });

  it('错误信息含 pattern id，便于定位', () => {
    try {
      assertBudget('polka-dots', bigSvg, '', true);
      expect.unreachable('应当抛错');
    } catch (e) {
      expect((e as Error).message).toContain('polka-dots');
    }
  });
});