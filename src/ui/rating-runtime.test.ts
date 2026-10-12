/**
 * ratings.ts 运行时：本地队列（localStorage）→ 满 500 条批量提交 → 成功才清 / 失败保留；
 * 换一版的 👎 排除 = 服务端 ∪ 本地队列（立即生效）；同步状态订阅。
 * localStorage 用内存替身；网络出口用 __setRatingTransport 替换（不发真实请求）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RATING_BATCH_THRESHOLD, type RatingBatch } from '../shared/ratings-api';
import { STORAGE_KEY } from '../shared/constants';
import { syncPhase } from './rating-sync';
import {
  __setRatingTransport,
  chooseVerdict,
  getRatingQueue,
  getRatingState,
  getRatingSync,
  maybeSubmit,
  noteReroll,
  rerollExclusions,
  retryDelayMs,
  setRatingOwner,
  stashCurrentRating,
  subscribeRatingSync,
} from './ratings';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};
// /api/ratings/mine 在测试里返回固定数据
let mine: Record<string, { v: 'good' | 'bad'; ts: number }> = {};
(globalThis as { fetch?: unknown }).fetch = async (url: string) => {
  if (String(url).endsWith('/api/ratings/mine')) {
    return new Response(JSON.stringify({ ratings: mine }), { headers: { 'Content-Type': 'application/json' } });
  }
  throw new Error(`unexpected fetch ${url}`);
};

const OWNER = 'rei@example.com';
const qKey = `${STORAGE_KEY.ratingQueue}:${OWNER}`;
const batches: RatingBatch[] = [];
let respond: (b: RatingBatch) => Promise<boolean> = async () => true;

beforeEach(async () => {
  mem.clear();
  mine = {};
  batches.length = 0;
  respond = async () => true;
  __setRatingTransport((b) => {
    batches.push(b);
    return respond(b);
  });
  await setRatingOwner(null);
});
afterEach(() => __setRatingTransport(null));

/** 给 pattern 评一条：换上色板 → 选择 → 换到下一套（这一刻入队）。 */
function rate(pattern: string, palette: string, v: 'good' | 'bad') {
  noteReroll(pattern, palette);
  chooseVerdict(v);
  noteReroll(pattern, `${palette}-next`);
}

describe('本地队列', () => {
  it('评分进 localStorage（按账号分 key），不发网络请求；同一对后写覆盖前写', async () => {
    await setRatingOwner(OWNER);
    rate('p1', 'nord', 'good');
    rate('p1', 'nord', 'bad');
    rate('p1', 'monet', 'good');
    expect(batches).toEqual([]);
    const stored = JSON.parse(mem.get(qKey)!);
    expect(Object.keys(stored).sort()).toEqual(['p1|monet', 'p1|nord']);
    expect(stored['p1|nord'].v).toBe('bad');
  });

  it('页面隐藏只把当前选择写进本地队列，不发请求', async () => {
    await setRatingOwner(OWNER);
    noteReroll('p1', 'nord');
    chooseVerdict('bad');
    stashCurrentRating();
    expect(batches).toEqual([]);
    expect(JSON.parse(mem.get(qKey)!)['p1|nord'].v).toBe('bad');
  });

  it('未登录不入队', async () => {
    rate('p1', 'nord', 'bad');
    expect(mem.size).toBe(0);
  });

  it('刷新后（重新 setRatingOwner）队列从 localStorage 恢复', async () => {
    await setRatingOwner(OWNER);
    rate('p1', 'nord', 'bad');
    await setRatingOwner(null);
    expect(Object.keys(getRatingQueue())).toEqual([]);
    await setRatingOwner(OWNER);
    expect(Object.keys(getRatingQueue())).toEqual(['p1|nord']);
  });
});

