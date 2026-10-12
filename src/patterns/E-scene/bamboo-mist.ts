/**
 * 竹林 —— E 风景 / 单幅构图。
 *
 * 构图要点：雾色天光下 4 层竹子由远及近：远层细密、浅淡；越近越粗、越深、越疏，
 * 最前景只有两三根粗竹压在画面上。竹竿贯穿画面、略带倾斜，竹节处断开一道细缝（透出背后），
 * 近两层竹节下方再加一道浅色节环；竹叶为披针形，成簇地从竹节伸出的小枝末端扇形下垂，
 * 集中在画面上半部。层与层之间各压一道雾（与雾色同色的半透明幕），地面再加两级低雾 → 前清后朦。
 *
 * ⭐ 体积/节点策略：
 *   - 坐标系：短边 = 1000 的虚拟坐标，整体 `<g transform="scale(q)">` 放大；体积与分辨率解耦。
 *   - 竹竿 = 描边直线 + `stroke-dasharray`（实段 = 节间，空段 = 节缝），同层同粗细档的竹竿合并为一条 path；
 *     每根竹竿起点随机上移，节位因此各不相同。
 *   - 竹叶：每片两段相对二次曲线（≈ 30B），每层（× 摇曳子组）一条 path；超出 LEAF_CAP 时按比例抽稀。
 * 动画（仅预览，cfg.animate 且「竹影摇曳」打开）：每层竹子分两组，以底部为轴做极小角度 skewX 往返
 *（transform-box:fill-box + transform-origin 底边中点），各层 / 各组周期与相位不同。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;
/** 竹竿 + 竹节 + 小枝 + 竹叶的 path 数据总字节上限（竹叶取剩余预算，至少 LEAF_MIN）。 */
const TOTAL_CAP = 13800;
const LEAF_MIN = 5200;

/**
 * 各层：竿宽范围、平均间距（相对短边 = 1000）、节间长度（相对竿宽）、
 * 每竿叶簇数、叶长、摇曳角度（度）与周期（秒）。
 */
const LAYERS = [
  { id: 'bamboo_far', wMin: 5, wMax: 8, gap: 58, seg: [11, 16], clusters: 1.6, leaf: 34, sway: 0.35, dur: 9.5 },
  { id: 'bamboo_mid', wMin: 9, wMax: 14, gap: 115, seg: [10, 14], clusters: 2.6, leaf: 54, sway: 0.5, dur: 8.1 },
  { id: 'bamboo_near', wMin: 17, wMax: 25, gap: 230, seg: [8, 11], clusters: 3.2, leaf: 80, sway: 0.65, dur: 6.9 },
  { id: 'bamboo_front', wMin: 34, wMax: 46, gap: 620, seg: [6, 8], clusters: 2.6, leaf: 120, sway: 0.45, dur: 7.7 },
] as const;

interface Culm {
  x: number;
  lean: number;
  w: number;
  seg: number;
  y0: number;
  sub: number;
  /** 粗细档 0..2（同档竿宽、节间相同 → 可合并为一条 dasharray path） */
  band: number;
}

