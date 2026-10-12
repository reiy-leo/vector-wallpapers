/**
 * 分形树 —— J 数学生成 / 单幅构图（seedable）。
 *
 * L-system 式递归：每根枝在末端分出 2（偶尔 3）根子枝，子枝长度按比例缩短、角度按「张角 ± 随机」展开，
 * 风向让每一级都向一侧偏一点；深层随机剪枝避免「完美二叉树」的程序感。
 * 枝梢挂两色圆点叶簇（点彩树冠）；背后一轮大圆（日 / 月）与一道缓坡地面，让它像一张壁纸而非示意图。
 *
 * 三种构图：
 *  - tree   独树：一棵居中偏侧的大树；
 *  - grove  树林：前中后三棵，远小近大；
 *  - coral  珊瑚：从底边升起的多根弯曲枝，枝梢是圆润的珊瑚虫。
 *
 * ⭐ 体积：几何在「短边 = 1000」虚拟坐标中取整数；每一级深度合并成一条 path（线宽逐级递减），
 * 叶簇按颜色各一条 path（零长度子路径 + 圆头描边）。生成后若路径字节超过 PATH_CAP，
 * 用同一个子随机源降一级深度重新生成 → 结构稳定、体积有硬上限。
 */
import { mulberry32 } from '../../engine/rng';
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { num, op, pair, scaleOf } from './_helpers';

/** 枝 + 叶 path 数据字节上限。 */
const PATH_CAP = 14500;

interface Seg {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 弯曲控制点（珊瑚）；无则为直线 */
  cx?: number;
  cy?: number;
  d: number;
}

