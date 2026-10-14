/**
 * 服务器默认值 + 批改模式打分（契约见 src/shared/defaults-api.ts）。
 *
 *   GET /api/defaults       公开；返回 `defaults:v1`（Cache-Control: public, max-age=60）
 *   PUT /api/defaults       仅 ADMIN_EMAILS；{ defaults?, scores? } 合并进 `defaults:v1` / `adminScores:v1`
 *   GET /api/admin/scores   仅 ADMIN_EMAILS；返回 `adminScores:v1`
 *
 * 复用 RATINGS KV 绑定（不需要 Rei 新建资源）。每次 PUT 最多 2 次写（两个 key 各 1 次，未提交的那项不写）。
 */
import {
  ADMIN_SCORES_KV_KEY,
  DEFAULTS_KV_KEY,
  DEFAULTS_MAX_AGE,
  DEFAULTS_MAX_BODY_BYTES,
  DEFAULTS_MAX_DOC_BYTES,
  MAX_SCORES,
  mergeDefaults,
  mergeScores,
  pickTopPalettes,
  rankByScores,
  sanitizeDefaultsMap,
  sanitizeScores,
  validatePutBody,
  type AdminScoresDoc,
  type AdminScoresResponse,
  type DefaultsDoc,
  type DefaultsGetResponse,
  type DefaultsPutResponse,
} from '../shared/defaults-api';
import { getUser } from './auth';
import { adminEmails, type Env, type KVLike } from './env';

const json = (data: unknown, status = 200, cache = 'no-store') =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });

export async function readDefaultsDoc(kv: KVLike): Promise<DefaultsDoc> {
  try {
    const raw = (await kv.get(DEFAULTS_KV_KEY, 'json')) as { defaults?: unknown; updatedAt?: unknown } | null;
    return {
      defaults: sanitizeDefaultsMap(raw?.defaults),
      updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null,
    };
  } catch {
    return { defaults: {}, updatedAt: null };
  }
}

export async function readScoresDoc(kv: KVLike): Promise<AdminScoresDoc> {
  try {
    const raw = (await kv.get(ADMIN_SCORES_KV_KEY, 'json')) as { scores?: unknown; updatedAt?: unknown } | null;
    return { scores: sanitizeScores(raw?.scores), updatedAt: typeof raw?.updatedAt === 'string' ? raw.updatedAt : null };
  } catch {
    return { scores: {}, updatedAt: null };
  }
}

/** 管理员校验：未登录 401 未登录；非管理员 403 禁止访问。返回 null 表示通过。 */
async function requireAdmin(req: Request, env: Env): Promise<Response | null> {
  const user = await getUser(req, env);
  if (!user) return json({ error: 'unauthorized' }, 401);
  if (!adminEmails(env).includes(user.email.trim().toLowerCase())) return json({ error: 'forbidden' }, 403);
  return null;
}

/** GET /api/defaults —— 公开、可短暂缓存。KV 未绑定时返回空覆盖（前端照常用内置默认）。 */
export async function getDefaults(_req: Request, env: Env): Promise<Response> {
  if (!env.RATINGS) return json({ defaults: {}, updatedAt: null, picks: {}, ranks: {} } satisfies DefaultsGetResponse, 200, `public, max-age=${DEFAULTS_MAX_AGE}`);
  const [dDoc, sDoc] = await Promise.all([readDefaultsDoc(env.RATINGS), readScoresDoc(env.RATINGS)]);
  // 打分本身只给管理员看；公开的只有「每个母题 × 底色选中了哪套色板」
  const doc: DefaultsGetResponse = { ...dDoc, picks: pickTopPalettes(sDoc.scores), ranks: rankByScores(sDoc.scores) };
  return json(doc, 200, `public, max-age=${DEFAULTS_MAX_AGE}`);
}

/** GET /api/admin/scores */
export async function getAdminScores(req: Request, env: Env): Promise<Response> {
  const denied = await requireAdmin(req, env);
  if (denied) return denied;
  if (!env.RATINGS) return json({ error: 'storage not configured' }, 503);
  const body: AdminScoresResponse = { scores: (await readScoresDoc(env.RATINGS)).scores };
  return json(body);
}

/** PUT /api/defaults */
export async function putDefaults(req: Request, env: Env): Promise<Response> {
  const denied = await requireAdmin(req, env);
  if (denied) return denied;
  if (!env.RATINGS) return json({ error: 'storage not configured' }, 503);

  let raw: unknown;
  try {
    const len = Number(req.headers.get('Content-Length') ?? '0');
    if (len > DEFAULTS_MAX_BODY_BYTES) return json({ error: 'body too large' }, 413);
    const text = await req.text();
    if (new TextEncoder().encode(text).length > DEFAULTS_MAX_BODY_BYTES) return json({ error: 'body too large' }, 413);
    raw = JSON.parse(text);
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  const body = validatePutBody(raw);
  if (typeof body === 'string') return json({ error: body }, 400);

  const kv = env.RATINGS;
  const updatedAt = new Date().toISOString();
  const [dDoc, sDoc] = await Promise.all([readDefaultsDoc(kv), readScoresDoc(kv)]);

  const defaults = body.defaults ? mergeDefaults(dDoc.defaults, body.defaults) : dDoc.defaults;
  const adminScores = body.scores ? mergeScores(sDoc.scores, body.scores) : sDoc.scores;

  let dText: string | null = null;
  if (body.defaults) {
    dText = JSON.stringify({ defaults, updatedAt } satisfies DefaultsDoc);
    if (new TextEncoder().encode(dText).length > DEFAULTS_MAX_DOC_BYTES) return json({ error: 'defaults document too large' }, 413);
  }
  if (Object.keys(adminScores).length > MAX_SCORES) return json({ error: 'too many scores' }, 413);

  if (dText) await kv.put(DEFAULTS_KV_KEY, dText);
  if (body.scores) await kv.put(ADMIN_SCORES_KV_KEY, JSON.stringify({ scores: adminScores, updatedAt } satisfies AdminScoresDoc));

  const res: DefaultsPutResponse = {
    ok: true,
    patterns: body.defaults ? Object.keys(body.defaults).length : 0,
    scores: body.scores ? Object.keys(body.scores).length : 0,
    updatedAt: body.defaults ? updatedAt : (dDoc.updatedAt ?? updatedAt),
    defaults,
    adminScores,
  };
  return json(res);
}
