/**
 * 分层飘雪（共享）—— 供 christmas-trees / pine-forest 使用。
 *
 * 景深：4 个深度层，远 → 近：
 *   far   极小、暗、慢、密
 *   mid   小、半亮，少量六角星
 *   near  大、亮、快、疏，六角星稍多
 *   front 少量大而柔的「近焦雪片」：低不透明度光晕 + 实心小核（`<use>` 复用同一条 d）
 * 层内再拆 3 个子组：粒径 ±15%、下落周期与起始偏移各不相同 → 不会整层齐步走。
 *
 * 形状：大多是圆点（零长度子路径 + 圆头描边）；约 1/4 圆点带一段很短的 h/v，
 * 圆头描边下成为略扁的椭圆；mid/near 少量六角星（三条交叉短线，细描边）。
 * 每个「层 × 子组 × 形状」合并为一条 path。
 *
 * 分布：均匀撒点 + 每层若干随机团簇（团内越靠中心越密），整体疏密不均、不成网格。
 *
 * 坐标：画在「短边 = V」的虚拟坐标里，雪层根 `<g>` 用 scale(q) 放大 → 坐标与分辨率解耦。
 * 随机数：只用调用方传入的 rng；每片雪固定消耗 7 个随机数，雪量只决定取前多少片
 * （雪量变化不打乱已有雪片）。字节超出 cap 时按前缀截断。
 *
 * 动画（仅预览，调用方决定 falling）：
 *   每层外包一层横向摆动（CSS keyframes，振幅 / 周期按层不同，ease-in-out 往返）；
 *   每个子组一层下落（translateY 一屏，线性循环，周期与负 delay 各异），
 *   子组内容用 `<use y=-H>` 在上方补一份 → 一屏平移无缝衔接。
 */
import type { RenderApi } from '../types';

/** 虚拟坐标短边。 */
const V = 500;

interface Layer {
  /** 粒径倍率（相对 base 直径） */
  d: number;
  /** 不透明度倍率 */
  op: number;
  /** 数量权重 */
  w: number;
  /** 下落一屏的基础周期（秒） */
  dur: number;
  /** 横向摆动振幅（相对短边）与周期（秒） */
  amp: number;
  sway: number;
  /** 六角星占比 */
  star: number;
  /** 团簇个数、团簇占比、团簇半径（相对短边） */
  clusters: number;
  clusterP: number;
  clusterR: number;
}

const LAYERS: Layer[] = [
  { d: 0.42, op: 0.42, w: 0.45, dur: 54, amp: 0.004, sway: 9.5, star: 0, clusters: 5, clusterP: 0.3, clusterR: 0.22 },
  { d: 0.78, op: 0.66, w: 0.3, dur: 37, amp: 0.008, sway: 7.3, star: 0.1, clusters: 4, clusterP: 0.4, clusterR: 0.18 },
  { d: 1.2, op: 0.92, w: 0.18, dur: 25, amp: 0.014, sway: 5.6, star: 0.18, clusters: 3, clusterP: 0.45, clusterR: 0.15 },
  { d: 2.5, op: 0.22, w: 0.07, dur: 16, amp: 0.022, sway: 4.4, star: 0, clusters: 2, clusterP: 0.3, clusterR: 0.2 },
];
/** 子组：粒径倍率、周期倍率、起始偏移（占周期比例）。 */
const SUBS = [
  { s: 0.86, t: 1, b: 0 },
  { s: 1, t: 1.14, b: 0.37 },
  { s: 1.17, t: 0.88, b: 0.71 },
];

export interface SnowOptions {
  W: number;
  H: number;
  rng: () => number;
  api: RenderApi;
  /** 期望片数（会被 cap 截断） */
  count: number;
  /** 基础直径（相对短边，near 层 ≈ 1.2 倍） */
  size: number;
  color: string;
  opacity: number;
  /** path 数据字节上限 */
  cap: number;
  falling: boolean;
  /** 文档内唯一的 id 前缀 */
  idPrefix: string;
}

