/**
 * 电视雪花 —— D 像素 / 无信号。
 *
 * 构图要点：满屏随机灰阶像素噪点（三档亮度），可选细横扫描线 + 0~3 条
 * 更亮的水平「滚动干扰带」。
 *
 * ⭐ 体积/节点策略：3 张噪点 tile 叠加，单元格数互质（31 / 37 / 41），
 * 合成周期 = 31×37×41 = 47027 格，重复完全不可见；每张 tile 内用单位坐标
 * （patternTransform=scale(px)）+ 每档亮度一条相对坐标 path（同色横向连续格
 * 合并为一段 `m dx dy hNv1h-Nz`），DOM 节点与画布尺寸、密度无关。
 * 三层透明度不同（1 / .75 / .55），叠压处混出更多灰阶。
 * 体积：按格数 × 密度预估字节并预先压低概率，BYTE_CAP 作硬兜底。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 三层噪点 path 数据总字节上限（其余标记 < 2KB，整体稳在 20KB 内）。 */
const BYTE_CAP = 15500;
/** 互质单元格数 → 合成周期极大。 */
const LAYER_CELLS = [31, 37, 41];
/** 每层叠加透明度：后层半透，叠压时产生额外灰阶。 */
const LAYER_ALPHA = [1, 0.75, 0.55];
/** 亮度档采样权重：hi / mid / lo。 */
const LEVEL_W = [0.3, 0.38, 0.32];
/** 每个格子平均字节（经验值，用于预估）。 */
const BYTES_PER_CELL = 8.6;
/** 分层抽样块边长（格）。 */
const STRAT = 4;