describe(`满 ${RATING_BATCH_THRESHOLD} 条批量提交`, () => {
  async function fill(n: number) {
    for (let i = 0; i < n; i++) rate(`p${i}`, 'nord', i % 2 ? 'good' : 'bad');
  }

  it(`第 ${RATING_BATCH_THRESHOLD} 条入队时 POST 一个数组；成功后清队列并记录成功`, async () => {
    await setRatingOwner(OWNER);
    await fill(RATING_BATCH_THRESHOLD - 1);
    expect(batches).toEqual([]);
    rate('last', 'nord', 'bad');
    await maybeSubmit();
    expect(batches.length).toBe(1);
    expect(batches[0].length).toBe(RATING_BATCH_THRESHOLD);
    expect(batches[0][0]).toEqual({ pattern: 'p0', palette: 'nord', verdict: 'bad' });
    expect(Object.keys(getRatingQueue())).toEqual([]);
    expect(mem.has(qKey)).toBe(false);
    const sync = getRatingSync();
    expect(sync.last).toMatchObject({ ok: true, count: RATING_BATCH_THRESHOLD });
    expect(syncPhase(sync)).toBe('submitted');
  });

  it('失败保留整队并标记失败；退避期内入队不重试，退避期过后重试，成功后清', async () => {
    await setRatingOwner(OWNER);
    respond = async () => false;
    await fill(RATING_BATCH_THRESHOLD);
    await maybeSubmit();
    await maybeSubmit();
    expect(batches.length).toBe(1);
    expect(Object.keys(getRatingQueue()).length).toBe(RATING_BATCH_THRESHOLD);
    expect(syncPhase(getRatingSync())).toBe('failed');
    respond = async () => true;
    rate('soon', 'nord', 'good'); // 退避期内：不发
    await maybeSubmit();
    expect(batches.length).toBe(1);
    vi.useFakeTimers({ now: Date.now() + retryDelayMs(1) + 1000, toFake: ['Date'] });
    try {
      rate('again', 'nord', 'good');
      await maybeSubmit();
    } finally {
      vi.useRealTimers();
    }
    expect(batches.length).toBe(2);
    expect(batches[1].length).toBe(RATING_BATCH_THRESHOLD + 2);
    expect(Object.keys(getRatingQueue())).toEqual([]);
    expect(syncPhase(getRatingSync())).toBe('submitted');
  });

  it('退避：30 秒起翻倍，封顶 30 分钟', () => {
    expect([1, 2, 3].map(retryDelayMs)).toEqual([30_000, 60_000, 120_000]);
    expect(retryDelayMs(20)).toBe(30 * 60_000);
  });

  it('上次失败留下的满队列：下次登录时立即重试（无视退避）', async () => {
    await setRatingOwner(OWNER);
    respond = async () => false;
    await fill(RATING_BATCH_THRESHOLD);
    await maybeSubmit();
    await setRatingOwner(null);
    respond = async () => true;
    await setRatingOwner(OWNER);
    expect(batches.length).toBe(2);
    expect(Object.keys(getRatingQueue())).toEqual([]);
  });

  it('提交中：同步状态为 submitting，订阅者收到通知；请求在途期间改判的那条保留', async () => {
    await setRatingOwner(OWNER);
    let release!: (ok: boolean) => void;
    respond = () => new Promise<boolean>((r) => (release = r));
    let notified = 0;
    const off = subscribeRatingSync(() => notified++);
    await fill(RATING_BATCH_THRESHOLD);
    expect(syncPhase(getRatingSync())).toBe('submitting');
    rate('p0', 'nord', 'good'); // 在途期间改判（第一条原为 bad）
    release(true);
    await maybeSubmit();
    off();
    expect(notified).toBeGreaterThan(0);
    expect(getRatingQueue()['p0|nord']?.v).toBe('good');
    expect(Object.keys(getRatingQueue()).length).toBe(1);
  });
});

describe('换一版排除 👎：服务端 ∪ 本地队列', () => {
  it('本地队列里的 👎 立即生效，/mine 的 👎 也算；本地改成 👍 覆盖服务端 👎', async () => {
    mine = { 'p1|nord': { v: 'bad', ts: 1 }, 'p1|monet': { v: 'bad', ts: 1 } };
    mem.set(qKey, JSON.stringify({ 'p1|klimt': { v: 'bad', ts: 5 }, 'p1|monet': { v: 'good', ts: 6 } }));
    await setRatingOwner(OWNER);
    expect([...rerollExclusions('p1')].sort()).toEqual(['klimt', 'nord']);
    rate('p1', 'dracula', 'bad');
    expect(rerollExclusions('p1').has('dracula')).toBe(true);
    expect(getRatingState().submitted['p1|monet']).toBe('good');
  });
});
