/**
 * 评分同步状态 —— 纯函数（状态来源：ratings.ts 的 `useRatingSync()`；展示：RatingSyncStatus.tsx）。
 *
 * 四种外观（Rei 2026-10-12）：攒着 / 提交中 / 已提交 / 失败（失败用警示色）。
 */
import { RATING_BATCH_THRESHOLD } from '../shared/ratings-api';

/** 上一次批量提交的结果（按账号存在 localStorage，刷新后仍能看到）。 */
export interface RatingSyncLast {
  /** 毫秒时间戳。 */
  at: number;
  ok: boolean;
  /** 这一批的条数。 */
  count: number;
}

export interface RatingSyncStatus {
  /** 本地队列里待提交的条数（去重后）。 */
  queued: number;
  /** 满多少条批量提交。 */
  threshold: number;
  submitting: boolean;
  last: RatingSyncLast | null;
}

export type RatingSyncPhase = 'queued' | 'submitting' | 'submitted' | 'failed';

export const emptySyncStatus: RatingSyncStatus = {
  queued: 0,
  threshold: RATING_BATCH_THRESHOLD,
  submitting: false,
  last: null,
};

/**
 * 外观判定，优先级：提交中 > 失败（直到下一次成功）> 已提交（上次成功且队列已清空）> 攒着。
 * 上次成功后又攒了新评分 → 回到「攒着」。
 */
export function syncPhase(s: RatingSyncStatus): RatingSyncPhase {
  if (s.submitting) return 'submitting';
  if (s.last && !s.last.ok) return 'failed';
  if (s.last?.ok && s.queued === 0) return 'submitted';
  return 'queued';
}

export const SYNC_PHASE_LABEL: Record<RatingSyncPhase, string> = {
  queued: '评分攒在本地',
  submitting: '评分提交中',
  submitted: '评分已提交',
  failed: '评分提交失败',
};

/** 进度百分比（0~100，超出阈值封顶）。 */
export const syncProgress = (s: RatingSyncStatus): number =>
  Math.min(100, Math.round((s.queued / Math.max(1, s.threshold)) * 100));

const pad = (n: number) => String(n).padStart(2, '0');

/** 「刚刚 / N 分钟前 / N 小时前 / 今天 HH:mm / M月D日 HH:mm」—— 本地时区。 */
export function formatSyncTime(at: number, now: number): string {
  const diff = Math.max(0, now - at);
  const d = new Date(at);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前（${hm}）`;
  const today = new Date(now);
  const sameDay =
    d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  if (sameDay) return `今天 ${hm}`;
  const y = d.getFullYear() === today.getFullYear() ? '' : `${d.getFullYear()}年`;
  return `${y}${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

/** 从 localStorage 读回的值做形状校验。 */
export function sanitizeSyncLast(raw: unknown): RatingSyncLast | null {
  if (!raw || typeof raw !== 'object') return null;
  const { at, ok, count } = raw as Record<string, unknown>;
  if (typeof at !== 'number' || !Number.isFinite(at) || typeof ok !== 'boolean') return null;
  return { at, ok, count: typeof count === 'number' && count >= 0 ? Math.floor(count) : 0 };
}
