/**
 * 「色板 × 母题」评分条 —— 画布底部居中的小浮条（Rei 2026-10-12）。
 *
 * - 换一版 / 手动切色板后浮出：👍 适合 / 👎 不适合，选中态高亮；再点一次 = 取消。
 * - 约 4 秒无操作自动收起成一个小圆按钮（显示当前选择或中性图标），点它再展开；
 *   鼠标悬停 / 键盘焦点在条内时不收起。
 * - 只对已登录用户显示。选择不是点一下就提交：先进本地队列，满 500 条才批量上传（见 ratings.ts）。
 *
 * ⭐ 定位由 CanvasStage 的 RatingOverlay 负责（锚定图片盒子，与主题浮层同一套 useImageBox）。
 * - 批改模式（仅管理员，Rei 2026-10-14）：换成打分 —— 每对一个整数 −5…+5，👍 +1 / 👎 −1（先抵消对方），
 *   图标角标显示次数；与普通评分完全分开，关闭批改模式时随默认值一起上传。普通模式不变。
 * ⭐ 胶囊外形：外圈 rounded-full + p-1，内圈图标按钮 rounded-full —— 天然同心（Kumo concentric-border-radius）。
 */
import { useEffect, useState, type ReactNode } from 'react';
import { ThumbsDown, ThumbsUp } from '@phosphor-icons/react';
import { isSignedIn, useAuth } from './auth';
import { IconButton } from './primitives';
import { chooseVerdict, installRatingListeners, setRatingOwner, useRatings } from './ratings';
import { bumpAdminScore, useReview } from './admin-review';
import { badCount, goodCount } from '../shared/defaults-api';
import { pairKey } from '../shared/ratings-api';

/** 无操作多久后收起（毫秒）。 */
export const RATING_IDLE_MS = 4000;