const def: PatternDef = {
  id: 'bamboo-mist',
  tones: ['light'],
  name: '竹林',
  category: 'E-scene',
  description: '雾中竹林：四层竹竿由远及近、由浅到深，竹节分明，披针形竹叶成簇下垂，层间薄雾营造纵深。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '雾色天光', role: 'bg', paint: { type: 'solid', color: '#e4eae2' }, opacity: 1, visible: true, configurable: true },
    { id: 'bamboo_far', label: '竹 · 远', role: 'detail', paint: { type: 'solid', color: '#b9c9bb' }, opacity: 1, visible: true, configurable: true },
    { id: 'bamboo_mid', label: '竹 · 中', role: 'secondary', paint: { type: 'solid', color: '#87a28d' }, opacity: 1, visible: true, configurable: true },
    { id: 'bamboo_near', label: '竹 · 近', role: 'primary', paint: { type: 'solid', color: '#4b6a54' }, opacity: 1, visible: true, configurable: true },
    { id: 'bamboo_front', label: '竹 · 前景', role: 'primary', paint: { type: 'solid', color: '#29422f' }, opacity: 1, visible: true, configurable: true },
    { id: 'node', label: '竹节环', role: 'accent', paint: { type: 'solid', color: '#c9d8c4' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'mist', label: '雾', role: 'detail', paint: { type: 'solid', color: '#f1f4ee' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '竹林密度', type: 'range', min: 0.4, max: 1.6, step: 0.05, default: 1, heavy: true },
    { key: 'fog', label: '雾气强度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'foliage', label: '枝叶茂密', type: 'range', min: 0.3, max: 1.5, step: 0.05, default: 1, heavy: true },
    { key: 'lean', label: '倾斜', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: 'swaying', label: '竹影摇曳', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'morning-mist',
      label: '晨雾',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4eae2' } },
        bamboo_far: { paint: { type: 'solid', color: '#b9c9bb' } },
        bamboo_mid: { paint: { type: 'solid', color: '#87a28d' } },
        bamboo_near: { paint: { type: 'solid', color: '#4b6a54' } },
        bamboo_front: { paint: { type: 'solid', color: '#29422f' } },
        node: { paint: { type: 'solid', color: '#c9d8c4' }, opacity: 0.7 },
        mist: { paint: { type: 'solid', color: '#f1f4ee' } },
      },
    },
    {
      id: 'ink',
      label: '水墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#efede6' } },
        bamboo_far: { paint: { type: 'solid', color: '#cfcdc6' } },
        bamboo_mid: { paint: { type: 'solid', color: '#9c9a94' } },
        bamboo_near: { paint: { type: 'solid', color: '#5b5a57' } },
        bamboo_front: { paint: { type: 'solid', color: '#2a2a29' } },
        node: { paint: { type: 'solid', color: '#e2e0d8' }, opacity: 0.6 },
        mist: { paint: { type: 'solid', color: '#f6f4ee' } },
      },
      params: { fog: 0.6 },
    },
    {
      id: 'jade',
      label: '翠玉',
      elements: {
        bg: { paint: { type: 'solid', color: '#cfe0d2' } },
        bamboo_far: { paint: { type: 'solid', color: '#9fc2a8' } },
        bamboo_mid: { paint: { type: 'solid', color: '#5f9672' } },
        bamboo_near: { paint: { type: 'solid', color: '#2f6a47' } },
        bamboo_front: { paint: { type: 'solid', color: '#173d28' } },
        node: { paint: { type: 'solid', color: '#b9dbbf' }, opacity: 0.65 },
        mist: { paint: { type: 'solid', color: '#e6f0e6' } },
      },
      params: { fog: 0.4 },
    },
    {
      id: 'moonlit',
      label: '月夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#2c3a45' } },
        bamboo_far: { paint: { type: 'solid', color: '#3d4f5a' } },
        bamboo_mid: { paint: { type: 'solid', color: '#2a3a44' } },
        bamboo_near: { paint: { type: 'solid', color: '#1a2830' } },
        bamboo_front: { paint: { type: 'solid', color: '#0d161b' } },
        node: { paint: { type: 'solid', color: '#5f7683' }, opacity: 0.6 },
        mist: { paint: { type: 'solid', color: '#4a5d69' } },
      },
      params: { fog: 0.45 },
    },
    {
      id: 'autumn',
      label: '秋黄',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe6d4' } },
        bamboo_far: { paint: { type: 'solid', color: '#d8cfa9' } },
        bamboo_mid: { paint: { type: 'solid', color: '#b2a76d' } },
        bamboo_near: { paint: { type: 'solid', color: '#7a7a45' } },
        bamboo_front: { paint: { type: 'solid', color: '#454a2a' } },
        node: { paint: { type: 'solid', color: '#e8dfba' }, opacity: 0.65 },
        mist: { paint: { type: 'solid', color: '#f6f0e2' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['bamboo_near', 'bamboo_front'],
    secondary: ['bamboo_mid'],
    accent: ['node'],
    detail: ['bamboo_far', 'mist'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const num = (k: string, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number(params[k])));
    const density = num('density', 0.2, 3);
    const fog = num('fog', 0, 1);
    const foliage = num('foliage', 0.1, 3);
    const leanK = num('lean', 0, 1);
    const swaying = animate && params.swaying === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const r0 = Math.round;
    const op = (v: number): string => api.n(Math.max(0, Math.min(1, v)));
    const top = -40;
    const bot = Math.ceil(Hv) + 40;
    const span = bot - top;

    const bg = elements.get('bg')!;
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';
    const mist = elements.get('mist')!;
    const node = elements.get('node')!;
    const mistRect = (y0: number, o: number): string =>
      mist.visible && o > 0 ? `<rect y="${r0(y0)}" width="${Math.ceil(Wv)}" height="${r0(bot - y0)}" fill="${mist.paintValue}" fill-opacity="${op(o * mist.opacity)}"/>` : '';

    // ── 布局（一次性消耗随机数）────────────────────────
    const layerCulms: Culm[][] = LAYERS.map((L, li) => {
      const culms: Culm[] = [];
      // 超宽画幅（虚拟宽 > 2000）按比例放疏，体积不随画幅无限增长
      const gap = L.gap / (density * Math.min(1, 2000 / Wv));
      let x = -rng() * gap;
      let k = 0;
      while (x < Wv + gap * 0.5) {
        const band = Math.floor(rng() * 3) % 3;
        const w = L.wMin + ((band + 0.5) / 3) * (L.wMax - L.wMin);
        const seg = w * (L.seg[0] + ((2 - band + 0.5) / 3) * (L.seg[1] - L.seg[0]));
        culms.push({
          x,
          lean: (rng() - 0.5) * 0.09 * leanK + (li === 3 ? (rng() - 0.5) * 0.04 * leanK : 0),
          w,
          seg,
          y0: top - rng() * seg,
          sub: k++ % 2,
          band,
        });
        x += gap * (0.45 + rng() * 1.1);
      }
      return culms;
    });

    // 竹叶：每竿若干簇，每簇 3~6 片；每片固定消耗随机数
    interface Leaf {
      li: number;
      sub: number;
      bx: number;
      by: number;
      a: number;
      len: number;
      keep: number;
    }
    const leaves: Leaf[] = [];
    const nodesD: string[][] = LAYERS.map(() => ['', '']);
    const twigD: string[][] = LAYERS.map(() => ['', '']);
    LAYERS.forEach((L, li) => {
      layerCulms[li].forEach((c) => {
        const nClusters = Math.max(0, Math.round(L.clusters * foliage * (0.6 + rng() * 0.8)));
        for (let k = 0; k < nClusters; k++) {
          // 簇所在高度：集中在上半部（含画面上方伸入的枝）
          const yy = top + span * Math.pow(rng(), 1.3) * 0.6;
          const nodeIdx = Math.round((yy - c.y0) / c.seg);
          const ny = c.y0 + nodeIdx * c.seg;
          const nx = c.x + c.lean * (ny - top);
          const side = rng() < 0.5 ? -1 : 1;
          const tl = L.leaf * (0.4 + rng() * 0.6);
          const ta = side > 0 ? -0.35 - rng() * 0.5 : Math.PI + 0.35 + rng() * 0.5;
          const ex = nx + Math.cos(ta) * tl;
          const ey = ny + Math.sin(ta) * tl;
          twigD[li][c.sub] += `M${r0(nx)} ${r0(ny)}l${r0(ex - nx)} ${r0(ey - ny)}`;
          const n = 3 + Math.floor(rng() * 4);
          // 扇形下垂：中心方向 = 小枝方向朝下偏 0.9~1.3 rad
          const center = side > 0 ? 0.55 + rng() * 0.5 : Math.PI - 0.55 - rng() * 0.5;
          for (let j = 0; j < n; j++) {
            const spread = (j / Math.max(1, n - 1) - 0.5) * (1.3 + rng() * 0.4);
            leaves.push({
              li,
              sub: c.sub,
              bx: ex,
              by: ey,
              a: center + spread * side,
              len: L.leaf * (0.75 + rng() * 0.5),
              keep: rng(),
            });
          }
        }
        // 竹节环（近两层）
        if (li >= 2) {
          const hw = c.w * 0.56;
          for (let y = c.y0 + c.seg; y < bot; y += c.seg) {
            const x = c.x + c.lean * (y - top);
            nodesD[li][c.sub] += `M${r0(x - hw)} ${r0(y + c.w * 0.16)}h${r0(hw * 2)}`;
          }
        }
      });
    });

    // ── 竹叶 path（超限按 keep 抽稀）──────────────────
    const buildLeaves = (keepFrac: number): string[][] => {
      const out = LAYERS.map(() => ['', '']);
      const pos = LAYERS.map(() => [null, null] as Array<[number, number] | null>);
      leaves
        .filter((l) => l.keep < keepFrac)
        .forEach((l) => {
          const wd = l.len * 0.15;
          const c = Math.cos(l.a);
          const s = Math.sin(l.a);
          const tx = r0(l.len * c);
          const ty = r0(l.len * s);
          const c1x = r0(l.len * 0.35 * c - wd * s);
          const c1y = r0(l.len * 0.35 * s + wd * c);
          const c2x = r0(l.len * 0.35 * c + wd * s) - tx;
          const c2y = r0(l.len * 0.35 * s - wd * c) - ty;
          const x = r0(l.bx);
          const y = r0(l.by);
          const p = pos[l.li][l.sub];
          out[l.li][l.sub] += `${p ? `m${x - p[0]} ${y - p[1]}` : `M${x} ${y}`}q${c1x} ${c1y} ${tx} ${ty}q${c2x} ${c2y} ${-tx} ${-ty}`;
          pos[l.li][l.sub] = [x, y];
        });
      return out.map((a) => a.map((d) => d.replace(/ -/g, '-')));
    };
    // 预估竹竿 path 字节（≈ 18B/竿）+ 节环 + 小枝 → 余下给竹叶
    const fixedBytes =
      layerCulms.reduce((a, cs) => a + cs.length * 18, 0) + [...nodesD.flat(), ...twigD.flat()].reduce((a, d) => a + d.length, 0);
    const leafCap = Math.max(LEAF_MIN, TOTAL_CAP - fixedBytes);
    let keepFrac = 1;
    let leafD = buildLeaves(keepFrac);
    for (let g = 0; g < 30 && leafD.flat().reduce((a, d) => a + d.length, 0) > leafCap; g++) {
      keepFrac *= 0.88;
      leafD = buildLeaves(keepFrac);
    }

    // ── 输出：远 → 近，层间压雾 ─────────────────────────
    const fogAfter = [0.42, 0.3, 0, 0];
    LAYERS.forEach((L, li) => {
      const e = elements.get(L.id)!;
      if (e.visible) {
        let layer = '';
        for (const sub of [0, 1]) {
          const culms = layerCulms[li].filter((c) => c.sub === sub);
          // 竿：按粗细档合并，同档一条 path（同档竿宽 / 节间一致，节环与节缝对齐）
          let g = '';
          for (let band = 0; band < 3; band++) {
            const cs = culms.filter((c) => c.band === band);
            if (cs.length === 0) continue;
            const { w, seg } = cs[0];
            const gapLen = Math.max(1.5, w * 0.13);
            let d = '';
            for (const c of cs) {
              const dx = c.lean * (bot - c.y0);
              d += `M${r0(c.x + c.lean * (c.y0 - top))} ${r0(c.y0)}l${r0(dx)} ${r0(bot - c.y0)}`;
            }
            g += `<path d="${d}" fill="none" stroke-width="${r0(w)}" stroke-dasharray="${r0(seg - gapLen)} ${api.n(gapLen)}"/>`;
          }
          if (twigD[li][sub] !== '') g += `<path d="${twigD[li][sub]}" fill="none" stroke-width="${api.n(Math.max(1, L.wMin * 0.18))}"/>`;
          if (leafD[li][sub] !== '') g += `<path d="${leafD[li][sub]}" stroke="none"/>`;
          if (node.visible && nodesD[li][sub] !== '') {
            g += `<path d="${nodesD[li][sub]}" fill="none" stroke="${node.paintValue}" stroke-opacity="${op(node.opacity)}" stroke-width="${api.n(Math.max(1.2, L.wMin * 0.09))}"/>`;
          }
          if (g === '') continue;
          if (swaying) {
            const ang = L.sway * (sub === 0 ? 1 : 0.8);
            const name = api.keyframes(`vw-bmsway-${String(ang).replace('.', '_')}`, `from{transform:skewX(-${ang}deg)}to{transform:skewX(${ang}deg)}`);
            const dur = Math.round(L.dur * (sub === 0 ? 1 : 1.17) * 10) / 10;
            layer += `<g style="transform-box:fill-box;transform-origin:50% 100%;animation:${name} ${dur}s ease-in-out -${Math.round(dur * (0.25 + 0.3 * sub + 0.1 * li) * 10) / 10}s infinite alternate">${g}</g>`;
          } else {
            layer += g;
          }
        }
        inner += `<g fill="${e.paintValue}" stroke="${e.paintValue}" fill-opacity="${op(e.opacity)}" stroke-opacity="${op(e.opacity)}">${layer}</g>`;
      }
      if (fogAfter[li] > 0) inner += mistRect(top, fog * fogAfter[li]);
      // 地面低雾：近层之后两级
      if (li === 2) inner += mistRect(Hv * 0.7, fog * 0.22) + mistRect(Hv * 0.8, fog * 0.22) + mistRect(Hv * 0.9, fog * 0.22);
    });

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
