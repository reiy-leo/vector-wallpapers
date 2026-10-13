/**
 * 「服务器默认值」与「批改模式打分」—— Worker 与前端共用的契约（Rei 2026-10-14）。
 *
 * 批改模式（仅 ADMIN_EMAILS）：管理员边调边记，关闭批改模式时一次 PUT 上传：
 *   - defaults：每个母题的默认参数 + 浅底 / 深底各自的默认配色（覆盖内置默认）
 *   - scores：「母题 × 色板」打分，整数 −5…+5（与普通 👍/👎 评分完全分开）
 *
 * 存储（复用 RATINGS KV，不需新建资源）：
 *   `defaults:v1`     → DefaultsDoc（所有人启动时 GET /api/defaults 读取）
 *   `adminScores:v1`  → AdminScoresDoc（仅管理员 GET /api/admin/scores）
 *   两个 key 都不以 `u:` 开头，不会被评分汇总的 list(prefix "u:") 扫到。
 *
 * 数据形状（只存「与内置默认不同」的部分，客户端按内置默认 + 覆盖还原，无损）：
 *   { [patternId]: {
 *       params?: { [controlKey]: number | string | boolean },        // 与控件 default 不同的参数（浅/深底共用）
 *       tones?: { light?: { elements: ElementOverride[] }, dark?: {...} }  // 与内置默认不同的元件；
 *   } }                                                               //   tones.x 存在 = 该底色有覆盖（elements 可为空 = 就是内置默认）
 *
 * PUT 合并规则（未提交的母题保持服务器原值）：
 *   - defaults[p] = null → 删除该母题的覆盖
 *   - params 提交了就整体替换（缺省 key = 控件默认值）；未提交则保留原值
 *   - tones 按底色替换：只提交 light 时 dark 保留原值
 *   - scores[pair] = 0 → 删除该打分
 */
import type { PaintSpec, ParamValue } from '../patterns/types';
import { isHexColor } from './guards';
import { isRatingId, splitPairKey } from './ratings-api';

export type DefaultsTone = 'light' | 'dark';
export const DEFAULTS_TONES: readonly DefaultsTone[] = ['light', 'dark'];

export interface ElementOverride {
  id: string;
  paint: PaintSpec;
  opacity: number;
  visible: boolean;
}

export interface ToneOverride {
  elements: ElementOverride[];
}

export interface PatternDefaults {
  params?: Record<string, ParamValue>;
  tones?: Partial<Record<DefaultsTone, ToneOverride>>;
}

export type DefaultsMap = Record<string, PatternDefaults>;
/** PUT 里 null = 删除该母题的覆盖。 */
export type DefaultsPatch = Record<string, PatternDefaults | null>;

/** 「母题|色板」→ −5…+5 的整数（0 不存）。键同 ratings-api 的 pairKey。 */
export type AdminScores = Record<string, number>;

/** PUT /api/defaults 的请求体。两项都可省略，但至少要有一项。 */
export interface DefaultsPutBody {
  defaults?: DefaultsPatch;
  scores?: AdminScores;
}

/** GET /api/defaults 的响应体（公开）。 */
export interface DefaultsGetResponse {
  defaults: DefaultsMap;
  /** ISO 时间；从未写过为 null。 */
  updatedAt: string | null;
  /** 打分最高的色板（见 pickTopPalettes）：`母题|底色` → 色板 id。旧 Worker 没有这个字段。 */
  picks?: ScorePicks;
}

/** PUT /api/defaults 的响应体。 */
export interface DefaultsPutResponse {
  ok: true;
  /** 本次提交涉及的母题数 / 打分条数。 */
  patterns: number;
  scores: number;
  updatedAt: string;
  /** 合并后的完整默认值（客户端直接替换本地副本，不必等 GET 缓存过期）。 */
  defaults: DefaultsMap;
  /** 合并后的完整打分。 */
  adminScores: AdminScores;
}

/** GET /api/admin/scores 的响应体（仅管理员）。 */
export interface AdminScoresResponse {
  scores: AdminScores;
}