const def: PatternDef = {
  id: 'tv-static',
  name: '电视雪花',
  category: 'D-pixel',
  description: '无信号电视的满屏灰阶雪花噪点，可选细扫描线与亮色滚动干扰带。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#262626' }, opacity: 1, visible: true, configurable: true },
    { id: 'snow_lo', label: '雪花 · 暗', role: 'detail', paint: { type: 'solid', color: '#575757' }, opacity: 1, visible: true, configurable: true },
    { id: 'snow_mid', label: '雪花 · 中', role: 'secondary', paint: { type: 'solid', color: '#9a9a9a' }, opacity: 1, visible: true, configurable: true },
    { id: 'snow_hi', label: '雪花 · 亮', role: 'primary', paint: { type: 'solid', color: '#ececec' }, opacity: 1, visible: true, configurable: true },
    { id: 'scanline', label: '扫描线', role: 'detail', paint: { type: 'solid', color: '#000000' }, opacity: 0.5, visible: true, configurable: true },
    { id: 'band', label: '干扰带', role: 'accent', paint: { type: 'solid', color: '#ffffff' }, opacity: 0.4, visible: true, configurable: true },
  ],

  controls: [
    // 以 1080 短边为基准的设计 px，渲染时 × min(W,H)/1080 并取整（避免 tile 接缝）
    { key: 'grain', label: '颗粒大小', type: 'range', min: 1, max: 8, step: 0.5, default: 2.5, heavy: true },
    { key: 'density', label: '噪点密度', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.7, heavy: true },
    { key: 'scanlines', label: '扫描线', type: 'toggle', default: true },
    { key: 'scanGap', label: '扫描线距', type: 'range', min: 0.5, max: 3, step: 0.1, default: 1 },
    { key: 'bands', label: '干扰带数', type: 'range', min: 0, max: 3, step: 1, default: 1 },
  ],

  presets: [
    {
      id: 'classic',
      label: '经典黑白',
      elements: {
        bg: { paint: { type: 'solid', color: '#262626' } },
        snow_lo: { paint: { type: 'solid', color: '#575757' } },
        snow_mid: { paint: { type: 'solid', color: '#9a9a9a' } },
        snow_hi: { paint: { type: 'solid', color: '#ececec' } },
        scanline: { paint: { type: 'solid', color: '#000000' } },
        band: { paint: { type: 'solid', color: '#ffffff' } },
      },
    },
    {
      id: 'phosphor',
      label: '绿色荧光',
      elements: {
        bg: { paint: { type: 'solid', color: '#06180c' } },
        snow_lo: { paint: { type: 'solid', color: '#1d5a31' } },
        snow_mid: { paint: { type: 'solid', color: '#3fae63' } },
        snow_hi: { paint: { type: 'solid', color: '#b6ffc6' } },
        scanline: { paint: { type: 'solid', color: '#000000' } },
        band: { paint: { type: 'solid', color: '#d8ffe0' } },
      },
    },
    {
      id: 'blue-screen',
      label: '蓝屏色调',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b1633' } },
        snow_lo: { paint: { type: 'solid', color: '#2f4a7d' } },
        snow_mid: { paint: { type: 'solid', color: '#7392c8' } },
        snow_hi: { paint: { type: 'solid', color: '#dde9ff' } },
        scanline: { paint: { type: 'solid', color: '#030817' } },
        band: { paint: { type: 'solid', color: '#eaf2ff' } },
      },
      params: { bands: 2 },
    },
    {
      id: 'sepia',
      label: '暖调怀旧',
      elements: {
        bg: { paint: { type: 'solid', color: '#251a10' } },
        snow_lo: { paint: { type: 'solid', color: '#5e4429' } },
        snow_mid: { paint: { type: 'solid', color: '#a8845a' } },
        snow_hi: { paint: { type: 'solid', color: '#f3e0bd' } },
        scanline: { paint: { type: 'solid', color: '#0d0804' } },
        band: { paint: { type: 'solid', color: '#fff0d2' } },
      },
      params: { grain: 3 },
    },
    {
      id: 'inverse',
      label: '浅底反相',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4e4e4' } },
        snow_lo: { paint: { type: 'solid', color: '#b4b4b4' } },
        snow_mid: { paint: { type: 'solid', color: '#727272' } },
        snow_hi: { paint: { type: 'solid', color: '#1c1c1c' } },
        scanline: { paint: { type: 'solid', color: '#ffffff' } },
        band: { paint: { type: 'solid', color: '#000000' }, opacity: 0.22 },
      },
      params: { density: 0.6 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['snow_hi'],
    secondary: ['snow_mid'],
    accent: ['band'],
    detail: ['snow_lo', 'scanline'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.25, Math.min(8, Math.min(W, H) / 1080));
    const px = Math.max(1, Math.round(Number(params.grain) * unit));
    const density = Math.max(0, Math.min(1, Number(params.density)));
    const scan = params.scanlines === true;
    const nBands = Math.max(0, Math.min(3, Math.round(Number(params.bands))));

    const bg = elements.get('bg')!;
    const levels = [elements.get('snow_hi')!, elements.get('snow_mid')!, elements.get('snow_lo')!];
    const scanEl = elements.get('scanline')!;
    const bandEl = elements.get('band')!;

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // ── 噪点层 ──────────────────────────────────────────────
    // 每层占格概率；三层合计覆盖 1-(1-p)^3（density=1 → ≈66%）。
    let p = 0.08 + 0.22 * density;
    const totalCells = LAYER_CELLS.reduce((a, c) => a + c * c, 0);
    const est = totalCells * p * BYTES_PER_CELL;
    if (est > BYTE_CAP * 0.92) p *= (BYTE_CAP * 0.92) / est;

    const pickLevel = (): number => {
      const r = rng();
      return r < LEVEL_W[0] ? 0 : r < LEVEL_W[0] + LEVEL_W[1] ? 1 : 2;
    };

    let used = 0;
    LAYER_CELLS.forEach((cells, li) => {
      // 逐格采样：grid[i] = -1 空，0/1/2 = 亮度档
      // 分层抽样（4×4 块内恰取 ≈p 比例的格）：消除 i.i.d. 噪点的低频「团块」，
      // 否则团块随 tile 周期重复，缩略图里会被肉眼认出格状纹理。
      const grid = new Int8Array(cells * cells).fill(-1);
      for (let by = 0; by < cells; by += STRAT) {
        for (let bx = 0; bx < cells; bx += STRAT) {
          const idx: number[] = [];
          for (let y = by; y < Math.min(cells, by + STRAT); y++)
            for (let x = bx; x < Math.min(cells, bx + STRAT); x++) idx.push(y * cells + x);
          const k = Math.min(idx.length, Math.floor(idx.length * p + rng()));
          for (let i = 0; i < k; i++) {
            const j = i + Math.floor(rng() * (idx.length - i));
            const t = idx[i];
            idx[i] = idx[j];
            idx[j] = t;
            grid[idx[i]] = pickLevel();
          }
        }
      }

      const d = ['', '', ''];
      const last = [
        [0, 0],
        [0, 0],
        [0, 0],
      ];
      for (let y = 0; y < cells; y++) {
        let x = 0;
        while (x < cells) {
          const lv = grid[y * cells + x];
          if (lv < 0) {
            x++;
            continue;
          }
          let len = 1;
          while (x + len < cells && grid[y * cells + x + len] === lv) len++;
          if (used > BYTE_CAP) break;
          const L = last[lv];
          const seg = `${d[lv] === '' ? 'M' : 'm'}${d[lv] === '' ? x : x - L[0]} ${d[lv] === '' ? y : y - L[1]}h${len}v1h-${len}z`;
          d[lv] += seg;
          used += seg.length;
          L[0] = x;
          L[1] = y;
          x += len;
        }
      }

      const inner = levels
        .map((e, k) => (e.visible && d[k] !== '' ? path(d[k], { fill: e.paintValue, 'fill-opacity': e.opacity }) : ''))
        .join('');
      if (inner === '') return;
      const ref = api.tile({
        key: `tvs-${li}-${cells}-${px}`,
        w: cells,
        h: cells,
        transform: `scale(${px})`,
        content: g({}, inner),
      });
      parts.push(rect(0, 0, W, H, { fill: ref, 'fill-opacity': LAYER_ALPHA[li] }));
    });

    // ── 扫描线：周期按短边缩放（1080 短边 ≈ 9px），缩略图里也能看出条纹；暗线占 ~45% ──
    if (scan && scanEl.visible) {
      const gap = Math.max(0.5, Math.min(3, Number(params.scanGap) || 1));
      const period = Math.max(3, Math.round(9 * unit * gap));
      const lineH = Math.max(1, Math.round(period * 0.45));
      const ref = api.tile({
        key: `tvs-scan-${period}-${lineH}`,
        w: 8,
        h: period,
        content: rect(0, 0, 8, lineH, { fill: scanEl.paintValue }),
      });
      parts.push(rect(0, 0, W, H, { fill: ref, 'fill-opacity': scanEl.opacity }));
    }

    // ── 滚动干扰带：竖向羽化亮带 + 带内若干细横条纹 ────────────
    if (nBands > 0 && bandEl.visible) {
      const grad = api.linear({
        key: 'tvs-band',
        angle: 90,
        stops: [
          { offset: 0, color: bandEl.paintValue, opacity: 0 },
          { offset: 0.45, color: bandEl.paintValue, opacity: 1 },
          { offset: 0.6, color: bandEl.paintValue, opacity: 0.85 },
          { offset: 1, color: bandEl.paintValue, opacity: 0 },
        ],
      });
      const useGrad = bandEl.paintValue.startsWith('#');
      for (let b = 0; b < nBands; b++) {
        // 带分布在各自 1/n 的竖向区间内，避免重叠成一团
        const bh = H * (0.05 + rng() * 0.09);
        const top = H * 0.06;
        const slot = (H * 0.88) / nBands;
        const by = top + slot * b + rng() * Math.max(0, slot - bh);
        parts.push(
          rect(0, by, W, bh, {
            fill: useGrad ? grad : bandEl.paintValue,
            'fill-opacity': useGrad ? bandEl.opacity : bandEl.opacity * 0.5,
          }),
        );
        // 细横条纹：1 颗粒高，随机起点与长度，合为一条 path
        let sd = '';
        const streaks = 5 + Math.floor(rng() * 6);
        for (let s = 0; s < streaks; s++) {
          const sy = by + bh * (0.15 + rng() * 0.7);
          const sx = rng() * W * 0.8;
          const sw = W * (0.08 + rng() * 0.45);
          sd += `M${api.n(sx)} ${api.n(sy)}h${api.n(Math.min(sw, W - sx))}v${px}h${api.n(-Math.min(sw, W - sx))}z`;
        }
        parts.push(path(sd, { fill: bandEl.paintValue, 'fill-opacity': Math.min(1, bandEl.opacity * 1.4) }));
      }
    }

    return { body: parts.join('') };
  },
};

export default def;
