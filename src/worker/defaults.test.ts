/**
 * 服务器默认值 + 批改打分：/api/me 的 admin、GET 公开可缓存、PUT 仅管理员 + 校验 + 合并、分 key 存储。
 * 走真实路由（createHandler）与真实会话签名，KV 用内存替身并计数读写。
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE } from './auth';
import type { Env, KVLike } from './env';
import { createHandler } from './index';
import { sign } from './session';
import {
  ADMIN_SCORES_KV_KEY,
  DEFAULTS_KV_KEY,
  DEFAULTS_MAX_BODY_BYTES,
  mergeDefaults,
  mergeScores,
  sanitizeDefaultsMap,
  validatePutBody,
  type DefaultsMap,
} from '../shared/defaults-api';

class MemKV implements KVLike {
  data = new Map<string, string>();
  reads = 0;
  writes = 0;
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
  async list() {
    return { keys: [], list_complete: true };
  }
}

const SECRET = 'test-secret';
const app = createHandler(() => new Response('static'));
let kv: MemKV;
let env: Env;

beforeEach(() => {
  kv = new MemKV();
  env = { SESSION_SECRET: SECRET, RATINGS: kv, ADMIN_EMAILS: 'Admin@Example.com' };
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

const solid = (color: string) => ({ type: 'solid' as const, color });
const lightTone = { elements: [{ id: 'bg', paint: solid('#ffffff'), opacity: 1, visible: true }] };
const darkTone = { elements: [{ id: 'bg', paint: solid('#101010'), opacity: 1, visible: true }] };

describe('GET /api/me', () => {
  it('管理员 → admin: true；普通用户 / 未登录 → false', async () => {
    expect(((await (await call('GET', '/api/me', { email: 'admin@example.com' })).json()) as { admin: boolean }).admin).toBe(true);
    expect(((await (await call('GET', '/api/me', { email: 'x@y.z' })).json()) as { admin: boolean }).admin).toBe(false);
    expect(((await (await call('GET', '/api/me')).json()) as { admin: boolean }).admin).toBe(false);
  });
});

describe('GET /api/defaults', () => {
  it('公开、可短暂缓存；空库 → 空覆盖', async () => {
    const res = await call('GET', '/api/defaults');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(await res.json()).toEqual({ defaults: {}, updatedAt: null });
  });

  it('KV 未绑定 → 仍 200 空覆盖（前端照常用内置默认）', async () => {
    env.RATINGS = undefined;
    expect(await (await call('GET', '/api/defaults')).json()).toEqual({ defaults: {}, updatedAt: null });
  });

  it('KV 里的损坏条目被清洗掉', async () => {
    kv.data.set(DEFAULTS_KV_KEY, JSON.stringify({ defaults: { 'good-one': { params: { n: 3 } }, 'Bad Id': {}, x: { params: 5 } }, updatedAt: 't' }));
    expect(await (await call('GET', '/api/defaults')).json()).toEqual({ defaults: { 'good-one': { params: { n: 3 } } }, updatedAt: 't' });
  });
});

describe('PUT /api/defaults', () => {
  const body = { defaults: { 'polka-dots': { params: { size: 12 }, tones: { light: lightTone } } } };

  it('未登录 401、普通用户 403（禁止访问）、跨站 403，均不写 KV', async () => {
    expect((await call('PUT', '/api/defaults', { body })).status).toBe(401);
    expect((await call('PUT', '/api/defaults', { email: 'x@y.z', body })).status).toBe(403);
    expect((await call('PUT', '/api/defaults', { email: 'admin@example.com', body, headers: { Origin: 'https://evil.test' } })).status).toBe(403);
    expect(kv.writes).toBe(0);
  });

  it('非法 JSON / 形状 → 400；超大 → 413', async () => {
    const admin = 'admin@example.com';
    expect((await call('PUT', '/api/defaults', { email: admin, raw: '{nope' })).status).toBe(400);
    expect((await call('PUT', '/api/defaults', { email: admin, body: {} })).status).toBe(400);
    expect((await call('PUT', '/api/defaults', { email: admin, body: { defaults: { 'polka-dots': { tones: { sepia: lightTone } } } } })).status).toBe(400);
    expect((await call('PUT', '/api/defaults', { email: admin, body: { defaults: { 'polka-dots': { tones: { light: { elements: [{ id: 'bg', paint: solid('red'), opacity: 1, visible: true }] } } } } } })).status).toBe(400);
    expect((await call('PUT', '/api/defaults', { email: admin, body: { scores: { 'polka-dots|nord': 6 } } })).status).toBe(400);
    expect((await call('PUT', '/api/defaults', { email: admin, raw: 'x'.repeat(DEFAULTS_MAX_BODY_BYTES + 1) })).status).toBe(413);
    expect(kv.writes).toBe(0);
  });

  it('管理员：写进 defaults:v1，GET 读回；只提交 defaults 时不写打分 key', async () => {
    const res = await call('PUT', '/api/defaults', { email: 'admin@example.com', body });
    expect(res.status).toBe(200);
    const j = (await res.json()) as { ok: boolean; patterns: number; scores: number; defaults: DefaultsMap };
    expect(j).toMatchObject({ ok: true, patterns: 1, scores: 0 });
    expect(j.defaults).toEqual(body.defaults);
    expect(kv.writes).toBe(1);
    expect(kv.data.has(ADMIN_SCORES_KV_KEY)).toBe(false);
    const got = (await (await call('GET', '/api/defaults')).json()) as { defaults: DefaultsMap; updatedAt: string };
    expect(got.defaults).toEqual(body.defaults);
    expect(typeof got.updatedAt).toBe('string');
  });

  it('合并：未提交的母题保留；同母题只提交 dark 时 light 保留；null 删除', async () => {
    const admin = 'admin@example.com';
    await call('PUT', '/api/defaults', { email: admin, body: { defaults: { a: { params: { k: 1 }, tones: { light: lightTone } }, b: { params: { k: 2 } } } } });
    await call('PUT', '/api/defaults', { email: admin, body: { defaults: { a: { params: { k: 9 }, tones: { dark: darkTone } }, b: null } } });
    const got = (await (await call('GET', '/api/defaults')).json()) as { defaults: DefaultsMap };
    expect(got.defaults).toEqual({ a: { params: { k: 9 }, tones: { light: lightTone, dark: darkTone } } });
  });

  it('打分：存在 adminScores:v1（与 defaults 分开），0 = 删除；GET /api/admin/scores 仅管理员', async () => {
    const admin = 'admin@example.com';
    const r1 = await call('PUT', '/api/defaults', { email: admin, body: { scores: { 'a|nord': -4, 'a|riso-pop': 2 } } });
    expect(r1.status).toBe(200);
    expect(kv.data.has(DEFAULTS_KV_KEY)).toBe(false);
    await call('PUT', '/api/defaults', { email: admin, body: { scores: { 'a|riso-pop': 0, 'b|nord': 5 } } });
    expect((await call('GET', '/api/admin/scores', { email: 'x@y.z' })).status).toBe(403);
    expect((await call('GET', '/api/admin/scores')).status).toBe(401);
    const j = (await (await call('GET', '/api/admin/scores', { email: admin })).json()) as { scores: Record<string, number> };
    expect(j.scores).toEqual({ 'a|nord': -4, 'b|nord': 5 });
  });
});

describe('纯函数', () => {
  it('validatePutBody 拒绝非对象 / 空 / 非法 id，接受 null 删除', () => {
    expect(typeof validatePutBody([])).toBe('string');
    expect(typeof validatePutBody({ defaults: {} , scores: undefined })).toBe('object');
    expect(typeof validatePutBody({ defaults: { 'UPPER': {} } })).toBe('string');
    expect(validatePutBody({ defaults: { a: null } })).toEqual({ defaults: { a: null } });
    expect(typeof validatePutBody({ defaults: { a: { params: { k: { nested: 1 } } } } })).toBe('string');
    expect(typeof validatePutBody({ defaults: { a: { tones: { light: { elements: [{ id: 'x', paint: solid('#fff'), opacity: 2, visible: true }] } } } } })).toBe('string');
  });

  it('渐变 paint 通过校验并原样保留', () => {
    const lin = { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#000000' }, { offset: 1, color: '#ffffff', opacity: 0.5 }] };
    const v = validatePutBody({ defaults: { a: { tones: { dark: { elements: [{ id: 'sky', paint: lin, opacity: 0.8, visible: false }] } } } } });
    expect(v).toEqual({ defaults: { a: { tones: { dark: { elements: [{ id: 'sky', paint: lin, opacity: 0.8, visible: false }] } } } } });
  });

  it('mergeDefaults 不改入参；params 未提交时保留', () => {
    const base: DefaultsMap = { a: { params: { k: 1 }, tones: { light: lightTone } } };
    const out = mergeDefaults(base, { a: { tones: { dark: darkTone } } });
    expect(out.a).toEqual({ params: { k: 1 }, tones: { light: lightTone, dark: darkTone } });
    expect(base.a.tones).toEqual({ light: lightTone });
  });

  it('mergeScores：0 删除', () => {
    expect(mergeScores({ x: 1, y: -2 }, { x: 0, z: 3 })).toEqual({ y: -2, z: 3 });
  });

  it('sanitizeDefaultsMap 丢弃非法母题、保留合法', () => {
    expect(sanitizeDefaultsMap({ ok: { params: { k: true } }, 'no way': {}, bad: { tones: { light: 1 } } })).toEqual({ ok: { params: { k: true } } });
  });
});