/** KV 里存的文档。 */
export interface DefaultsDoc {
  defaults: DefaultsMap;
  updatedAt: string | null;
}
export interface AdminScoresDoc {
  scores: AdminScores;
  updatedAt: string | null;
}

export const DEFAULTS_ENDPOINT = '/api/defaults';
export const ADMIN_SCORES_ENDPOINT = '/api/admin/scores';
export const DEFAULTS_KV_KEY = 'defaults:v1';
export const ADMIN_SCORES_KV_KEY = 'adminScores:v1';
/** GET /api/defaults 的浏览器缓存秒数。 */
export const DEFAULTS_MAX_AGE = 60;
/** 单次 PUT 请求体上限。 */
export const DEFAULTS_MAX_BODY_BYTES = 512 * 1024;
/** 合并后整份默认值的上限（所有访客启动时都要下载它）。 */
export const DEFAULTS_MAX_DOC_BYTES = 1024 * 1024;

/* ── 打分 ─────────────────────────────────────────────────────── */

export const SCORE_MAX = 5;
/**
 * 打分 ≤ 这个值的色板，在该母题的「换一版」里排除（管理员自己的换一版，与普通 👎 同义）。
 * 取 −3：点一两下 👎 只是「偏弱」，连点三下才算明确不适合；也留出「先 👎 再 👍 抵消」的余地。
 */
export const SCORE_EXCLUDE_AT = -3;

export const clampScore = (n: number): number =>
  Math.max(-SCORE_MAX, Math.min(SCORE_MAX, Math.round(Number.isFinite(n) ? n : 0)));
/**
 * 打分键：「母题 | 色板 | 底色」。同一母题 × 色板在浅底 / 深底下单独打分（Rei 2026-10-14）。
 * 旧的两段键（不分底色）清洗时丢弃。
 */
export type ScoreTone = 'light' | 'dark';
/**
 * 母题自己的默认配色（浅底 / 深底各一套）在打分里的「色板」id（Rei 2026-10-14）。
 * 不是真实色板：普通 👍/👎 不会提交它（Worker 只收已知色板），只用于批改打分。
 */
export const DEFAULT_PALETTE_ID = 'default';
export const scoreKey = (pattern: string, palette: string, tone: ScoreTone): string => `${pattern}|${palette}|${tone}`;

export function splitScoreKey(key: string): { pattern: string; palette: string; tone: ScoreTone } | null {
  const i = key.lastIndexOf('|');
  if (i <= 0) return null;
  const tone = key.slice(i + 1);
  if (tone !== 'light' && tone !== 'dark') return null;
  const pair = splitPairKey(key.slice(0, i));
  return pair ? { ...pair, tone } : null;
}

/** `母题|底色` → 该底色下打分最高的色板 id。 */
export type ScorePicks = Record<string, string>;

/**
 * 默认配色用打分最高的色板（Rei 2026-10-14）：每个「母题 × 底色」取打分最高的那套，
 * 必须 > 0 且唯一；最高的是「默认」本身、并列、或没有正分 → 不选（维持现状：上传覆盖 / 内置）。
 */
export function pickTopPalettes(scores: AdminScores): ScorePicks {
  const best = new Map<string, { palette: string; score: number; tie: boolean }>();
  for (const [k, v] of Object.entries(scores)) {
    const key = splitScoreKey(k);
    if (!key || v <= 0) continue;
    const slot = `${key.pattern}|${key.tone}`;
    const cur = best.get(slot);
    if (!cur || v > cur.score) best.set(slot, { palette: key.palette, score: v, tie: false });
    else if (v === cur.score) cur.tie = true;
  }
  const out: ScorePicks = {};
  for (const [slot, b] of best) if (!b.tie && b.palette !== DEFAULT_PALETTE_ID) out[slot] = b.palette;
  return out;
}

