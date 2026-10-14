/**
 * 「色板 × 母题」评分接口（契约见 src/shared/ratings-api.ts）。
 *
 *   POST /api/ratings          [{pattern, palette, verdict}, …]（批量；兼容单个对象）→ 合并进 `u:<userhash>`（1 读 ≤1 写）
 *   GET  /api/ratings/mine     当前用户全部评分（只读 `u:<userhash>`）
 *   GET  /api/ratings/summary  [?format=csv] 按母题汇总 good/bad（仅 ADMIN_EMAILS；list `u:` + 逐个 get）
 *
 * ⭐ KV 免费额度 1000 次写/天：每次提交（无论一批多少条）最多 1 次写；合并后与已存完全相同则 0 次写。
 *   前端攒满 500 条才发一次（见 src/ui/rating-queue.ts）。
 * userhash = SHA-256("vw-ratings:" + email) 的前 32 位 hex —— KV 里不存邮箱明文。
 */
import { PALETTES, VIVID_PALETTES } from "../patterns/palettes";
import {
  RATING_BATCH_MAX,
  isRatingId,
  isRatingTone,
  isVerdict,
  pairKey,
  sanitizeDoc,
  splitPairKey,
  type MyRatingsResponse,
  type RatingBatchResponse,
  type RatingSubmit,
  type RatingsDoc,
  type RatingsSummary,
} from "../shared/ratings-api";
import { DEFAULT_PALETTE_ID } from "../shared/defaults-api";
import { getUser } from "./auth";
import { adminEmails, type Env, type KVLike } from "./env";

/** 单个用户文档最多保留的评分条数（超出丢最旧的）。27~40 母题 × ~70 色板 ≈ 2800，留余量。 */
export const MAX_ENTRIES_PER_USER = 5000;
/** 请求体上限：每条 ≤ ~130 字节 × RATING_BATCH_MAX 条，留余量。 */
export const MAX_BODY_BYTES = 192 * 1024;

/** 已知色板 id：展示色板 + 「换一版」专用的高饱和色板。 */
const KNOWN_PALETTES: ReadonlySet<string> = new Set([...PALETTES, ...VIVID_PALETTES].map((p) => p.id).concat(DEFAULT_PALETTE_ID));

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

