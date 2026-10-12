/**
 * 松林飘雪 —— C 有机形态 / 单幅构图。
 *
 * 构图要点：单色系（默认青绿）4 层云杉剪影由远及近叠压铺满画面：
 * 远层浅而朦胧、近层深而高大；树冠轮廓是一层层下垂的锯齿枝条（非光滑三角），
 * 树身细高、彼此重叠；最上面是分层的雪：远小暗密、近大亮疏，圆点为主夹少量六角星。
 *
 * ⭐ 体积/节点策略：
 *   - 坐标系：所有几何画在「短边 = 1000」的虚拟坐标里，整层 path 用
 *     `transform="scale(q)"` 放大到真实像素 → 坐标与分辨率解耦，整数即可。
 *   - 每层所有树合并为**一条** path（同向子路径 nonzero 并集，无叠色），
 *     锯齿轮廓用相对 `l` 命令 + 整数增量，单点 ≈ 6 字节。
 *   - 雪：共享 `_snow.ts`，4 个深度层（远小暗密 → 近大亮疏），圆点为主夹少量六角星，
 *     零长度子路径 + 圆头描边，每「层 × 子组 × 形状」一条 path（≈ 9 字节/片）。
 *   - BYTE_CAP：树形细节（枝层数 / 小锯齿）按档位逐级降低直到总字节落入上限，
 *     超宽画幅也稳在 20KB 内。
 * 动画（仅预览，cfg.animate && snowfall）：各深度层下落速度 / 摆幅不同（视差），
 * 层内子组周期与起始偏移错开，`<use>` 上方补副本一屏无缝循环。
 */
import { path, rect } from '../../engine/svg';
import { renderSnow } from './_snow';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 四层树 + 雪花 path 数据合计字节上限（其余标记 < 1.2KB → 整体 < 20KB）。 */
const BYTE_CAP = 17800;
/** 树轮廓独占的上限（雪花少时也不让树把预算吃满，默认画面体积更可控）。 */
const TREE_CAP = 15800;
/** 雪层 path 数据字节上限（≈ 9~10B/片）。 */
const SNOW_CAP = 3000;
/** 雪量 = 1 时每「短边见方」的雪片数。 */
const SNOW_PER_SCREEN = 300;
/** 虚拟坐标短边。 */
const V = 600;
/** 每棵树预抽的随机数个数（不同细节档位复用同一组，保证降档不改布局）。 */
const JIT = 157;

/** 各层：树冠顶部所在高度（相对画面高）、树高（相对场景尺度）、底宽比例。 */
const LAYERS = [
  { id: 'layer_far', top: 0.0, h: 0.62, w: 0.21 },
  { id: 'layer_mid', top: 0.16, h: 0.74, w: 0.22 },
  { id: 'layer_near', top: 0.36, h: 0.9, w: 0.23 },
  { id: 'layer_front', top: 0.6, h: 1.12, w: 0.24 },
] as const;

interface Tree {
  x: number;
  top: number;
  h: number;
  w: number;
  r: number[];
}

/**
 * 一棵云杉的闭合轮廓（相对坐标）。
 * 左侧自上而下逐层：内凹点 →（上缘小簇锯齿）→ 下垂枝尖（低于下一层内凹点，形成下钩）
 * → 向内上收的枝下缘；右侧同法生成后反向拼接（两侧独立抖动）。
 * 名义树高以下（被近层遮挡的部分）枝层加倍稀疏且不带锯齿，一直延伸到画面底部。
 */