/** 宽松清洗 GET /api/defaults 的 picks：键 `母题|底色`，值色板 id。 */
export function sanitizePicks(raw: unknown): ScorePicks {
  const out: ScorePicks = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const i = k.lastIndexOf('|');
    if (i <= 0 || typeof v !== 'string') continue;
    if (splitScoreKey(`${k.slice(0, i)}|${v}${k.slice(i)}`)) out[k] = v;
  }
  return out;
}

/** 👍：先抵消 👎，封顶 +5。 */
export const scoreUp = (s: number): number => clampScore(s + 1);
/** 👎：先抵消 👍，封底 −5。 */
export const scoreDown = (s: number): number => clampScore(s - 1);
/** 👍 角标数字（>0 才显示）。 */
export const goodCount = (s: number): number => (s > 0 ? s : 0);
/** 👎 角标数字（<0 才显示）。 */
export const badCount = (s: number): number => (s < 0 ? -s : 0);

const isScore = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= -SCORE_MAX && v <= SCORE_MAX;

/**
 * 宽松清洗（KV 旧值 / 响应 / localStorage）：丢掉非法条目和 0。
 * `keepZero`：待上传的补丁里 0 有意义（= 让服务器删除该条），要保留。
 */
export function sanitizeScores(raw: unknown, keepZero = false): AdminScores {
  const out: AdminScores = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (splitScoreKey(k) && isScore(v) && (keepZero || v !== 0)) out[k] = v;
  }
  return out;
}

/** 合并打分：patch 覆盖 base，0 = 删除。 */
export function mergeScores(base: AdminScores, patch: AdminScores): AdminScores {
  const out: AdminScores = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === 0) delete out[k];
    else out[k] = v;
  }
  return out;
}

/* ── 默认值校验 ───────────────────────────────────────────────── */

/** 元件 id / 控件 key：字母数字下划线连字符，≤ 48。 */
export const DEFAULTS_KEY_RE = /^[A-Za-z0-9_-]{1,48}$/;
const MAX_ELEMENTS = 200;
const MAX_STOPS = 32;
const MAX_PARAMS = 100;
const MAX_STRING_PARAM = 64;
export const MAX_DEFAULTS_PATTERNS = 1000;
export const MAX_SCORES = 20000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function parsePaint(raw: unknown): PaintSpec | null {
  if (!isObj(raw)) return null;
  if (raw.type === 'none') return { type: 'none' };
  if (raw.type === 'solid') return isHexColor(raw.color) ? { type: 'solid', color: raw.color } : null;
  if (raw.type !== 'linear' && raw.type !== 'radial') return null;
  if (!Array.isArray(raw.stops) || raw.stops.length === 0 || raw.stops.length > MAX_STOPS) return null;
  const stops = [];
  for (const s of raw.stops) {
    if (!isObj(s) || !fin(s.offset) || !isHexColor(s.color)) return null;
    if (s.opacity !== undefined && !fin(s.opacity)) return null;
    stops.push(s.opacity === undefined ? { offset: s.offset, color: s.color } : { offset: s.offset, color: s.color, opacity: s.opacity });
  }
  if (raw.type === 'linear') return fin(raw.angle) ? { type: 'linear', angle: raw.angle, stops } : null;
  return fin(raw.cx) && fin(raw.cy) && fin(raw.r) ? { type: 'radial', cx: raw.cx, cy: raw.cy, r: raw.r, stops } : null;
}

function parseTone(raw: unknown): ToneOverride | null {
  if (!isObj(raw) || !Array.isArray(raw.elements) || raw.elements.length > MAX_ELEMENTS) return null;
  const elements: ElementOverride[] = [];
  const seen = new Set<string>();
  for (const e of raw.elements) {
    if (!isObj(e) || typeof e.id !== 'string' || !DEFAULTS_KEY_RE.test(e.id) || seen.has(e.id)) return null;
    const paint = parsePaint(e.paint);
    if (!paint || !fin(e.opacity) || e.opacity < 0 || e.opacity > 1 || typeof e.visible !== 'boolean') return null;
    seen.add(e.id);
    elements.push({ id: e.id, paint, opacity: e.opacity, visible: e.visible });
  }
  return { elements };
}

