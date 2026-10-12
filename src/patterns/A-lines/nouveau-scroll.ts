/**
 * 涡卷曲线 —— A 极简线条。
 *
 * 构图要点：**自相似递归**的对数螺线涡卷。每一圈涡卷的起始点上
 * 再生一个缩小版涡卷，层层递归 —— 这正是新艺术运动卷草纹的核心机制。
 *
 * 与现有 A 类两个近似母题的区别（`STYLE-100-ANALYSIS.md` §4.2 的缺口论证）：
 *  - `contour-rings` 是**闭合同心圆**，无自相似、无端点
 *  - `flow-lines` 是**开放平行流线**，无递归、无卷曲
 *  - 本母题是**递归 + 有端点 + 螺旋收紧**，三者皆不同
 *
 * 2026-10-12 改版（Rei：每块形状可以随机）：不再用 <pattern> 平铺同一单元，
 * 整幅 best-candidate 散布卷草簇，每簇的圈数 / 收紧 / 方向 / 旋向 / 大小按「随机度」各自偏离；
 * 压边簇在对边用同一子种子复制 → 可无缝平铺。同元件合成一条 path，节点数恒定；BYTE_CAP 兜体积。
 */
import { path, rect } from '../../engine/svg';
import { mulberry32 } from '../../engine/rng';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';

/** path 数据体积上限：保证任意尺寸/参数都不击穿 20KB。 */
const BYTE_CAP = 16500;