function treePath(t: Tree, tiers: number, teeth: number, jag: number, floorY: number): string {
  const r = t.r;
  let ri = 0;
  const rnd = (): number => r[ri++ % JIT];
  const tierH = t.h / tiers;
  const pts: Array<[number, number]> = [];
  const apex: [number, number] = [t.x + (rnd() - 0.5) * t.w * 0.06, t.top];
  const side = (dir: -1 | 1): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    let y = t.top + tierH * (0.5 + rnd() * 0.3);
    let guard = 0;
    while (y < floorY && guard++ < 80) {
      const f = (y - t.top) / t.h;
      const below = f > 1.02;
      // 包络：尖顶 → 快速变宽 → 下部近似柱状
      const e = t.w * Math.min(1, 0.1 + 0.9 * Math.pow(Math.min(f, 1), 0.72)) * (0.9 + rnd() * 0.2);
      const th = tierH * (below ? 2 : f < 0.2 ? 0.7 : 1) * (0.75 + rnd() * 0.5);
      const nX = t.x + dir * e * (0.3 + rnd() * 0.2);
      const tipX = t.x + dir * e * (0.92 + rnd() * 0.3 * (0.3 + jag));
      const tipY = y + th * (0.88 + jag * (0.15 + rnd() * 0.35));
      const rX = t.x + dir * e * (0.5 + rnd() * 0.15);
      const rY = y + th * (0.66 + rnd() * 0.12);
      out.push([nX, y], [tipX, tipY]);
      // 枝下缘的下垂小簇：沿 枝尖 → 回收点 交替插入上凹 / 下垂点
      const tk = below ? 0 : teeth;
      for (let k = 1; k <= tk; k++) {
        const a1 = (k - 0.45) / (tk + 0.6);
        const a2 = k / (tk + 0.6);
        const amp = th * (0.22 + rnd() * 0.3) * (0.35 + jag);
        out.push([tipX + (rX - tipX) * a1, tipY + (rY - tipY) * a1 - amp * 0.55]);
        out.push([tipX + (rX - tipX) * a2, tipY + (rY - tipY) * a2 + amp * 0.5]);
      }
      out.push([rX, rY]);
      y += th;
    }
    out.push([t.x + dir * t.w * 0.5, floorY]);
    return out;
  };
  pts.push(apex, ...side(-1), ...side(1).reverse());

  // 整数相对坐标；连续零位移点省略
  let px = Math.round(pts[0][0]);
  let py = Math.round(pts[0][1]);
  let d = `M${px} ${py}l`;
  let first = true;
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round(pts[i][0]);
    const y = Math.round(pts[i][1]);
    const dx = x - px;
    const dy = y - py;
    if (dx === 0 && dy === 0) continue;
    d += `${first || dx < 0 ? '' : ' '}${dx}${dy < 0 ? '' : ' '}${dy}`;
    first = false;
    px = x;
    py = y;
  }
  return `${d}z`;
}

