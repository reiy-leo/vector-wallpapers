/**
 * 圣诞树林 —— C 有机形态 / 扁平插画。
 *
 * 构图要点：深蓝夜空 + 下方约 80% 被层层交叠的扁平圣诞树占满。
 * 每棵树由 3~5 层「三角形树冠」自下而上叠成（上层压住下层），
 * 每层的尖顶有轻微横向错位，底边带一条斜切的暗色楔形 → 两面受光的扁平感。
 * 树按远 → 近分成若干排（横屏 3 排，竖屏自动加排以填满纵向），
 * 远排小、浅，近排大、深；最近一排树底越出画布，保证底部无缝。
 * 最上层撒一层大小不一的白色雪点。
 *
 * ⭐ 体积/节点策略：
 *   - 每排一个 `<g fill=排色>`（顶层节点数 = 排数 + 背景 + 雪），
 *     排内每棵树 2 条 path：整树轮廓（全部层合并）+ 全部暗楔（叠半透明阴影色）。
 *     必须逐树输出而非整排合并：后画的树要盖住先画那棵的暗楔，合并会穿帮。
 *   - 雪点 = 零长度线段 + 圆头描边（`M x yh0`），按 3 档半径各一条 path，约 11B/点。
 *   - 树与雪各有字节预算（TREE_CAP / SNOW_CAP），超了就放稀树距 / 截断雪点，
 *     「控件全部拉满 × 任意比例 × 动画副本」都稳在 20KB 内。
 *
 * 动画（仅预览）：`snowfall` 开关 + cfg.animate 时，雪层整体向下平移一屏循环，
 * 用 `<use>` 在上方补一份副本做无缝衔接；三档雪点速度不同（近大远小的视差）。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

/** 树冠全部 path 数据的字节上限（含标签开销估算）。 */
const TREE_CAP = 11000;
/** 雪点 path 数据字节上限；动画时 `<use>` 复用，不额外占字节。 */
const SNOW_CAP = 5200;
/** 雪点三档：半径倍率、数量权重、下落周期（秒）。 */
const SNOW_TIERS: Array<{ r: number; w: number; dur: number }> = [
  { r: 0.55, w: 0.5, dur: 34 },
  { r: 1, w: 0.33, dur: 24 },
  { r: 1.6, w: 0.17, dur: 16 },
];

interface Tree {
  /** 中心 x、顶端 y、高、底宽 */
  x: number;
  top: number;
  h: number;
  w: number;
  /** 每层尖顶错位（相对底宽）与暗楔方向（1 = 右侧厚，-1 = 左侧厚） */
  tips: number[];
  dirs: number[];
}

