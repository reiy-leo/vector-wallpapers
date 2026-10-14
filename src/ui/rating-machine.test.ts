/**
 * 「色板 × 母题」评分状态机：选择 / 改选 / 取消 / 换色板时产出提交 / 页面隐藏 flush / 排除 👎。
 * 纯函数测试 —— 用的就是 ratings.ts 运行时调用的同一个 reduceRating。
 */
import { describe, expect, it } from 'vitest';
import {
  excludedPalettes,
  initialRatingState,
  pendingCommit,
  reduceRating,
  type RatingCommit,
  type RatingEvent,
  type RatingState,
} from './rating-machine';

/** 依次喂事件，收集全部提交。 */
function run(events: RatingEvent[], from: RatingState = initialRatingState) {
  let s = from;
  const commits: RatingCommit[] = [];
  for (const e of events) {
    const t = reduceRating(s, e);
    s = t.state;
    commits.push(...t.commits);
  }
  return { s, commits };
}

const show = (pattern: string, palette: string): RatingEvent => ({ type: 'show', pattern, palette });
const good: RatingEvent = { type: 'choose', verdict: 'good' };
const bad: RatingEvent = { type: 'choose', verdict: 'bad' };

describe('评分状态机', () => {
  it('没换过色板时不能选择、也不提交', () => {
    const { s, commits } = run([good, { type: 'flush' }]);
    expect(s.current).toBeNull();
    expect(commits).toEqual([]);
  });

  it('选择不立即提交；下一次换色板时才提交上一对的最终选择', () => {
    const a = run([show('p1', 'nord'), good]);
    expect(a.commits).toEqual([]);
    expect(a.s.current).toEqual({ pattern: 'p1', palette: 'nord', verdict: 'good' });
    const b = run([show('p1', 'dracula')], a.s);
    expect(b.commits).toEqual([{ pattern: 'p1', palette: 'nord', verdict: 'good' }]);
    expect(b.s.current).toEqual({ pattern: 'p1', palette: 'dracula', verdict: null });
  });

  it('改选 good → bad：只提交最终的 bad', () => {
    const { commits } = run([show('p1', 'nord'), good, bad, show('p1', 'monet')]);
    expect(commits).toEqual([{ pattern: 'p1', palette: 'nord', verdict: 'bad' }]);
  });

  it('再点一次同一个 = 取消；取消后换色板不提交', () => {
    const { s, commits } = run([show('p1', 'nord'), good, good]);
    expect(s.current?.verdict).toBeNull();
    expect(run([show('p1', 'monet')], s).commits).toEqual([]);
    expect(commits).toEqual([]);
  });

  it('没选择就换色板：不提交', () => {
    expect(run([show('p1', 'a1'), show('p1', 'a2'), show('p1', 'a3')]).commits).toEqual([]);
  });

  it('连续换色板：每次只提交上一对', () => {
    const { commits } = run([show('p1', 'a1'), bad, show('p1', 'a2'), show('p1', 'a3'), good, show('p1', 'a4')]);
    expect(commits).toEqual([
      { pattern: 'p1', palette: 'a1', verdict: 'bad' },
      { pattern: 'p1', palette: 'a3', verdict: 'good' },
    ]);
  });

  it('重复套用同一套色板：选择保留、不提交', () => {
    const { s, commits } = run([show('p1', 'nord'), bad, show('p1', 'nord')]);
    expect(commits).toEqual([]);
    expect(s.current?.verdict).toBe('bad');
  });

  it('切母题时提交上一对并隐藏评分条；同母题的 pattern 事件不动作', () => {
    const same = run([show('p1', 'nord'), good, { type: 'pattern', pattern: 'p1' }]);
    expect(same.commits).toEqual([]);
    expect(same.s.current?.verdict).toBe('good');
    const { s, commits } = run([{ type: 'pattern', pattern: 'p2' }], same.s);
    expect(commits).toEqual([{ pattern: 'p1', palette: 'nord', verdict: 'good' }]);
    expect(s.current).toBeNull();
  });

  it('非色板来源的换一版（clear）：提交上一对并隐藏', () => {
    const { s, commits } = run([show('p1', 'nord'), bad, { type: 'clear' }]);
    expect(commits).toEqual([{ pattern: 'p1', palette: 'nord', verdict: 'bad' }]);
    expect(s.current).toBeNull();
  });

  it('flush（页面隐藏）提交未提交的那一条，评分条保持；之后同一选择不重复提交，改选后再提交', () => {
    const a = run([show('p1', 'nord'), good, { type: 'flush' }]);
    expect(a.commits).toEqual([{ pattern: 'p1', palette: 'nord', verdict: 'good' }]);
    expect(a.s.current?.verdict).toBe('good');
    // 回到页面后直接换色板：已提交过 good → 不重复
    expect(run([{ type: 'flush' }, show('p1', 'monet')], a.s).commits).toEqual([]);
    // 回到页面改成 bad → 换色板时提交 bad
    expect(run([bad, show('p1', 'monet')], a.s).commits).toEqual([{ pattern: 'p1', palette: 'nord', verdict: 'bad' }]);
  });

  it('与服务端已有评分相同则不提交；新换上的色板回显历史选择', () => {
    const loaded = run([{ type: 'loaded', ratings: { 'p1|nord': { v: 'bad', ts: 1 } } }]);
    const shown = run([show('p1', 'nord')], loaded.s);
    expect(shown.s.current?.verdict).toBe('bad');
    expect(pendingCommit(shown.s)).toBeNull();
    expect(run([show('p1', 'monet')], shown.s).commits).toEqual([]);
    // 改成 good 才提交
    expect(run([good, show('p1', 'monet')], shown.s).commits).toEqual([{ pattern: 'p1', palette: 'nord', verdict: 'good' }]);
  });

  it('loaded 晚于 show 到达：给尚未选择的当前一对回显，已选择的不覆盖', () => {
    const r = { 'p1|nord': { v: 'good' as const, ts: 1 } };
    expect(run([show('p1', 'nord'), { type: 'loaded', ratings: r }]).s.current?.verdict).toBe('good');
    expect(run([show('p1', 'nord'), bad, { type: 'loaded', ratings: r }]).s.current?.verdict).toBe('bad');
  });

  it('reset（退出登录）清空一切', () => {
    const { s } = run([show('p1', 'nord'), bad, show('p1', 'x'), { type: 'reset' }]);
    expect(s).toEqual(initialRatingState);
  });
});

