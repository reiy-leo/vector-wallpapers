/**
 * 「色板 × 母题」评分的运行时：external store + 本地队列 + 批量提交（状态机见 rating-machine.ts）。
 *
 * 数据流（Rei 2026-10-12）：
 *   点 👍/👎 → 状态机在「换色板 / 切母题 / 页面隐藏」时产出该对的最终选择
 *   → 进本地队列（localStorage，按 pattern|palette 去重、后写覆盖前写）
 *   → 队列满 500 条才 POST /api/ratings 一个数组（Worker 合并进 u:<userhash>，只写 1 次 KV）
 *   → 成功才清掉已发出的条目，失败整队保留：退避期（30 秒起翻倍，封顶 30 分钟）过后的下一次入队、
 *     或下次登录（刷新页面）时再试。
 *   页面隐藏（visibilitychange=hidden / pagehide）只把当前选择**写进本地队列**，不发网络请求。
 *
 * 换一版的 👎 排除 = /api/ratings/mine 拉到的 ∪ 本地队列（立即生效）∪ 当前尚未入队的 👎。
 *
 * 接入点：
 *  - `noteReroll` / `notePalette`：换一版、色板面板手动套用之后
 *  - `rerollExclusions(patternId)`：换一版之前
 *  - `setRatingOwner(email | null)`：登录状态确认后（评分条组件调用）
 *  - 母题变化：订阅 workbench store 的 patternId，自动收尾上一对
 */
import { useSyncExternalStore } from 'react';
import {
  RATINGS_ENDPOINT,
  RATINGS_MINE_ENDPOINT,
  sanitizeDoc,
  type RatingBatch,
  type Verdict,
} from '../shared/ratings-api';
import {
  excludedPalettes,
  initialRatingState,
  reduceRating,
  type RatingCommit,
  type RatingEvent,
  type RatingState,
} from './rating-machine';
import { enqueueRating, removeSent, shouldSubmit, takeBatch, type RatingQueue } from './rating-queue';
import { adminRerollExclusions, subscribeReview } from './admin-review';
import { DEFAULT_PALETTE_ID } from '../shared/defaults-api';
import { colorsMatchDefault, getBaseServerDefaults, pickedPaletteFor } from './defaults';
import { bgTone } from './coloring';
import { registry } from '../patterns';
import { emptySyncStatus, type RatingSyncLast, type RatingSyncStatus } from './rating-sync';
import {
  getConfig,
  readRatingQueue,
  readRatingSync,
  subscribeToStore,
  writeRatingQueue,
  writeRatingSync,
} from './store';

let state: RatingState = initialRatingState;
/** 换色板的次数：评分条据此在每次换色板后重新展开。 */
let showSeq = 0;
const listeners = new Set<() => void>();

/** 当前登录邮箱（队列的归属）；null = 未登录，不入队。 */
let owner: string | null = null;
/** 内存里的队列（localStorage 不可用时也能在本次会话内攒着）。 */
let queue: RatingQueue = {};
let lastTs = 0;
let inFlight: Promise<void> | null = null;
/** 上一次批量提交的结果。 */
let lastSync: RatingSyncLast | null = null;
/** 失败退避：连续失败次数与下次允许自动重试的时间（避免服务端挂掉时每评一条就打一次请求）。 */
let failStreak = 0;
let retryAt = 0;
/** 退避：30 秒起翻倍，封顶 30 分钟。 */
export const retryDelayMs = (streak: number): number => Math.min(30 * 60_000, 30_000 * 2 ** Math.max(0, streak - 1));

/* ── 同步状态（标题栏的同步图标订阅它） ───────────────────────── */

const syncListeners = new Set<() => void>();
let syncSnapshot: RatingSyncStatus = emptySyncStatus;

/** 重新计算同步状态快照；有变化才通知（快照引用稳定，供 useSyncExternalStore）。 */
function emitSync(): void {
  const next: RatingSyncStatus = {
    queued: Object.keys(queue).length,
    threshold: emptySyncStatus.threshold,
    submitting: inFlight !== null,
    last: lastSync,
  };
  const prev = syncSnapshot;
  if (
    prev.queued === next.queued &&
    prev.submitting === next.submitting &&
    prev.last === next.last &&
    prev.threshold === next.threshold
  ) return;
  syncSnapshot = next;
  syncListeners.forEach((l) => l());
}