export async function userHash(email: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vw-ratings:${email.trim().toLowerCase()}`));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

export const userKey = (hash: string) => `u:${hash}`;

async function readDoc(kv: KVLike, key: string): Promise<RatingsDoc> {
  try {
    return sanitizeDoc(await kv.get(key, "json"));
  } catch {
    return {}; // 损坏的 JSON：当作空文档，下次写入覆盖
  }
}

/** 校验请求体。返回错误文案或清洗后的值。 */
export function parseSubmit(raw: unknown): RatingSubmit | string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "body must be a JSON object";
  const { pattern, palette, verdict, tone } = raw as Record<string, unknown>;
  if (!isRatingId(pattern)) return "invalid pattern";
  if (!isRatingId(palette)) return "invalid palette";
  if (!KNOWN_PALETTES.has(palette)) return "unknown palette";
  if (!isVerdict(verdict)) return "invalid verdict";
  if (tone !== undefined && !isRatingTone(tone)) return "invalid tone";
  return tone ? { pattern, palette, verdict, tone } : { pattern, palette, verdict };
}

/**
 * 把一批评分合并进文档（后出现的覆盖先出现的）；返回新文档，或 null 表示与已存完全相同（无需写入）。
 */
export function mergeRatings(doc: RatingsDoc, items: readonly RatingSubmit[], now: number): RatingsDoc | null {
  let next: RatingsDoc | null = null;
  for (const it of items) {
    const k = pairKey(it.pattern, it.palette, it.tone);
    const cur = (next ?? doc)[k];
    if (cur?.v === it.verdict) continue;
    next ??= { ...doc };
    next[k] = { v: it.verdict, ts: now };
  }
  if (!next) return null;
  const keys = Object.keys(next);
  if (keys.length > MAX_ENTRIES_PER_USER) {
    const n = next;
    keys
      .sort((a, b) => n[a].ts - n[b].ts)
      .slice(0, keys.length - MAX_ENTRIES_PER_USER)
      .forEach((old) => delete n[old]);
  }
  return next;
}

/** 单条版本（测试 / 兼容用）。 */
export const mergeRating = (doc: RatingsDoc, pattern: string, palette: string, verdict: "good" | "bad", now: number) =>
  mergeRatings(doc, [{ pattern, palette, verdict }], now);

/** 校验整批：非数组且非对象 → 错误文案；否则拆出合法条目与非法条数。 */
export function parseBatch(raw: unknown): { items: RatingSubmit[]; rejected: number } | string {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : null;
  if (!list) return "body must be a JSON array of ratings";
  if (list.length === 0) return "empty batch";
  if (list.length > RATING_BATCH_MAX) return `batch too large (max ${RATING_BATCH_MAX})`;
  const items: RatingSubmit[] = [];
  let rejected = 0;
  for (const x of list) {
    const p = parseSubmit(x);
    if (typeof p === "string") rejected++;
    else items.push(p);
  }
  return { items, rejected };
}

async function readBody(req: Request): Promise<unknown> {
  const len = Number(req.headers.get("Content-Length") ?? "0");
  if (len > MAX_BODY_BYTES) throw new Error("too large");
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("too large");
  return JSON.parse(text);
}

/** POST /api/ratings —— 批量提交（数组）；兼容单个对象。 */
export async function postRating(req: Request, env: Env): Promise<Response> {
  const user = await getUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.RATINGS) return json({ error: "ratings storage not configured" }, 503);

  let raw: unknown;
  try {
    raw = await readBody(req);
  } catch (e) {
    const big = (e as Error).message === "too large";
    return json({ error: big ? "body too large" : "invalid JSON" }, big ? 413 : 400);
  }
  const parsed = parseBatch(raw);
  if (typeof parsed === "string") return json({ error: parsed }, 400);

  let written = false;
  if (parsed.items.length > 0) {
    const key = userKey(await userHash(user.email));
    const next = mergeRatings(await readDoc(env.RATINGS, key), parsed.items, Date.now());
    if (next) {
      await env.RATINGS.put(key, JSON.stringify(next));
      written = true;
    }
  }
  const body: RatingBatchResponse = { ok: true, accepted: parsed.items.length, rejected: parsed.rejected, written };
  return json(body);
}

/** GET /api/ratings/mine */
export async function getMyRatings(req: Request, env: Env): Promise<Response> {
  const user = await getUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!env.RATINGS) return json({ error: "ratings storage not configured" }, 503);
  const body: MyRatingsResponse = { ratings: await readDoc(env.RATINGS, userKey(await userHash(user.email))) };
  return json(body);
}

/** 汇总所有用户文档（纯函数，便于测试）。 */
export function summarize(docs: readonly RatingsDoc[], now = new Date()): RatingsSummary {
  const patterns: RatingsSummary["patterns"] = {};
  for (const doc of docs) {
    for (const [k, e] of Object.entries(doc)) {
      const pair = splitPairKey(k);
      if (!pair) continue;
      const byPalette = (patterns[pair.pattern] ??= {});
      const c = (byPalette[pair.tone ? `${pair.palette}|${pair.tone}` : pair.palette] ??= { good: 0, bad: 0 });
      c[e.v] += 1;
    }
  }
  return { generatedAt: now.toISOString(), users: docs.length, patterns };
}

export function summaryToCsv(s: RatingsSummary): string {
  const rows = ["pattern,palette,tone,good,bad"];
  for (const pattern of Object.keys(s.patterns).sort()) {
    const byPalette = s.patterns[pattern];
    for (const palette of Object.keys(byPalette).sort()) {
      const c = byPalette[palette];
      const [id, tone = ""] = palette.split("|");
      rows.push(`${pattern},${id},${tone},${c.good},${c.bad}`);
    }
  }
  return rows.join("\n") + "\n";
}

/** GET /api/ratings/summary[?format=csv] —— 仅管理员。 */
export async function getSummary(req: Request, env: Env): Promise<Response> {
  const user = await getUser(req, env);
  if (!user) return json({ error: "unauthorized" }, 401);
  if (!adminEmails(env).includes(user.email.trim().toLowerCase())) return json({ error: "forbidden" }, 403);
  if (!env.RATINGS) return json({ error: "ratings storage not configured" }, 503);

  const kv = env.RATINGS;
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: "u:", cursor, limit: 1000 });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);

  // 逐个 get，小批并发（Worker 单请求子请求数有上限；管理员接口很少用）
  const docs: RatingsDoc[] = [];
  for (let i = 0; i < keys.length; i += 20) {
    docs.push(...(await Promise.all(keys.slice(i, i + 20).map((k) => readDoc(kv, k)))));
  }
  const summary = summarize(docs);

  if (new URL(req.url).searchParams.get("format") === "csv") {
    return new Response(summaryToCsv(summary), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="ratings-summary.csv"',
        "Cache-Control": "no-store",
      },
    });
  }
  return json(summary);
}