describe('换一版排除 👎', () => {
  it('只排除本母题评过 bad 的色板；当前未提交的 bad 也算', () => {
    const { s } = run([
      { type: 'loaded', ratings: { 'p1|nord': { v: 'bad', ts: 1 }, 'p1|monet': { v: 'good', ts: 1 }, 'p2|klimt': { v: 'bad', ts: 1 } } },
      show('p1', 'dracula'),
      bad,
    ]);
    expect([...excludedPalettes(s, 'p1')].sort()).toEqual(['dracula', 'nord']);
    expect([...excludedPalettes(s, 'p2')]).toEqual(['klimt']);
    expect(excludedPalettes(s, 'p3').size).toBe(0);
  });

  it('当前把历史 bad 改成 good：立即不再排除', () => {
    const { s } = run([{ type: 'loaded', ratings: { 'p1|nord': { v: 'bad', ts: 1 } } }, show('p1', 'nord'), good]);
    expect(excludedPalettes(s, 'p1').has('nord')).toBe(false);
  });

  it('pattern 前缀不串：p1 的排除不含 p10 的', () => {
    const { s } = run([{ type: 'loaded', ratings: { 'p10|nord': { v: 'bad', ts: 1 } } }]);
    expect(excludedPalettes(s, 'p1').size).toBe(0);
  });
});

describe('浅底 / 深底分开评（Rei 2026-10-14）', () => {
  it('同一色板两个底色各自一条；切底色时上一底色的选择提交，另一底色从空开始', () => {
    let t = reduceRating(initialRatingState, { type: 'show', pattern: 'p', palette: 'nord', tone: 'light' });
    t = reduceRating(t.state, { type: 'choose', verdict: 'good' });
    t = reduceRating(t.state, { type: 'show', pattern: 'p', palette: 'nord', tone: 'dark' });
    expect(t.commits).toEqual([{ pattern: 'p', palette: 'nord', tone: 'light', verdict: 'good' }]);
    expect(t.state.current?.verdict).toBeNull();
    t = reduceRating(t.state, { type: 'choose', verdict: 'bad' });
    expect(excludedPalettes(t.state, 'p', 'dark').has('nord')).toBe(true);
    expect(excludedPalettes(t.state, 'p', 'light').has('nord')).toBe(false);
    t = reduceRating(t.state, { type: 'flush' });
    expect(t.state.submitted).toEqual({ 'p|nord|light': 'good', 'p|nord|dark': 'bad' });
  });

  it('旧的不分底色评分：两个底色都回显 / 排除；带底色的新评分优先', () => {
    let t = reduceRating(initialRatingState, { type: 'loaded', ratings: { 'p|nord': { v: 'bad', ts: 1 } } });
    expect(excludedPalettes(t.state, 'p', 'light').has('nord')).toBe(true);
    expect(excludedPalettes(t.state, 'p', 'dark').has('nord')).toBe(true);
    t = reduceRating(t.state, { type: 'show', pattern: 'p', palette: 'nord', tone: 'dark' });
    expect(t.state.current?.verdict).toBe('bad');
    t = reduceRating(t.state, { type: 'choose', verdict: 'good' });
    t = reduceRating(t.state, { type: 'flush' });
    expect(excludedPalettes(t.state, 'p', 'dark').has('nord')).toBe(false);
    expect(excludedPalettes(t.state, 'p', 'light').has('nord')).toBe(true);
  });
});