export function getRatingSync(): RatingSyncStatus {
  return syncSnapshot;
}

export function subscribeRatingSync(l: () => void): () => void {
  syncListeners.add(l);
  return () => {
    syncListeners.delete(l);
  };
}

export function useRatingSync(): RatingSyncStatus {
  return useSyncExternalStore(subscribeRatingSync, getRatingSync, getRatingSync);
}

/* ── 网络出口（测试可替换） ─────────────────────────────────── */

/** POST 一批；返回是否成功（2xx 且响应 ok）。 */
export type RatingTransport = (batch: RatingBatch) => Promise<boolean>;

const httpTransport: RatingTransport = async (batch) => {
  try {
    const res = await fetch(RATINGS_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(batch),
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: unknown };
    return body.ok === true;
  } catch {
    return false;
  }
};

let transport: RatingTransport = httpTransport;
export function __setRatingTransport(fn: RatingTransport | null): void {
  transport = fn ?? httpTransport;
}

/* ── 队列 ─────────────────────────────────────────────────────── */

const nextTs = () => (lastTs = Math.max(Date.now(), lastTs + 1));

function persist(): void {
  if (owner) writeRatingQueue(owner, queue);
}

function enqueue(c: RatingCommit): void {
  if (!owner) return;
  queue = enqueueRating(queue, c, nextTs());
  persist();
  emitSync();
  void maybeSubmit();
}

/**
 * 队列满阈值就批量提交。同一时间只有一个请求在途；成功后若仍满阈值（积压超过单批上限）继续发下一批。
 * 失败后进入退避期（`retryDelayMs`），期间入队不触发重试；`force`（登录确认时）无视退避。
 * 返回在途请求的 Promise（测试用）。
 */
export function maybeSubmit(force = false): Promise<void> {
  if (inFlight) return inFlight;
  if (!owner || !shouldSubmit(queue)) return Promise.resolve();
  if (!force && Date.now() < retryAt) return Promise.resolve();
  const who = owner;
  const plan = takeBatch(queue);
  inFlight = (async () => {
    const ok = await transport(plan.items);
    inFlight = null;
    if (owner !== who) return emitSync(); // 请求在途时换了账号：结果不归当前账号
    lastSync = { at: Date.now(), ok, count: plan.items.length };
    writeRatingSync(who, lastSync);
    if (ok) {
      queue = removeSent(queue, plan.sent);
      persist();
      failStreak = 0;
      retryAt = 0;
    } else {
      // 失败：整队保留，退避后（或下次登录时）再试
      failStreak++;
      retryAt = Date.now() + retryDelayMs(failStreak);
    }
    emitSync();
    if (ok && shouldSubmit(queue)) await maybeSubmit();
  })();
  emitSync();
  return inFlight;
}

/* ── 状态机驱动 ───────────────────────────────────────────────── */

function dispatch(e: RatingEvent): void {
  const t = reduceRating(state, e);
  if (e.type === 'show' && t.state.current !== state.current) showSeq++;
  const changed = t.state !== state;
  state = t.state;
  for (const c of t.commits) enqueue(c);
  if (changed) listeners.forEach((l) => l());
}

/** 换一版之后：paletteId 为 null（非色板来源）时隐藏评分条。 */
export function noteReroll(patternId: string, paletteId: string | null): void {
  dispatch(paletteId ? { type: 'show', pattern: patternId, palette: paletteId } : { type: 'clear' });
}

/**
 * 画布停在母题自己的默认配色（打开的第一张 / 选母题 / 恢复默认 / 切浅深底）→ 评分条评「默认」这套
 * （Rei 2026-10-14：非批改模式的默认图也要有 👍/👎）。默认展示的是打分选中的色板 → 评那套色板本身。
 * 批改模式里同一位置是 ±5 打分，浅底、深底各算一套。
 */
