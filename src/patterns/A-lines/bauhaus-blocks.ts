/**
 * 包豪斯块面 —— A 极简几何线条。
 *
 * 构图要点（2026-10-12 审美返修）：画面被划成大模块格，每个模块要么留白、
 * 要么放一个充满模块的基本形（整圆 / 半圆 / 四分之一圆 / 直角三角 / 方块），
 * 朝向与颜色由 seeded rng 决定。6×6 模块组成一个 <pattern> 超级单元，
 * 重复周期约为短边的 1.1 倍，肉眼不易察觉平铺。
 *
 * ⚠️ 返修原因：旧版单元仅 140px 且每单元 4 个图形，红黄蓝小块极密、噪。
 * 现在模块按短边等比缩放（默认约 8 列），约一半模块留白，配色降饱和一档。
 *
 * 体积策略：超级单元内容恒定（≤ 16 个图形），与平铺密度完全解耦。
 */
import { circle, g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'bauhaus-blocks',
  name: '包豪斯块面',
  category: 'A-lines',
  description: '圆、半圆、四分之一圆、三角与方块在大模块格中错落留白，安静的包豪斯构成。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f1ece2' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_a', label: '形 · A', role: 'primary', paint: { type: 'solid', color: '#b5503f' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_b', label: '形 · B', role: 'secondary', paint: { type: 'solid', color: '#34505f' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_c', label: '形 · C', role: 'accent', paint: { type: 'solid', color: '#d6a650' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    // 单元尺寸 = 模块边长（以 1080 短边为基准的设计像素，按短边等比缩放）
    { key: 'cell', label: '单元尺寸', type: 'range', min: 80, max: 400, step: 4, default: 200, heavy: true },
    { key: 'radius', label: '图形占比', type: 'range', min: 0.2, max: 0.9, step: 0.01, default: 0.72 },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
    { key: 'outlined', label: '描边风格', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'classic',
      label: '经典包豪斯',
      elements: {
        bg: { paint: { type: 'solid', color: '#eee8dc' } },
        shape_a: { paint: { type: 'solid', color: '#a8443a' } },
        shape_b: { paint: { type: 'solid', color: '#2a3f4f' } },
        shape_c: { paint: { type: 'solid', color: '#d9c7a3' } },
      },
    },
    {
      id: 'primary',
      label: '原色',
      elements: {
        bg: { paint: { type: 'solid', color: '#f6f4ef' } },
        shape_a: { paint: { type: 'solid', color: '#3a64a0' } },
        shape_b: { paint: { type: 'solid', color: '#e2bb48' } },
        shape_c: { paint: { type: 'solid', color: '#c55246' } },
      },
    },
    {
      id: 'noir',
      label: '单色',
      elements: {
        bg: { paint: { type: 'solid', color: '#1a1a1a' } },
        shape_a: { paint: { type: 'solid', color: '#d9d6d0' } },
        shape_b: { paint: { type: 'solid', color: '#8a8782' } },
        shape_c: { paint: { type: 'solid', color: '#4a4846' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['shape_a'], secondary: ['shape_b'], accent: ['shape_c'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const m = Math.max(40, Number(params.cell)) * unit; // 模块边长
    const ratio = Math.max(0.2, Math.min(0.9, Number(params.radius)));
    const rotate = Number(params.rotate);
    const outlined = params.outlined === true;

    const bg = elements.get('bg')!;
    const COLORS = [elements.get('shape_a')!, elements.get('shape_b')!, elements.get('shape_c')!];

    const N = 6; // 超级单元 = N×N 模块（周期 ≈ 1.1 个屏幕高，平铺感弱）
    const S = m * N;
    const sw = Math.max(1, m * 0.03);
    const style = (e: (typeof COLORS)[number]): Record<string, string | number> =>
      outlined
        ? { fill: 'none', stroke: e.paintValue, 'stroke-width': sw, 'stroke-opacity': e.opacity }
        : { fill: e.paintValue, 'fill-opacity': e.opacity };

    // 模块洗牌：前 3 个占用位依次分给 A/B/C（三色必然出现 → 改色命中率 100%），其余随机
    const order = Array.from({ length: N * N }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const filled = 14 + Math.floor(rng() * 3); // 36 格只填 14~16 个 → 过半留白

    const n = api.n;
    const shapes: string[] = [];
    for (let k = 0; k < filled; k++) {
      const idx = order[k];
      const x0 = (idx % N) * m;
      const y0 = Math.floor(idx / N) * m;
      const e = COLORS[k < 3 ? k : Math.floor(rng() * 3)];
      const kind = Math.floor(rng() * 5);
      const turn = Math.floor(rng() * 4) * 90;
      if (!e.visible) continue;
      // 图形在模块内居中，边长 s = 模块 × 占比
      const s = m * ratio;
      const h = s / 2;
      const cx = x0 + m / 2;
      const cy = y0 + m / 2;
      let shape: string;
      switch (kind) {
        case 0: // 整圆
          shape = circle(cx, cy, h);
          break;
        case 1: // 半圆（直边在模块中线）
          shape = path(`M${n(cx - h)} ${n(cy + h * 0.5)}A${n(h)} ${n(h)} 0 0 1 ${n(cx + h)} ${n(cy + h * 0.5)}Z`);
          break;
        case 2: // 四分之一圆（圆心在图形框一角）
          shape = path(`M${n(cx - h)} ${n(cy - h)}H${n(cx + h)}A${n(s)} ${n(s)} 0 0 1 ${n(cx - h)} ${n(cy + h)}Z`);
          break;
        case 3: // 直角三角
          shape = path(`M${n(cx - h)} ${n(cy - h)}L${n(cx + h)} ${n(cy + h)}H${n(cx - h)}Z`);
          break;
        default: // 方块（略小于圆，视觉等重）
          shape = rect(cx - h * 0.85, cy - h * 0.85, h * 1.7, h * 1.7);
      }
      // 朝向：绕模块中心旋转 0/90/180/270
      shapes.push(g({ transform: turn ? `rotate(${turn} ${n(cx)} ${n(cy)})` : undefined, ...style(e) }, shape));
    }

    const tileRef = api.tile({
      key: `bb-${n(m)}-${n(ratio)}-${n(rotate)}-${outlined ? 1 : 0}`,
      w: S,
      h: S,
      content: shapes.join(''),
      transform: rotate === 0 ? undefined : `rotate(${n(rotate)})`,
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;