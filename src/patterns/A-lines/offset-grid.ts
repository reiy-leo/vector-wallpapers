/**
 * 错位方格 —— A 极简几何线条。
 *
 * 构图要点（2026-10-12 重写）：
 *  - 横线组是完整的淡网格行线；竖线组按行交替错位 `shift × 格距`（砌砖式），
 *    「错位」由此真正可见（旧实现把横线组水平平移 —— 对水平线是零效果）。
 *  - 强调块不再随机散落成零星小点，而是落在错位格里、聚成一组靠近三分点的
 *    「阶梯簇」：首块满色，其余逐级变淡，形成主次分明的构图焦点。
 * 线组走 <pattern> 平铺，DOM 节点数与格距无关。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'offset-grid',
  name: '错位方格',
  category: 'B-repeat',
  description: '淡网格行线 + 按行错位的竖线（砌砖式），强调块在三分点附近聚成主次分明的阶梯簇。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f3f0e9' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_v', label: '竖线组', role: 'secondary', paint: { type: 'solid', color: '#2d3138' }, opacity: 0.28, visible: true, configurable: true },
    { id: 'line_h', label: '横线组', role: 'primary', paint: { type: 'solid', color: '#2d3138' }, opacity: 0.16, visible: true, configurable: true },
    { id: 'block', label: '强调块', role: 'accent', paint: { type: 'solid', color: '#c4553f' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    // cell / weight 以 1080p 短边为基准，渲染时乘 unit = 短边/1080（2560×1440 下 ×1.33）
    { key: 'cell', label: '格距', type: 'range', min: 40, max: 240, step: 2, default: 104, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.5, max: 6, step: 0.1, default: 1.2, unit: 'px' },
    { key: 'shift', label: '错位量', type: 'range', min: 0, max: 0.5, step: 0.01, default: 0.33 },
    { key: 'blocks', label: '强调块数', type: 'range', min: 0, max: 8, step: 1, default: 4 },
  ],

  presets: [
    {
      id: 'paper',
      label: '纸白',
      elements: {
        bg: { paint: { type: 'solid', color: '#faf7f0' } },
        line_v: { paint: { type: 'solid', color: '#1f2937' }, opacity: 0.26 },
        line_h: { paint: { type: 'solid', color: '#1f2937' }, opacity: 0.14 },
        block: { paint: { type: 'solid', color: '#d9962b' } },
      },
    },
    {
      id: 'ink',
      label: '墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#16181c' } },
        line_v: { paint: { type: 'solid', color: '#e5e7eb' }, opacity: 0.2 },
        line_h: { paint: { type: 'solid', color: '#e5e7eb' }, opacity: 0.1 },
        block: { paint: { type: 'solid', color: '#6fb3bf' } },
      },
    },
    {
      id: 'terracotta',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2e8dc' } },
        line_v: { paint: { type: 'solid', color: '#9a3412' }, opacity: 0.3 },
        line_h: { paint: { type: 'solid', color: '#9a3412' }, opacity: 0.16 },
        block: { paint: { type: 'solid', color: '#5f7d5a' } },
      },
      params: { shift: 0.5 },
    },
  ],

  paletteSlots: { bg: ['bg'], secondary: ['line_v'], primary: ['line_h'], accent: ['block'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const cell = Math.max(8, Number(params.cell) * unit);
    const weight = Number(params.weight) * unit;
    const shift = Math.max(0, Math.min(0.5, Number(params.shift)));
    const blockCount = Math.round(Number(params.blocks));

    const bg = elements.get('bg')!;
    const lv = elements.get('line_v')!;
    const lh = elements.get('line_h')!;
    const block = elements.get('block')!;

    /**
     * 网格原点：让网格在画布上居中（左右/上下留边对称），构图更稳。
     * 两个 pattern 共用这一原点（patternTransform 平移），线与块严格对齐。
     */
    const ox = ((W % cell) / 2) % cell;
    const oy = ((H % (cell * 2)) / 2) % (cell * 2);
    const originT = ox === 0 && oy === 0 ? undefined : `translate(${api.n(ox)} ${api.n(oy)})`;
    const sx = shift * cell;

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // 横线组：每格一条完整行线（淡）
    if (lh.visible) {
      const hTile = api.tile({
        key: `og-h-${api.n(cell)}-${api.n(weight)}`,
        w: cell,
        h: cell,
        content: path(`M0 ${api.n(weight / 2)}H${api.n(cell)}`, {
          fill: 'none',
          stroke: lh.paintValue,
          'stroke-width': weight,
          'stroke-opacity': lh.opacity,
        }),
        transform: originT,
      });
      parts.push(rect(0, 0, W, H, { fill: hTile }));
    }

    /**
     * 竖线组：单元 = cell × 2cell。上半行竖线在 x=0，下半行竖线右移 shift·cell，
     * 平铺后形成砌砖式错位（shift=0.5 即标准顺砖）。
     */
    if (lv.visible) {
      const xa = weight / 2;
      const xb = sx + weight / 2;
      const vTile = api.tile({
        key: `og-v-${api.n(cell)}-${api.n(weight)}-${api.n(shift)}`,
        w: cell,
        h: cell * 2,
        content: path(`M${api.n(xa)} 0V${api.n(cell)}M${api.n(xb)} ${api.n(cell)}V${api.n(cell * 2)}`, {
          fill: 'none',
          stroke: lv.paintValue,
          'stroke-width': weight,
          'stroke-opacity': lv.opacity,
        }),
        transform: originT,
      });
      parts.push(rect(0, 0, W, H, { fill: vTile }));
    }

    /**
     * 强调块：落在错位格内，组成一个靠近三分点的「阶梯簇」。
     * 焦点在四个三分点中由 seed 选一个；之后每块从上一块出发，
     * 向右 / 下 / 左 / 上的相邻错位格走一步（不重叠）。
     * 首块满色，其余透明度逐级递减 —— 主次分明，不再是零星散点。
     */
    if (block.visible && blockCount > 0) {
      const thirds: Array<[number, number]> = [
        [1 / 3, 1 / 3],
        [2 / 3, 1 / 3],
        [1 / 3, 2 / 3],
        [2 / 3, 2 / 3],
      ];
      const [fx, fy] = thirds[Math.floor(rng() * 4) % 4];
      const rowOf = (y: number) => Math.floor((y - oy) / cell);
      const rowShift = (r: number) => (((r % 2) + 2) % 2 === 1 ? sx : 0);
      const colOf = (x: number, r: number) => Math.floor((x - ox - rowShift(r)) / cell);

      let r = rowOf(H * fy + (rng() - 0.5) * cell);
      let c = colOf(W * fx + (rng() - 0.5) * cell, r);
      const taken = new Set<string>();
      const inset = Math.max(weight * 1.5, cell * 0.06);
      const maxR = Math.floor((H - oy) / cell) - 1;
      const maxC = Math.floor((W - ox) / cell) - 2;

      for (let i = 0; i < blockCount; i++) {
        if (i > 0) {
          // 走一步：优先右、下，形成向一侧延伸的阶梯；被占用则换方向
          const dirs: Array<[number, number]> = rng() < 0.5 ? [[1, 0], [0, 1], [-1, 0], [0, -1]] : [[0, 1], [1, 0], [0, -1], [-1, 0]];
          let moved = false;
          for (const [dc, dr] of dirs) {
            const nr = Math.max(0, Math.min(maxR, r + dr));
            // 换行时按错位量修正列号，使块在视觉上「斜着」相邻
            const nc = Math.max(0, Math.min(maxC, c + dc + (dr !== 0 && rowShift(nr) < rowShift(r) ? 1 : 0)));
            if (!taken.has(`${nc},${nr}`)) {
              r = nr;
              c = nc;
              moved = true;
              break;
            }
          }
          if (!moved) break;
        }
        taken.add(`${c},${r}`);
        const x = ox + c * cell + rowShift(r) + inset;
        const y = oy + r * cell + inset;
        const size = cell - inset * 2;
        // 透明度阶梯：1 → 0.55 → 0.4 → 0.3 …（带极轻 seeded 抖动，保证 seed 敏感）
        const k = i === 0 ? 1 : Math.max(0.18, 0.62 - i * 0.1 + (rng() - 0.5) * 0.04);
        parts.push(rect(x, y, size, size, { fill: block.paintValue, 'fill-opacity': block.opacity * k }));
      }
    }

    return { body: parts.join('') };
  },
};

export default def;