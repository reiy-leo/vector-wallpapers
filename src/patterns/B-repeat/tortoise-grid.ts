/**
 * 龟甲方格 —— B 波点 / 网格重复。
 *
 * 几何：毕达哥拉斯铺砌（Pythagorean tiling，俗称风车格 / 大小方砖交错）。
 * 大方格边长 a、小方格边长 b，周期格是两个向量 v1=(a,b)、v2=(-b,a) 张成的
 * 边长 c=√(a²+b²) 的正方形，相对世界坐标轴倾斜 θ=atan2(b,a)。
 *
 * 实现：<pattern> 本身只能是轴对齐矩形，所以把 pattern 旋转 θ（patternTransform），
 * 再在 pattern 内部用 rotate(-θ) 把方砖转回水平 —— 净效果是水平摆放的大小方砖。
 * pattern 会裁掉溢出 tile 的部分，因此内部画 3×3 份格点副本把 tile 盖满。
 * 无随机性 → seedable: false。
 */
import { g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'tortoise-grid',
  name: '龟甲方格',
  category: 'B-repeat',
  description: '大小方砖交错的风车格（毕达哥拉斯铺砌），砖缝留白，安静耐看的地砖肌理。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色 · 砖缝', role: 'bg', paint: { type: 'solid', color: '#d8d0c3' }, opacity: 1, visible: true, configurable: true },
    { id: 'tile_l', label: '大方格', role: 'primary', paint: { type: 'solid', color: '#efe9df' }, opacity: 1, visible: true, configurable: true },
    { id: 'tile_s', label: '小方格', role: 'secondary', paint: { type: 'solid', color: '#b89f86' }, opacity: 1, visible: true, configurable: true },
    { id: 'inset', label: '内框线', role: 'detail', paint: { type: 'solid', color: '#ffffff' }, opacity: 0.45, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cols', label: '大格数量（长边）', type: 'range', min: 6, max: 30, step: 1, default: 13, heavy: true },
    { key: 'ratio', label: '小格比例', type: 'range', min: 0.25, max: 0.8, step: 0.01, default: 0.48 },
    { key: 'gap', label: '砖缝', type: 'range', min: 0, max: 0.12, step: 0.005, default: 0.035 },
    { key: 'radius', label: '圆角', type: 'range', min: 0, max: 0.3, step: 0.01, default: 0.04 },
    { key: 'insetSize', label: '内框缩进', type: 'range', min: 0.08, max: 0.35, step: 0.01, default: 0.16 },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
  ],

  presets: [
    {
      id: 'stone',
      label: '石灰',
      elements: {
        bg: { paint: { type: 'solid', color: '#d8d0c3' } },
        tile_l: { paint: { type: 'solid', color: '#efe9df' } },
        tile_s: { paint: { type: 'solid', color: '#b89f86' } },
        inset: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.45 },
      },
    },
    {
      id: 'slate',
      label: '石板夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#15191f' } },
        tile_l: { paint: { type: 'solid', color: '#262c35' } },
        tile_s: { paint: { type: 'solid', color: '#a88a5c' } },
        inset: { paint: { type: 'solid', color: '#3a424e' }, opacity: 0.8 },
      },
    },
    {
      id: 'sage',
      label: '鼠尾草',
      elements: {
        bg: { paint: { type: 'solid', color: '#c9d1c4' } },
        tile_l: { paint: { type: 'solid', color: '#e6ebe1' } },
        tile_s: { paint: { type: 'solid', color: '#7f9a86' } },
        inset: { paint: { type: 'solid', color: '#f7f9f4' }, opacity: 0.6 },
      },
      params: { ratio: 0.42 },
    },
    {
      id: 'terracotta',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe4d6' } },
        tile_l: { paint: { type: 'solid', color: '#c4937a' } },
        tile_s: { paint: { type: 'solid', color: '#f4ece1' } },
        inset: { paint: { type: 'solid', color: '#ad7a63' }, opacity: 0.7 },
      },
      params: { gap: 0.05, ratio: 0.55 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['tile_l'], secondary: ['tile_s'], detail: ['inset'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const { n } = api;
    const cols = Math.max(2, Number(params.cols));
    const ratio = Math.min(0.95, Math.max(0.05, Number(params.ratio)));
    const rot = Number(params.rotate);

    // 尺寸从长边推导（竖屏不会被挤得过密）：一个「周期」在水平方向上的投影约为 a + b。
    const a = Math.max(W, H) / cols / (1 + ratio * 0.35);
    const b = a * ratio;
    const c = Math.hypot(a, b);
    const theta = (Math.atan2(b, a) * 180) / Math.PI;
    const gap = a * Number(params.gap);
    const half = gap / 2;
    const rad = Number(params.radius);

    const bg = elements.get('bg')!;
    const tl = elements.get('tile_l')!;
    const ts = elements.get('tile_s')!;
    const ins = elements.get('inset')!;

    const v1x = a;
    const v1y = b;
    const v2x = -b;
    const v2y = a;

    const big: string[] = [];
    const small: string[] = [];
    const frames: string[] = [];
    const insetD = a * Number(params.insetSize);
    const sw = Math.max(0.5, a * 0.018);

    for (let k = -1; k <= 1; k++) {
      for (let m = -1; m <= 1; m++) {
        const ox = k * v1x + m * v2x;
        const oy = k * v1y + m * v2y;
        const la = a - gap;
        const lb = b - gap;
        if (tl.visible && la > 0) {
          big.push(rect(ox + half, oy + half, la, la, { rx: rad > 0 ? n(la * rad) : undefined }));
        }
        if (ins.visible) {
          const s = a - 2 * insetD;
          if (s > 0) frames.push(rect(ox + insetD, oy + insetD, s, s, { rx: rad > 0 ? n(s * rad) : undefined }));
        }
        if (ts.visible && lb > 0) {
          small.push(rect(ox + a + half, oy + half, lb, lb, { rx: rad > 0 ? n(lb * rad) : undefined }));
        }
      }
    }

    const groups: string[] = [];
    if (big.length) groups.push(g({ fill: tl.paintValue, 'fill-opacity': tl.opacity }, big.join('')));
    if (small.length) groups.push(g({ fill: ts.paintValue, 'fill-opacity': ts.opacity }, small.join('')));
    if (frames.length) {
      groups.push(
        g(
          {
            fill: 'none',
            stroke: ins.paintValue,
            'stroke-opacity': ins.opacity,
            'stroke-width': n(sw),
          },
          frames.join(''),
        ),
      );
    }

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (groups.length) {
      const tileRef = api.tile({
        key: `tg-${n(a)}-${n(b)}`,
        w: c,
        h: c,
        content: g({ transform: `rotate(${n(-theta)})` }, groups.join('')),
        transform: `rotate(${n(theta + rot)})`,
      });
      parts.push(rect(0, 0, W, H, { fill: tileRef }));
    }
    return { body: parts.join('') };
  },
};

export default def;
