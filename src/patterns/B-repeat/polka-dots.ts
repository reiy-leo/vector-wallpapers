/**
 * 波点圆点 —— B 波点 / 网格重复（架构 §12.5 的参考实现）。
 *
 * ⭐ 高密度必须走 <pattern>：密度 4 与密度 60 的 SVG 体积几乎相同，
 * DOM 节点数恒为 2。这是「密度与体积解耦」的教科书案例。
 */
import { circle, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'polka-dots',
  name: '波点圆点',
  category: 'B-repeat',
  description: '经典波点圆点，三档尺寸错位排布，密度与体积解耦。',
  // 规则几何本身没有随机性：换seed 只会改参数默认值，不会改构图。
  // 如实标注可避免 UI 亮起一个无效的骰子按钮。
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#fdf6e3' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot_l', label: '大点', role: 'primary', paint: { type: 'solid', color: '#1e293b' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot_m', label: '中点', role: 'secondary', paint: { type: 'solid', color: '#e11d48' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'dot_s', label: '小点', role: 'accent', paint: { type: 'solid', color: '#0ea5e9' }, opacity: 0.8, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '密度', type: 'range', min: 4, max: 60, step: 1, default: 18, heavy: true },
    { key: 'sizeL', label: '大点尺寸', type: 'range', min: 2, max: 40, step: 1, default: 14 },
    { key: 'sizeM', label: '中点尺寸', type: 'range', min: 1, max: 30, step: 1, default: 8 },
    { key: 'stagger', label: '错位', type: 'toggle', default: true },
    { key: 'rotate', label: '旋转', type: 'angle', default: 0 },
  ],

  presets: [
    {
      id: 'cream',
      label: '奶油',
      elements: {
        bg: { paint: { type: 'solid', color: '#fdf6e3' } },
        dot_l: { paint: { type: 'solid', color: '#1e293b' } },
        dot_m: { paint: { type: 'solid', color: '#e11d48' } },
        dot_s: { paint: { type: 'solid', color: '#0ea5e9' } },
      },
    },
    {
      id: 'mono',
      label: '单色',
      elements: {
        bg: { paint: { type: 'solid', color: '#111827' } },
        dot_l: { paint: { type: 'solid', color: '#f9fafb' } },
        dot_m: { paint: { type: 'solid', color: '#9ca3af' } },
        dot_s: { paint: { type: 'solid', color: '#4b5563' } },
      },
    },
    {
      id: 'candy',
      label: '糖果',
      elements: {
        bg: { paint: { type: 'solid', color: '#fff1f6' } },
        dot_l: { paint: { type: 'solid', color: '#db2777' } },
        dot_m: { paint: { type: 'solid', color: '#7c3aed' } },
        dot_s: { paint: { type: 'solid', color: '#06b6d4' } },
      },
      params: { density: 24 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['dot_l'], secondary: ['dot_m'], accent: ['dot_s'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const density = Math.max(2, Number(params.density));
    const cell = Math.max(8, W / density);
    const stagger = params.stagger === true;
    const rotate = Number(params.rotate);

    const bg = elements.get('bg')!;
    const dotL = elements.get('dot_l')!;
    const dotM = elements.get('dot_m')!;
    const dotS = elements.get('dot_s')!;

    // 错位排布：主点居中；开启 stagger 后中点与小点挪到单元对角，
    // 于是平铺后形成「一大一中一小」的三层波点肌理（经典波点 Wallpaper 的做法）。
const cx = cell * 0.5;
    const cy = cell * 0.5;
    const rL = Math.max(0.5, (cell * Number(params.sizeL)) / 28);
    const rM = Math.max(0.4, (cell * Number(params.sizeM)) / 28);
    const rS = Math.max(0.3, rM * 0.45);

    const marks: string[] = [];
    if (dotL.visible) {
      marks.push(circle(cx, cy, rL, { fill: dotL.paintValue, 'fill-opacity': dotL.opacity }));
    }
    if (dotM.visible) {
      marks.push(
        circle(stagger ? cell * 0.82 : cx, stagger ? cell * 0.82 : cy, rM, {
          fill: dotM.paintValue,
          'fill-opacity': dotM.opacity,
        }),
      );
    }
    if (dotS.visible) {
      marks.push(
        circle(stagger ? cell * 0.18 : cx, stagger ? cell * 0.18 : cy, rS, {
          fill: dotS.paintValue,
          'fill-opacity': dotS.opacity,
        }),
      );
    }

    const tileRef = api.tile({
      key: `pd-${api.n(cell)}-${api.n(rL)}-${api.n(rM)}-${stagger ? 1 : 0}`,
      w: cell,
      h: cell,
      content: marks.join(''),
      transform: rotate === 0 ? undefined : `rotate(${api.n(rotate)})`,
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