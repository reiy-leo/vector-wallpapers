/**
 * 像素地形 —— D 像素 / 复古游戏。
 *
 * 构图要点：与 `dusk-ridges` 同属「层叠剪影」母题，但山脊轮廓改��
 * **阶梯状方块**（列 + 台阶）而非平滑正弦，因此是 D 类的像素质感。
 * 水面用倒影条带 + 水平高光条表现波光。
 *
 * D 类由引擎自动加 `shape-rendering="crispEdges"`，所以台阶边缘绝对锐利。
 *
 * ⭐ 节点与体积：地形按「列」绘制，列数是固定值（与W/H 无关），
 * 因此体积与尺寸解耦；改用 W/H 比例推导列宽即可铺满任意画幅。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 地形列数：固定值，保证体积可预测。 */
const COLS = 64;

const def: PatternDef = {
  id: 'pixel-terrain',
  name: '像素地形',
  category: 'D-pixel',
  description: '阶梯状像素山峦层叠，水面映着天光，复古游戏场景。',
  seedable: true,
  animatable: false,

  elements: [
    {
      id: 'sky',
      label: '天空',
      role: 'bg',
      paint: {
    type: 'linear',
 angle: 90,
        stops: [
   { offset: 0, color: '#1e3a8a' },
    { offset: 0.5, color: '#7c3aed' },
     { offset: 1, color: '#fb7185' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'far', label: '山峦 · 远', role: 'secondary', paint: { type: 'solid', color: '#4c1d95' }, opacity: 1, visible: true, configurable: true },
    { id: 'mid', label: '山峦 · 中', role: 'primary', paint: { type: 'solid', color: '#2e1065' }, opacity: 1, visible: true, configurable: true },
    { id: 'fore', label: '前景', role: 'detail', paint: { type: 'solid', color: '#0f0425' }, opacity: 1, visible: true, configurable: true },
    { id: 'water', label: '水面', role: 'accent', paint: { type: 'solid', color: '#312e81' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'relief', label: '起伏', type: 'range', min: 0.05, max: 0.5, step: 0.01, default: 0.22, heavy: true },
    { key: 'layers', label: '层数', type: 'range', min: 2, max: 4, step: 1, default: 3 },
    { key: 'waterY', label: '水面高度', type: 'range', min: 0.5, max: 0.9, step: 0.01, default: 0.72 },
    { key: 'glint', label: '水面波光', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'dusk8',
      label: '黄昏',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
          stops: [
              { offset: 0, color: '#1e3a8a' },
     { offset: 0.5, color: '#7c3aed' },
              { offset: 1, color: '#fb7185' },
            ],
    },
      },
        far: { paint: { type: 'solid', color: '#4c1d95' } },
        mid: { paint: { type: 'solid', color: '#2e1065' } },
      fore: { paint: { type: 'solid', color: '#0f0425' } },
        water: { paint: { type: 'solid', color: '#312e81' } },
      },
    },
    {
      id: 'forest8',
      label: '林夜',
      elements: {
        sky: {
          paint: {
            type: 'linear',
    angle: 90,
            stops: [
              { offset: 0, color: '#022c22' },
   { offset: 0.6, color: '#065f46' },
   { offset: 1, color: '#a7f3d0' },
            ],
          },
    },
        far: { paint: { type: 'solid', color: '#065f46' } },
        mid: { paint: { type: 'solid', color: '#064e3b' } },
 fore: { paint: { type: 'solid', color: '#022c22' } },
        water: { paint: { type: 'solid', color: '#0f766e' } },
      },
    },
    {
      id: 'ember8',
      label: '余烬',
      elements: {
      sky: {
          paint: {
      type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#450a0a' },
 { offset: 0.55, color: '#b45309' },
    { offset: 1, color: '#fde68a' },
         ],
     },
   },
        far: { paint: { type: 'solid', color: '#7c2d12' } },
        mid: { paint: { type: 'solid', color: '#431407' } },
        fore: { paint: { type: 'solid', color: '#1c1917' } },
        water: { paint: { type: 'solid', color: '#9a3412' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['sky'],
    secondary: ['far'],
    primary: ['mid'],
    detail: ['fore'],
    accent: ['water'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const relief = Math.max(0.02, Number(params.relief));
    const layerCount = Math.max(2, Math.min(4, Math.round(Number(params.layers))));
    const waterRatio = Math.max(0.5, Math.min(0.9, Number(params.waterY)));
    const glint = params.glint === true;

    const sky = elements.get('sky')!;
    const fore = elements.get('fore')!;
    const water = elements.get('water')!;

    const colW = W / COLS;
    const waterY = H * waterRatio;

    /**
     * 生成一条阶梯状山脊的**闭合路径**（单条 path，不是 N 个矩形）。
     *
     * ⭐ 为什么要单条 path：逐列画 rect 时，3 层 × 64 列会产生上百个节点，
     * 直接击穿 60 节点红线（实测 97）。改成「水平段 + 垂直段」交替的
     * 阶梯轮廓后，每层只占 1 个节点。
     *
     * 三层各自用独立的 seeded 频率与相位 → 换 seed 换山形。
     */
    const ridgePath = (
      baseY: number,
      amp: number,
      f1: number,
      f2: number,
      p1: number,
      p2: number,
    ): string => {
      const yAt = (t: number): number =>
    baseY -
        amp * (0.78 * Math.sin(t * Math.PI * 2 * f1 + p1) + 0.22 * Math.sin(t * Math.PI * 2 * f2 + p2));

      // 沿 x 逐列走：先水平到列边界，再垂直到新高度 —— 形成真正的台阶
      let d = `M0 ${api.n(yAt(0))}`;
      for (let i = 1; i <= COLS; i++) {
        const yPrev = yAt((i - 1) / COLS);
        const y = yAt(i / COLS);
        d += ` L${api.n(i * colW)} ${api.n(yPrev)}`;
        if (Math.abs(y - yPrev) > 0.01) d += ` L${api.n(i * colW)} ${api.n(y)}`;
      }
      /**
       * ⚠️ 封口线必须落在**所有山脊点的下方**，即 baseY + amp×1.25。
       *
       *踩过的坑：早先封在 baseY 上，但 yAt 的正弦和可以取到 −1，
       * 于是部分山脊点**低于** baseY，闭合线在山体中间横穿，
       * 渲染出「倒挂的钟乳石」与自交形状（实测可见）。
       * dusk-ridges 用 `baseY + height*3` 封口正是同一个道理。
       */
      const closeY = baseY + amp * 1.25;
      return `${d} L${api.n(W)} ${api.n(closeY)} L0 ${api.n(closeY)} Z`;
    };

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // 远山：数量不足时保留近景
    const RIDGE_IDS = ['far', 'mid', 'fore'] as const;
    // 保留最近 layerCount 层：切片起点 = 总数 - 实际层数。
    // ⚠️ 不能写成 `length - (layerCount - 1)`：那是 off-by-one，
    // layers=3 时会算成 slice(1) → 丢掉 `far`，导致该元件改色永远无效（实测 0%）。
    const keep = Math.min(layerCount, RIDGE_IDS.length);
    const chosen = RIDGE_IDS.slice(RIDGE_IDS.length - keep);

    for (let li = 0; li < chosen.length; li++) {
      const e = elements.get(chosen[li])!;
      if (!e.visible) continue;
      const t = (li + 1) / (chosen.length + 1);
      const baseY = waterY - H * relief * (0.25 + t * 0.7);
      const amp = H * relief * (0.5 + t * 0.6);
      parts.push(
        path(
          ridgePath(
   baseY,
    amp,
            0.8 + li * 0.5 + rng() * 0.6,
          2.4 + li * 1.1 + rng() * 1.4,
      rng() * Math.PI * 2,
            rng() * Math.PI * 2,
          ),
    { fill: e.paintValue, 'fill-opacity': e.opacity },
      ),
    );
      }

    // 水面：整条水平带 + 波光条
    if (water.visible) {
  parts.push(rect(0, waterY, W, H - waterY, { fill: water.paintValue, 'fill-opacity': water.opacity }));
   if (glint) {
     // 波光用等距横条，宽度沿 x 由 seeded 抖动 —— 形成碎光而非规则条纹
  const rows = 7;
        for (let r = 0; r < rows; r++) {
   const ry = waterY + ((H - waterY) * (r + 0.6)) / (rows + 1);
     const segs = 5;
       for (let sIdx = 0; sIdx < segs; sIdx++) {
     const sw = (W / segs) * (0.25 + rng() * 0.5);
          const sx = (W / segs) * sIdx + rng() * (W / segs) * 0.4;
     parts.push(
       rect(sx, ry, sw, Math.max(1, H * 0.004), {
      fill: fore.paintValue,
        'fill-opacity': 0.35,
              }),
         );
   }
        }
      }
    }

    return { body: parts.join('') };
  },
};

export default def;
