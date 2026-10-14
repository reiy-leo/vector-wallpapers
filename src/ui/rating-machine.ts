/**
 * 「色板 × 母题」评分状态机 —— 纯函数，零副作用（网络 / 定时器在 ratings.ts）。
 *
 * 规则（Rei 2026-10-12）：
 *  - 换色板（换一版 / 手动点色板）后，对「当前 (pattern, palette)」可选 👍 / 👎；
 *    在色板没换之前可随时改（good ↔ bad），再点一次同一个 = 取消。
 *  - **不是每次点击都提交**：当前这一对的最终选择，在下一次换色板或切母题时才产出一条提交；
 *    页面隐藏（visibilitychange=hidden / pagehide）时 `flush` 产出未提交的那一条。
 *    「提交」= 进本地队列（ratings.ts / rating-queue.ts），满 500 条才批量上传。
 *  - 没选择不提交；与已知的（本地队列 + /api/ratings/mine 拉回来的）相同不提交。
 *  - 连续换色板：只提交上一对的最终选择。
 *
 * ⚠️ 取消一个已提交的选择不会产出提交（接口只有 good / bad，没有「撤销」）。
 */
import { pairKey, type RatingTone, type RatingsDoc, type Verdict } from '../shared/ratings-api';

export interface RatingCurrent {
  pattern: string;
  palette: string;
  /** 浅底 / 深底分开评（Rei 2026-10-14）；缺省 = 旧的不分底色。 */
  tone?: RatingTone;
  verdict: Verdict | null;
}

/** 某一对已知的评分：带底色的优先，退回旧的不分底色键。 */
const known = (sub: Readonly<Record<string, Verdict>>, pattern: string, palette: string, tone?: RatingTone): Verdict | null =>
  sub[pairKey(pattern, palette, tone)] ?? (tone ? sub[pairKey(pattern, palette)] : undefined) ?? null;

export interface RatingState {
  /** 当前可评的那一对；null = 评分条不显示（没换过色板 / 刚切了母题）。 */
  current: RatingCurrent | null;
  /** 已知的评分：服务端（/mine）∪ 本地队列 ∪ 本次会话已产出的提交。pairKey → verdict。 */
  submitted: Readonly<Record<string, Verdict>>;
}

export interface RatingCommit {
  pattern: string;
  palette: string;
  tone?: RatingTone;
  verdict: Verdict;
}

export type RatingEvent =
  /** 画布换上了一套新色板（reroll / 手动切换）。 */
  | { type: 'show'; pattern: string; palette: string; tone?: RatingTone }
  /** 用户点了 👍 / 👎（再点同一个 = 取消）。 */
  | { type: 'choose'; verdict: Verdict }
  /** 当前母题变成了 `pattern`（切母题 / 载入收藏等）。 */
  | { type: 'pattern'; pattern: string }
  /** 换了配色但不是来自某套色板（作者配色骨架 / 生成式和声）：提交上一对并隐藏评分条。 */
  | { type: 'clear' }
  /** 页面隐藏：产出未提交的那一条（进本地队列），评分条保持原样（回来还能改）。 */
  | { type: 'flush' }
  /** 已知评分载入：本地队列（登录确认时）或 /api/ratings/mine（随后）。已有的优先，不被覆盖。 */
  | { type: 'loaded'; ratings: RatingsDoc }
  /** 退出登录。 */
  | { type: 'reset' };

export interface Transition {
  state: RatingState;
  commits: RatingCommit[];
}

export const initialRatingState: RatingState = { current: null, submitted: {} };

/** 当前这一对是否有待提交的选择。 */
export function pendingCommit(s: RatingState): RatingCommit | null {
  const c = s.current;
  if (!c || c.verdict === null) return null;
  if (known(s.submitted, c.pattern, c.palette, c.tone) === c.verdict) return null;
  return c.tone
    ? { pattern: c.pattern, palette: c.palette, tone: c.tone, verdict: c.verdict }
    : { pattern: c.pattern, palette: c.palette, verdict: c.verdict };
}

/** 产出待提交的那一条，并（乐观地）记入 submitted。 */
function commitPending(s: RatingState): Transition {
  const p = pendingCommit(s);
  if (!p) return { state: s, commits: [] };
  return {
    state: { ...s, submitted: { ...s.submitted, [pairKey(p.pattern, p.palette, p.tone)]: p.verdict } },
    commits: [p],
  };
}

export function reduceRating(s: RatingState, e: RatingEvent): Transition {
  switch (e.type) {
    case 'show': {
      const c = s.current;
      // 重复套用同一套色板：选择保留，什么也不提交
      if (c && c.pattern === e.pattern && c.palette === e.palette && c.tone === e.tone) return { state: s, commits: [] };
      const t = commitPending(s);
      const prior = known(t.state.submitted, e.pattern, e.palette, e.tone);
      const cur: RatingCurrent = e.tone
        ? { pattern: e.pattern, palette: e.palette, tone: e.tone, verdict: prior }
        : { pattern: e.pattern, palette: e.palette, verdict: prior };
      return {
        state: { ...t.state, current: cur },
        commits: t.commits,
      };
    }
    case 'choose': {
      const c = s.current;
      if (!c) return { state: s, commits: [] };
      const verdict = c.verdict === e.verdict ? null : e.verdict;
      return { state: { ...s, current: { ...c, verdict } }, commits: [] };
    }
    case 'pattern': {
      if (!s.current || s.current.pattern === e.pattern) return { state: s, commits: [] };
      const t = commitPending(s);
      return { state: { ...t.state, current: null }, commits: t.commits };
    }
    case 'clear': {
      if (!s.current) return { state: s, commits: [] };
      const t = commitPending(s);
      return { state: { ...t.state, current: null }, commits: t.commits };
    }
    case 'flush':
      return commitPending(s);
    case 'loaded': {
      const fromServer: Record<string, Verdict> = {};
      for (const [k, entry] of Object.entries(e.ratings)) fromServer[k] = entry.v;
      // 本次会话里刚提交的优先（服务端返回可能比本地慢一步）
      const submitted = { ...fromServer, ...s.submitted };
      const c = s.current;
      const current =
        c && c.verdict === null ? { ...c, verdict: known(submitted, c.pattern, c.palette, c.tone) } : c;
      return { state: { current, submitted }, commits: [] };
    }
    case 'reset':
      return { state: initialRatingState, commits: [] };
  }
}

/**
 * 「换一版」时要排除的色板：该母题里评过 👎 的（含当前这一对尚未提交的 👎 ——
 * 点了 👎 紧接着点换一版，这一次就不该再抽回来）。
 */
export function excludedPalettes(s: RatingState, pattern: string, tone?: RatingTone): Set<string> {
  const out = new Set<string>();
  const prefix = `${pattern}|`;
  for (const [k, v] of Object.entries(s.submitted)) {
    if (!k.startsWith(prefix)) continue;
    const rest = k.slice(prefix.length).split('|');
    // 带底色的只排除同一底色；旧的不分底色键两边都排除
    if (rest.length === 2 && tone && rest[1] !== tone) continue;
    // 同一色板：带底色的判断优先于旧键
    if (known(s.submitted, pattern, rest[0], tone) === 'bad') out.add(rest[0]);
  }
  const c = s.current;
  if (c && c.pattern === pattern && (!tone || !c.tone || c.tone === tone)) {
    if (c.verdict === 'bad') out.add(c.palette);
    // 当前这一对改成了 👍 / 取消：以当前选择为准
    else if (c.verdict === 'good') out.delete(c.palette);
  }
  return out;
}
