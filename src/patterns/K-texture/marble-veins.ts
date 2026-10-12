/**
 * 大理石 —— K 材质纹理。
 *
 * 结构（自下而上）：
 *   bg        石材底色；
 *   cloud     几团高斯模糊的大色块 → 石材内部的云雾状色差；
 *   vein      主脉：沿统一走向蜿蜒穿过画面的粗细变化脉络（填充多边形，宽度沿程起伏），
 *             背后垫一层同形模糊「晕」（<use> 复用同一条 path，不增字节）；
 *   vein_fine 支脉：从主脉分叉出去的细纹，可再分叉，偶尔交织；
 *   accent    金线：一条更细、更直的点缀脉（可关）。
 *
 * 脉络走向 = 总方向 + 两段低频正弦（蜿蜒）+ 逐步小抖动（石材的碎裂感，由「粗糙度」控制）。
 * 体积：短边 = 1000 的虚拟坐标 + 整体 scale；折线 RDP 化简为整数相对坐标；
 * 主脉 + 支脉总字节有上限，超出逐级放宽化简容差。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { V, num, op, polyD, scaleOf, simplify, type Pt } from './_helpers';

/** 主脉 + 支脉 path 数据总字节上限。 */
const VEIN_CAP = 14000;

const def: PatternDef = {
  id: 'marble-veins',
  name: '大理石',
  category: 'K-texture',
  description: '石材底色上浮着云雾状色差，主脉粗细起伏地斜穿画面，并分叉出细密支脉。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '石底', role: 'bg', paint: { type: 'solid', color: '#efede9' }, opacity: 1, visible: true, configurable: true },
    { id: 'cloud', label: '云雾', role: 'detail', paint: { type: 'solid', color: '#dcd8d2' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'vein', label: '主脉', role: 'primary', paint: { type: 'solid', color: '#8e9096' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'vein_fine', label: '支脉', role: 'secondary', paint: { type: 'solid', color: '#a9abb0' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'accent', label: '金线', role: 'accent', paint: { type: 'solid', color: '#c2a76f' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    { key: 'veins', label: '主脉数', type: 'range', min: 1, max: 7, step: 1, default: 3, heavy: true },
    { key: 'branching', label: '分叉', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55, heavy: true },
    { key: 'angle', label: '走向', type: 'range', min: -80, max: 80, step: 5, default: 30, unit: '°' },
    { key: 'roughness', label: '粗糙度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.45 },
    { key: 'gold', label: '金线', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'carrara',
      label: '卡拉拉白',
      elements: {
        bg: { paint: { type: 'solid', color: '#efede9' } },
        cloud: { paint: { type: 'solid', color: '#dcd8d2' }, opacity: 0.7 },
        vein: { paint: { type: 'solid', color: '#8e9096' }, opacity: 0.8 },
        vein_fine: { paint: { type: 'solid', color: '#a9abb0' }, opacity: 0.75 },
        accent: { paint: { type: 'solid', color: '#c2a76f' }, opacity: 0.85 },
      },
    },
    {
      id: 'calacatta',
      label: '金丝白',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3f0ea' } },
        cloud: { paint: { type: 'solid', color: '#e6e0d6' }, opacity: 0.75 },
        vein: { paint: { type: 'solid', color: '#9b9488' }, opacity: 0.75 },
        vein_fine: { paint: { type: 'solid', color: '#bcb4a7' }, opacity: 0.7 },
        accent: { paint: { type: 'solid', color: '#c19a55' }, opacity: 0.9 },
      },
      params: { gold: true, veins: 2, angle: -35, branching: 0.4 },
    },
    {
      id: 'nero',
      label: '黑金花',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c1d20' } },
        cloud: { paint: { type: 'solid', color: '#2b2c30' }, opacity: 0.8 },
        vein: { paint: { type: 'solid', color: '#d8d5cf' }, opacity: 0.75 },
        vein_fine: { paint: { type: 'solid', color: '#7f7f82' }, opacity: 0.7 },
        accent: { paint: { type: 'solid', color: '#b8995c' }, opacity: 0.85 },
      },
      params: { gold: true, veins: 4, branching: 0.65 },
    },
    {
      id: 'verde',
      label: '森绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#2e463f' } },
        cloud: { paint: { type: 'solid', color: '#3b5850' }, opacity: 0.8 },
        vein: { paint: { type: 'solid', color: '#c9d5cc' }, opacity: 0.7 },
        vein_fine: { paint: { type: 'solid', color: '#7f9a90' }, opacity: 0.75 },
        accent: { paint: { type: 'solid', color: '#e2d6b0' }, opacity: 0.6 },
      },
      params: { veins: 5, angle: 55, roughness: 0.6, branching: 0.7 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['vein'],
    secondary: ['vein_fine'],
    accent: ['accent'],
    detail: ['cloud'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, seed } = cfg;
    const veinN = Math.round(num(params, 'veins', 1, 7));
    const branching = num(params, 'branching', 0, 1);
    const angDeg = num(params, 'angle', -80, 80);
    const rough = num(params, 'roughness', 0, 1);
    const goldOn = params.gold === true;

    const q = scaleOf(W, H);
    const Wv = W / q;
    const Hv = H / q;
    const r0 = Math.round;
    const cx = Wv / 2;
    const cy = Hv / 2;
    const diag = Math.hypot(Wv, Hv);

    const bg = elements.get('bg')!;
    const cloud = elements.get('cloud')!;
    const vein = elements.get('vein')!;
    const fine = elements.get('vein_fine')!;
    const accent = elements.get('accent')!;

    const th = (angDeg * Math.PI) / 180;
    const dir: Pt = [Math.cos(th), Math.sin(th)];
    const nor: Pt = [-dir[1], dir[0]];

    /**
     * 一条蜿蜒脉络：自 p 沿角度 a 走 len，步长 st。
     * 方向 = a + 两段低频正弦 + 逐步抖动（抖动幅度随粗糙度）。
     */
    const walk = (p: Pt, a: number, len: number, st: number, wig: number): Pt[] => {
      const pts: Pt[] = [[p[0], p[1]]];
      const f1 = 1.5 + rng() * 2;
      const f2 = 4 + rng() * 5;
      const p1 = rng() * 6.283;
      const p2 = rng() * 6.283;
      let x = p[0];
      let y = p[1];
      const n = Math.max(2, Math.round(len / st));
      let drift = 0;
      for (let i = 1; i <= n; i++) {
        const t = i / n;
        // 角度随机游走（带回复）→ 弯而不折；独立抖动只负责「碎」，随粗糙度
        drift = drift * 0.82 + (rng() - 0.5) * 0.22;
        const aa =
          a +
          wig * (0.32 * Math.sin(t * f1 * Math.PI + p1) + 0.16 * Math.sin(t * f2 * Math.PI + p2)) +
          drift +
          (rng() - 0.5) * rough * 0.75;
        x += Math.cos(aa) * st;
        y += Math.sin(aa) * st;
        pts.push([x, y]);
      }
      return pts;
    };

    // ── 主脉：沿法向均匀分布起点，穿越整幅 ───────────────────
    interface MainVein {
      pts: Pt[];
      w: number[];
    }
    const mains: MainVein[] = [];
    const span = Math.abs(Wv * nor[0]) + Math.abs(Hv * nor[1]); // 画面在法向上的投影宽度
    for (let i = 0; i < veinN; i++) {
      const off = ((i + 0.5) / veinN - 0.5) * span * 0.9 + (rng() - 0.5) * (span / veinN) * 0.6;
      const start: Pt = [cx + nor[0] * off - dir[0] * diag * 0.62, cy + nor[1] * off - dir[1] * diag * 0.62];
      const pts = walk(start, th + (rng() - 0.5) * 0.25, diag * 1.24, V * 0.018, 1);
      // 宽度沿程起伏：若干个「鼓包」叠加，两端收细
      const wBase = V * (0.0035 + rng() * 0.004) * (i === 0 ? 1.5 : 1);
      const bumps = Array.from({ length: 4 }, () => [rng(), 0.06 + rng() * 0.16, 0.3 + rng() * 2]);
      const w = pts.map((_, k) => {
        const t = k / (pts.length - 1);
        let s = 0.12;
        for (const [c, sp, h] of bumps) s += h * Math.exp(-(((t - c) / sp) ** 2));
        return wBase * s;
      });
      mains.push({ pts, w });
    }

    // ── 伴生细纹：贴着主脉一侧平行走一段（大理石脉常成束出现）────────
    const companions: Pt[][] = [];
    for (const m of mains) {
      const nc = Math.round(1 + branching * 2.5 * rng());
      for (let c = 0; c < nc; c++) {
        const n = m.pts.length;
        const i0 = Math.floor(rng() * n * 0.6);
        const i1 = Math.min(n - 1, i0 + Math.floor(n * (0.2 + rng() * 0.4)));
        const side = rng() < 0.5 ? -1 : 1;
        const gap = V * (0.006 + rng() * 0.014);
        const ph = rng() * 6.283;
        const pts: Pt[] = [];
        for (let i = i0; i <= i1; i++) {
          const a = m.pts[Math.max(0, i - 1)];
          const b = m.pts[Math.min(n - 1, i + 1)];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
          const t = (i - i0) / Math.max(1, i1 - i0);
          // 两端并回主脉，中段分开
          const g = side * gap * Math.sin(t * Math.PI) * (1 + 0.5 * Math.sin(t * 9 + ph));
          pts.push([m.pts[i][0] - ((b[1] - a[1]) / len) * g, m.pts[i][1] + ((b[0] - a[0]) / len) * g]);
        }
        companions.push(pts);
      }
    }

    // ── 支脉：从主脉分叉，偏离主方向 15°~55°，可再分一级 ───────────
    const branches: Array<{ pts: Pt[]; level: number }> = [];
    const spawn = (from: Pt[], baseA: number, level: number, count: number, lenK: number): void => {
      for (let b = 0; b < count; b++) {
        const k = Math.floor((0.05 + rng() * 0.9) * (from.length - 1));
        const p = from[k];
        const side = rng() < 0.5 ? -1 : 1;
        const a = baseA + side * (0.26 + rng() * 0.7);
        const len = diag * lenK * (0.35 + rng() * 0.65);
        const pts = walk(p, a, len, V * 0.014, 0.8);
        branches.push({ pts, level });
        if (level === 0 && rng() < branching * 0.8) spawn(pts, a, 1, 1 + Math.floor(rng() * 2), lenK * 0.45);
      }
    };
    for (const m of mains) spawn(m.pts, th, 0, Math.round(branching * (2 + rng() * 5)), 0.32);
    // 少量自由细纹（不依附主脉），斜向交织
    const loose = Math.round(branching * 4);
    for (let i = 0; i < loose; i++) {
      const p: Pt = [rng() * Wv, rng() * Hv];
      branches.push({ pts: walk(p, th + (rng() < 0.5 ? 0.5 : -0.5) + (rng() - 0.5) * 0.4, diag * (0.15 + rng() * 0.3), V * 0.014, 0.9), level: 1 });
    }

    // ── 编码（带总字节上限）────────────────────────────────
    const ribbon = (m: MainVein): Pt[] => {
      const L: Pt[] = [];
      const R: Pt[] = [];
      const n = m.pts.length;
      for (let i = 0; i < n; i++) {
        const a = m.pts[Math.max(0, i - 1)];
        const b = m.pts[Math.min(n - 1, i + 1)];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const hw = m.w[i] / 2;
        L.push([m.pts[i][0] + nx * hw, m.pts[i][1] + ny * hw]);
        R.push([m.pts[i][0] - nx * hw, m.pts[i][1] - ny * hw]);
      }
      return [...L, ...R.reverse()];
    };
    const ribbons = mains.map(ribbon);
    const encode = (tol: number): [string, string, string] => {
      let dm = '';
      for (const rb of ribbons) dm += polyD(simplify(rb, tol * 0.5), true);
      let d0 = '';
      let d1 = '';
      for (const b of branches) {
        const d = polyD(simplify(b.pts, tol));
        if (b.level === 0) d0 += d;
        else d1 += d;
      }
      for (const c of companions) d1 += polyD(simplify(c, tol));
      return [dm, d0, d1];
    };
    let tol = 0.5;
    let enc = encode(tol);
    for (let g = 0; g < 20 && enc.join('').length > VEIN_CAP; g++) {
      tol *= 1.25;
      enc = encode(tol);
    }
    const [mainD, br0D, br1D] = enc;

    // ── 金线：一条更直的细脉 ───────────────────────────────
    let goldD = '';
    if (goldOn && accent.visible) {
      const off = (rng() - 0.5) * span * 0.6;
      const a = th + (rng() < 0.5 ? 0.18 : -0.18);
      const start: Pt = [cx + nor[0] * off - Math.cos(a) * diag * 0.6, cy + nor[1] * off - Math.sin(a) * diag * 0.6];
      const pts = walk(start, a, diag * 1.2, V * 0.02, 0.6);
      goldD = polyD(simplify(pts, 0.6));
      // 金线的一条短分叉
      const k = Math.floor(pts.length * (0.3 + rng() * 0.4));
      goldD += polyD(simplify(walk(pts[k], a + 0.6, diag * 0.18, V * 0.016, 0.6), 0.6));
    }

    // ── 组装 ────────────────────────────────────────────
    let inner = '';
    if (cloud.visible) {
      let blobs = '';
      const nb = 5 + Math.floor(rng() * 3);
      for (let i = 0; i < nb; i++) {
        // 云团沿脉络方向拉长，与石材的沉积方向一致
        const along = (rng() - 0.5) * diag * 0.8;
        const across = (rng() - 0.5) * span * 0.9;
        const x = cx + dir[0] * along + nor[0] * across;
        const y = cy + dir[1] * along + nor[1] * across;
        const rx = V * (0.22 + rng() * 0.3);
        const ry = rx * (0.3 + rng() * 0.3);
        blobs += `<ellipse transform="translate(${r0(x)} ${r0(y)})rotate(${r0(angDeg + (rng() - 0.5) * 30)})" rx="${r0(rx)}" ry="${r0(ry)}" fill-opacity="${op(0.5 + rng() * 0.5)}"/>`;
      }
      inner += `<g fill="${cloud.paintValue}" opacity="${op(cloud.opacity)}" filter="${api.blur(V * 0.05)}">${blobs}</g>`;
    }
    if (fine.visible) {
      if (br1D !== '') inner += `<path d="${br1D}" fill="none" stroke="${fine.paintValue}" stroke-opacity="${op(fine.opacity * 0.75)}" stroke-width="0.8" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (br0D !== '') inner += `<path d="${br0D}" fill="none" stroke="${fine.paintValue}" stroke-opacity="${op(fine.opacity)}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    }
    if (vein.visible && mainD !== '') {
      const id = `mv${seed}-${r0(Wv)}-${r0(Hv)}`;
      inner +=
        `<use href="#${id}" opacity="0.3" filter="${api.blur(V * 0.012)}"/>` +
        `<path id="${id}" d="${mainD}" fill="${vein.paintValue}" fill-opacity="${op(vein.opacity)}" stroke="${vein.paintValue}" stroke-opacity="${op(vein.opacity)}" stroke-width="0.6" stroke-linejoin="round"/>`;
    }
    if (goldD !== '') inner += `<path d="${goldD}" fill="none" stroke="${accent.paintValue}" stroke-opacity="${op(accent.opacity)}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`;

    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
