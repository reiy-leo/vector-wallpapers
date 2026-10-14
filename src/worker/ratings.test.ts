/**
 * Worker 评分接口：登录校验、请求体校验、每次提交 ≤1 次 KV 写、/mine 只读一个 key、summary 仅管理员 + CSV。
 * 走真实路由（createHandler）与真实会话签名（session.sign），KV 用内存替身并计数读写。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from './auth';
import type { Env, KVLike } from './env';
import { createHandler } from './index';
import { MAX_ENTRIES_PER_USER, mergeRating, mergeRatings, parseBatch, parseSubmit, summarize, summaryToCsv, userHash, userKey } from './ratings';
import { sign } from './session';
import { RATING_BATCH_MAX, RATING_BATCH_THRESHOLD, type RatingsDoc } from '../shared/ratings-api';

class MemKV implements KVLike {
  data = new Map<string, string>();
  reads = 0;
  writes = 0;
  lists = 0;
  get(key: string, type: 'json'): Promise<unknown>;
  get(key: string, type?: 'text'): Promise<string | null>;
  async get(key: string, type?: 'json' | 'text'): Promise<unknown> {
    this.reads++;
    const v = this.data.get(key);
    if (v === undefined) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(key: string, value: string) {
    this.writes++;
    this.data.set(key, value);
  }
  async list(opts: { prefix?: string; cursor?: string; limit?: number }) {
    this.lists++;
    const all = [...this.data.keys()].filter((k) => k.startsWith(opts.prefix ?? '')).sort();
    const start = opts.cursor ? Number(opts.cursor) : 0;
    const limit = Math.min(opts.limit ?? 1000, 2); // 故意小页，覆盖分页
    const keys = all.slice(start, start + limit).map((name) => ({ name }));
    const done = start + limit >= all.length;
    return { keys, list_complete: done, cursor: done ? undefined : String(start + limit) };
  }
}

const SECRET = 'test-secret';
const app = createHandler(() => new Response('static'));
let kv: MemKV;
let env: Env;

beforeEach(() => {
  kv = new MemKV();
  env = { SESSION_SECRET: SECRET, RATINGS: kv, ADMIN_EMAILS: 'Admin@Example.com, other@x.io' };
});

async function cookieFor(email: string) {
  const token = await sign({ sub: email, email, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
}

async function call(method: string, path: string, opts: { email?: string; body?: unknown; raw?: string; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.email) headers.Cookie = await cookieFor(opts.email);
  let body: string | undefined;
  if (opts.raw !== undefined) body = opts.raw;
  else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }
  return app.fetch(new Request(`https://vw.test${path}`, { method, headers, body }), env);
}

const valid = { pattern: 'polka-dots', palette: 'nord', verdict: 'bad' };

describe('POST /api/ratings', () => {
  it('未登录 → 401，不碰 KV', async () => {
    const res = await call('POST', '/api/ratings', { body: valid });
    expect(res.status).toBe(401);
    expect(kv.reads + kv.writes).toBe(0);
  });

  it('跨站 Origin → 403', async () => {
    const res = await call('POST', '/api/ratings', { email: 'a@b.c', body: valid, headers: { Origin: 'https://evil.test' } });
    expect(res.status).toBe(403);
  });

  it('首次提交：1 读 1 写，写进 u:<hash>，不写逐条 r: key', async () => {
    const res = await call('POST', '/api/ratings', { email: 'A@B.c', body: valid, headers: { Origin: 'https://vw.test' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accepted: 1, rejected: 0, written: true });
    expect(kv.reads).toBe(1);
    expect(kv.writes).toBe(1);
    const key = userKey(await userHash('a@b.c'));
    expect([...kv.data.keys()]).toEqual([key]);
    expect(key).toMatch(/^u:[0-9a-f]{32}$/);
    expect(kv.data.get(key)).not.toContain('a@b.c'); // 不存邮箱明文
    const doc = JSON.parse(kv.data.get(key)!) as RatingsDoc;
    expect(doc['polka-dots|nord'].v).toBe('bad');
  });

  it('同一对重复提交相同 verdict：0 写；改判覆盖：再 1 写；不同对合并进同一个 key', async () => {
    await call('POST', '/api/ratings', { email: 'a@b.c', body: valid });
    await call('POST', '/api/ratings', { email: 'a@b.c', body: valid });
    expect(kv.writes).toBe(1);
    await call('POST', '/api/ratings', { email: 'a@b.c', body: { ...valid, verdict: 'good' } });
    await call('POST', '/api/ratings', { email: 'a@b.c', body: { ...valid, palette: 'riso-pop' } });
    expect(kv.writes).toBe(3);
    expect(kv.data.size).toBe(1);
    const doc = JSON.parse([...kv.data.values()][0]) as RatingsDoc;
    expect(Object.fromEntries(Object.entries(doc).map(([k, e]) => [k, e.v]))).toEqual({
      'polka-dots|nord': 'good',
      'polka-dots|riso-pop': 'bad',
    });
  });

  it('无 Content-Type 的 JSON 文本也接受', async () => {
    const res = await call('POST', '/api/ratings', { email: 'a@b.c', raw: JSON.stringify([valid]) });
    expect(res.status).toBe(200);
  });

  it(`批量 ${RATING_BATCH_THRESHOLD} 条：1 读 1 写；数组里同一对后者覆盖前者`, async () => {
    const batch = Array.from({ length: RATING_BATCH_THRESHOLD - 1 }, (_, i) => ({ pattern: `p${i}`, palette: 'nord', verdict: 'good' }));
    batch.push({ pattern: 'p0', palette: 'nord', verdict: 'bad' });
    const res = await call('POST', '/api/ratings', { email: 'a@b.c', body: batch });
    expect(await res.json()).toEqual({ ok: true, accepted: RATING_BATCH_THRESHOLD, rejected: 0, written: true });
    expect(kv.reads).toBe(1);
    expect(kv.writes).toBe(1);
    const doc = JSON.parse([...kv.data.values()][0]) as RatingsDoc;
    expect(Object.keys(doc).length).toBe(RATING_BATCH_THRESHOLD - 1);
    expect(doc['p0|nord'].v).toBe('bad');
  });

  it('批量里的非法条目跳过而不是整批拒绝（免得一条脏数据卡死前端队列）', async () => {
    const res = await call('POST', '/api/ratings', {
      email: 'a@b.c',
      body: [valid, { ...valid, palette: 'gone-palette' }, { ...valid, pattern: 'BAD' }, 'x'],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, accepted: 1, rejected: 3, written: true });
  });

  it('全部非法：200 但 0 读 0 写', async () => {
    const res = await call('POST', '/api/ratings', { email: 'a@b.c', body: [{ ...valid, verdict: 'meh' }] });
    expect(await res.json()).toEqual({ ok: true, accepted: 0, rejected: 1, written: false });
    expect(kv.reads + kv.writes).toBe(0);
  });

  it(`空数组 / 超过 ${RATING_BATCH_MAX} 条 → 400`, async () => {
    expect((await call('POST', '/api/ratings', { email: 'a@b.c', body: [] })).status).toBe(400);
    const big = Array.from({ length: RATING_BATCH_MAX + 1 }, () => valid);
    expect((await call('POST', '/api/ratings', { email: 'a@b.c', body: big })).status).toBe(400);
    expect(kv.writes).toBe(0);
  });

  it.each([
    [{ ...valid, pattern: 'Polka' }],
    [{ ...valid, pattern: 'a'.repeat(49) }],
    [{ ...valid, pattern: '../x' }],
    [{ ...valid, palette: 'not-a-palette' }],
    [{ ...valid, palette: 'nord|x' }],
    [{ ...valid, verdict: 'meh' }],
  ])('非法条目 %j：被计入 rejected，不写 KV', async (body) => {
    const res = await call('POST', '/api/ratings', { email: 'a@b.c', body: [body] });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { rejected: number }).rejected).toBe(1);
    expect(kv.writes).toBe(0);
  });

  it('请求体不是数组也不是对象 → 400', async () => {
    const res = await call('POST', '/api/ratings', { email: 'a@b.c', body: 42 });
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe('body must be a JSON array of ratings');
  });

  it('坏 JSON → 400；超长 → 413', async () => {
    expect((await call('POST', '/api/ratings', { email: 'a@b.c', raw: '{oops' })).status).toBe(400);
    expect((await call('POST', '/api/ratings', { email: 'a@b.c', raw: JSON.stringify({ ...valid, pad: 'x'.repeat(200 * 1024) }) })).status).toBe(413);
    expect(kv.writes).toBe(0);
  });

  it('没有 RATINGS 绑定 → 503', async () => {
    env.RATINGS = undefined;
    expect((await call('POST', '/api/ratings', { email: 'a@b.c', body: valid })).status).toBe(503);
  });

  it('其它方法 → 404', async () => {
    expect((await call('PUT', '/api/ratings', { email: 'a@b.c', body: valid })).status).toBe(404);
  });
});

describe('GET /api/ratings/mine', () => {
  it('未登录 401；登录后只读自己的 u: key（1 读 0 写）', async () => {
    expect((await call('GET', '/api/ratings/mine')).status).toBe(401);
    await call('POST', '/api/ratings', { email: 'a@b.c', body: valid });
    await call('POST', '/api/ratings', { email: 'z@b.c', body: { ...valid, verdict: 'good' } });
    kv.reads = 0;
    kv.writes = 0;
    const res = await call('GET', '/api/ratings/mine', { email: 'a@b.c' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ratings: RatingsDoc };
    expect(Object.keys(body.ratings)).toEqual(['polka-dots|nord']);
    expect(body.ratings['polka-dots|nord'].v).toBe('bad');
    expect(kv.reads).toBe(1);
    expect(kv.writes).toBe(0);
  });

  it('KV 里是损坏的值：返回空而不是 500', async () => {
    kv.data.set(userKey(await userHash('a@b.c')), '{"bad|":1, "x|nord": {"v":"meh"}}');
    const res = await call('GET', '/api/ratings/mine', { email: 'a@b.c' });
    expect(await res.json()).toEqual({ ratings: {} });
  });
});

describe('GET /api/ratings/summary', () => {
  beforeEach(async () => {
    await call('POST', '/api/ratings', { email: 'u1@x.io', body: valid });
    await call('POST', '/api/ratings', { email: 'u2@x.io', body: valid });
    await call('POST', '/api/ratings', { email: 'u3@x.io', body: { ...valid, verdict: 'good' } });
    await call('POST', '/api/ratings', { email: 'u3@x.io', body: { ...valid, pattern: 'flow-lines', palette: 'monet', verdict: 'good' } });
  });

  it('未登录 401，非管理员 403', async () => {
    expect((await call('GET', '/api/ratings/summary')).status).toBe(401);
    expect((await call('GET', '/api/ratings/summary', { email: 'u1@x.io' })).status).toBe(403);
  });

  it('管理员（大小写不敏感）拿到按母题汇总的计数；分页 list 全部 u: key', async () => {
    const res = await call('GET', '/api/ratings/summary', { email: 'admin@example.com' });
    expect(res.status).toBe(200);
    const s = (await res.json()) as { users: number; patterns: Record<string, Record<string, { good: number; bad: number }>> };
    expect(s.users).toBe(3);
    expect(s.patterns).toEqual({
      'polka-dots': { nord: { good: 1, bad: 2 } },
      'flow-lines': { monet: { good: 1, bad: 0 } },
    });
    expect(kv.lists).toBeGreaterThan(1);
  });

  it('?format=csv 下载 CSV', async () => {
    const res = await call('GET', '/api/ratings/summary?format=csv', { email: 'other@x.io' });
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(await res.text()).toBe('pattern,palette,tone,good,bad\nflow-lines,monet,,1,0\npolka-dots,nord,,1,2\n');
  });
});

describe('纯函数', () => {
  it('parseSubmit 接受合法体；parseBatch 兼容单个对象', () => {
    expect(parseSubmit(valid)).toEqual(valid);
    expect(parseBatch(valid)).toEqual({ items: [valid], rejected: 0 });
  });

  it('mergeRatings：与已存完全相同 → null（不写）', () => {
    const doc: RatingsDoc = { 'polka-dots|nord': { v: 'bad', ts: 1 } };
    expect(mergeRatings(doc, [{ pattern: 'polka-dots', palette: 'nord', verdict: 'bad' }], 2)).toBeNull();
  });

  it('mergeRating 超过上限时丢最旧的', () => {
    const doc: RatingsDoc = {};
    for (let i = 0; i < MAX_ENTRIES_PER_USER; i++) doc[`p${i}|nord`] = { v: 'good', ts: i + 1 };
    const next = mergeRating(doc, 'new', 'nord', 'bad', 1e12)!;
    expect(Object.keys(next).length).toBe(MAX_ENTRIES_PER_USER);
    expect(next['p0|nord']).toBeUndefined();
    expect(next['new|nord'].v).toBe('bad');
  });

  it('summarize / CSV 对空数据', () => {
    expect(summaryToCsv(summarize([]))).toBe('pattern,palette,tone,good,bad\n');
  });
});

describe('浅底 / 深底分开评', () => {
  it('parseSubmit 收 tone 与「默认」；mergeRatings 用三段键；汇总 / CSV 带底色', async () => {
    const m = await import('./ratings');
    expect(m.parseSubmit({ pattern: 'p', palette: 'default', verdict: 'good', tone: 'dark' })).toEqual({ pattern: 'p', palette: 'default', verdict: 'good', tone: 'dark' });
    expect(m.parseSubmit({ pattern: 'p', palette: 'default', verdict: 'good', tone: 'dim' })).toBe('invalid tone');
    const doc = m.mergeRatings({}, [{ pattern: 'p', palette: 'nord', verdict: 'bad', tone: 'light' }], 5)!;
    expect(Object.keys(doc)).toEqual(['p|nord|light']);
    const csv = m.summaryToCsv(m.summarize([{ ...doc, 'p|nord': { v: 'good', ts: 1 } }], new Date(0)));
    expect(csv).toBe('pattern,palette,tone,good,bad\np,nord,,1,0\np,nord,light,0,1\n');
  });
});
