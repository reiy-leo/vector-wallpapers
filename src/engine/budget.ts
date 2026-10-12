/**
 * 体积守卫 —— 把「单 Pattern SVG < 20KB」「body 直接子节点 ≤ 60」从口号变成断言。
 *
 * 分级策略（架构 §8）：
 *  - dev：超限直接 `throw`，阻断开发（问题暴露在发生时，而不是 CI 才发现）
 *  - prod：仅 `console.warn`，绝不让用户白屏
 */
import { LIMITS } from '../shared/constants';
import { countTopLevelNodes } from './svg';

/** 用 TextEncoder 而非 s.length —— 体积红线说的是字节不是字符。 */
export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export interface BudgetReport {
  bytes: number;
  nodes: number;
  byteLimit: number;
  nodeLimit: number;
  violations: string[];
}

/** 度量一份完整 SVG 文本。 */
export function measure(svgText: string, body: string): BudgetReport {
  const bytes = byteLength(svgText);
  const nodes = countTopLevelNodes(body);
  const violations: string[] = [];
  if (bytes > LIMITS.MAX_SVG_BYTES) {
    violations.push(`SVG 体积 ${bytes}B 超过 ${LIMITS.MAX_SVG_BYTES}B 红线`);
  }
  if (nodes > LIMITS.MAX_BODY_NODES) {
    violations.push(`body 顶层节点 ${nodes} 个超过 ${LIMITS.MAX_BODY_NODES} 个上限（应改用 <pattern> 平铺）`);
  }
  return { bytes, nodes, byteLimit: LIMITS.MAX_SVG_BYTES, nodeLimit: LIMITS.MAX_BODY_NODES, violations };
}

export class BudgetError extends Error {
  readonly report: BudgetReport;

  constructor(patternId: string, report: BudgetReport) {
    super(`[budget] ${patternId} 超出体积红线：${report.violations.join('；')}`);
    this.name = 'BudgetError';
    this.report = report;
  }
}

/**
 * 断言体积预算。
 * @param isDev 来自 `import.meta.env.DEV`（由调用方注入，保持本模块可测）
 */
export function assertBudget(
  patternId: string,
  svgText: string,
  body: string,
  isDev: boolean,
): BudgetReport {
  const report = measure(svgText, body);
  if (report.violations.length === 0) return report;
  if (isDev) throw new BudgetError(patternId, report);
  console.warn(`[budget] ${patternId} ${report.violations.join('；')}`);
  return report;
}