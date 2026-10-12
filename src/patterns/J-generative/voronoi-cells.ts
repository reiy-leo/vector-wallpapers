/**
 * 沃罗诺伊细胞 —— J 数学生成 / 单幅构图（seedable）。
 *
 * 算法：抖动网格撒种子（含画布外一圈边缘种子，保证边界细胞完整）→
 * 对每个种子用「与其余种子连线的中垂线半平面」逐一裁剪包围盒，得到凸多边形细胞
 * → 可选 Lloyd 松弛（种子移到细胞质心再重算）让细胞更匀称。
 * 配色分组由低频平滑场 + 随机扰动决定（「成片」程度可调），少量细胞留空只描边，让底色透出来。
 *
 * 三种样式：
 *  - mosaic  圆角马赛克：细胞内缩成均匀缝隙，填色 + 同色圆角描边 → 卵石 / 瓷片感；
 *  - outline 圆角描边：只描细胞轮廓（各组颜色），像细胞切片；
 *  - stained 彩窗：细胞不内缩直接填色，统一用「铅条」色粗线勾缝。
 *
 * ⭐ 体积：几何在「短边 = 1000」虚拟坐标中取整数，每组颜色合并为一条 path（相对坐标）；
 * 细胞总数有硬上限 MAX_CELLS。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { V, centroid, clipHalf, insetConvex, num, op, polyD, scaleOf, smoothField, type P2 } from './_helpers';

const MAX_CELLS = 230;

const def: PatternDef = {
  id: 'voronoi-cells',
  name: '沃罗诺伊细胞',
  category: 'J-generative',
  description: '种子驱动的沃罗诺伊镶嵌：圆角马赛克、细胞描边或彩窗铅条，色块成片分布，换一版即换一组种子。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色 / 缝隙', role: 'bg', paint: { type: 'solid', color: '#ece6dc' }, opacity: 1, visible: true, configurable: true },
    { id: 'cell_a', label: '细胞 · 主', role: 'primary', paint: { type: 'solid', color: '#c9b49a' }, opacity: 1, visible: true, configurable: true },
    { id: 'cell_b', label: '细胞 · 次', role: 'secondary', paint: { type: 'solid', color: '#8fa39a' }, opacity: 1, visible: true, configurable: true },
    { id: 'cell_c', label: '细胞 · 点缀', role: 'accent', paint: { type: 'solid', color: '#c47f62' }, opacity: 1, visible: true, configurable: true },
    { id: 'edge', label: '轮廓 / 铅条', role: 'detail', paint: { type: 'solid', color: '#6f6559' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'nucleus', label: '细胞核', role: 'detail', paint: { type: 'solid', color: '#f7f2ea' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cells', label: '细胞数', type: 'range', min: 10, max: 70, step: 1, default: 28, heavy: true },
    {
      key: 'style', label: '样式', type: 'select', default: 'mosaic', options: [
        { value: 'mosaic', label: '圆角马赛克' },
        { value: 'outline', label: '细胞描边' },
        { value: 'stained', label: '彩窗铅条' },
      ],
    },
    { key: 'gap', label: '缝隙', type: 'range', min: 0.5, max: 4, step: 0.25, default: 1.5 },
    { key: 'round', label: '圆角', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'cluster', label: '色块成片', type: 'range', min: 0, max: 1, step: 0.05, default: 0.65 },
    { key: 'empty', label: '留空比例', type: 'range', min: 0, max: 0.5, step: 0.02, default: 0.16 },
    { key: 'nuclei', label: '细胞核', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'pebble',
      label: '卵石',
      elements: {
        bg: { paint: { type: 'solid', color: '#ece6dc' } },
        cell_a: { paint: { type: 'solid', color: '#c9b49a' } },
        cell_b: { paint: { type: 'solid', color: '#8fa39a' } },
        cell_c: { paint: { type: 'solid', color: '#c47f62' } },
        edge: { paint: { type: 'solid', color: '#6f6559' }, opacity: 0.75 },
        nucleus: { paint: { type: 'solid', color: '#f7f2ea' }, opacity: 0.85 },
      },
    },
    {
      id: 'deep-sea',
      label: '深海切片',
      elements: {
        bg: { paint: { type: 'solid', color: '#141c26' } },
        cell_a: { paint: { type: 'solid', color: '#5f93a3' } },
        cell_b: { paint: { type: 'solid', color: '#8fb3a6' } },
        cell_c: { paint: { type: 'solid', color: '#d9ad6f' } },
        edge: { paint: { type: 'solid', color: '#4f6878' }, opacity: 0.9 },
        nucleus: { paint: { type: 'solid', color: '#e8dcc0' }, opacity: 0.8 },
      },
      params: { style: 'outline', cells: 34, gap: 1.25, round: 0.8, empty: 0.2 },
    },
    {
      id: 'cathedral',
      label: '彩窗',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1a1f' } },
        cell_a: { paint: { type: 'solid', color: '#3f5b70' } },
        cell_b: { paint: { type: 'solid', color: '#6e4a52' } },
        cell_c: { paint: { type: 'solid', color: '#b8955a' } },
        edge: { paint: { type: 'solid', color: '#1d1a1f' }, opacity: 1 },
        nucleus: { paint: { type: 'solid', color: '#efe3c8' }, opacity: 0.35 },
      },
      params: { style: 'stained', cells: 22, gap: 2.5, cluster: 0.35, empty: 0.12 },
    },
    {
      id: 'sage-tile',
      label: '鼠尾草瓷片',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3f1ea' } },
        cell_a: { paint: { type: 'solid', color: '#b9c4b0' } },
        cell_b: { paint: { type: 'solid', color: '#d9d2c0' } },
        cell_c: { paint: { type: 'solid', color: '#7f9483' } },
        edge: { paint: { type: 'solid', color: '#9aa596' }, opacity: 0.8 },
        nucleus: { paint: { type: 'solid', color: '#5f7466' }, opacity: 0.5 },
      },
      params: { cells: 46, gap: 1.25, round: 0.85, cluster: 0.8, empty: 0.1, nuclei: false },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['cell_a'],
    secondary: ['cell_b'],
    accent: ['cell_c'],
    detail: ['edge', 'nucleus'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cellsK = num(params, 'cells', 10, 70);
    const gapK = num(params, 'gap', 0.5, 4);
    const roundK = num(params, 'round', 0, 1);
    const cluster = num(params, 'cluster', 0, 1);
    const emptyK = num(params, 'empty', 0, 0.5);
    const nuclei = params.nuclei === true;
    const style = params.style === 'outline' || params.style === 'stained' ? params.style : 'mosaic';

    const q = scaleOf(W, H);
    const Wv = W / q;
    const Hv = H / q;

    // ── 种子：抖动网格（含画布外一圈） ──────────────────────
    const target = Math.min(MAX_CELLS, Math.round((cellsK * Wv * Hv) / (V * V)));
    const s = Math.sqrt((Wv * Hv) / Math.max(4, target)); // 平均细胞边长
    const cols = Math.max(2, Math.round(Wv / s));
    const rows = Math.max(2, Math.round(Hv / s));
    const sx = Wv / cols;
    const sy = Hv / rows;
    let sites: P2[] = [];
    const inside: boolean[] = [];
    for (let j = -1; j <= rows; j++) {
      for (let i = -1; i <= cols; i++) {
        const jit = 0.85;
        const x = (i + 0.5 + (rng() - 0.5) * jit) * sx;
        const y = (j + 0.5 + (rng() - 0.5) * jit) * sy;
        sites.push([x, y]);
        inside.push(i >= 0 && j >= 0 && i < cols && j < rows);
      }
    }
    const box: P2[] = [
      [-sx * 1.5, -sy * 1.5],
      [Wv + sx * 1.5, -sy * 1.5],
      [Wv + sx * 1.5, Hv + sy * 1.5],
      [-sx * 1.5, Hv + sy * 1.5],
    ];
    const reach = Math.max(sx, sy) * 4;

    const cellOf = (k: number, pts: ReadonlyArray<P2>): P2[] => {
      const [px, py] = pts[k];
      let poly: P2[] = box.slice();
      // 只与附近种子求中垂线（远处的不可能切到本细胞）
      for (let m = 0; m < pts.length && poly.length >= 3; m++) {
        if (m === k) continue;
        const [qx, qy] = pts[m];
        const dx = qx - px;
        const dy = qy - py;
        if (Math.abs(dx) > reach || Math.abs(dy) > reach) continue;
        poly = clipHalf(poly, dx, dy, (dx * (px + qx) + dy * (py + qy)) / 2);
      }
      return poly;
    };

    // Lloyd 松弛 1 轮（仅移动画布内种子；边缘种子保持抖动网格）
    let polys = sites.map((_, k) => cellOf(k, sites));
    sites = sites.map((p, k) => (inside[k] && polys[k].length >= 3 ? centroid(polys[k]) : p));
    polys = sites.map((_, k) => cellOf(k, sites));

    // ── 配色分组：平滑场 + 随机扰动 ─────────────────────────
    const field = smoothField(rng, Math.min(Wv, Hv) * 0.32);
    const groups: Array<{ poly: P2[]; site: P2; g: number; v: number }> = [];
    sites.forEach((site, k) => {
      const poly = polys[k];
      const noise = rng() * 2 - 1;
      const pick = rng();
      if (poly.length < 3) return;
      // 只保留与画布相交的细胞
      const xs = poly.map((p) => p[0]);
      const ys = poly.map((p) => p[1]);
      if (Math.max(...xs) < 0 || Math.min(...xs) > Wv || Math.max(...ys) < 0 || Math.min(...ys) > Hv) return;
      const v = field(site[0], site[1]) * cluster + noise * 1.6 * (1 - cluster);
      groups.push({ poly, site, g: pick < emptyK ? 3 : -1, v });
    });
    // 按场值排名分组：主 46% / 次 34% / 点缀 20%（比例稳定，不随 seed 偏色）
    const ranked = groups.filter((c) => c.g !== 3).sort((a, b) => a.v - b.v);
    ranked.forEach((c, i) => {
      const t = i / Math.max(1, ranked.length);
      c.g = t < 0.46 ? 0 : t < 0.8 ? 1 : 2;
    });

    // ── 几何：内缩 + 圆角 ────────────────────────────────
    const gapV = (gapK * 3) / 2; // 缝隙一半（虚拟单位）
    const radV = roundK * s * 0.26;
    const lineV = Math.max(1.5, gapK * (style === 'outline' ? 2.4 : 1.6));
    const ds = ['', '', '', ''];
    const holes: string[] = [];
    for (const c of groups) {
      if (style === 'stained') {
        ds[c.g] += polyD(c.poly);
      } else {
        const inset = insetConvex(c.poly, gapV + radV + (style === 'outline' && radV < lineV / 2 ? lineV / 2 : 0));
        if (inset.length < 3) continue;
        const d = polyD(inset);
        if (c.g === 3) holes.push(d);
        else ds[c.g] += d;
      }
    }

    const ids = ['cell_a', 'cell_b', 'cell_c'];
    let inner = '';
    const edge = elements.get('edge')!;
    const bgEl = elements.get('bg')!;
    if (style === 'stained') {
      ids.forEach((id, gi) => {
        const e = elements.get(id)!;
        if (e.visible && ds[gi] !== '') inner += `<path d="${ds[gi]}" fill="${e.paintValue}" fill-opacity="${op(e.opacity)}"/>`;
      });
      // 留空细胞在彩窗里显示为底色玻璃：不填，透出底色
      if (edge.visible) {
        const all = groups.map((c) => polyD(c.poly)).join('');
        inner += `<path d="${all}" fill="none" stroke="${edge.paintValue}" stroke-opacity="${op(edge.opacity)}" stroke-width="${Math.round(gapV * 2 + 2)}" stroke-linejoin="round"/>`;
      }
    } else {
      const sw = style === 'outline' ? lineV : radV * 2;
      ids.forEach((id, gi) => {
        const e = elements.get(id)!;
        if (!e.visible || ds[gi] === '') return;
        if (style === 'outline') {
          // 圆角环：同一路径先用细胞色粗描边，再用底色描内圈 → 只剩一圈圆角轮廓
          if (radV > lineV / 2) {
            const id = `vc${cfg.seed}${gi}`;
            inner +=
              `<defs><path id="${id}" d="${ds[gi]}"/></defs>` +
              `<use href="#${id}" fill="none" stroke="${e.paintValue}" stroke-opacity="${op(e.opacity)}" stroke-width="${api.n(radV * 2 + lineV)}" stroke-linejoin="round"/>` +
              `<use href="#${id}" fill="${bgEl.paintValue}" stroke="${bgEl.paintValue}" stroke-width="${api.n(radV * 2 - lineV)}" stroke-linejoin="round"/>`;
          } else {
            inner += `<path d="${ds[gi]}" fill="none" stroke="${e.paintValue}" stroke-opacity="${op(e.opacity)}" stroke-width="${api.n(lineV)}" stroke-linejoin="round"/>`;
          }
        } else {
          const strokeAttr = sw > 0.5 ? ` stroke="${e.paintValue}" stroke-width="${api.n(sw)}" stroke-linejoin="round"` : '';
          inner += `<path d="${ds[gi]}" fill="${e.paintValue}"${strokeAttr} opacity="${op(e.opacity)}"/>`;
        }
      });
      if (edge.visible && holes.length > 0) {
        inner += `<path d="${holes.join('')}" fill="none" stroke="${edge.paintValue}" stroke-opacity="${op(edge.opacity)}" stroke-width="${api.n(lineV)}" stroke-linejoin="round" stroke-dasharray="${api.n(lineV * 2.5)} ${api.n(lineV * 2.5)}"/>`;
      }
    }

    // ── 细胞核：零长度子路径 + 圆头描边 ─────────────────────
    const nucleus = elements.get('nucleus')!;
    if (nuclei && nucleus.visible) {
      let d = '';
      let px = 0;
      let py = 0;
      const list = groups.filter((c) => c.g !== 3 || style === 'stained').map((c) => c.site);
      list.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      for (const p of list) {
        const x = Math.round(p[0]);
        const y = Math.round(p[1]);
        if (x < -10 || y < -10 || x > Wv + 10 || y > Hv + 10) continue;
        d += d === '' ? `M${x} ${y}h0` : `m${x - px}${y - py < 0 ? '' : ' '}${y - py}h0`;
        px = x;
        py = y;
      }
      if (d !== '') {
        inner += `<path d="${d}" fill="none" stroke="${nucleus.paintValue}" stroke-opacity="${op(nucleus.opacity)}" stroke-width="${api.n(Math.max(4, s * 0.075))}" stroke-linecap="round"/>`;
      }
    }

    const bg = elements.get('bg')!;
    return {
      body:
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) +
        `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
