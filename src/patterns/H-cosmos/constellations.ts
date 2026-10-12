/**
 * 星座图 —— H 宇宙天文。
 *
 * 构图要点：像一张星图而不是夜景 —— 底上一层细坐标网格（直角经纬网 / 极坐标星盘），
 * 满屏暗淡的背景星点（三档星等），其上分布若干「星座」：
 * 每个星座 4~8 颗星，由随机游走生成自然的折线形态，用最小生成树连线（偶尔闭合一个小环），
 * 连线两端留出空隙不碰星点（星图惯例）；每个星座最亮的一颗为主星：更大、带光环与十字星芒。
 * 与 starry-night-sky 的区别：无银河 / 山峦 / 地平线，是平面化的「图」。
 *
 * ⭐ 体积策略：虚拟坐标短边 = 1000 + scale(q)；直角网格走 api.tile（<pattern>）；
 * 背景星点为零长度子路径 + 圆头描边，按字节上限截断；星座连线合并为一条 path。
 * 动画（仅预览）：背景星分 3 组错相闪烁。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { V, circleSub, dotPath, f1, fitCount, num, op, sparkle, virt, type Pt } from './_helpers';

const FIELD_CAP = 6400;
const TIERS = [
  { w: 1.7, o: 0.42, p: 0.68 },
  { w: 2.7, o: 0.68, p: 0.25 },
  { w: 3.9, o: 0.95, p: 0.07 },
];
const TW_PER = [3.1, 4.3, 5.7];

const def: PatternDef = {
  id: 'constellations',
  name: '星座图',
  category: 'H-cosmos',
  description: '星图式构图：细坐标网格上散布暗淡星点，若干星座由细线串连，主星带光环与星芒。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0d1628' }, opacity: 1, visible: true, configurable: true },
    { id: 'grid', label: '坐标网格', role: 'detail', paint: { type: 'solid', color: '#3a4d72' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'field_stars', label: '背景星', role: 'detail', paint: { type: 'solid', color: '#8fa2c6' }, opacity: 1, visible: true, configurable: true },
    { id: 'lines', label: '星座连线', role: 'secondary', paint: { type: 'solid', color: '#c8b07c' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'stars', label: '星座星', role: 'primary', paint: { type: 'solid', color: '#f2eee2' }, opacity: 1, visible: true, configurable: true },
    { id: 'highlight', label: '主星', role: 'accent', paint: { type: 'solid', color: '#ffd28a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '星座数量', type: 'range', min: 3, max: 12, step: 1, default: 6, heavy: true },
    {
      key: 'gridStyle',
      label: '网格样式',
      type: 'select',
      options: [
        { value: 'rect', label: '经纬网' },
        { value: 'polar', label: '星盘' },
      ],
      default: 'rect',
    },
    { key: 'gridSize', label: '网格尺度', type: 'range', min: 0.5, max: 2, step: 0.1, default: 1 },
    { key: 'lineWidth', label: '连线粗细', type: 'range', min: 0.5, max: 3, step: 0.1, default: 1.4 },
    { key: 'starSize', label: '星点大小', type: 'range', min: 0.6, max: 1.6, step: 0.1, default: 1 },
    { key: 'fieldDensity', label: '背景星密度', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.5, heavy: true },
    { key: 'twinkle', label: '星星闪烁', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'observatory',
      label: '天文台',
      elements: {
        bg: { paint: { type: 'solid', color: '#0d1628' } },
        grid: { paint: { type: 'solid', color: '#3a4d72' }, opacity: 0.55 },
        field_stars: { paint: { type: 'solid', color: '#8fa2c6' } },
        lines: { paint: { type: 'solid', color: '#c8b07c' }, opacity: 0.75 },
        stars: { paint: { type: 'solid', color: '#f2eee2' } },
        highlight: { paint: { type: 'solid', color: '#ffd28a' } },
      },
    },
    {
      id: 'parchment',
      label: '古星图',
      elements: {
        bg: { paint: { type: 'solid', color: '#eee4cf' } },
        grid: { paint: { type: 'solid', color: '#b9a37c' }, opacity: 0.6 },
        field_stars: { paint: { type: 'solid', color: '#8c7a58' } },
        lines: { paint: { type: 'solid', color: '#7a5a34' }, opacity: 0.8 },
        stars: { paint: { type: 'solid', color: '#3a2b1c' } },
        highlight: { paint: { type: 'solid', color: '#a2452b' } },
      },
      params: { gridStyle: 'polar', fieldDensity: 0.35 },
    },
    {
      id: 'blueprint',
      label: '蓝图',
      elements: {
        bg: { paint: { type: 'solid', color: '#173a63' } },
        grid: { paint: { type: 'solid', color: '#4b74a3' }, opacity: 0.5 },
        field_stars: { paint: { type: 'solid', color: '#a9c6e6' } },
        lines: { paint: { type: 'solid', color: '#e6eff9' }, opacity: 0.7 },
        stars: { paint: { type: 'solid', color: '#ffffff' } },
        highlight: { paint: { type: 'solid', color: '#ffe08f' } },
      },
      params: { gridSize: 0.7, lineWidth: 1 },
    },
    {
      id: 'aubergine',
      label: '茄紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#1b1425' } },
        grid: { paint: { type: 'solid', color: '#46365a' }, opacity: 0.6 },
        field_stars: { paint: { type: 'solid', color: '#9e8db5' } },
        lines: { paint: { type: 'solid', color: '#d6a5b6' }, opacity: 0.7 },
        stars: { paint: { type: 'solid', color: '#f6eef2' } },
        highlight: { paint: { type: 'solid', color: '#f3c58e' } },
      },
      params: { gridStyle: 'polar', count: 8 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['stars'],
    secondary: ['lines'],
    accent: ['highlight'],
    detail: ['grid', 'field_stars'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const { q, Wv, Hv } = virt(W, H);
    const E = (id: string) => elements.get(id)!;
    const count = Math.round(num(params, 'count', 3, 12));
    const gs = num(params, 'gridSize', 0.5, 2);
    const lw = num(params, 'lineWidth', 0.5, 3);
    const ss = num(params, 'starSize', 0.6, 1.6);
    const fd = num(params, 'fieldDensity', 0.1, 1);
    const polar = params.gridStyle === 'polar';
    const twinkle = animate && params.twinkle === true;
    const r0 = Math.round;

    const bg = E('bg');
    let inner = '';

    // ── 坐标网格 ────────────────────────────────────────
    const grid = E('grid');
    const step = r0(V * 0.125 * gs);
    if (polar) {
      // 星盘：圆心在画面下方很远处 → 画面里是一组平缓的同心弧 + 汇聚的经线
      const R0 = Math.max(Wv, Hv);
      const cx = Wv * 0.5;
      const cy = Hv + R0 * 0.55;
      const far = Math.hypot(Math.max(cx, Wv - cx), cy);
      const near = Math.max(step, cy - Hv - step);
      let d = '';
      for (let r = Math.ceil(near / step) * step; r <= far; r += step) d += circleSub(cx, cy, r);
      let dm = '';
      const dA = (Math.PI / 180) * 6 * gs;
      const half = Math.atan2(Wv * 0.5 + step, cy) + dA;
      for (let a = -Math.floor(half / dA) * dA; a <= half; a += dA) {
        const s = Math.sin(a);
        const c = -Math.cos(a);
        dm += `M${f1(cx + s * near)} ${f1(cy + c * near)}L${f1(cx + s * far)} ${f1(cy + c * far)}`;
      }
      inner +=
        `<path d="${d}" fill="none" stroke="${grid.paintValue}" stroke-opacity="${op(grid.opacity)}" stroke-width="1"/>` +
        `<path d="${dm}" fill="none" stroke="${grid.paintValue}" stroke-opacity="${op(grid.opacity * 0.75)}" stroke-width="0.8" stroke-dasharray="2 6"/>`;
    } else {
      const s = step;
      const h = s / 2;
      const content =
        `<path d="M0 0H${s}M0 0V${s}" fill="none" stroke="${grid.paintValue}" stroke-opacity="${op(grid.opacity)}" stroke-width="1"/>` +
        `<path d="M${h} 0V${s}M0 ${h}H${s}" fill="none" stroke="${grid.paintValue}" stroke-opacity="${op(grid.opacity * 0.6)}" stroke-width="0.7" stroke-dasharray="1.5 5.5"/>` +
        `<path d="M${h - 4} ${h}h8M${h} ${h - 4}v8" stroke="${grid.paintValue}" stroke-opacity="${op(grid.opacity)}" stroke-width="0.8"/>`;
      const fill = api.tile({
        w: s,
        h: s,
        content,
        key: 'cst-grid',
        transform: `translate(${f1((Wv / 2) % s)} ${f1((Hv / 2) % s)})`,
      });
      inner += rect(0, 0, r0(Wv) + 1, r0(Hv) + 1, { fill });
    }

    // ── 背景星（每颗固定 4 个随机数）─────────────────────
    const field = E('field_stars');
    const nField = r0(fd * 420 * ((Wv * Hv) / (V * V)));
    const fs: Array<{ p: Pt; t: number; g: number }> = [];
    for (let i = 0; i < nField; i++) {
      const p: Pt = [rng() * Wv, rng() * Hv];
      const u = rng();
      const t = u < TIERS[0].p ? 0 : u < TIERS[0].p + TIERS[1].p ? 1 : 2;
      fs.push({ p, t, g: Math.floor(rng() * 3) % 3 });
    }
    const build = (k: number): string[][] => {
      const out = TIERS.map(() => [0, 1, 2].map(() => [] as Pt[]));
      for (let i = 0; i < k; i++) out[fs[i].t][fs[i].g].push(fs[i].p);
      return out.map((gs2) => gs2.map((pts) => dotPath(pts.sort((a, b) => a[0] - b[0]))));
    };
    const kField = fitCount(nField, FIELD_CAP, (k) => build(k).flat().reduce((a, d) => a + d.length + 12, 0));
    const fd2 = build(kField);
    const tw = twinkle ? api.keyframes('vw-cst-tw', 'to{opacity:.25}') : '';
    let fm = '';
    TIERS.forEach((T, ti) => {
      let tm = '';
      fd2[ti].forEach((d, gi) => {
        if (d === '') return;
        const p = `<path d="${d}"/>`;
        tm += twinkle ? `<g style="animation:${tw} ${TW_PER[gi]}s ease-in-out -${f1(TW_PER[gi] * 0.41 * (gi + 1))}s infinite alternate">${p}</g>` : p;
      });
      if (tm !== '') fm += `<g stroke-width="${f1(T.w * ss)}" stroke-opacity="${op(field.opacity * T.o)}">${tm}</g>`;
    });
    if (fm !== '') inner += `<g fill="none" stroke="${field.paintValue}" stroke-linecap="round">${fm}</g>`;

    // ── 星座位置：抖动网格（cols×rows ≥ count，随机取 count 格）→ 分布均匀不扎堆 ──
    const cols = Math.max(1, Math.round(Math.sqrt((count * Wv) / Hv)));
    const rows = Math.max(1, Math.ceil(count / cols));
    const cw = Wv / cols;
    const ch = Hv / rows;
    const R = Math.min(cw, ch) * 0.4;
    const cells: number[] = [];
    for (let i = 0; i < cols * rows; i++) cells.push(i);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1)) % (i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const centers: Pt[] = cells.slice(0, count).map((ci) => [
      ((ci % cols) + 0.5 + (rng() - 0.5) * 0.36) * cw,
      (Math.floor(ci / cols) + 0.5 + (rng() - 0.5) * 0.36) * ch,
    ]);

    // ── 黄道：一条横贯画面的虚线正弦弧（星图的标志性辅助线）──
    {
      const amp = Hv * (0.12 + rng() * 0.1);
      const mid = Hv * (0.35 + rng() * 0.3);
      const ph = rng() * Math.PI * 2;
      let d = '';
      for (let i = 0; i <= 48; i++) {
        const x = (Wv * i) / 48;
        d += `${i === 0 ? 'M' : 'L'}${r0(x)} ${r0(mid + Math.sin((x / Wv) * Math.PI * 1.3 + ph) * amp)}`;
      }
      inner += `<path d="${d}" fill="none" stroke="${grid.paintValue}" stroke-opacity="${op(Math.min(1, grid.opacity * 1.5))}" stroke-width="1.3" stroke-dasharray="10 6 2 6"/>`;
    }

    // ── 每个星座：随机游走取星 → 最小生成树连线 ──────────────
    let lineD = '';
    let starD = '';
    let hiD = '';
    let haloD = '';
    let spikeD = '';
    for (const c of centers) {
      const n = 4 + Math.floor(rng() * 5);
      const pts: Pt[] = [c];
      const rot = rng() * Math.PI * 2;
      for (let k = 1; k < n; k++) {
        let placed: Pt | null = null;
        for (let tries = 0; tries < 5 && !placed; tries++) {
          const base = rng() < 0.6 ? pts[pts.length - 1] : pts[Math.floor(rng() * pts.length) % pts.length];
          const a = rot + (rng() - 0.5) * 2.6;
          const L = R * (0.3 + rng() * 0.42);
          let x = base[0] + Math.cos(a) * L;
          let y = base[1] + Math.sin(a) * L;
          const dc = Math.hypot(x - c[0], y - c[1]);
          if (dc > R) {
            x = c[0] + ((x - c[0]) * R) / dc;
            y = c[1] + ((y - c[1]) * R) / dc;
          }
          const m = 28;
          x = Math.max(m, Math.min(Wv - m, x));
          y = Math.max(m, Math.min(Hv - m, y));
          if (pts.every((p) => Math.hypot(p[0] - x, p[1] - y) > R * 0.2)) placed = [x, y];
        }
        if (placed) pts.push(placed);
      }
      const mags = pts.map(() => rng());
      let bright = 0;
      mags.forEach((m, i) => {
        if (m > mags[bright]) bright = i;
      });
      const rad = mags.map((m, i) => (i === bright ? 6 : 2.4 + m * 2.8) * ss);

      // Prim
      const inT = pts.map((_, i) => i === 0);
      const edges: Array<[number, number]> = [];
      const has = (a: number, b: number) => edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      for (let k = 1; k < pts.length; k++) {
        let bi = -1;
        let bj = -1;
        let bd = Infinity;
        for (let i = 0; i < pts.length; i++) {
          if (!inT[i]) continue;
          for (let j = 0; j < pts.length; j++) {
            if (inT[j]) continue;
            const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
            if (d < bd) {
              bd = d;
              bi = i;
              bj = j;
            }
          }
        }
        inT[bj] = true;
        edges.push([bi, bj]);
      }
      if (rng() < 0.45 && pts.length >= 4) {
        let bi = -1;
        let bj = -1;
        let bd = R * 0.8;
        for (let i = 0; i < pts.length; i++)
          for (let j = i + 1; j < pts.length; j++) {
            if (has(i, j)) continue;
            const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
            if (d < bd) {
              bd = d;
              bi = i;
              bj = j;
            }
          }
        if (bi >= 0) edges.push([bi, bj]);
      }
      for (const [i, j] of edges) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[j];
        const L = Math.hypot(x2 - x1, y2 - y1);
        const g1 = rad[i] + 5 + lw;
        const g2 = rad[j] + 5 + lw;
        if (L <= g1 + g2 + 4) continue;
        const ux = (x2 - x1) / L;
        const uy = (y2 - y1) / L;
        lineD += `M${r0(x1 + ux * g1)} ${r0(y1 + uy * g1)}l${r0(ux * (L - g1 - g2))} ${r0(uy * (L - g1 - g2))}`;
      }
      pts.forEach((p, i) => {
        if (i === bright) {
          hiD += circleSub(p[0], p[1], rad[i]);
          haloD += circleSub(p[0], p[1], rad[i] * 2.7);
          spikeD += sparkle(p[0], p[1], rad[i] * 5.2, rad[i] * 0.28);
        } else {
          starD += circleSub(p[0], p[1], rad[i]);
        }
      });
    }

    const lines = E('lines');
    if (lineD !== '')
      inner += `<path d="${lineD.replace(/ -/g, '-')}" fill="none" stroke="${lines.paintValue}" stroke-opacity="${op(lines.opacity)}" stroke-width="${f1(lw)}" stroke-linecap="round"/>`;
    const stars = E('stars');
    if (starD !== '') inner += `<path d="${starD}" fill="${stars.paintValue}" fill-opacity="${op(stars.opacity)}"/>`;
    const hi = E('highlight');
    inner +=
      `<path d="${haloD}" fill="none" stroke="${hi.paintValue}" stroke-opacity="${op(hi.opacity * 0.55)}" stroke-width="${f1(0.9 * ss)}"/>` +
      `<path d="${spikeD}" fill="${hi.paintValue}" fill-opacity="${op(hi.opacity * 0.75)}"/>` +
      `<path d="${hiD}" fill="${hi.paintValue}" fill-opacity="${op(hi.opacity)}"/>`;

    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