export function RatingBar() {
  const auth = useAuth();
  const signedIn = isSignedIn(auth);
  const { state, seq } = useRatings();
  const review = useReview();
  const [open, setOpen] = useState(true);
  const [held, setHeld] = useState(false); // 悬停 / 焦点在条内
  const [poke, setPoke] = useState(0); // 每次交互重置计时

  useEffect(() => {
    installRatingListeners();
  }, []);

  // 登录确认 → 载入本地队列 + 拉历史评分（回显 + 换一版排除 👎）；未登录 → 清空
  const email = auth.status === 'ready' ? (auth.me.user?.email ?? null) : null;
  useEffect(() => {
    if (auth.status === 'loading') return;
    void setRatingOwner(email);
  }, [auth.status, email]);

  // 每次换色板重新展开
  useEffect(() => {
    setOpen(true);
  }, [seq]);

  useEffect(() => {
    if (!open || held) return;
    const t = window.setTimeout(() => setOpen(false), RATING_IDLE_MS);
    return () => window.clearTimeout(t);
  }, [open, held, seq, poke]);

  const current = state.current;
  if (!signedIn || !current) return null;
  const verdict = current.verdict;
  const scoring = review.admin && review.on;
  const score = scoring ? (review.scores[pairKey(current.pattern, current.palette)] ?? 0) : 0;

  const holdProps = {
    onPointerEnter: () => setHeld(true),
    onPointerLeave: () => setHeld(false),
    onFocus: () => setHeld(true),
    onBlur: () => setHeld(false),
  };

  if (!open && scoring) {
    const tone = score > 0 ? 'text-success' : score < 0 ? 'text-danger' : 'text-fg-mute';
    return (
      <span className="inline-flex overflow-hidden rounded-full bg-surface shadow-pop ring-1 ring-line">
        <IconButton
          label={`批改打分：${score > 0 ? `+${score}` : score}（点击展开）`}
          onClick={() => {
            setOpen(true);
            setPoke((n) => n + 1);
          }}
        >
          <span className="relative inline-flex">
            {score < 0 ? (
              <ThumbsDown size={16} weight="fill" className={tone} />
            ) : (
              <ThumbsUp size={16} weight={score > 0 ? 'fill' : 'regular'} className={tone} />
            )}
            <ScoreBadge n={score > 0 ? goodCount(score) : badCount(score)} tone={score > 0 ? 'good' : 'bad'} />
          </span>
        </IconButton>
      </span>
    );
  }

  if (!open) {
    const label =
      verdict === 'good' ? '已评：适合（点击展开评分）' : verdict === 'bad' ? '已评：不适合（点击展开评分）' : '给这套配色评分';
    const tone = verdict === 'good' ? 'text-success' : verdict === 'bad' ? 'text-danger' : 'text-fg-mute';
    return (
      // 圆形外壳在 span 上：IconButton 自带 rounded-sm，同属性类名叠加时谁赢取决于 CSS 生成顺序，不可靠
      <span className="inline-flex overflow-hidden rounded-full bg-surface shadow-pop ring-1 ring-line">
        <IconButton
          label={label}
          onClick={() => {
            setOpen(true);
            setPoke((n) => n + 1);
          }}
        >
          {verdict === 'bad' ? (
            <ThumbsDown size={16} weight="fill" className={tone} />
          ) : (
            <ThumbsUp size={16} weight={verdict ? 'fill' : 'regular'} className={tone} />
          )}
        </IconButton>
      </span>
    );
  }

  if (scoring) {
    const bump = (dir: 'up' | 'down') => {
      bumpAdminScore(current.pattern, current.palette, dir);
      setPoke((n) => n + 1);
    };
    const good = goodCount(score);
    const bad = badCount(score);
    return (
      <div
        role="group"
        aria-label="批改打分：这套配色适合当前母题吗"
        className="flex items-center gap-1 rounded-full bg-surface p-1 pl-4 shadow-pop ring-1 ring-line"
        {...holdProps}
      >
        <span className="whitespace-nowrap pr-1 text-base text-fg-soft">批改打分</span>
        <VerdictButton label={`适合 +1（当前 ${score}）`} active={good > 0} activeClass="bg-success-tint" onClick={() => bump('up')}>
          <span className="relative inline-flex">
            <ThumbsUp size={16} weight={good > 0 ? 'fill' : 'regular'} className={good > 0 ? 'text-success' : 'text-fg-mute'} />
            <ScoreBadge n={good} tone="good" />
          </span>
        </VerdictButton>
        <VerdictButton label={`不适合 −1（当前 ${score}）`} active={bad > 0} activeClass="bg-danger-tint" onClick={() => bump('down')}>
          <span className="relative inline-flex">
            <ThumbsDown size={16} weight={bad > 0 ? 'fill' : 'regular'} className={bad > 0 ? 'text-danger' : 'text-fg-mute'} />
            <ScoreBadge n={bad} tone="bad" />
          </span>
        </VerdictButton>
      </div>
    );
  }

  const pick = (v: 'good' | 'bad') => {
    chooseVerdict(v);
    setPoke((n) => n + 1);
  };

  return (
    <div
      role="group"
      aria-label="这套配色适合当前母题吗"
      className="flex items-center gap-1 rounded-full bg-surface p-1 pl-4 shadow-pop ring-1 ring-line"
      {...holdProps}
    >
      <span className="whitespace-nowrap pr-1 text-base text-fg-soft">这套配色适合吗？</span>
      <VerdictButton label="适合" active={verdict === 'good'} activeClass="bg-success-tint" onClick={() => pick('good')}>
        <ThumbsUp size={16} weight={verdict === 'good' ? 'fill' : 'regular'} className={verdict === 'good' ? 'text-success' : 'text-fg-mute'} />
      </VerdictButton>
      <VerdictButton label="不适合" active={verdict === 'bad'} activeClass="bg-danger-tint" onClick={() => pick('bad')}>
        <ThumbsDown size={16} weight={verdict === 'bad' ? 'fill' : 'regular'} className={verdict === 'bad' ? 'text-danger' : 'text-fg-mute'} />
      </VerdictButton>
    </div>
  );
}

/**
 * 👍 / 👎 单个按钮。圆形裁切在外层 span（同心于胶囊外圈）；选中色写在图标上 ——
 * 不与 IconButton ghost 变体的 text-* / hover:* 类名抢同一属性。
 */
function VerdictButton({
  label,
  active,
  activeClass,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  activeClass: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <span className={`inline-flex overflow-hidden rounded-full ${active ? activeClass : ''}`}>
      <IconButton label={label} aria-pressed={active} onClick={onClick}>
        {children}
      </IconButton>
    </span>
  );
}

/** 打分角标：图标右上角的次数（0 不显示）。纯装饰，数值已在按钮的 aria-label 里。 */
function ScoreBadge({ n, tone }: { n: number; tone: 'good' | 'bad' }) {
  if (n <= 0) return null;
  return (
    <span
      aria-hidden="true"
      className={`absolute -right-2 -top-2 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-2xs tabular-nums leading-none text-on-brand ${
        tone === 'good' ? 'bg-success' : 'bg-danger'
      }`}
    >
      {n}
    </span>
  );
}
