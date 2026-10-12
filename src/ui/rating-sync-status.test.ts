/**
 * 标题栏同步图标（RatingSyncStatus.tsx）：只给登录用户显示；图标与无障碍名称随同步状态变，失败用警示色。
 * 用 react-dom/server 渲染真实组件（不点开 Popover —— 弹层内容由 rating-sync 纯函数测试覆盖）。
 */
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { RATING_BATCH_THRESHOLD } from '../shared/ratings-api';
import { loadMe } from './auth';
import { RatingSyncStatus } from './RatingSyncStatus';
import { __setRatingTransport, chooseVerdict, maybeSubmit, noteReroll, setRatingOwner } from './ratings';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
};
let user: { email: string; name: null; picture: null } | null = null;
(globalThis as { fetch?: unknown }).fetch = async (url: string) => {
  const body = String(url).endsWith('/api/me') ? { user, authMode: 'google' } : { ratings: {} };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
};

const html = () => renderToString(createElement(RatingSyncStatus));
const rate = (p: string, v: 'good' | 'bad') => {
  noteReroll(p, 'nord');
  chooseVerdict(v);
  noteReroll(p, 'monet');
};

let ok = true;
beforeAll(() => __setRatingTransport(async () => ok));
afterAll(() => __setRatingTransport(null));
beforeEach(async () => {
  mem.clear();
  ok = true;
  await setRatingOwner(null);
});

describe('评分同步图标', () => {
  it('未登录不渲染', async () => {
    user = null;
    await loadMe();
    expect(html()).toBe('');
  });

  it('登录后：攒着 → 显示本地条数；失败 → 警示色；成功 → 已提交', async () => {
    user = { email: 'rei@example.com', name: null, picture: null };
    await loadMe();
    await setRatingOwner(user.email);
    expect(html()).toContain('评分攒在本地（本地 0 / 500）');

    rate('p1', 'bad');
    rate('p2', 'good');
    expect(html()).toContain('评分攒在本地（本地 2 / 500）');
    expect(html()).toContain('text-fg-mute');

    ok = false;
    for (let i = 0; i < RATING_BATCH_THRESHOLD; i++) rate(`q${i}`, 'bad');
    await maybeSubmit();
    expect(html()).toContain('评分提交失败');
    expect(html()).toContain('text-warning');

    ok = true;
    await setRatingOwner(null);
    await setRatingOwner(user.email); // 登录时无视退避立即重试
    expect(html()).toContain('评分已提交（本地 0 / 500）');
    expect(html()).toContain('text-success');
  });
});
