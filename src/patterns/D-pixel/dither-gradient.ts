/**
 * 抖动渐变 —— D 像素 / 复古游戏。
 *
 * 构图要点：2~3 色的鲜艳渐变，用**有序 Bayer 矩阵抖动**（4×4 / 8×8）量化成
 * 大颗方像素，像老游戏机只有几种颜色时画出来的天空。
 *
 * ⭐ 体积策略（7680×4320 拉满仍 < 20KB）：
 * 逐像素 run-length 不可行 —— 抖动区里同色横向连续段长度≈1，8K 下几万段。
 * 这里利用 Bayer 抖动的**嵌套性**：第 k 档的点集 ⊂ 第 k+1 档的点集。
 *   · 每一档只画「本档新增」的那几个点，做成一张 N×N 平铺 tile；
 *   · 该 tile 填进区域 R_k = {渐变值 ≥ 阈值_k}（累积区域，层层叠放），
 *     任意位置叠出来的点集恰好就是该处应有的抖动档位；
 *   · 最后一档用纯色填满（= 下一种颜色的「底」）。
 * 每个累积区域是逐行一个区间，描成**一条阶梯轮廓 path**（只记拐角），
 * 坐标是格子整数、放在 `scale(像素尺寸)` 的组里 → 字节与分辨率基本无关。
 * tile 用 userSpaceOnUse，自然继承组的缩放，抖动网格与区域网格严格对齐。
 * BYTE_CAP 兜底：超限就把像素放大重算（纯函数、确定性）。
 *
 * 元件：bg = 颜色 A（整幅底）；mid = 颜色 B（A→B 抖动点 + B 实色区）；
 * hi = 颜色 C（B→C 抖动点 + C 实色区）。双色模式只有 A→C。
 *
 * seed：线性模式扰动角度 ±12° 与渐变起止；径向模式扰动圆心；两者都扰动波纹相位/频率。
 */
import { g, n, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult, ResolvedElement } from '../types';

/** 全部区域轮廓 + tile 内容的字节上限（其余标记 < 2KB）。 */
const BYTE_CAP = 15000;

/** 递归生成 N×N Bayer 矩阵（值 0..N²-1）。 */
function bayer(size: number): number[][] {
  let m = [[0]];
  while (m.length < size) {
    const k = m.length;
    const next: number[][] = Array.from({ length: k * 2 }, () => new Array<number>(k * 2).fill(0));
    for (let y = 0; y < k; y++) {
      for (let x = 0; x < k; x++) {
        const v = m[y][x] * 4;
        next[y][x] = v;
        next[y][x + k] = v + 2;
        next[y + k][x] = v + 3;
        next[y + k][x + k] = v + 1;
      }
    }
    m = next;
  }
  return m;
}

/**
 * 把「逐行区间」描成阶梯多边形。a[r] / b[r] 为第 r 行的 [起, 止)，a<0 表示该行为空。
 * 只输出拐角（相对 h/v），连续多行同边界合并为一个 v。
 */
function staircase(a: Int32Array, b: Int32Array, rows: number): string {
  let d = '';
  let r = 0;
  while (r < rows) {
    if (a[r] < 0) {
      r++;
      continue;
    }
    const r0 = r;
    while (r + 1 < rows && a[r + 1] >= 0) r++;
    const r1 = r;
    let s = `M${a[r0]} ${r0}h${b[r0] - a[r0]}`;
    // 右边界向下
    let v = 0;
    for (let i = r0; i <= r1; i++) {
      v++;
      if (i < r1 && b[i + 1] !== b[i]) {
        s += `v${v}h${b[i + 1] - b[i]}`;
        v = 0;
      }
    }
    s += `v${v}h${a[r1] - b[r1]}`;
    // 左边界向上
    v = 0;
    for (let i = r1; i >= r0; i--) {
      v++;
      if (i > r0 && a[i - 1] !== a[i]) {
        s += `v-${v}h${a[i - 1] - a[i]}`;
        v = 0;
      }
    }
    s += `v-${v}z`;
    d += s;
    r = r1 + 1;
  }
  return d;
}