const def: PatternDef = {
  id: 'nouveau-scroll',
  name: '涡卷曲线',
  category: 'A-lines',
  description: '自相似递归的对数螺线涡卷随意散布，每簇的圈数、方向、大小都不同，优雅有机。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f7f3ea' }, opacity: 1, visible: true, configurable: true },
    { id: 'stem', label: '主涡卷', role: 'primary', paint: { type: 'solid', color: '#2d5a3d' }, opacity: 1, visible: true, configurable: true },
    { id: 'scroll', label: '副涡卷', role: 'secondary', paint: { type: 'solid', color: '#8b6f3e' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'bud', label: '花苞点', role: 'accent', paint: { type: 'solid', color: '#a63d40' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '单元尺寸', type: 'range', min: 160, max: 480, step: 10, default: 260, heavy: true },
    { key: 'vary', label: '随机度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'turns', label: '旋转圈数', type: 'range', min: 1.2, max: 3.5, step: 0.1, default: 2.2 },
    { key: 'tighten', label: '收紧系数', type: 'range', min: 0.15, max: 0.6, step: 0.01, default: 0.34 },
    { key: 'depth', label: '递归层数', type: 'range', min: 1, max: 5, step: 1, default: 3 },
    { key: 'sides', label: '镜像', type: 'select', default: '2', options: [
      { value: '1', label: '单支' },
      { value: '2', label: '双支镜像' },
      { value: '4', label: '四向' },
    ] },
  ],

  presets: [
    {
      id: 'ivy',
      label: '常春藤',
      elements: {
        bg: { paint: { type: 'solid', color: '#f7f3ea' } },
        stem: { paint: { type: 'solid', color: '#2d5a3d' } },
        scroll: { paint: { type: 'solid', color: '#8b6f3e' } },
        bud: { paint: { type: 'solid', color: '#a63d40' } },
      },
    },
    {
      id: 'midnight',
      label: '午夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#131a24' } },
        stem: { paint: { type: 'solid', color: '#c9a96a' } },
        scroll: { paint: { type: 'solid', color: '#7d8ea3' } },
        bud: { paint: { type: 'solid', color: '#c96f7a' } },
      },
    },
    {
      id: 'terracotta',
      label: '赤陶',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2e4d8' } },
        stem: { paint: { type: 'solid', color: '#a8442a' } },
        scroll: { paint: { type: 'solid', color: '#6b7a4f' } },
        bud: { paint: { type: 'solid', color: '#e0a458' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['stem'], secondary: ['scroll'], accent: ['bud'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    // 尺寸按短边归一化（1080 基准）→ 与分辨率无关
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const cell = Math.max(160, Number(params.cell)) * unitPx;
    const turns0 = Math.max(1.2, Math.min(3.5, Number(params.turns)));
    const tighten0 = Math.max(0.15, Math.min(0.6, Number(params.tighten)));
    const depth = Math.round(Math.max(1, Math.min(5, Number(params.depth))));
    const sides = Number(params.sides) === 1 ? 1 : Number(params.sides) === 4 ? 4 : 2;
    const vary = Math.max(0, Math.min(1, Number(params.vary ?? 0.6)));

    const bg = elements.get('bg')!;
    const stem = elements.get('stem')!;
    const scroll = elements.get('scroll')!;
    const bud = elements.get('bud')!;

    // 同一元件的所有涡卷合成一条 path（节点数恒定）
    let stemD = '';
    let scrollD = '';
    let budD = '';
    // 大画布取整到 1px，小画布保留 1 位小数：肉眼无差，体积省一截
    const q = unitPx >= 1 ? 1 : 10;
    const R = (v: number): number => Math.round(v * q) / q;

    /**
     * 对数螺线卷：**从起点 (sx,sy) 向内卷**，r(t) = r0 · tighten^(t·turns)。
     * 圆心放在起点沿 rot 的反方向 r0 处，于是曲线恰好从给定点出发 —— 子卷能从母卷身上「长出来」。
     * 返回折线 d 与曲线上的采样点（供子卷取出芽点）。
     */
    const curl = (sx: number, sy: number, rot: number, r0: number, dir: number, turns: number, tighten: number) => {
      const cx = sx - r0 * Math.cos(rot);
      const cy = sy - r0 * Math.sin(rot);
      const steps = Math.max(10, Math.min(30, Math.round(turns * 7 + (r0 / unitPx) / 10)));
      let px = R(sx);
      let py = R(sy);
      let d = `M${px} ${py}`;
      const pts: Array<[number, number, number]> = [[sx, sy, rot]];
      for (let i = 1; i <= steps; i++) {
        // 外圈弧长大、内圈小：采样向外圈加密（u^1.7），同样段数下外圈不再折角
        const t = Math.pow(i / steps, 1.7);
        const th = rot + dir * turns * Math.PI * 2 * t;
        const r = r0 * Math.pow(tighten, t * turns);
        const x = cx + r * Math.cos(th);
        const y = cy + r * Math.sin(th);
        pts.push([x, y, th]);
        const nx = R(x);
        const ny = R(y);
        d += `l${R(nx - px)} ${R(ny - py)}`;
        px = nx;
        py = ny;
      }
      return { d, pts };
    };

    /**
     * 一簇卷草：从簇心向 sides 个方向各甩出一支主卷（双支时左右旋向相反 → S 形卷）；
     * 每支主卷靠外的一段再「出芽」长出反向的小卷，递归 depth 层，最末端点花苞。
     * 「随机度」让每簇的圈数、收紧、方向、旋向、大小、出芽位置各自偏离 → 每块形状都不同。
     */
    const cluster = (cx: number, cy: number, rr: () => number) => {
      const scale = 1 + (rr() - 0.5) * 0.9 * vary;
      const turns = turns0 * (1 + (rr() - 0.5) * 0.5 * vary);
      const tighten = Math.max(0.15, Math.min(0.6, tighten0 * (1 + (rr() - 0.5) * 0.6 * vary)));
      const spin = rr() * Math.PI * 2 * Math.min(1, vary * 1.5);
      const base = sides === 1 ? [0] : sides === 4 ? [0, Math.PI / 2, Math.PI, -Math.PI / 2] : [0, Math.PI];
      const flip = rr() < 0.5 ? 1 : -1;
      const grow = (sx: number, sy: number, rot: number, r0: number, dir: number, level: number) => {
        const primary = level === 0;
        const el = primary ? stem : scroll;
        // 体积兜底放在每一支上：最坏参数（四向 × 5 层）下单簇就有数 KB
        if (!el.visible || stemD.length + scrollD.length + budD.length > BYTE_CAP) return;
        const c = curl(sx, sy, rot, r0, dir, primary ? turns : turns * 0.85, tighten);
        if (primary) stemD += c.d;
        else scrollD += c.d;
        if (level < depth - 1) {
          // 在曲线外侧 15%~35% 处出芽，反向卷
          const k = Math.max(1, Math.round(c.pts.length * (0.15 + rr() * 0.2)));
          const [bx, by, th] = c.pts[k];
          grow(bx, by, th + Math.PI, r0 * (0.42 + rr() * 0.12), -dir, level + 1);
        } else if (bud.visible) {
          const [tx, ty] = c.pts[c.pts.length - 1];
          budD += `M${R(tx)} ${R(ty)}h0`;
        }
      };
      base.forEach((b, idx) => {
        const rot = b + spin + (rr() - 0.5) * 0.8 * vary;
        const dir = (sides === 2 && idx === 1 ? -1 : 1) * flip;
        const r0 = cell * 0.3 * scale * (1 + (rr() - 0.5) * 0.4 * vary);
        grow(cx, cy, rot, r0, dir, 0);
      });
    };

    // 簇心：best-candidate 均匀随机落位；压边的簇在对边复制 → 四边可无缝平铺
    const count = Math.max(4, Math.min(40, Math.round((W * H) / (cell * cell * 1.3))));
    const reach = cell * 0.75;
    const centers: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      let best: [number, number] = [0, 0];
      let bestD = -1;
      for (let k = 0; k < 8; k++) {
        const x = rng() * W;
        const y = rng() * H;
        let dmin = Infinity;
        for (const [qx, qy] of centers) {
          const dx = Math.min(Math.abs(qx - x), W - Math.abs(qx - x));
          const dy = Math.min(Math.abs(qy - y), H - Math.abs(qy - y));
          dmin = Math.min(dmin, dx * dx + dy * dy);
        }
        if (dmin > bestD) {
          bestD = dmin;
          best = [x, y];
        }
      }
      centers.push(best);
    }
    for (const [x0, y0] of centers) {
      if (stemD.length + scrollD.length + budD.length > BYTE_CAP) break;
      // 每个副本用同一随机序列 → 接缝两侧形状一致
      const xs = [x0, ...(x0 - reach < 0 ? [x0 + W] : []), ...(x0 + reach > W ? [x0 - W] : [])];
      const ys = [y0, ...(y0 - reach < 0 ? [y0 + H] : []), ...(y0 + reach > H ? [y0 - H] : [])];
      const seed = Math.floor(rng() * 4294967296);
      for (const x of xs) for (const y of ys) cluster(x, y, mulberry32(seed));
    }

    const sw = Math.max(0.9, cell * 0.011);
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (stemD) parts.push(path(stemD, { fill: 'none', stroke: stem.paintValue, 'stroke-opacity': stem.opacity, 'stroke-width': sw, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (scrollD) parts.push(path(scrollD, { fill: 'none', stroke: scroll.paintValue, 'stroke-opacity': scroll.opacity, 'stroke-width': sw * 0.72, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (budD) parts.push(path(budD, { fill: 'none', stroke: bud.paintValue, 'stroke-opacity': bud.opacity, 'stroke-width': cell * 0.034, 'stroke-linecap': 'round' }));
    return { body: parts.join('') };
  },
};

export default def;