const def: PatternDef = {
  id: 'fractal-tree',
  name: '分形树',
  category: 'J-generative',
  description: '递归分叉生长的分形树 / 珊瑚，枝梢挂点彩叶簇，背后一轮日月；张角、风向、深度可调，换一版即长出新的一棵。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '天色', role: 'bg', paint: { type: 'solid', color: '#efe8dc' }, opacity: 1, visible: true, configurable: true },
    { id: 'orb', label: '日 / 月', role: 'detail', paint: { type: 'solid', color: '#e6c9a8' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'ground', label: '地面', role: 'detail', paint: { type: 'solid', color: '#d9cdb8' }, opacity: 1, visible: true, configurable: true },
    { id: 'trunk', label: '树干', role: 'primary', paint: { type: 'solid', color: '#4a3f38' }, opacity: 1, visible: true, configurable: true },
    { id: 'twig', label: '细枝', role: 'secondary', paint: { type: 'solid', color: '#6e5f53' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf', label: '叶簇 · 主', role: 'accent', paint: { type: 'solid', color: '#b8705a' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'leaf_alt', label: '叶簇 · 次', role: 'accent', paint: { type: 'solid', color: '#d9a46c' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'style', label: '构图', type: 'select', default: 'tree', options: [
        { value: 'tree', label: '独树' },
        { value: 'grove', label: '树林' },
        { value: 'coral', label: '珊瑚' },
      ],
    },
    { key: 'depth', label: '分叉深度', type: 'range', min: 4, max: 9, step: 1, default: 9, heavy: true },
    { key: 'spread', label: '张角', type: 'range', min: 10, max: 45, step: 1, default: 25, unit: '°' },
    { key: 'wind', label: '风向', type: 'range', min: -1, max: 1, step: 0.05, default: 0.2 },
    { key: 'leafSize', label: '叶簇大小', type: 'range', min: 0.4, max: 2, step: 0.05, default: 1 },
    { key: 'leaves', label: '显示叶簇', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'autumn',
      label: '秋日',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe8dc' } },
        orb: { paint: { type: 'solid', color: '#e6c9a8' }, opacity: 0.85 },
        ground: { paint: { type: 'solid', color: '#d9cdb8' } },
        trunk: { paint: { type: 'solid', color: '#4a3f38' } },
        twig: { paint: { type: 'solid', color: '#6e5f53' } },
        leaf: { paint: { type: 'solid', color: '#b8705a' }, opacity: 0.9 },
        leaf_alt: { paint: { type: 'solid', color: '#d9a46c' }, opacity: 0.85 },
      },
    },
    {
      id: 'moonlit',
      label: '月下',
      elements: {
        bg: { paint: { type: 'solid', color: '#1b2230' } },
        orb: { paint: { type: 'solid', color: '#e9e2cf' }, opacity: 0.9 },
        ground: { paint: { type: 'solid', color: '#121822' } },
        trunk: { paint: { type: 'solid', color: '#0e131b' } },
        twig: { paint: { type: 'solid', color: '#2a3446' } },
        leaf: { paint: { type: 'solid', color: '#7f97b5' }, opacity: 0.7 },
        leaf_alt: { paint: { type: 'solid', color: '#c4cfdc' }, opacity: 0.55 },
      },
      params: { style: 'grove', spread: 22, wind: -0.15, leafSize: 0.8 },
    },
    {
      id: 'reef',
      label: '珊瑚礁',
      elements: {
        bg: { paint: { type: 'solid', color: '#16303a' } },
        orb: { paint: { type: 'solid', color: '#2c5561' }, opacity: 0.6 },
        ground: { paint: { type: 'solid', color: '#0f232b' } },
        trunk: { paint: { type: 'solid', color: '#d98a74' } },
        twig: { paint: { type: 'solid', color: '#e7a98d' } },
        leaf: { paint: { type: 'solid', color: '#f1cdb0' }, opacity: 0.95 },
        leaf_alt: { paint: { type: 'solid', color: '#8cc0b4' }, opacity: 0.85 },
      },
      params: { style: 'coral', depth: 8, spread: 20, wind: 0, leafSize: 1.1 },
    },
    {
      id: 'ink-bare',
      label: '冬枝水墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1efe9' } },
        orb: { paint: { type: 'solid', color: '#c9574a' }, opacity: 0.85 },
        ground: { paint: { type: 'solid', color: '#e2ded5' } },
        trunk: { paint: { type: 'solid', color: '#2b2928' } },
        twig: { paint: { type: 'solid', color: '#57524e' } },
        leaf: { paint: { type: 'solid', color: '#c9574a' }, opacity: 0.8 },
        leaf_alt: { paint: { type: 'solid', color: '#8e8780' }, opacity: 0.5 },
      },
      params: { spread: 30, wind: 0.45, leafSize: 0.5 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['trunk'],
    secondary: ['twig'],
    accent: ['leaf', 'leaf_alt'],
    detail: ['orb', 'ground'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const style = params.style === 'grove' || params.style === 'coral' ? params.style : 'tree';
    const depthReq = Math.round(num(params, 'depth', 4, 9));
    const spread = (num(params, 'spread', 10, 45) * Math.PI) / 180;
    const wind = num(params, 'wind', -1, 1);
    const leafSize = num(params, 'leafSize', 0.4, 2);
    const leavesOn = params.leaves === true;

    const q = scaleOf(W, H);
    const Wv = W / q;
    const Hv = H / q;
    const coral = style === 'coral';
    const r0 = Math.round;

    // 构图随机量（先取，保证重试时不变）
    const side = rng() < 0.5 ? -1 : 1;
    const subSeed = Math.floor(rng() * 2 ** 31);
    const orbJ = rng();

    const groundY = Hv * (coral ? 0.93 : 0.86);
    const L0 = Math.min(Hv * (coral ? 0.2 : 0.225), Wv * (coral ? 0.3 : 0.25));

    interface Root { x: number; y: number; a: number; len: number; w: number; }
    const roots = (rr: () => number): Root[] => {
      if (style === 'tree') {
        return [{ x: Wv * (0.5 + side * 0.08), y: groundY + Hv * 0.01, a: -Math.PI / 2, len: L0 * 0.85, w: L0 * 0.11 }];
      }
      if (style === 'grove') {
        return [
          { x: Wv * (0.5 - side * 0.27), y: groundY - Hv * 0.035, a: -Math.PI / 2, len: L0 * 0.55, w: L0 * 0.06 },
          { x: Wv * (0.5 + side * 0.3), y: groundY - Hv * 0.015, a: -Math.PI / 2, len: L0 * 0.72, w: L0 * 0.075 },
          { x: Wv * (0.5 - side * 0.02), y: groundY + Hv * 0.02, a: -Math.PI / 2, len: L0 * 0.95, w: L0 * 0.1 },
        ];
      }
      const k = Math.max(5, Math.round(Wv / 190));
      const out: Root[] = [];
      for (let i = 0; i < k; i++) {
        const x = Wv * ((i + 0.5 + (rr() - 0.5) * 0.6) / k);
        out.push({ x, y: Hv + 10, a: -Math.PI / 2 + (rr() - 0.5) * 0.45, len: L0 * (0.55 + rr() * 0.6), w: L0 * 0.075 });
      }
      return out;
    };

    const build = (maxD: number): { byDepth: string[]; leafA: string; leafB: string; bytes: number } => {
      const rr = mulberry32(subSeed);
      const segs: Seg[] = [];
      const tips: Array<{ x: number; y: number; d: number }> = [];
      const grow = (x: number, y: number, a: number, len: number, d: number): void => {
        let a2 = a;
        let cx: number | undefined;
        let cy: number | undefined;
        if (coral) {
          const bend = (rr() - 0.5) * 0.55;
          cx = x + Math.cos(a + bend * 0.5) * len * 0.5;
          cy = y + Math.sin(a + bend * 0.5) * len * 0.5;
          a2 = a + bend;
        }
        const x2 = coral ? cx! + Math.cos(a2) * len * 0.5 : x + Math.cos(a) * len;
        const y2 = coral ? cy! + Math.sin(a2) * len * 0.5 : y + Math.sin(a) * len;
        segs.push({ x1: x, y1: y, x2, y2, cx, cy, d });
        if (d >= maxD) {
          tips.push({ x: x2, y: y2, d });
          return;
        }
        const kids = rr() < (coral ? 0.28 : 0.14) ? 3 : 2;
        let grew = 0;
        for (let k = 0; k < kids; k++) {
          const t = kids === 2 ? (k === 0 ? -1 : 1) : k - 1;
          const jitter = 0.7 + rr() * 0.6;
          const lean = wind * 0.13 * (0.4 + d / maxD); // 风：每级向一侧偏
          const up = coral ? (-Math.PI / 2 - a2) * 0.25 : 0; // 珊瑚：轻微向上回正
          const ang = a2 + t * spread * jitter + lean + up;
          const ratio = coral ? 0.74 + rr() * 0.12 : (t === 0 ? 0.78 : 0.66 + rr() * 0.14);
          // 深层随机剪枝（至少保留一枝）
          if (d >= 3 && rr() < 0.12 && (grew > 0 || k < kids - 1)) continue;
          grew++;
          grow(x2, y2, ang, len * ratio, d + 1);
        }
      };
      roots(rr).forEach((rt) => grow(rt.x, rt.y, rt.a, rt.len, 0));

      // 每级一条 path
      const byDepth: string[] = Array.from({ length: maxD + 1 }, () => '');
      const sorted = segs.slice().sort((p, s) => p.d - s.d || p.x1 - s.x1);
      for (const s of sorted) {
        const x1 = r0(s.x1);
        const y1 = r0(s.y1);
        if (s.cx !== undefined && s.cy !== undefined) {
          byDepth[s.d] += `M${pair(x1, y1)}q${pair(r0(s.cx) - x1, r0(s.cy) - y1)}${r0(s.x2) - x1 < 0 ? '' : ' '}${pair(r0(s.x2) - x1, r0(s.y2) - y1)}`;
        } else {
          byDepth[s.d] += `M${pair(x1, y1)}l${pair(r0(s.x2) - x1, r0(s.y2) - y1)}`;
        }
      }
      // 叶簇：每个梢 2~3 颗，主 / 次两色
      const la: Array<[number, number]> = [];
      const lb: Array<[number, number]> = [];
      const spreadL = L0 * 0.05 * (coral ? 0.4 : 1);
      for (const t of tips) {
        const nL = coral ? 1 : 2 + (rr() < 0.4 ? 1 : 0);
        for (let i = 0; i < nL; i++) {
          const ang = rr() * Math.PI * 2;
          const rad = rr() * spreadL;
          const p: [number, number] = [r0(t.x + Math.cos(ang) * rad), r0(t.y + Math.sin(ang) * rad)];
          (rr() < 0.58 ? la : lb).push(p);
        }
      }
      const dots = (list: Array<[number, number]>): string => {
        list.sort((p, s) => p[1] - s[1] || p[0] - s[0]);
        let d = '';
        let px = 0;
        let py = 0;
        for (const [x, y] of list) {
          d += d === '' ? `M${pair(x, y)}h0` : `m${pair(x - px, y - py)}h0`;
          px = x;
          py = y;
        }
        return d;
      };
      const leafA = leavesOn ? dots(la) : '';
      const leafB = leavesOn ? dots(lb) : '';
      const bytes = byDepth.reduce((n, s) => n + s.length, 0) + leafA.length + leafB.length;
      return { byDepth, leafA, leafB, bytes };
    };

    let maxD = depthReq;
    let geo = build(maxD);
    while (geo.bytes > PATH_CAP && maxD > 4) {
      maxD--;
      geo = build(maxD);
    }

    // ── 背景：日 / 月 + 地面 ─────────────────────────────
    let inner = '';
    const orb = elements.get('orb')!;
    if (orb.visible) {
      const ox = Wv * (0.5 - side * (0.18 + orbJ * 0.08));
      const oy = Hv * (coral ? 0.26 : 0.3);
      const orr = Math.min(Wv, Hv) * (coral ? 0.3 : 0.17);
      inner += `<circle cx="${r0(ox)}" cy="${r0(oy)}" r="${r0(orr)}" fill="${orb.paintValue}" fill-opacity="${op(orb.opacity)}"/>`;
    }
    const ground = elements.get('ground')!;
    if (ground.visible) {
      const g0 = r0(groundY + Hv * 0.03 * side);
      const g1 = r0(groundY - Hv * 0.03 * side);
      const gm = r0(groundY - Hv * 0.035);
      inner += `<path d="M0 ${g0}Q${r0(Wv * 0.5)} ${gm} ${r0(Wv)} ${g1}V${r0(Hv)}H0z" fill="${ground.paintValue}" fill-opacity="${op(ground.opacity)}"/>`;
    }

    // ── 枝：逐级线宽递减；前半段用树干色，后半段用细枝色 ───────────
    const trunk = elements.get('trunk')!;
    const twig = elements.get('twig')!;
    const w0 = L0 * (coral ? 0.075 : style === 'grove' ? 0.09 : 0.11);
    const taper = coral ? 0.8 : 0.7;
    const split = Math.max(1, Math.round(maxD * 0.45));
    geo.byDepth.forEach((d, i) => {
      if (d === '') return;
      const e = i < split ? trunk : twig;
      if (!e.visible) return;
      const w = Math.max(1.2, w0 * Math.pow(taper, i));
      inner += `<path d="${d}" fill="none" stroke="${e.paintValue}" stroke-opacity="${op(e.opacity)}" stroke-width="${api.n(w)}" stroke-linecap="round"/>`;
    });

    // ── 叶簇 ───────────────────────────────────────────
    const leaf = elements.get('leaf')!;
    const leafAlt = elements.get('leaf_alt')!;
    const lr = L0 * (coral ? 0.036 : 0.042) * leafSize * (maxD >= 8 ? 1 : 1 + (8 - maxD) * 0.25);
    if (leaf.visible && geo.leafA !== '') {
      inner += `<path d="${geo.leafA}" fill="none" stroke="${leaf.paintValue}" stroke-opacity="${op(leaf.opacity)}" stroke-width="${api.n(lr * 2)}" stroke-linecap="round"/>`;
    }
    if (leafAlt.visible && geo.leafB !== '') {
      inner += `<path d="${geo.leafB}" fill="none" stroke="${leafAlt.paintValue}" stroke-opacity="${op(leafAlt.opacity)}" stroke-width="${api.n(lr * 1.6)}" stroke-linecap="round"/>`;
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
