/**
 * 有机斑点场 —— C 渐变流体 / 有机形态。
 *
 * 构图要点：柔和底色上散布大小不一的有机斑点，按三组配色。
 * 每个斑点由 3~4 个重叠圆构成，边缘互相消融，得到「 metaball / 有机」观感。
 *
 * ⭐⭐ 命中率的正解（memphis-grid 教训的直接应用）：
 * 本 pattern **不做随机采样决定谁出现**。单元内的斑点**槽位是固定的**，
 * 每个槽位绑定了确定的色组（slot % 3），因此三组色在**每个**单元内
 * 都必然出现 —— 改色命中率恒为 100%，与参数、seed 无关。
 * seed 只改变斑点的大小、圆心偏移与重叠子圆的排布。
 */
import { circle, g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 单元内斑点槽位数：固定值 → 体积可预测。 */
const SLOTS = 9;

/** 取小数部分（低差异序列用，保证结果恒在 [0,1)）。 */
function frac(x: number): number {
  return x - Math.floor(x);
}

const def: PatternDef = {
  id: 'blob-field',
  name: '有机斑点场',
  category: 'C-organic',
  description: '大小不一的有机斑点散布，三组配色互相消融，柔软安静。',
  seedable: true,
  animatable: false,

  elements: [
    {
      id: 'bg',
      label: '底色',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
  { offset: 0, color: '#fdf4ff' },
  { offset: 1, color: '#e0e7ff' },
        ],
   },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'blob_a', label: '斑点 · A', role: 'primary', paint: { type: 'solid', color: '#c084fc' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'blob_b', label: '斑点 · B', role: 'secondary', paint: { type: 'solid', color: '#67e8f9' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'blob_c', label: '斑点 · C', role: 'accent', paint: { type: 'solid', color: '#fda4af' }, opacity: 0.7, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 160, max: 900, step: 10, default: 430, heavy: true },
    // 下限 0.6：0.2 时最小单元下斑点只有 1~1.4px，属于「画了看不见」
    { key: 'scale', label: '斑点大小', type: 'range', min: 0.6, max: 2.4, step: 0.05, default: 1.5 },
  { key: 'lobes', label: '重叠子圆', type: 'range', min: 2, max: 5, step: 1, default: 3 },
    { key: 'jitter', label: '随机游走', type: 'range', min: 0, max: 0.14, step: 0.01, default: 0.1 },
  ],

  presets: [
    {
      id: 'candy',
      label: '糖果',
      elements: {
        bg: {
          paint: {
            type: 'linear',
 angle: 90,
      stops: [
              { offset: 0, color: '#fff1f2' },
  { offset: 1, color: '#ede9fe' },
      ],
          },
    },
        blob_a: { paint: { type: 'solid', color: '#fb7185' } },
   blob_b: { paint: { type: 'solid', color: '#fbbf24' } },
     blob_c: { paint: { type: 'solid', color: '#34d399' } },
      },
    },
    {
      id: 'moss',
      label: '苔痕',
      elements: {
        bg: {
  paint: {
 type: 'linear',
   angle: 90,
       stops: [
   { offset: 0, color: '#f7fee7' },
  { offset: 1, color: '#ccfbf1' },
     ],
      },
        },
      blob_a: { paint: { type: 'solid', color: '#65a30d' } },
        blob_b: { paint: { type: 'solid', color: '#0d9488' } },
    blob_c: { paint: { type: 'solid', color: '#ca8a04' } },
      },
    },
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        bg: {
 paint: {
       type: 'linear',
         angle: 90,
   stops: [
        { offset: 0, color: '#1e1b4b' },
     { offset: 1, color: '#4c1d95' },
    ],
   },
      },
        blob_a: { paint: { type: 'solid', color: '#a78bfa' } },
        blob_b: { paint: { type: 'solid', color: '#f0abfc' } },
      blob_c: { paint: { type: 'solid', color: '#67e8f9' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['blob_a'], secondary: ['blob_b'], accent: ['blob_c'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(60, Number(params.size));
    const scale = Math.max(0.1, Number(params.scale));
    const lobes = Math.max(2, Math.min(5, Math.round(Number(params.lobes))));
    const jitter = Math.max(0, Math.min(0.5, Number(params.jitter)));

    const bg = elements.get('bg')!;
    const A = elements.get('blob_a')!;
    const B = elements.get('blob_b')!;
    const C = elements.get('blob_c')!;
    const GROUPS = [A, B, C];

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    /**
     * 只用**单档**单元，不做多档叠加。
     *
     * 为什么不靠「行错位」打破 3×3 格点感：行错位会让最右一列的槽位
     * 落到 tile 之外（1.166 cell），被裁成半圆 —— 实测会看到规律的
     * 「半个斑点」阵列，比原来的方格更糟。
     *
     * 决定依据（两条，都是实测/推理结论，不是偏好）：
     * 1. 多档叠加本来是为了打破 3×3 格点感，但真正解决格点问题的是
     *    **低差异序列**（见下）。序列一换，方格感就消失了，叠加层就不再必要。
 * 2. 第二档（0.41×，约 176px）会让槽位余量 `room` 变得极小，
     *    产出一批半径 1px 的隐形圆点 —— 这类点贡献不了画面，
     *    却仍然占用「槽位 → 色组」的固定映射配额，是纯粹的负担。
  *    因此叠加方案被删除，而不是留着修修补补。
     */
    const LAYERS = [1];

    for (let li = 0; li < LAYERS.length; li++) {
      const unit = cell * LAYERS[li];
      const marks: string[] = [];

      for (let i = 0; i < SLOTS; i++) {
        /**
         * ⭐ 槽位 → 色组是**固定映射**，不是随机结果。
         * 这是本 pattern 命中率 100% 的根据：三组色在每个单元内都必然出现。
         * 若改成「随机挑组」，就会重演 memphis-grid 那种 30% 命中率的问题。
         */
    const e = GROUPS[i % 3];
    if (!e.visible) continue;

/**
         * 位置用**黄金比低差异序列**而不是 3×3 方格。
         *
         * ⚠️ 踩过的坑：早先按 3×3 等距槽位排布，即使加 30% 间距的抖动，
         * 整幅图仍能一眼看出方形网格（实测可见）—— 等距点阵的「格」
         * 比斑点本身更强。改用无理数序列后，9 个点在视觉上无明显规律，
         * 分布却依然均匀（低差异序列的性质），格点感消失。
     */
        /**
         * ⭐ 序列值先**内缩到 [MARGIN, 1−MARGIN]**，再乘以 unit。
         *
* 这一步是修「退化斑点」的关键。frac() 的取值可以任意接近 0 或 1，
         * 于是槽位可能落在 tile 边界上甚至之外：
         *   - 越界 → 圆心出现**负坐标**（实测见到 cy = −12.09），整颗斑点被裁掉；
       *   - 贴边 → 缩小 `room`，半径被夹成 1px 的隐形点。
         * 而「槽位 → 色组」是固定映射，一个退化的槽位等于**白白消耗掉某个色组
         * 的出场配额**，那正是本 pattern 命中率保证的根基。
       *
         * 内缩后每个槽位到边至少有 0.14·unit 的距离，退化从「靠 clamp 兜底」
       * 变成「结构上不可能发生」—— 不用跳过槽位（跳过会破坏固定映射），
         * 也不用把半径硬夹成隐形点。
         */
        const MARGIN = 0.14;
        const span = 1 - 2 * MARGIN;
        const u = MARGIN + span * frac(0.5 + i * 0.6180339887);
     const v = MARGIN + span * frac(0.5 + i * 0.7548776662);
        const cx = unit * u + (rng() - 0.5) * unit * jitter;
        const cy = unit * v + (rng() - 0.5) * unit * jitter;

        /**
         * 余量 = 该点到四条边的实际最近距离，逐点精确。
         * 内缩 + jitter 上限 0.14 保证它恒为正，不会退化成夹到下限的隐形点。
         */
        const room = Math.min(cx, unit - cx, cy, unit - cy) - 1;
        // 防御：余量确为负时（理论上已被 MARGIN 排除）退回一个安全的小值，
        // 而不是 Math.max(1, …) 那种「夹出一个看不见的点」。
        if (room < 2) continue;
const r0 = Math.min(unit * 0.1 * scale * (0.55 + rng() * 0.9), room);

        // 若干重叠子圆 → 边缘互相消融，形成有机轮廓
      for (let k = 0; k < lobes; k++) {
          const spread = Math.min(r0 * 0.6, Math.max(0, room - r0));
          const ox = k === 0 ? 0 : (rng() - 0.5) * spread;
          const oy = k === 0 ? 0 : (rng() - 0.5) * spread;
   // 子圆半径下限 1.5px：不允许出现「画了但看不见」的微点。
          // 上界由余量收敛 —— room − |ox| − |oy| ≥ r0，故不会越出 tile。
          const r = Math.max(
            1.5,
 Math.min(r0 * (k === 0 ? 1 : 0.45 + rng() * 0.55), room - Math.abs(ox) - Math.abs(oy)),
    );
          marks.push(circle(cx + ox, cy + oy, r, { fill: e.paintValue, 'fill-opacity': e.opacity / lobes }));
      }
      }

      if (marks.length > 0) {
    parts.push(
     rect(0, 0, W, H, {
            fill: api.tile({
    key: `bf${li}-${api.n(unit)}-${api.n(scale)}-${lobes}-${api.n(jitter)}`,
     w: unit,
   h: unit,
              content: g({}, marks.join('')),
            }),
   }),
        );
      }
    }

    return { body: parts.join('') };
  },
};

export default def;
