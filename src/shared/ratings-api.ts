/**
 * 「色板 × 母题」评分 —— Worker 与前端共用的契约（Rei 2026-10-12）。
 *
 * 用途：筛出不适合某母题的色板。登录用户在「换一版」/ 手动切色板后给当前组合打 👍 / 👎，
 * 自己评过 👎 的色板在该母题的「换一版」里不再抽到；管理员可按母题导出 good/bad 计数。
 *
 * 存储（KV 免费额度 1000 次写/天）：
 *   每个用户一个 key `u:<userhash>`，值为 `RatingsDoc`：{ "<pattern>|<palette>": { v, ts } }。
 *   提交 = 读出 → 合并 → 写回（1 读 1 写；与已存相同则 0 写）。
 *
 * 前端先攒本地队列（localStorage，按 pattern|palette 去重、后写覆盖前写），
 * 累计满 `RATING_BATCH_THRESHOLD` 条才 POST 一个数组批量提交；成功才清队列（Rei 2026-10-12）。
 */

export type Verdict = 'good' | 'bad';

export interface RatingEntry {
  v: Verdict;
  /** 毫秒时间戳（服务端写入时间）。 */
  ts: number;
}

/** 单个用户的全部评分：键为 `pairKey(pattern, palette)`。 */
export type RatingsDoc = Record<string, RatingEntry>;

/** 批量请求里的一条。 */
export interface RatingSubmit {
  pattern: string;
  palette: string;
  verdict: Verdict;
}

/** POST /api/ratings 的请求体：数组（批量）；兼容单个对象。同一对在数组里出现多次时后者覆盖前者。 */
export type RatingBatch = RatingSubmit[];

/** POST /api/ratings 的响应体。 */
export interface RatingBatchResponse {
  ok: true;
  /** 合法并已合并的条数。 */
  accepted: number;
  /** 被跳过的非法条目数（格式错 / 未知色板）——跳过而不是整批拒绝，免得一条脏数据卡死队列。 */
  rejected: number;
  /** 是否写了 KV（合并后与已存完全相同则不写）。 */
  written: boolean;
}

/** 本地队列累计到这么多条（去重后）才批量提交一次。 */
export const RATING_BATCH_THRESHOLD = 500;
/** 单次请求最多条数（队列因失败重试积压超过时分批发）。 */
export const RATING_BATCH_MAX = 1000;

/** GET /api/ratings/mine 的响应体。 */
export interface MyRatingsResponse {
  ratings: RatingsDoc;
}

/** GET /api/ratings/summary 的响应体（仅 ADMIN_EMAILS）。 */
export interface RatingsSummary {
  generatedAt: string;
  /** 参与评分的用户数（= `u:` key 数）。 */
  users: number;
  /** pattern → palette → 计数。 */
  patterns: Record<string, Record<string, { good: number; bad: number }>>;
}

/** 母题 / 色板 id 的形状：小写 kebab-case，≤ 48 字符（与 PatternId、Palette.id 同一命名空间）。 */
export const RATING_ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const RATING_ID_MAX = 48;

export const isRatingId = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= RATING_ID_MAX && RATING_ID_RE.test(v);

export const isVerdict = (v: unknown): v is Verdict => v === 'good' || v === 'bad';

/** 文档内的键。`|` 不在 id 字符集里，天然无歧义。 */
export const pairKey = (pattern: string, palette: string): string => `${pattern}|${palette}`;

export function splitPairKey(key: string): { pattern: string; palette: string } | null {
  const i = key.indexOf('|');
  if (i <= 0) return null;
  const pattern = key.slice(0, i);
  const palette = key.slice(i + 1);
  return isRatingId(pattern) && isRatingId(palette) ? { pattern, palette } : null;
}

/** 从任意 JSON 里清洗出合法的 RatingsDoc（KV 里的旧值 / 损坏值、/mine 响应都过一遍）。 */
export function sanitizeDoc(raw: unknown): RatingsDoc {
  const out: RatingsDoc = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, e] of Object.entries(raw as Record<string, unknown>)) {
    if (!splitPairKey(k) || !e || typeof e !== 'object') continue;
    const { v, ts } = e as { v?: unknown; ts?: unknown };
    if (isVerdict(v)) out[k] = { v, ts: typeof ts === 'number' && Number.isFinite(ts) ? ts : 0 };
  }
  return out;
}

export const RATINGS_ENDPOINT = '/api/ratings';
export const RATINGS_MINE_ENDPOINT = '/api/ratings/mine';
export const RATINGS_SUMMARY_ENDPOINT = '/api/ratings/summary';