const def: PatternDef = {
  id: 'christmas-trees',
  name: '圣诞树林',
  category: 'C-organic',
  description: '深蓝夜空下层层交叠的扁平圣诞树，每棵由数层双色三角树冠叠成，白色雪点洒满画面。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '夜空', role: 'bg', paint: { type: 'solid', color: '#1d2a52' }, opacity: 1, visible: true, configurable: true },
    { id: 'tree_far', label: '树 · 远', role: 'secondary', paint: { type: 'solid', color: '#a4d49c' }, opacity: 1, visible: true, configurable: true },
    { id: 'tree_mid', label: '树 · 中', role: 'secondary', paint: { type: 'solid', color: '#7cbf7c' }, opacity: 1, visible: true, configurable: true },
    { id: 'tree_near', label: '树 · 近', role: 'primary', paint: { type: 'solid', color: '#5aa862' }, opacity: 1, visible: true, configurable: true },
    { id: 'shade', label: '树冠暗面', role: 'detail', paint: { type: 'solid', color: '#173a26' }, opacity: 0.28, visible: true, configurable: true },
    { id: 'snow', label: '雪点', role: 'accent', paint: { type: 'solid', color: '#ffffff' }, opacity: 0.92, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '树木密度', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1, heavy: true },
    { key: 'size', label: '树木大小', type: 'range', min: 0.6, max: 1.4, step: 0.05, default: 1, heavy: true },
    { key: 'tiers', label: '树冠层数', type: 'range', min: 3, max: 5, step: 1, default: 4 },
    { key: 'snow', label: '雪量', type: 'range', min: 0.2, max: 2, step: 0.1, default: 1 },
    { key: 'snowSize', label: '雪点大小', type: 'range', min: 0.5, max: 2, step: 0.1, default: 1 },
    { key: 'snowfall', label: '飘雪动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'night',
      label: '雪夜松林',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2a52' } },
        tree_far: { paint: { type: 'solid', color: '#a4d49c' } },
        tree_mid: { paint: { type: 'solid', color: '#7cbf7c' } },
        tree_near: { paint: { type: 'solid', color: '#5aa862' } },
        shade: { paint: { type: 'solid', color: '#173a26' }, opacity: 0.28 },
        snow: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.92 },
      },
    },
    {
      id: 'pastel',
      label: '薄荷晨雪',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9eef3' } },
        tree_far: { paint: { type: 'solid', color: '#cfe6d6' } },
        tree_mid: { paint: { type: 'solid', color: '#a9d3bb' } },
        tree_near: { paint: { type: 'solid', color: '#83bc9f' } },
        shade: { paint: { type: 'solid', color: '#3f6b5c' }, opacity: 0.2 },
        snow: { paint: { type: 'solid', color: '#ffffff' }, opacity: 1 },
      },
      params: { snow: 1.2 },
    },
    {
      id: 'vivid',
      label: '节日撞色',
      elements: {
        bg: { paint: { type: 'solid', color: '#b3203a' } },
        tree_far: { paint: { type: 'solid', color: '#3fbf6a' } },
        tree_mid: { paint: { type: 'solid', color: '#1f9a50' } },
        tree_near: { paint: { type: 'solid', color: '#0e7a3e' } },
        shade: { paint: { type: 'solid', color: '#06331a' }, opacity: 0.32 },
        snow: { paint: { type: 'solid', color: '#fff6e0' }, opacity: 0.95 },
      },
    },
    {
      id: 'frost',
      label: '霜蓝冷杉',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f1d2e' } },
        tree_far: { paint: { type: 'solid', color: '#8fb7c4' } },
        tree_mid: { paint: { type: 'solid', color: '#5e93a3' } },
        tree_near: { paint: { type: 'solid', color: '#3b7083' } },
        shade: { paint: { type: 'solid', color: '#0a2230' }, opacity: 0.3 },
        snow: { paint: { type: 'solid', color: '#eaf4ff' }, opacity: 0.9 },
      },
      params: { tiers: 5, snow: 1.4 },
    },
    {
      id: 'dusk',
      label: '暮色暖林',
      elements: {
        bg: { paint: { type: 'solid', color: '#3a2a4a' } },
        tree_far: { paint: { type: 'solid', color: '#c9c48e' } },
        tree_mid: { paint: { type: 'solid', color: '#94a66e' } },
        tree_near: { paint: { type: 'solid', color: '#677f52' } },
        shade: { paint: { type: 'solid', color: '#2a2018' }, opacity: 0.26 },
        snow: { paint: { type: 'solid', color: '#fff1dc' }, opacity: 0.85 },
      },
      params: { tiers: 3 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['tree_near'],
    secondary: ['tree_far', 'tree_mid'],
    accent: ['snow'],
    detail: ['shade'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate, seed } = cfg;
    const S = Math.min(W, H);
    const density = Math.max(0.3, Number(params.density));
    const size = Math.max(0.3, Number(params.size));
    const tiers = Math.max(3, Math.min(5, Math.round(Number(params.tiers))));
    const snowAmt = Math.max(0, Number(params.snow));
    const snowSize = Math.max(0.2, Number(params.snowSize));
    const falling = animate && params.snowfall === true;

    const bg = elements.get('bg')!;
    const rowEls = [elements.get('tree_far')!, elements.get('tree_mid')!, elements.get('tree_near')!];
    const shade = elements.get('shade')!;
    const snow = elements.get('snow')!;
    const r0 = (v: number): number => Math.round(v);

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // ── 排布：横屏 3 排，竖屏按纵向空间加排 ─────────────────────
    const baseH = S * 0.92 * size;
    const nearH = baseH;
    const yTop = H * 0.16;
    const yLast = Math.max(yTop + baseH * 0.3, H - nearH * 0.72);
    const avgH = baseH * 0.78;
    const rowCount = Math.max(3, Math.min(8, Math.ceil((yLast - yTop) / (0.46 * avgH)) + 1));

    // 先抽完全部随机布局（与字节预算无关的部分），再按预算决定树距倍率
    const layoutSeeds: number[] = [];
    for (let i = 0; i < 4096; i++) layoutSeeds.push(rng());
    let ls = 0;
    const R = (): number => layoutSeeds[ls++ % layoutSeeds.length];

    const buildRows = (spread: number): Tree[][] => {
      ls = 0;
      const rows: Tree[][] = [];
      for (let r = 0; r < rowCount; r++) {
        const t = rowCount === 1 ? 1 : r / (rowCount - 1);
        const scale = 0.5 + 0.5 * t;
        const hRow = baseH * scale;
        const wRow = hRow * 0.78;
        const topRow = yTop + (yLast - yTop) * t;
        const spacing = ((wRow * 0.78) / density) * spread;
        const trees: Tree[] = [];
        let x = -R() * spacing;
        while (x < W + wRow * 0.5) {
          const k = 0.82 + R() * 0.36;
          const h0 = hRow * k;
          let top = topRow + (R() - 0.5) * hRow * 0.22;
          let h = h0;
          // 最近一排：树底必须越出画布
          if (r === rowCount - 1 && top + h < H * 1.03) h = (H * 1.03 - top);
          if (top < H * 0.06) top = H * 0.06 + R() * hRow * 0.05;
          const tips: number[] = [];
          const dirs: number[] = [];
          for (let i = 0; i < tiers; i++) {
            tips.push((R() - 0.5) * 0.12);
            dirs.push(R() < 0.5 ? -1 : 1);
          }
          trees.push({ x: x + (R() - 0.5) * spacing * 0.3, top, h, w: h0 * 0.78 * (0.92 + R() * 0.16), tips, dirs });
          x += spacing * (0.75 + R() * 0.5);
        }
        // 排内从后往前：随机先后，让交叠关系不呆板
        for (let i = trees.length - 1; i > 0; i--) {
          const j = Math.floor(R() * (i + 1));
          const tmp = trees[i];
          trees[i] = trees[j];
          trees[j] = tmp;
        }
        rows.push(trees);
      }
      return rows;
    };

    /** 一棵树 → [轮廓 d, 暗楔 d]。层自下而上输出（上层盖住下层）。 */
    const treePaths = (tr: Tree): [string, string] => {
      let body = '';
      let wedge = '';
      const n = tiers;
      for (let i = n - 1; i >= 0; i--) {
        const f = (i + 1) / n;
        const bottom = tr.top + tr.h * (0.12 + 0.88 * f);
        const tierTop = tr.top + (i === 0 ? 0 : tr.h * (0.12 + 0.88 * (i / n)) - tr.h * (0.6 / n));
        const half = (tr.w / 2) * (0.36 + 0.64 * f);
        const ax = tr.x + tr.tips[i] * tr.w;
        const lx = tr.x - half;
        const rx = tr.x + half;
        const cut = tr.h * (0.16 / n) * (1.2 + 0.4 * f);
        const ay = r0(tierTop);
        const by = r0(bottom);
        body += `M${r0(ax)} ${ay}L${r0(rx)} ${by}H${r0(lx)}Z`;
        // 最下层：树身沿较缓的斜率一直延伸到画布底（被前排遮住，只在前排树缝里露出），
        // 保证任何排的树缝里都不会漏出夜空
        if (i === n - 1 && by < H) {
          const ext = (H - by) * (half / Math.max(1, by - ay)) * 0.55;
          body += `M${r0(lx)} ${by}H${r0(rx)}L${r0(rx + ext)} ${r0(H)}H${r0(lx - ext)}Z`;
        }
        // 暗楔：底边一侧抬高 cut 形成斜切，楔形 = 原底边与斜切线之间的薄三角
        // 抬高点取在该侧斜边上，楔形完整落在本层轮廓内，不会在边缘外露出暗角
        const k = cut / Math.max(1, bottom - tierTop);
        const ey = r0(bottom - cut);
        if (tr.dirs[i] > 0) wedge += `M${r0(lx)} ${by}L${r0(rx + (ax - rx) * k)} ${ey}L${r0(rx)} ${by}Z`;
        else wedge += `M${r0(rx)} ${by}L${r0(lx + (ax - lx) * k)} ${ey}L${r0(lx)} ${by}Z`;
      }
      return [body, wedge];
    };

    const shadeAttrs = { fill: shade.paintValue, 'fill-opacity': shade.opacity };
    const renderRows = (rows: Tree[][]): string[] =>
      rows.map((trees, r) => {
        const t = rowCount === 1 ? 1 : r / (rowCount - 1);
        const el = rowEls[Math.min(2, Math.floor(t * 2.999))];
        let inner = '';
        for (const tr of trees) {
          const [b, wd] = treePaths(tr);
          inner += path(b, {});
          if (shade.visible) inner += path(wd, shadeAttrs);
        }
        return el.visible ? g({ fill: el.paintValue, 'fill-opacity': el.opacity }, inner) : '';
      });

    let spread = 1;
    let rowMarkup = renderRows(buildRows(spread));
    for (let guard = 0; guard < 12 && rowMarkup.join('').length > TREE_CAP; guard++) {
      spread *= 1.12;
      rowMarkup = renderRows(buildRows(spread));
    }
    parts.push(...rowMarkup.filter((s) => s !== ''));

    // ── 雪点：3 档半径，零长度线段 + 圆头描边 ──────────────────
    // 随机量独立抽取（固定上限条数），雪量只决定取前多少个 → 雪量变化不改树林布局
    const areaRatio = (W * H) / (S * S);
    const want = Math.round(190 * snowAmt * areaRatio);
    const rBase = S * 0.0042 * snowSize;
    const snowD = ['', '', ''];
    let used = 0;
    for (let i = 0; i < want; i++) {
      const u = rng();
      const tier = u < SNOW_TIERS[0].w ? 0 : u < SNOW_TIERS[0].w + SNOW_TIERS[1].w ? 1 : 2;
      const seg = `M${r0(rng() * W)} ${r0(rng() * H)}h0`;
      if (used + seg.length > SNOW_CAP) break;
      snowD[tier] += seg;
      used += seg.length;
    }
    if (snow.visible) {
      const sid = `ct-snow-${seed}-${r0(W)}x${r0(H)}`;
      SNOW_TIERS.forEach((st, k) => {
        if (snowD[k] === '') return;
        const sw = Math.max(1.2, rBase * st.r * 2);
        const attrs = {
          fill: 'none',
          stroke: snow.paintValue,
          'stroke-opacity': snow.opacity,
          'stroke-width': api.n(sw),
          'stroke-linecap': 'round',
        };
        if (!falling) {
          parts.push(path(snowD[k], attrs));
          return;
        }
        // 动画：整层向下平移一屏，上方 `<use>` 副本无缝补位
        const name = api.keyframes(`vw-ctfall-${r0(H)}`, `from{transform:translateY(0)}to{transform:translateY(${r0(H)}px)}`);
        const id = `${sid}-${k}`;
        parts.push(
          g(
            { style: `animation:${name} ${st.dur}s linear infinite` },
            path(snowD[k], { ...attrs, id }) + `<use href="#${id}" y="${r0(-H)}"/>`,
          ),
        );
      });
    }

    return { body: parts.join('') };
  },
};

export default def;