export interface SnowResult {
  markup: string;
  /** 雪层全部标记的字节数 */
  bytes: number;
}

interface Flake {
  layer: number;
  sub: number;
  x: number;
  y: number;
  /** 0 = 圆点，1 = 横向略扁，2 = 纵向略扁，3 = 六角星 */
  shape: number;
}

const f1 = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

export function renderSnow(o: SnowOptions): SnowResult {
  const { W, H, rng, api } = o;
  if (o.count <= 0) return { markup: '', bytes: 0 };
  const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
  const Wv = W / q;
  const Hv = H / q;
  const minW = 1.2 / q; // 可见下限：真实像素直径 ≥ 1.2

  // ── 团簇中心（固定消耗，先于雪片）────────────────────────
  const centers: Array<Array<[number, number]>> = LAYERS.map((L) => {
    const cs: Array<[number, number]> = [];
    for (let i = 0; i < L.clusters; i++) cs.push([rng() * Wv, rng() * Hv]);
    return cs;
  });

  // ── 雪片（每片 7 个随机数）──────────────────────────────
  const pad = V * 0.03; // 左右各多撒一点，摆动时边缘不露空
  const span = Wv + pad * 2;
  const flakes: Flake[] = [];
  for (let i = 0; i < o.count; i++) {
    const u = rng();
    const v = rng();
    const c = rng();
    const a = rng();
    const b = rng();
    const s = rng();
    const e = rng();
    let acc = 0;
    let layer = LAYERS.length - 1;
    for (let k = 0; k < LAYERS.length; k++) {
      acc += LAYERS[k].w;
      if (u < acc) {
        layer = k;
        break;
      }
    }
    const L = LAYERS[layer];
    let x: number;
    let y: number;
    if (c < L.clusterP) {
      const [cx, cy] = centers[layer][Math.floor((c / L.clusterP) * L.clusters) % L.clusters];
      const ang = a * Math.PI * 2;
      const rad = V * L.clusterR * b * b; // b² → 团中心更密
      x = cx + Math.cos(ang) * rad * 1.4;
      y = cy + Math.sin(ang) * rad;
    } else {
      x = a * Wv;
      y = b * Hv;
    }
    x = ((((x + pad) % span) + span) % span) - pad;
    y = ((y % Hv) + Hv) % Hv;
    const shape = s < L.star ? 3 : e < 0.13 ? 1 : e < 0.26 ? 2 : 0;
    flakes.push({ layer, sub: Math.floor(v * SUBS.length) % SUBS.length, x: Math.round(x), y: Math.round(y), shape });
  }

  const base = o.size * V;
  const dia = (layer: number, sub: number): number => Math.max(minW, base * LAYERS[layer].d * SUBS[sub].s);

  /** 前 n 片 → 每个「层 × 子组」的 [圆点 d, 星 d]。 */
  const build = (n: number): string[][][] => {
    const out = LAYERS.map(() => SUBS.map(() => ['', '']));
    const groups = LAYERS.map(() => SUBS.map(() => [[], []] as Flake[][]));
    for (let i = 0; i < n; i++) {
      const fl = flakes[i];
      groups[fl.layer][fl.sub][fl.shape === 3 ? 1 : 0].push(fl);
    }
    groups.forEach((subs, li) =>
      subs.forEach((pair, si) =>
        pair.forEach((list, kind) => {
          // 按 x 排序 → 相对 dx 很短
          list.sort((p, r) => p.x - r.x || p.y - r.y);
          const dm = dia(li, si);
          const el = f1(Math.max(0.5, dm * 0.3)); // 椭圆拉长量
          const arm = dm * 0.95; // 星臂长
          const ax = f1(arm);
          const hy = f1(arm * 0.866);
          const vy = f1(arm * 1.732);
          let d = '';
          let px = 0;
          let py = 0;
          list.forEach((fl, j) => {
            if (kind === 0) {
              d += j === 0 ? `M${fl.x} ${fl.y}` : `m${fl.x - px} ${fl.y - py}`;
              const tail = fl.shape === 1 ? `h${el}` : fl.shape === 2 ? `v${el}` : 'h0';
              d += tail;
              px = fl.x + (fl.shape === 1 ? Number(el) : 0);
              py = fl.y + (fl.shape === 2 ? Number(el) : 0);
            } else {
              // 六角星：横线 + 两条 ±60° 斜线（各自过中心）
              const sx = fl.x - arm;
              d += j === 0 ? `M${f1(sx)} ${fl.y}` : `m${f1(sx - px)} ${f1(fl.y - py)}`;
              d += `h${f1(arm * 2)}m-${f1(arm * 1.5)}-${hy}l${ax} ${vy}m0-${vy}l-${ax} ${vy}`;
              px = fl.x - arm / 2;
              py = fl.y + arm * 0.866;
            }
          });
          out[li][si][kind] = d;
        }),
      ),
    );
    return out;
  };

  const size = (ds: string[][][]): number => ds.flat(2).reduce((a, d) => a + d.length, 0);
  let n = o.count;
  let ds = build(n);
  for (let guard = 0; guard < 40 && size(ds) > o.cap && n > 0; guard++) {
    n = Math.floor(n * 0.92);
    ds = build(n);
  }
  if (n <= 0) return { markup: '', bytes: 0 };

  // ── 输出 ─────────────────────────────────────────────
  const op = (k: number): string => api.n(Math.min(1, o.opacity * k));
  const fallName = o.falling ? api.keyframes(`vw-snfall-${Math.round(Hv)}`, `to{transform:translateY(${Math.round(Hv)}px)}`) : '';
  let inner = '';
  LAYERS.forEach((L, li) => {
    let layerMarkup = '';
    SUBS.forEach((S, si) => {
      const [dd, sd] = ds[li][si];
      if (dd === '' && sd === '') return;
      const dm = dia(li, si);
      const id = `${o.idPrefix}${li}${si}`;
      let sub = '';
      if (dd !== '') {
        if (li === LAYERS.length - 1) {
          // 近焦大雪片：柔光晕（低不透明度大圆）+ 实心小核
          sub +=
            `<g stroke-width="${f1(dm)}" stroke-opacity="${op(L.op)}"><path id="${id}d" d="${dd}"/></g>` +
            `<use href="#${id}d" stroke-width="${f1(Math.max(minW, dm * 0.42))}" stroke-opacity="${op(0.85)}"/>`;
        } else {
          sub += `<path stroke-width="${f1(dm)}" stroke-opacity="${op(L.op)}" d="${dd}"/>`;
        }
      }
      if (sd !== '') {
        sub += `<path stroke-width="${f1(Math.max(minW * 0.8, dm * 0.26))}" stroke-opacity="${op(Math.min(1, L.op * 1.05))}" d="${sd}"/>`;
      }
      if (o.falling) {
        const dur = Math.round(L.dur * S.t * 10) / 10;
        const delay = Math.round(dur * S.b * 10) / 10;
        layerMarkup +=
          `<g style="animation:${fallName} ${dur}s linear${delay > 0 ? ` -${delay}s` : ''} infinite">` +
          `<g id="${id}">${sub}</g><use href="#${id}" y="${-Math.round(Hv)}"/></g>`;
      } else {
        layerMarkup += sub;
      }
    });
    if (layerMarkup === '') return;
    if (o.falling) {
      const amp = Math.max(1, Math.round(V * L.amp * 10) / 10);
      const sw = api.keyframes(`vw-snsway${li}`, `from{transform:translateX(-${amp}px)}to{transform:translateX(${amp}px)}`);
      const delay = Math.round(L.sway * (0.2 + 0.23 * li) * 10) / 10;
      inner += `<g style="animation:${sw} ${L.sway}s ease-in-out -${delay}s infinite alternate">${layerMarkup}</g>`;
    } else {
      inner += layerMarkup;
    }
  });
  const markup = `<g transform="scale(${q})" fill="none" stroke="${o.color}" stroke-linecap="round">${inner}</g>`;
  return { markup, bytes: markup.length };
}
