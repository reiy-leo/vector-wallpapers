/**
 * 批改模式（Rei 2026-10-14，仅 ADMIN_EMAILS 账号）。
 *
 * 开着时：
 *   - 每次画布配置变化 → 把当前母题的「参数 + 当前底色（浅/深）的配色」记进待上传表
 *     （参数浅深共用；配色按 bgTone 分开存），与当前生效默认完全相同则不记。
 *   - 待上传表即时叠到默认值上（defaults.ts 的 overlay）：切底色 / 恢复默认马上看到自己刚改的。
 *   - 评分条变成打分：每个「母题 × 色板 × 底色（浅/深）」一个整数 −5…+5（👍 +1、👎 −1，先互相抵消），与普通评分分开。
 *   - 开关与待上传表按邮箱存 localStorage（经 store），刷新不丢。
 * 关掉时：PUT /api/defaults { defaults, scores }；成功 → 清空待上传、通知「默认值已更新到服务器（N 个母题）」；
 *   失败 → 保留待上传、保持开启、返回带中文释义的状态码（如「403 禁止访问」）。
 *
 * 所有人启动时：`loadDefaults()` 非阻塞拉 GET /api/defaults，到达后首屏未动过的默认画布换成覆盖后的默认。
 */
import { useSyncExternalStore } from 'react';
import { registry } from '../patterns';
import { httpStatusText } from '../shared/http-status';
import {
  ADMIN_SCORES_ENDPOINT,
  DEFAULTS_ENDPOINT,
  SCORE_EXCLUDE_AT,
  mergeDefaults,
  mergeScores,
  sanitizeDefaultsMap,
  sanitizeScores,
  scoreDown,
  scoreKey,
  scoreUp,
  splitScoreKey,
  type ScoreTone,
  type AdminScores,
  type DefaultsMap,
  type DefaultsPutBody,
  type PatternDefaults,
} from '../shared/defaults-api';
import { bgTone } from './coloring';
import {
  builtinTone,
  colorsMatchDefault,
  getEffectiveDefaults,
  getServerDefaultsUpdatedAt,
  paramsWith,
  recordFromConfig,
  setDefaultsOverlay,
  setServerDefaults,
} from './defaults';
import {
  getConfig,
  readDefaultsStamp,
  readReviewState,
  refreshUntouchedDefault,
  subscribeToStore,
  writeDefaultsStamp,
  writeReviewState,
} from './store';
import type { PatternConfig } from '../engine/types';
import type { PatternDef } from '../patterns/types';

/* ── 纯函数（测试直接用） ─────────────────────────────────────── */

/**
 * 把一张配置记进待上传表。返回新表；与当前生效默认（effective）完全相同且该母题尚无待上传 → 返回原表（不记）。
 */
export function recordPending(pending: DefaultsMap, effective: DefaultsMap, cfg: PatternConfig, def: PatternDef): DefaultsMap {
  const tone = bgTone(cfg, def);
  const rec = recordFromConfig(cfg, def);
  if (!pending[def.id] && sameAsEffective(effective, cfg, def, tone)) return pending;
  const cur: PatternDefaults = pending[def.id] ?? {};
  const next: PatternDefaults = { params: rec.params, tones: { ...cur.tones, [tone]: { elements: rec.elements } } };
  return { ...pending, [def.id]: next };
}

/** cfg 的参数与当前底色配色是否与生效默认一致。 */
function sameAsEffective(effective: DefaultsMap, cfg: PatternConfig, def: PatternDef, tone: 'light' | 'dark'): boolean {
  const entry = effective[def.id];
  const params = paramsWith(def, entry?.params);
  if (def.controls.some((c) => cfg.params[c.key] !== params[c.key])) return false;
  return colorsAreDefault(effective, cfg, def, tone);
}

/** cfg 当前底色的配色（颜色 / 不透明度 / 显隐）是否就是该底色的生效默认配色（不看参数）。 */
export function colorsAreDefault(effective: DefaultsMap, cfg: PatternConfig, def: PatternDef, tone: 'light' | 'dark'): boolean {
  const entry = effective[def.id];
  // 待上传 / 记录判断：该底色没有覆盖、又不是内置底色 → 视为改动（切底色后要记下来）
  if (!entry?.tones?.[tone] && tone !== builtinTone(def)) return false;
  return colorsMatchDefault(effective, cfg, def, tone);
}

/** 打分：+1 / −1，先抵消对方，封顶 ±5。浅底 / 深底各自独立。 */
export function bumpScoreIn(scores: AdminScores, pattern: string, palette: string, tone: ScoreTone, dir: 'up' | 'down', base = 0): number {
  const cur = scores[scoreKey(pattern, palette, tone)] ?? base;
  return dir === 'up' ? scoreUp(cur) : scoreDown(cur);
}

