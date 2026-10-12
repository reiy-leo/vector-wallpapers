/**
 * 「色板 × 母题」评分的本地待提交队列 —— 纯函数（读写 localStorage 在 store.ts，网络在 ratings.ts）。
 *
 * Rei 2026-10-12：评分先攒在本地，按 `pattern|palette` 去重、后写覆盖前写；
 * 累计满 `RATING_BATCH_THRESHOLD`（500）条才向 /api/ratings 批量提交一次（Worker 只写 1 次 KV）。
 * 提交成功才把**这一批里、发出后没被改过的**条目移出队列；失败整队保留，下次再试。
 */
import {
  RATING_BATCH_MAX,
  RATING_BATCH_THRESHOLD,
  pairKey,
  splitPairKey,
  type RatingSubmit,
  type RatingsDoc,
} from '../shared/ratings-api';
import type { RatingCommit } from './rating-machine';

/** 队列与服务端文档同形：pairKey → { v, ts }（ts = 本地入队时间，用于「发出后是否被改过」）。 */
export type RatingQueue = RatingsDoc;

/** 入队（后写覆盖前写）。同一对重复入队：先删后插，键序 = 最近一次评分的先后。 */
export function enqueueRating(q: RatingQueue, c: RatingCommit, ts: number): RatingQueue {
  const k = pairKey(c.pattern, c.palette);
  const next: RatingQueue = { ...q };
  delete next[k];
  next[k] = { v: c.verdict, ts };
  return next;
}

export const queueSize = (q: RatingQueue): number => Object.keys(q).length;

/** 满阈值才提交。 */
export const shouldSubmit = (q: RatingQueue, threshold = RATING_BATCH_THRESHOLD): boolean => queueSize(q) >= threshold;

/** 待发送的一批：最旧的至多 `max` 条 + 每条发出时的 ts 快照。 */
export interface RatingBatchPlan {
  items: RatingSubmit[];
  sent: Record<string, number>;
}

export function takeBatch(q: RatingQueue, max = RATING_BATCH_MAX): RatingBatchPlan {
  const keys = Object.keys(q)
    .sort((a, b) => q[a].ts - q[b].ts)
    .slice(0, max);
  const items: RatingSubmit[] = [];
  const sent: Record<string, number> = {};
  for (const k of keys) {
    const pair = splitPairKey(k);
    if (!pair) continue;
    items.push({ pattern: pair.pattern, palette: pair.palette, verdict: q[k].v });
    sent[k] = q[k].ts;
  }
  return { items, sent };
}

/** 提交成功后：移除已发出且发出后没被改过的条目（请求在途期间改判的那条留着下次发）。 */
export function removeSent(q: RatingQueue, sent: Readonly<Record<string, number>>): RatingQueue {
  const next: RatingQueue = {};
  for (const [k, e] of Object.entries(q)) {
    if (sent[k] !== undefined && sent[k] === e.ts) continue;
    next[k] = e;
  }
  return next;
}