const def: PatternDef = {
  id: 'dither-gradient',
  name: '抖动渐变',
  category: 'D-pixel',
  description: '鲜艳的两三色渐变，用有序 Bayer 抖动量化成大颗方像素，老游戏机的复古色阶。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '颜色 A', role: 'bg', paint: { type: 'solid', color: '#2b1650' }, opacity: 1, visible: true, configurable: true },
    { id: 'mid', label: '颜色 B', role: 'secondary', paint: { type: 'solid', color: '#e2457c' }, opacity: 1, visible: true, configurable: true },
    { id: 'hi', label: '颜色 C', role: 'primary', paint: { type: 'solid', color: '#ffb04a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'shape',
      label: '渐变形状',
      type: 'select',
      default: 'linear',
      options: [
        { value: 'linear', label: '线性' },
        { value: 'radial', label: '径向' },
      ],
    },
    { key: 'angle', label: '渐变方向', type: 'angle', default: 90 },
    // 以 1080 短边为基准的设计 px
    { key: 'pixel', label: '像素大小', type: 'range', min: 4, max: 40, step: 1, default: 14, unit: 'px', heavy: true },
    { key: 'steps', label: '每段色阶', type: 'range', min: 2, max: 12, step: 1, default: 6, heavy: true },
    { key: 'balance', label: '中间色位置', type: 'range', min: 0.25, max: 0.75, step: 0.01, default: 0.5 },
    { key: 'wobble', label: '波纹扰动', type: 'range', min: 0, max: 1, step: 0.05, default: 0.3, heavy: true },
    {
      key: 'matrix',
      label: '抖动矩阵',
      type: 'select',
      default: '4',
      options: [
        { value: '4', label: 'Bayer 4×4' },
        { value: '8', label: 'Bayer 8×8' },
      ],
    },
    {
      key: 'stops',
      label: '色数',
      type: 'select',
      default: '3',
      options: [
        { value: '3', label: '三色 A→B→C' },
        { value: '2', label: '双色 A→C' },
      ],
    },
  ],

  presets: [
    {
      id: 'sunset',
      label: '落日',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b1650' } },
        mid: { paint: { type: 'solid', color: '#e2457c' } },
        hi: { paint: { type: 'solid', color: '#ffb04a' } },
      },
      params: { shape: 'linear', angle: 90 },
    },
    {
      id: 'ocean',
      label: '深海',
      elements: {
        bg: { paint: { type: 'solid', color: '#081a3a' } },
        mid: { paint: { type: 'solid', color: '#1d64b8' } },
        hi: { paint: { type: 'solid', color: '#3fd6c6' } },
      },
      params: { shape: 'radial' },
    },
    {
      id: 'gameboy',
      label: '掌机绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f380f' } },
        mid: { paint: { type: 'solid', color: '#4f8a2b' } },
        hi: { paint: { type: 'solid', color: '#a8c64e' } },
      },
      params: { shape: 'linear', angle: 270, pixel: 22, steps: 4 },
    },
    {
      id: 'neon',
      label: '霓虹',
      elements: {
        bg: { paint: { type: 'solid', color: '#14002e' } },
        mid: { paint: { type: 'solid', color: '#ff2bd1' } },
        hi: { paint: { type: 'solid', color: '#2ef2ff' } },
      },
      params: { shape: 'linear', angle: 45 },
    },
    {
      id: 'pastel',
      label: '粉彩',
      elements: {
        bg: { paint: { type: 'solid', color: '#c8dcff' } },
        mid: { paint: { type: 'solid', color: '#ffc8dc' } },
        hi: { paint: { type: 'solid', color: '#fff3c4' } },
      },
      params: { shape: 'radial', matrix: '8' },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    secondary: ['mid'],
    primary: ['hi'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const radial = params.shape === 'radial';
    const N = params.matrix === '8' ? 8 : 4;
    const three = params.stops !== '2';
    const L = Math.round(Math.max(2, Math.min(12, Number(params.steps) || 6)));
    const bal = Math.max(0.25, Math.min(0.75, Number(params.balance) || 0.5));
    const wob = Math.max(0, Math.min(1, Number(params.wobble) || 0));
    const pixelPx = Math.max(4, Math.min(40, Number(params.pixel) || 14));

    const bgEl = elements.get('bg')!;
    const midEl = elements.get('mid')!;
    const hiEl = elements.get('hi')!;

    // ── 随机量一次性取完（BYTE_CAP 重算时不再消耗 rng → 确定性）──
    const jitter = (rng() - 0.5) * 24; // 角度扰动（°）
    const lo = 0.03 + rng() * 0.1; // 渐变起点（留出纯 A 区）
    const hi = 0.9 + rng() * 0.08; // 渐变终点（留出纯 C 区）
    const rcx = 0.5 + (rng() - 0.5) * 0.6; // 径向圆心
    const rcy = 0.5 + (rng() - 0.5) * 0.6;
    const phase = rng();
    const freq = 0.8 + rng() * 1.6;
    const lobes = 3 + Math.floor(rng() * 4);

    const ang = ((Number(params.angle) || 0) + jitter) * (Math.PI / 180);
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const extent = Math.abs(W * ca) + Math.abs(H * sa);
    const extentPerp = Math.abs(W * sa) + Math.abs(H * ca);
    const cx = radial ? W * rcx : W / 2;
    const cy = radial ? H * rcy : H / 2;
    const rMax = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy));
    const amp = wob * 0.07;

    /** 渐变值 t∈R（0 = A，1 = C），已含 seed 起止与波纹。 */
    const tAt = (x: number, y: number): number => {
      let t: number;
      let w: number;
      if (radial) {
        const dx = x - cx;
        const dy = y - cy;
        t = 1 - Math.hypot(dx, dy) / (rMax * 0.92);
        w = Math.sin(Math.atan2(dy, dx) * lobes + phase * Math.PI * 2);
      } else {
        t = ((x - cx) * ca + (y - cy) * sa) / extent + 0.5;
        const v = (-(x - cx) * sa + (y - cy) * ca) / extentPerp;
        w = Math.sin((v * freq + phase) * Math.PI * 2);
      }
      return (t - lo) / (hi - lo) + amp * w;
    };

    // 每段色阶阈值：u ≥ (k-0.5)/L → 第 k 档；在全局 t 上的位置
    const segs: Array<{ el: ResolvedElement; t0: number; t1: number; key: string }> = three
      ? [
          { el: midEl, t0: 0, t1: bal, key: 'm' },
          { el: hiEl, t0: bal, t1: 1, key: 'h' },
        ]
      : [{ el: hiEl, t0: 0, t1: 1, key: 'h' }];

    // Bayer 增量点 tile 内容（与像素尺寸无关，循环外算一次）
    const M = bayer(N);
    const counts = Array.from({ length: L + 1 }, (_, k) => Math.round((k * N * N) / L));
    const dotsOf = (k: number): string => {
      let d = '';
      for (let y = 0; y < N; y++)
        for (let x = 0; x < N; x++) if (M[y][x] >= counts[k - 1] && M[y][x] < counts[k]) d += `M${x} ${y}h1v1h-1z`;
      return d;
    };
    const tileDots = Array.from({ length: L }, (_, i) => (i === 0 ? '' : dotsOf(i)));

    let cs = Math.max(1, pixelPx * unit);
    let layers: string[] = [];
    let scale = '1';
    for (let attempt = 0; attempt < 16; attempt++) {
      cs = Math.round(cs * 100) / 100;
      const cols = Math.ceil(W / cs);
      const rows = Math.ceil(H / cs);
      const grid = new Float32Array(cols * rows);
      for (let r = 0; r < rows; r++) {
        const y = Math.min(H, (r + 0.5) * cs);
        for (let c = 0; c < cols; c++) grid[r * cols + c] = tAt(Math.min(W, (c + 0.5) * cs), y);
      }
      const a = new Int32Array(rows);
      const b = new Int32Array(rows);
      const region = (tau: number): string => {
        for (let r = 0; r < rows; r++) {
          let first = -1;
          let last = -1;
          const base = r * cols;
          for (let c = 0; c < cols; c++) {
            if (grid[base + c] >= tau) {
              if (first < 0) first = c;
              last = c;
            }
          }
          a[r] = first;
          b[r] = last + 1;
        }
        return staircase(a, b, rows);
      };

      let used = 0;
      layers = [];
      for (const s of segs) {
        if (!s.el.visible) continue;
        const parts: string[] = [];
        for (let k = 1; k <= L; k++) {
          const tau = s.t0 + ((k - 0.5) / L) * (s.t1 - s.t0);
          if (k < L && tileDots[k] === '') continue;
          const d = region(tau);
          if (d === '') continue;
          used += d.length;
          if (k === L) {
            parts.push(path(d, { fill: s.el.paintValue }));
          } else {
            const content = path(tileDots[k], { fill: s.el.paintValue });
            used += content.length;
            const ref = api.tile({ key: `dg-${s.key}${N}-${L}-${k}`, w: N, h: N, content });
            parts.push(path(d, { fill: ref }));
          }
        }
        if (parts.length > 0) {
          layers.push(g({ opacity: s.el.opacity < 1 ? n(s.el.opacity) : undefined }, parts.join('')));
        }
      }
      scale = n(cs);
      if (used <= BYTE_CAP) break;
      cs *= 1.2;
    }

    const body: string[] = [rect(0, 0, W, H, { fill: bgEl.paintValue, 'fill-opacity': bgEl.opacity })];
    if (layers.length > 0) body.push(g({ transform: `scale(${scale})` }, layers.join('')));
    return { body: body.join('') };
  },
};

export default def;