/** 某母题在某底色下打分 ≤ SCORE_EXCLUDE_AT（−3）的色板 —— 换一版排除。 */
export function scoreExclusions(scores: AdminScores, pattern: string, tone: ScoreTone): Set<string> {
  const out = new Set<string>();
  for (const [k, v] of Object.entries(scores)) {
    const key = splitScoreKey(k);
    if (key && key.pattern === pattern && key.tone === tone && v <= SCORE_EXCLUDE_AT) out.add(key.palette);
  }
  return out;
}

/* ── 运行时状态 ───────────────────────────────────────────────── */

export interface ReviewView {
  /** 当前账号是管理员（能看到开关）。 */
  admin: boolean;
  on: boolean;
  submitting: boolean;
  /** 待上传的母题数 / 打分条数。 */
  pendingPatterns: number;
  pendingScores: number;
  /** 服务器打分 ∪ 待上传（0 已去掉），评分条回显用。 */
  scores: AdminScores;
}

let owner: string | null = null;
let on = false;
let submitting = false;
let pending: DefaultsMap = {};
let pendingScores: AdminScores = {};
let serverScores: AdminScores = {};
let view: ReviewView = { admin: false, on: false, submitting: false, pendingPatterns: 0, pendingScores: 0, scores: {} };
const listeners = new Set<() => void>();

function emit(): void {
  view = {
    admin: owner !== null,
    on,
    submitting,
    pendingPatterns: Object.keys(pending).length,
    pendingScores: Object.keys(pendingScores).length,
    scores: sanitizeScores(mergeScores(serverScores, pendingScores)),
  };
  listeners.forEach((l) => l());
}

function persist(): void {
  if (owner) writeReviewState(owner, { on, pending, scores: pendingScores });
}

function syncOverlay(): void {
  setDefaultsOverlay(on ? pending : null);
}

export function useReview(): ReviewView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
    () => view,
  );
}

export const getReview = (): ReviewView => view;