/** 严格解析一个母题的覆盖；任一字段非法 → null。 */
export function parsePatternDefaults(raw: unknown): PatternDefaults | null {
  if (!isObj(raw)) return null;
  const out: PatternDefaults = {};
  if (raw.params !== undefined) {
    if (!isObj(raw.params)) return null;
    const entries = Object.entries(raw.params);
    if (entries.length > MAX_PARAMS) return null;
    const params: Record<string, ParamValue> = {};
    for (const [k, v] of entries) {
      if (!DEFAULTS_KEY_RE.test(k)) return null;
      if (fin(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= MAX_STRING_PARAM)) params[k] = v;
      else return null;
    }
    out.params = params;
  }
  if (raw.tones !== undefined) {
    if (!isObj(raw.tones)) return null;
    const tones: Partial<Record<DefaultsTone, ToneOverride>> = {};
    for (const [k, v] of Object.entries(raw.tones)) {
      if (k !== 'light' && k !== 'dark') return null;
      const t = parseTone(v);
      if (!t) return null;
      tones[k] = t;
    }
    out.tones = tones;
  }
  return out;
}

/** 严格校验 PUT 请求体：返回清洗后的值，或给人看的错误文案（→ 400 请求无效）。 */
export function validatePutBody(raw: unknown): DefaultsPutBody | string {
  if (!isObj(raw)) return 'body must be a JSON object';
  const out: DefaultsPutBody = {};
  if (raw.defaults !== undefined) {
    if (!isObj(raw.defaults)) return 'defaults must be an object';
    const entries = Object.entries(raw.defaults);
    if (entries.length > MAX_DEFAULTS_PATTERNS) return 'too many patterns';
    const patch: DefaultsPatch = {};
    for (const [id, v] of entries) {
      if (!isRatingId(id)) return `invalid pattern id: ${String(id).slice(0, 60)}`;
      if (v === null) {
        patch[id] = null;
        continue;
      }
      const p = parsePatternDefaults(v);
      if (!p) return `invalid defaults for ${id}`;
      patch[id] = p;
    }
    out.defaults = patch;
  }
  if (raw.scores !== undefined) {
    if (!isObj(raw.scores)) return 'scores must be an object';
    const entries = Object.entries(raw.scores);
    if (entries.length > MAX_SCORES) return 'too many scores';
    const scores: AdminScores = {};
    for (const [k, v] of entries) {
      if (!splitScoreKey(k)) return `invalid score key: ${k.slice(0, 100)}`;
      if (!isScore(v)) return `invalid score for ${k}`;
      scores[k] = v;
    }
    out.scores = scores;
  }
  if (out.defaults === undefined && out.scores === undefined) return 'nothing to update';
  return out;
}

/** 宽松清洗整份默认值（KV 旧值 / GET 响应 / localStorage）：非法母题整条丢弃。 */
export function sanitizeDefaultsMap(raw: unknown): DefaultsMap {
  const out: DefaultsMap = {};
  if (!isObj(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!isRatingId(id)) continue;
    const p = parsePatternDefaults(v);
    if (p) out[id] = p;
  }
  return out;
}

/** 合并（规则见文件头）。不改动入参。 */
export function mergeDefaults(base: DefaultsMap, patch: DefaultsPatch): DefaultsMap {
  const out: DefaultsMap = { ...base };
  for (const [id, p] of Object.entries(patch)) {
    if (p === null) {
      delete out[id];
      continue;
    }
    const cur = out[id] ?? {};
    const next: PatternDefaults = {};
    const params = p.params ?? cur.params;
    if (params) next.params = params;
    const tones = { ...cur.tones, ...p.tones };
    if (Object.keys(tones).length > 0) next.tones = tones;
    out[id] = next;
  }
  return out;
}

/** 母题数（PUT 通知用）。 */
export const countPatterns = (m: DefaultsPatch): number => Object.keys(m).length;
