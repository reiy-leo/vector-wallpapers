/**
 * 批改模式运行时：只对管理员生效；开着时按「母题 × 底色」记录改动、刷新不丢；
 * 关闭时 PUT —— 成功清空并更新默认值，失败保留且保持开启、错误带中文释义；
 * 打分 −5…+5（先抵消对方），≤ −3 进换一版排除。网络用 __setReviewFetch 替换。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { createDefaultConfig } from '../engine/render';
import { allowedTones, applyTone } from './coloring';
import {
  __setReviewFetch,
  bumpAdminScore,
  bumpScoreIn,
  getReview,
  installReviewListeners,
  recordPending,
  scoreExclusions,
  setReviewMode,
  setReviewOwner,
  type FetchLike,
} from './admin-review';
import { builtinTone, getEffectiveDefaults, getServerDefaults, setDefaultsOverlay, setServerDefaults } from './defaults';
import { rerollExclusions } from './ratings';
import { getConfig, selectPattern, setConfig, setParam } from './store';
import { badCount, goodCount, scoreDown, scoreUp, type DefaultsPutBody } from '../shared/defaults-api';
import type { PatternDef } from '../patterns/types';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};

const def: PatternDef = registry
  .list()
  .find((d) => allowedTones(d).length === 2 && d.controls.some((c) => c.type === 'range') && d.elements.every((e) => !e.locked))!;
const range = def.controls.find((c) => c.type === 'range') as Extract<PatternDef['controls'][number], { type: 'range' }>;
const home = builtinTone(def);
const other = home === 'light' ? 'dark' : 'light';
const ADMIN = 'admin@example.com';

let puts: DefaultsPutBody[] = [];
let respond: (body: DefaultsPutBody) => Response;

const jsonRes = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

const fakeFetch: FetchLike = async (url, init) => {
  if (init?.method === 'PUT') {
    const b = JSON.parse(String(init.body)) as DefaultsPutBody;
    puts.push(b);
    return respond(b);
  }
  if (url.includes('/api/admin/scores')) return jsonRes({ scores: {} });
  return jsonRes({ defaults: {}, updatedAt: null });
};

beforeEach(() => {
  mem.clear();
  puts = [];
  respond = (b) => jsonRes({ ok: true, patterns: 1, scores: 0, updatedAt: '2026-10-14T01:00:00.000Z', defaults: b.defaults ?? {}, adminScores: b.scores ?? {} });
  __setReviewFetch(fakeFetch);
  setServerDefaults({}, null);
  setDefaultsOverlay(null);
  setReviewOwner(null, false);
  installReviewListeners();
});

afterEach(() => {
  __setReviewFetch(null);
});

describe('纯函数', () => {
  it('打分：先抵消、封顶 ±5；角标只显示同号部分', () => {
    let s = 0;
    for (let i = 0; i < 8; i++) s = scoreUp(s);
    expect(s).toBe(5);
    s = scoreDown(scoreDown(s));
    expect(s).toBe(3);
    for (let i = 0; i < 20; i++) s = scoreDown(s);
    expect(s).toBe(-5);
    expect([goodCount(3), badCount(3), goodCount(-2), badCount(-2)]).toEqual([3, 0, 0, 2]);
    expect(bumpScoreIn({ 'a|b': 2 }, 'a', 'b', 'down')).toBe(1);
  });

  it('scoreExclusions：≤ −3 排除，只看该母题', () => {
    expect([...scoreExclusions({ 'a|x': -3, 'a|y': -2, 'a|z': -5, 'b|x': -5 }, 'a')].sort()).toEqual(['x', 'z']);
  });

  it('recordPending：与生效默认相同不记；改了参数 / 配色按底色分开记', () => {
    const base = createDefaultConfig(def);
    expect(recordPending({}, {}, base, def)).toEqual({});
    const p1 = recordPending({}, {}, { ...base, params: { ...base.params, [range.key]: range.min === range.default ? range.max : range.min } }, def);
    expect(Object.keys(p1)).toEqual([def.id]);
    expect(p1[def.id].tones?.[home]).toEqual({ elements: [] });
    const flipped = applyTone(base, def, other);
    const p2 = recordPending(p1, {}, flipped, def);
    expect(p2[def.id].tones?.[home]).toEqual({ elements: [] });
    expect(p2[def.id].tones?.[other]?.elements.length).toBeGreaterThan(0);
  });
});

describe('运行时', () => {
  it('非管理员：没有批改模式，改动不记录', async () => {
    setReviewOwner('x@y.z', false);
    expect(getReview().admin).toBe(false);
    expect((await setReviewMode(true)).ok).toBe(false);
  });

  it('开着时记录改动并持久化；刷新（重载 owner）后仍在且仍开启', async () => {
    setReviewOwner(ADMIN, true);
    selectPattern(def.id);
    expect((await setReviewMode(true)).ok).toBe(true);
    setParam(range.key, range.default === range.min ? range.max : range.min);
    expect(getReview().pendingPatterns).toBe(1);
    // 叠层即时生效：生效默认里已有这条
    expect(getEffectiveDefaults()[def.id]).toBeTruthy();
    setReviewOwner(null, false);
    expect(getReview().on).toBe(false);
    setReviewOwner(ADMIN, true);
    expect(getReview()).toMatchObject({ on: true, pendingPatterns: 1 });
  });

  it('关闭 → PUT 成功：清空待上传、关闭、服务器副本更新', async () => {
    setReviewOwner(ADMIN, true);
    selectPattern(def.id);
    await setReviewMode(true);
    setConfig(applyTone(getConfig(), def, other));
    bumpAdminScore(def.id, 'nord', 'down');
    const r = await setReviewMode(false);
    expect(r).toEqual({ ok: true, on: false, patterns: 1, scores: 1, uploaded: true });
    expect(puts).toHaveLength(1);
    expect(puts[0].defaults?.[def.id]?.tones?.[other]).toBeTruthy();
    expect(puts[0].scores).toEqual({ [`${def.id}|nord`]: -1 });
    expect(getReview()).toMatchObject({ on: false, pendingPatterns: 0, pendingScores: 0 });
    expect(getServerDefaults()[def.id].tones?.[other]).toBeTruthy();
  });

  it('关闭 → PUT 失败：保留待上传、保持开启、错误带中文释义', async () => {
    respond = () => jsonRes({ error: 'forbidden' }, 403);
    setReviewOwner(ADMIN, true);
    selectPattern(def.id);
    await setReviewMode(true);
    setConfig(applyTone(getConfig(), def, other));
    const r = await setReviewMode(false);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('403 禁止访问');
    expect(getReview()).toMatchObject({ on: true, pendingPatterns: 1 });
  });

  it('没有改动时关闭：不发请求', async () => {
    setReviewOwner(ADMIN, true);
    await setReviewMode(true);
    const r = await setReviewMode(false);
    expect(r).toMatchObject({ ok: true, uploaded: false });
    expect(puts).toHaveLength(0);
  });

  it('打分 ≤ −3 进入换一版排除（仅管理员）', async () => {
    setReviewOwner(ADMIN, true);
    for (let i = 0; i < 3; i++) bumpAdminScore(def.id, 'nord', 'down');
    expect(rerollExclusions(def.id).has('nord')).toBe(true);
    bumpAdminScore(def.id, 'nord', 'up'); // −2
    expect(rerollExclusions(def.id).has('nord')).toBe(false);
    for (let i = 0; i < 3; i++) bumpAdminScore(def.id, 'nord', 'down');
    setReviewOwner('x@y.z', false);
    expect(rerollExclusions(def.id).has('nord')).toBe(false);
  });
});