/** 非 React 订阅（ratings.ts 用：批改模式开关变化时检查是否停在默认配色）。 */
export function subscribeReview(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** 正在批改打分，且画布停在当前母题、当前底色的默认配色上 → 该打分「默认」这套。 */
export function atDefaultColoring(cfg: PatternConfig): boolean {
  if (!owner || !on) return false;
  const def = registry.get(cfg.patternId);
  return !!def && colorsMatchDefault(getEffectiveDefaults(), cfg, def, bgTone(cfg, def));
}

/* ── 网络 ─────────────────────────────────────────────────────── */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
let fetcher: FetchLike = (i, init) => fetch(i, init);
/** 测试替换网络出口。 */
export function __setReviewFetch(fn: FetchLike | null): void {
  fetcher = fn ?? ((i, init) => fetch(i, init));
}

/**
 * 启动时调用（不阻塞首屏）：拉服务器默认值；若比本机上次上传的旧（浏览器缓存未过期），强制绕过缓存再拉一次。
 */
export async function loadDefaults(): Promise<void> {
  const get = async (cache?: RequestCache) => {
    const res = await fetcher(DEFAULTS_ENDPOINT, { credentials: 'same-origin', headers: { Accept: 'application/json' }, cache });
    const type = res.headers.get('Content-Type') ?? '';
    if (!res.ok || !type.includes('application/json')) return null; // 纯 vite 预览没有 Worker
    const body = (await res.json()) as { defaults?: unknown; updatedAt?: unknown };
    return { defaults: sanitizeDefaultsMap(body.defaults), updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : null };
  };
  try {
    let doc = await get();
    const stamp = readDefaultsStamp();
    if (doc && stamp && (!doc.updatedAt || doc.updatedAt < stamp)) doc = (await get('reload')) ?? doc;
    if (!doc) return;
    setServerDefaults(doc.defaults, doc.updatedAt);
    refreshUntouchedDefault();
  } catch {
    /* 拉不到：继续用内置默认 */
  }
}

async function loadServerScores(who: string): Promise<void> {
  try {
    const res = await fetcher(ADMIN_SCORES_ENDPOINT, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const type = res.headers.get('Content-Type') ?? '';
    if (!res.ok || !type.includes('application/json') || owner !== who) return;
    serverScores = sanitizeScores(((await res.json()) as { scores?: unknown }).scores);
    emit();
  } catch {
    /* 拉不到：只是回显 / 排除少一些 */
  }
}

/* ── 账号 ─────────────────────────────────────────────────────── */

/** 登录状态确认后调用：管理员 → 载入其批改状态；否则清空。 */
export function setReviewOwner(email: string | null, admin: boolean): void {
  const next = email && admin ? email.trim().toLowerCase() : null;
  if (next === owner) return;
  owner = next;
  serverScores = {};
  if (owner) {
    const s = readReviewState(owner);
    on = s.on;
    pending = s.pending;
    pendingScores = s.scores;
    void loadServerScores(owner);
  } else {
    on = false;
    pending = {};
    pendingScores = {};
  }
  syncOverlay();
  emit();
}

/* ── 记录 ─────────────────────────────────────────────────────── */

let installed = false;
let lastCfg: PatternConfig | null = null;

function onStoreChange(): void {
  const cfg = getConfig();
  if (cfg === lastCfg) return;
  lastCfg = cfg;
  if (!on || !owner) return;
  const def = registry.get(cfg.patternId);
  if (!def) return;
  const next = recordPending(pending, getEffectiveDefaults(), cfg, def);
  if (next === pending) return;
  pending = next;
  persist();
  syncOverlay();
  emit();
}

/** 订阅画布配置（幂等）。 */
export function installReviewListeners(): void {
  if (installed) return;
  installed = true;
  lastCfg = getConfig();
  subscribeToStore(onStoreChange);
}

/* ── 打分 ─────────────────────────────────────────────────────── */

export function getAdminScore(pattern: string, palette: string, tone: ScoreTone): number {
  return view.scores[scoreKey(pattern, palette, tone)] ?? 0;
}

export function bumpAdminScore(pattern: string, palette: string, tone: ScoreTone, dir: 'up' | 'down'): number {
  if (!owner) return 0;
  const s = bumpScoreIn(view.scores, pattern, palette, tone, dir);
  pendingScores = { ...pendingScores, [scoreKey(pattern, palette, tone)]: s };
  persist();
  emit();
  return s;
}

/** 换一版排除：管理员在当前底色下打分 ≤ −3 的色板（不论批改模式开关；非管理员为空集）。 */
export function adminRerollExclusions(pattern: string): Set<string> {
  if (!owner) return new Set();
  const cfg = getConfig();
  const def = registry.get(cfg.patternId);
  if (!def || def.id !== pattern) return new Set();
  return scoreExclusions(view.scores, pattern, bgTone(cfg, def));
}

/* ── 开关 ─────────────────────────────────────────────────────── */

export type ReviewToggleResult =
  | { ok: true; on: boolean; patterns: number; scores: number; uploaded: boolean }
  | { ok: false; error: string };

/**
 * 打开：直接打开（开始记录）。关闭：有待上传 → PUT；成功才关闭并清空，失败保持开启。
 */
export async function setReviewMode(next: boolean): Promise<ReviewToggleResult> {
  if (!owner) return { ok: false, error: '仅管理员可用' };
  if (submitting) return { ok: false, error: '正在上传，请稍候' };
  if (next) {
    on = true;
    lastCfg = getConfig();
    persist();
    syncOverlay();
    emit();
    return { ok: true, on: true, patterns: 0, scores: 0, uploaded: false };
  }
  const nPatterns = Object.keys(pending).length;
  const nScores = Object.keys(pendingScores).length;
  if (nPatterns === 0 && nScores === 0) {
    on = false;
    persist();
    syncOverlay();
    emit();
    return { ok: true, on: false, patterns: 0, scores: 0, uploaded: false };
  }

  const who = owner;
  const body: DefaultsPutBody = {};
  if (nPatterns > 0) body.defaults = pending;
  if (nScores > 0) body.scores = pendingScores;
  const sentPending = pending;
  const sentScores = pendingScores;
  submitting = true;
  emit();
  try {
    let res: Response;
    try {
      res = await fetcher(DEFAULTS_ENDPOINT, {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: '网络错误（未收到服务器响应）' };
    }
    if (!res.ok) {
      let detail = '';
      try {
        const j = (await res.json()) as { error?: unknown };
        if (typeof j.error === 'string') detail = `：${j.error}`;
      } catch {
        /* 非 JSON */
      }
      return { ok: false, error: `${httpStatusText(res.status)}${detail}` };
    }
    const j = (await res.json()) as { defaults?: unknown; adminScores?: unknown; updatedAt?: unknown };
    if (owner !== who) return { ok: false, error: '上传期间切换了账号' };
    const updatedAt = typeof j.updatedAt === 'string' ? j.updatedAt : getServerDefaultsUpdatedAt();
    // 服务器返回的是合并后的全量；兜底时用本地合并
    const merged = j.defaults !== undefined ? sanitizeDefaultsMap(j.defaults) : mergeDefaults(getEffectiveDefaults(), sentPending);
    setServerDefaults(merged, updatedAt);
    if (updatedAt && nPatterns > 0) writeDefaultsStamp(updatedAt);
    serverScores = j.adminScores !== undefined ? sanitizeScores(j.adminScores) : sanitizeScores(mergeScores(serverScores, sentScores));
    // 上传期间又记下的改动（理论上 UI 不允许）保留
    pending = Object.fromEntries(Object.entries(pending).filter(([k, v]) => sentPending[k] !== v));
    pendingScores = Object.fromEntries(Object.entries(pendingScores).filter(([k, v]) => sentScores[k] !== v));
    on = false;
    persist();
    syncOverlay();
    return { ok: true, on: false, patterns: nPatterns, scores: nScores, uploaded: true };
  } finally {
    submitting = false;
    emit();
  }
}
