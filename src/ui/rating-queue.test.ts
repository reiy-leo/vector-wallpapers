/** 本地评分队列（去重 / 覆盖 / 分批 / 成功后只清未改动条目）与同步状态（外观判定 / 时间格式）—— 纯函数。 */
import { describe, expect, it } from 'vitest';
import { RATING_BATCH_THRESHOLD } from '../shared/ratings-api';
import { enqueueRating, queueSize, removeSent, shouldSubmit, takeBatch, type RatingQueue } from './rating-queue';
import { emptySyncStatus, formatSyncTime, sanitizeSyncLast, syncPhase, syncProgress } from './rating-sync';

const c = (pattern: string, palette: string, verdict: 'good' | 'bad') => ({ pattern, palette, verdict });

describe('评分队列', () => {
  it('按 pattern|palette 去重，后写覆盖前写', () => {
    let q: RatingQueue = {};
    q = enqueueRating(q, c('p1', 'nord', 'good'), 1);
    q = enqueueRating(q, c('p1', 'monet', 'bad'), 2);
    q = enqueueRating(q, c('p1', 'nord', 'bad'), 3);
    expect(queueSize(q)).toBe(2);
    expect(q['p1|nord']).toEqual({ v: 'bad', ts: 3 });
  });

  it(`满 ${RATING_BATCH_THRESHOLD} 条才提交`, () => {
    let q: RatingQueue = {};
    for (let i = 0; i < RATING_BATCH_THRESHOLD - 1; i++) q = enqueueRating(q, c(`p${i}`, 'nord', 'good'), i + 1);
    expect(shouldSubmit(q)).toBe(false);
    q = enqueueRating(q, c('p0', 'nord', 'bad'), 9999); // 重复的一对不增加条数
    expect(shouldSubmit(q)).toBe(false);
    q = enqueueRating(q, c('px', 'nord', 'bad'), 10000);
    expect(shouldSubmit(q)).toBe(true);
  });

  it('takeBatch 取最旧的至多 max 条，并记录发出时的 ts', () => {
    let q: RatingQueue = {};
    q = enqueueRating(q, c('a', 'nord', 'good'), 30);
    q = enqueueRating(q, c('b', 'nord', 'bad'), 10);
    q = enqueueRating(q, c('c', 'nord', 'good'), 20);
    const plan = takeBatch(q, 2);
    expect(plan.items).toEqual([c('b', 'nord', 'bad'), c('c', 'nord', 'good')]);
    expect(plan.sent).toEqual({ 'b|nord': 10, 'c|nord': 20 });
  });

  it('成功后只移除发出后没被改过的条目', () => {
    let q: RatingQueue = {};
    q = enqueueRating(q, c('a', 'nord', 'good'), 1);
    q = enqueueRating(q, c('b', 'nord', 'good'), 2);
    const plan = takeBatch(q);
    q = enqueueRating(q, c('b', 'nord', 'bad'), 3); // 在途期间改判
    q = enqueueRating(q, c('d', 'nord', 'good'), 4); // 在途期间新增
    q = removeSent(q, plan.sent);
    expect(Object.keys(q).sort()).toEqual(['b|nord', 'd|nord']);
    expect(q['b|nord'].v).toBe('bad');
  });
});

describe('同步状态', () => {
  const at = Date.UTC(2026, 9, 12, 4, 0);
  it('外观优先级：提交中 > 失败 > 已提交（队列空）> 攒着', () => {
    expect(syncPhase(emptySyncStatus)).toBe('queued');
    expect(syncPhase({ ...emptySyncStatus, queued: 3 })).toBe('queued');
    expect(syncPhase({ ...emptySyncStatus, last: { at, ok: true, count: 500 } })).toBe('submitted');
    expect(syncPhase({ ...emptySyncStatus, queued: 1, last: { at, ok: true, count: 500 } })).toBe('queued');
    expect(syncPhase({ ...emptySyncStatus, queued: 500, last: { at, ok: false, count: 500 } })).toBe('failed');
    expect(syncPhase({ ...emptySyncStatus, submitting: true, last: { at, ok: false, count: 500 } })).toBe('submitting');
  });

  it('进度按阈值算并封顶', () => {
    expect(syncProgress({ ...emptySyncStatus, queued: 125 })).toBe(25);
    expect(syncProgress({ ...emptySyncStatus, queued: 900 })).toBe(100);
  });

  it('时间格式：刚刚 / N 分钟前 / 今天 / 跨天', () => {
    const base = new Date(2026, 9, 12, 14, 30).getTime();
    expect(formatSyncTime(base, base + 10_000)).toBe('刚刚');
    expect(formatSyncTime(base, base + 5 * 60_000)).toBe('5 分钟前（14:30）');
    expect(formatSyncTime(base, base + 3 * 3_600_000)).toBe('今天 14:30');
    expect(formatSyncTime(base, new Date(2026, 9, 14, 9, 0).getTime())).toBe('10月12日 14:30');
    expect(formatSyncTime(base, new Date(2027, 0, 2).getTime())).toBe('2026年10月12日 14:30');
  });

  it('sanitizeSyncLast 拒绝坏数据', () => {
    expect(sanitizeSyncLast({ at: 1, ok: true, count: 3 })).toEqual({ at: 1, ok: true, count: 3 });
    expect(sanitizeSyncLast({ at: 'x', ok: true })).toBeNull();
    expect(sanitizeSyncLast(null)).toBeNull();
  });
});