export function noteDefaultColoring(): void {
  const cfg = getConfig();
  const def = registry.get(cfg.patternId);
  if (!def) return;
  // 默认展示的是打分选中的色板 → 评分条打分的是那套色板本身
  const pickedId = pickedPaletteFor(cfg, def);
  if (pickedId) {
    dispatch({ type: 'show', pattern: cfg.patternId, palette: pickedId });
    return;
  }
  // 「默认」= 上传覆盖 / 内置（不含批改模式待上传叠层：那是正在改的这张，0ca7004）
  if (!colorsMatchDefault(getBaseServerDefaults(), cfg, def, bgTone(cfg, def))) return;
  dispatch({ type: 'show', pattern: cfg.patternId, palette: DEFAULT_PALETTE_ID });
}

/** 色板面板手动套用之后。 */
export function notePalette(patternId: string, paletteId: string): void {
  dispatch({ type: 'show', pattern: patternId, palette: paletteId });
}

export function chooseVerdict(verdict: Verdict): void {
  dispatch({ type: 'choose', verdict });
}

/**
 * 换一版之前：该母题里要排除的色板（服务端 + 本地队列 + 当前未入队的 👎）
 * ∪ 管理员批改模式打分 ≤ −3 的色板（仅管理员本人，见 admin-review.ts）。
 */
export function rerollExclusions(patternId: string): Set<string> {
  const out = excludedPalettes(state, patternId);
  for (const p of adminRerollExclusions(patternId)) out.add(p);
  return out;
}

/** 把当前这一对的选择写进本地队列（页面隐藏时调用；不发网络请求，除非队列恰好满阈值）。 */
export function stashCurrentRating(): void {
  dispatch({ type: 'flush' });
}

/**
 * 登录状态确认后调用：载入该账号的本地队列（立即参与排除），再拉服务端历史评分；
 * 队列若已满阈值（上次提交失败留下的）顺手重试。`null` = 未登录 / 退出登录，清空内存状态。
 */
export async function setRatingOwner(email: string | null): Promise<void> {
  const next = email ? email.trim().toLowerCase() : null;
  if (next === owner) return;
  owner = next;
  queue = {};
  lastSync = null;
  failStreak = 0;
  retryAt = 0;
  dispatch({ type: 'reset' });
  if (!owner) return emitSync();
  queue = readRatingQueue(owner);
  lastSync = readRatingSync(owner);
  emitSync();
  dispatch({ type: 'loaded', ratings: queue });
  await loadMyRatings();
  await maybeSubmit(true);
}

async function loadMyRatings(): Promise<void> {
  const who = owner;
  try {
    const res = await fetch(RATINGS_MINE_ENDPOINT, { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const type = res.headers.get('Content-Type') ?? '';
    if (!res.ok || !type.includes('application/json') || owner !== who) return;
    const body = (await res.json()) as { ratings?: unknown };
    // 状态机里已有的（本地队列 / 本次会话新评的）优先于服务端
    dispatch({ type: 'loaded', ratings: sanitizeDoc(body.ratings) });
  } catch {
    /* 拉不到历史评分：只是少排除一些、不回显，不影响使用 */
  }
}

/* ── 全局监听（只装一次） ────────────────────────────────────── */

let installed = false;

/** 母题变化 → 收尾上一对；页面隐藏 → 当前选择进本地队列。由评分条挂载时调用，幂等。 */
export function installRatingListeners(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  let lastPattern = getConfig().patternId;
  subscribeToStore(() => {
    const p = getConfig().patternId;
    if (p !== lastPattern) {
      lastPattern = p;
      dispatch({ type: 'pattern', pattern: p });
    }
    noteDefaultColoring();
  });
  subscribeReview(noteDefaultColoring);
  noteDefaultColoring();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') stashCurrentRating();
  });
  window.addEventListener('pagehide', stashCurrentRating);
}

/* ── React 绑定 ───────────────────────────────────────────────── */

export interface RatingView {
  state: RatingState;
  seq: number;
}

let view: RatingView = { state, seq: showSeq };
function getView(): RatingView {
  if (view.state !== state || view.seq !== showSeq) view = { state, seq: showSeq };
  return view;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useRatings(): RatingView {
  return useSyncExternalStore(subscribe, getView, getView);
}

export function getRatingState(): RatingState {
  return state;
}

/** 当前内存队列（测试 / 调试用）。 */
export function getRatingQueue(): RatingQueue {
  return queue;
}
