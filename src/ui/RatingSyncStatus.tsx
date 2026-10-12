/**
 * 评分同步状态 —— 标题栏里紧跟母题名的小图标 + kumo Popover（Rei 2026-10-12）。
 *
 * 图标随状态变：攒着（云 + 上箭头）/ 提交中（旋转箭头）/ 已提交（云 + 勾）/ 失败（云 + 警告，警示色）。
 * 点开显示：本地已攒 N / 500 + 进度条（kumo Meter）、上次提交时间与结果、正在提交时显示「提交中」。
 * 只对已登录用户显示；状态来自 ratings.ts 的 `useRatingSync()`。
 *
 * ⭐ 选中 / 警示色写在图标上，不与 IconButton ghost 变体的 text-* 类名抢同一属性（见 RatingBar）。
 */
import { useEffect, useState } from 'react';
import { Popover } from '@cloudflare/kumo/components/popover';
import { Meter } from '@cloudflare/kumo/components/meter';
import { ArrowsClockwise, CloudArrowUp, CloudCheck, CloudWarning } from '@phosphor-icons/react';
import { isSignedIn, useAuth } from './auth';
import { IconButton } from './primitives';
import { useRatingSync } from './ratings';
import {
  SYNC_PHASE_LABEL,
  formatSyncTime,
  syncPhase,
  syncProgress,
  type RatingSyncPhase,
} from './rating-sync';

const PHASE_TONE: Record<RatingSyncPhase, string> = {
  queued: 'text-fg-mute',
  submitting: 'text-brand',
  submitted: 'text-success',
  failed: 'text-warning',
};

function PhaseIcon({ phase, size = 16 }: { phase: RatingSyncPhase; size?: number }) {
  const cls = PHASE_TONE[phase];
  if (phase === 'submitting') return <ArrowsClockwise size={size} className={`${cls} motion-safe:animate-spin`} />;
  if (phase === 'submitted') return <CloudCheck size={size} className={cls} />;
  if (phase === 'failed') return <CloudWarning size={size} weight="fill" className={cls} />;
  return <CloudArrowUp size={size} className={cls} />;
}

export function RatingSyncStatus() {
  const auth = useAuth();
  const sync = useRatingSync();
  const [open, setOpen] = useState(false);
  // 弹层打开时每 30 秒刷新「N 分钟前」
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [open]);

  if (!isSignedIn(auth)) return null;
  const phase = syncPhase(sync);
  const label = `${SYNC_PHASE_LABEL[phase]}（本地 ${sync.queued} / ${sync.threshold}）`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        render={
          <IconButton label={label} nativeTitle aria-expanded={open} className="*:pointer-events-none">
            <PhaseIcon phase={phase} />
          </IconButton>
        }
      />
      <Popover.Content side="bottom" sideOffset={6}>
        <div className="grid w-72 gap-3">
          <div className="grid gap-1">
            <p className="flex items-center gap-1.5 text-base font-medium text-fg">
              <span className="flex h-lh items-center">
                <PhaseIcon phase={phase} size={15} />
              </span>
              {SYNC_PHASE_LABEL[phase]}
            </p>
            <p className="text-sm text-fg-mute">评分先攒在本地，满 {sync.threshold} 条自动上传一次。</p>
          </div>

          <Meter
            label="本地已攒"
            value={syncProgress(sync)}
            customValue={`${sync.queued} / ${sync.threshold}`}
          />

          <dl className="grid gap-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="shrink-0 whitespace-nowrap text-fg-mute">上次提交</dt>
              <dd className="text-right text-fg">
                {sync.submitting ? (
                  <span className="text-brand">提交中…</span>
                ) : sync.last ? (
                  <>
                    {formatSyncTime(sync.last.at, now)} ·{' '}
                    <span className={sync.last.ok ? 'text-success' : 'text-warning'}>
                      {sync.last.ok ? `成功（${sync.last.count} 条）` : '失败，下次再试'}
                    </span>
                  </>
                ) : (
                  '还没有提交过'
                )}
              </dd>
            </div>
          </dl>
        </div>
      </Popover.Content>
    </Popover>
  );
}