const def: PatternDef = {
  id: 'pine-forest',
  name: '松林飘雪',
  category: 'E-scene',
  description: '单色系多层云杉剪影由远及近叠压铺满画面，锯齿下垂的枝条，远浅近深，点缀大小不一的雪花。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天色', role: 'bg', paint: { type: 'solid', color: '#447471' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer_far', label: '松林 · 远', role: 'detail', paint: { type: 'solid', color: '#618f8d' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer_mid', label: '松林 · 中', role: 'secondary', paint: { type: 'solid', color: '#285848' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer_near', label: '松林 · 近', role: 'primary', paint: { type: 'solid', color: '#113b27' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer_front', label: '松林 · 前景', role: 'primary', paint: { type: 'solid', color: '#032206' }, opacity: 1, visible: true, configurable: true },
    { id: 'snow', label: '雪花', role: 'accent', paint: { type: 'solid', color: '#ffffff' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '树木密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5, heavy: true },
    { key: 'treeHeight', label: '树高', type: 'range', min: 0.7, max: 1.4, step: 0.05, default: 1, heavy: true },
    { key: 'jagged', label: '枝条锯齿', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6, heavy: true },
    { key: 'depth', label: '层次纵深', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'haze', label: '远景雾气', type: 'range', min: 0, max: 1, step: 0.05, default: 0.3 },
    { key: 'snowAmount', label: '雪量', type: 'range', min: 0, max: 1, step: 0.05, default: 0.45 },
    { key: 'snowSize', label: '雪花大小', type: 'range', min: 0.5, max: 2, step: 0.1, default: 1 },
    { key: 'snowfall', label: '雪花飘落', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'spruce-teal',
      label: '云杉青',
      elements: {
        bg: { paint: { type: 'solid', color: '#447471' } },
        layer_far: { paint: { type: 'solid', color: '#618f8d' } },
        layer_mid: { paint: { type: 'solid', color: '#285848' } },
        layer_near: { paint: { type: 'solid', color: '#113b27' } },
        layer_front: { paint: { type: 'solid', color: '#032206' } },
        snow: { paint: { type: 'solid', color: '#ffffff' } },
      },
    },
    {
      id: 'night-blue',
      label: '雪夜蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2b4a' } },
        layer_far: { paint: { type: 'solid', color: '#34476e' } },
        layer_mid: { paint: { type: 'solid', color: '#1a2740' } },
        layer_near: { paint: { type: 'solid', color: '#0f182b' } },
        layer_front: { paint: { type: 'solid', color: '#060a14' } },
        snow: { paint: { type: 'solid', color: '#e6eeff' } },
      },
      params: { snowAmount: 0.6 },
    },
    {
      id: 'misty-morning',
      label: '晨雾',
      elements: {
        bg: { paint: { type: 'solid', color: '#e3ebe8' } },
        layer_far: { paint: { type: 'solid', color: '#c4d4cf' } },
        layer_mid: { paint: { type: 'solid', color: '#93ada6' } },
        layer_near: { paint: { type: 'solid', color: '#5f7f77' } },
        layer_front: { paint: { type: 'solid', color: '#46665e' } },
        snow: { paint: { type: 'solid', color: '#ffffff' } },
      },
      params: { haze: 0.6, snowAmount: 0.3 },
    },
    {
      id: 'emerald',
      label: '翡翠',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f8f7a' } },
        layer_far: { paint: { type: 'solid', color: '#3dbf9f' } },
        layer_mid: { paint: { type: 'solid', color: '#0a6e57' } },
        layer_near: { paint: { type: 'solid', color: '#064b3a' } },
        layer_front: { paint: { type: 'solid', color: '#022a20' } },
        snow: { paint: { type: 'solid', color: '#f4fffb' } },
      },
      params: { jagged: 0.75 },
    },
    {
      id: 'dusk-plum',
      label: '暮紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#6b5a7e' } },
        layer_far: { paint: { type: 'solid', color: '#8d7c9f' } },
        layer_mid: { paint: { type: 'solid', color: '#4a3b5c' } },
        layer_near: { paint: { type: 'solid', color: '#2e2340' } },
        layer_front: { paint: { type: 'solid', color: '#160f22' } },
        snow: { paint: { type: 'solid', color: '#fff4fa' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['layer_near', 'layer_front'],
    secondary: ['layer_mid'],
    accent: ['snow'],
    detail: ['layer_far'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const num = (k: string, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number(params[k])));
    const density = num('density', 0, 1);
    const heightK = num('treeHeight', 0.5, 2);
    const jag = num('jagged', 0, 1);
    const depth = num('depth', 0, 1);
    const haze = num('haze', 0, 1);
    const snowAmt = num('snowAmount', 0, 1);
    const snowSize = num('snowSize', 0.3, 3);
    const snowfall = params.snowfall === true;

    // 虚拟坐标：短边 = V
    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const tf = `scale(${q})`;
    // 场景尺度：竖屏时树不至于细成线，也不至于只剩一两棵
    const S = Math.min(Hv, V * 1.45);
    // 纵深：层间顶部错落程度
    const spread = 0.7 + depth * 0.6;

    const bg = elements.get('bg')!;
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // ── 先抽布局（一次性消耗 rng；细节降档只重算轮廓，不改布局）──────
    const layerTrees: Tree[][] = LAYERS.map((L, li) => {
      const h = S * L.h * heightK * (1 - (1 - depth) * 0.12 * (3 - li) / 3);
      const w = S * L.w * L.h * (0.9 + 0.1 * li / 3);
      const topY = Hv * Math.min(L.top * spread, 0.66) - (li === 0 ? S * 0.04 : 0);
      const step = w * 2 * (1.25 - density * 0.75);
      const trees: Tree[] = [];
      let x = -w * (0.3 + rng() * 0.7);
      while (x < Wv + w) {
        const sh = 0.82 + rng() * 0.36;
        const r: number[] = [];
        for (let k = 0; k < JIT; k++) r.push(rng());
        trees.push({ x, top: topY + (rng() - 0.3) * h * 0.16, h: h * sh, w: w * (0.85 + rng() * 0.3) * Math.sqrt(sh), r });
        x += step * (0.6 + rng() * 0.8);
      }
      // 高个子放后面画（无叠色，顺序只影响抖动消耗；保持随机感即可）
      return trees;
    });

    // ── 细节档位：自高向低，直到总字节 ≤ BYTE_CAP ──────────────
    const levels = [
      { tierK: 1, teeth: 2 },
      { tierK: 0.85, teeth: 2 },
      { tierK: 1, teeth: 1 },
      { tierK: 0.85, teeth: 1 },
      { tierK: 0.75, teeth: 0 },
      { tierK: 0.6, teeth: 0 },
      { tierK: 0.45, teeth: 0 },
      { tierK: 0.35, teeth: 0 },
      { tierK: 0.28, teeth: 0 },
    ];
    const baseTeeth = jag < 0.2 ? 0 : jag < 0.5 ? 1 : 2;
    const snow = elements.get('snow')!;
    // 雪先于树轮廓生成（rng 消耗顺序固定），按实际字节给树让出预算；见 _snow.ts
    const Sp = Math.min(W, H);
    const sn = snow.visible
      ? renderSnow({
          W,
          H,
          rng,
          api,
          count: Math.round(snowAmt * SNOW_PER_SCREEN * ((W * H) / (Sp * Sp))),
          size: 0.0085 * snowSize,
          color: snow.paintValue,
          opacity: snow.opacity,
          cap: SNOW_CAP,
          falling: animate && snowfall,
          idPrefix: `pf${cfg.seed}s`,
        })
      : { markup: '', bytes: 0 };
    const snowBytes = sn.bytes;
    const treeCap = Math.min(TREE_CAP, BYTE_CAP - snowBytes);
    let ds: string[] = [];
    const floorY = Math.ceil(Hv) + 2;
    // 最后兜底：超宽画幅在最低细节下仍超限时，按比例抽稀树木（确定性）
    const thins = [0, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 0.85];
    outer: for (const thin of thins) {
      for (const lv of levels) {
        if (thin > 0 && lv !== levels[levels.length - 1]) continue;
        const teeth = Math.min(baseTeeth, lv.teeth);
        ds = layerTrees.map((trees, li) => {
          let d = '';
          trees.forEach((t, i) => {
            if (thin > 0 && Math.floor((i + 1) * thin) > Math.floor(i * thin)) return;
            const tiers = Math.max(5, Math.round((9 + jag * 4) * Math.sqrt(t.h / (S * 0.75)) * lv.tierK));
            d += treePath(t, tiers, li === 0 ? Math.min(1, teeth) : teeth, jag, floorY);
          });
          return d;
        });
        if (ds.reduce((a, d) => a + d.length, 0) <= treeCap) break outer;
      }
    }

    ds.forEach((d, li) => {
      const e = elements.get(LAYERS[li].id)!;
      if (!e.visible || d === '') return;
      // 雾气：越远越淡（与背景混色）
      const fade = li === 0 ? 1 - haze * 0.45 : li === 1 ? 1 - haze * 0.18 : 1;
      parts.push(path(d, { fill: e.paintValue, 'fill-opacity': e.opacity * fade, transform: tf }));
    });

    // ── 雪：4 个深度层（远小暗慢密 → 近大亮快疏）────────────
    if (sn.markup !== '') parts.push(sn.markup);

    return { body: parts.join('') };
  },
};

export default def;
