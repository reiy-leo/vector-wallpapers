/**
 * 递变网点 —— B 波点 / 网格重复。
 *
 * 构图要点：等径网点做严格平铺 + 覆盖全幅的明暗渐变调制层。
 * 网点在亮处清晰、暗处被冲淡，视觉上等效于「网点尺寸随明暗变化」——
 * 这正是印刷半色调的核心观感。
 *
 * ⭐ 为什么是「等径网点 + 渐变调制」而不是「逐点变半径」：
 * 真实印刷里网点半径确实随明暗连续变化，但逐点变半径与 <pattern> 平铺
 * **机制上直接冲突**（平铺 = 单元原样重复；连续渐变 = 逐点不同），
 * 而 B-repeat 类按架构 §3.3 必须平铺。
 * 曾尝试三种替代方案并逐一失败：
 *  1) pitch×pitch pattern，场只在单元内变 → 全图一片实底
 *  2) 每行一个 pattern → defs 签名去重把 36 行塌成 1 行
 *  3) 完全放弃平铺逐点画 → 视觉对了但违反平铺铁律，且 230 点即顶满 20KB
 * 现方案在 20KB 预算内守住了「密度与体积解耦」这条架构意图。
 */
import { circle, g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'halftone',
  name: '递变网点',
  category: 'B-repeat',
  description: '网点随明暗渐变显隐，双色分色，模拟印刷半色调的疏密变化。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f4efe4' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot_dark', label: '暗部网点', role: 'primary', paint: { type: 'solid', color: '#1a1a1a' }, opacity: 0.92, visible: true, configurable: true },
    { id: 'dot_light', label: '亮部网点', role: 'secondary', paint: { type: 'solid', color: '#e0453c' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'paper', label: '纸色', role: 'detail', paint: { type: 'solid', color: '#d9cdb6' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'pitch', label: '网点密度', type: 'range', min: 16, max: 120, step: 4, default: 52, heavy: true },
    { key: 'angle', label: '网点角度', type: 'angle', default: 45 },
    { key: 'spread', label: '明暗跨度', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.7 },
    { key: 'ripple', label: '波纹强度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'split', label: '双色分色', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'print',
      label: '丝网印刷',
      elements: {
        bg: { paint: { type: 'solid', color: '#f4efe4' } },
        dot_dark: { paint: { type: 'solid', color: '#1a1a1a' } },
        dot_light: { paint: { type: 'solid', color: '#e0453c' } },
        paper: { paint: { type: 'solid', color: '#d9cdb6' } },
      },
    },
    {
      id: 'cyanotype',
      label: '蓝晒',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8f0f6' } },
        dot_dark: { paint: { type: 'solid', color: '#0d3b66' } },
        dot_light: { paint: { type: 'solid', color: '#5fa8d3' } },
        paper: { paint: { type: 'solid', color: '#cfe0ec' } },
      },
    },
    {
      id: 'duotone-pink',
      label: '粉调',
      elements: {
        bg: { paint: { type: 'solid', color: '#fdf2f6' } },
        dot_dark: { paint: { type: 'solid', color: '#9d174d' } },
        dot_light: { paint: { type: 'solid', color: '#f9a8d4' } },
        paper: { paint: { type: 'solid', color: '#fbcfe8' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['dot_dark'], secondary: ['dot_light'], detail: ['paper'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const pitch = Math.max(8, Number(params.pitch));
    const angle = Number(params.angle);
    const spread = Math.max(0.2, Math.min(1, Number(params.spread)));
    const ripple = Math.max(0, Math.min(1, Number(params.ripple)));
    const split = params.split === true;

    const bg = elements.get('bg')!;
    const dotDark = elements.get('dot_dark')!;
    const dotLight = elements.get('dot_light')!;
    const paper = elements.get('paper')!;

    /**
     * seed 驱动的相位：决定网点平铺的**整体偏移量**。
     *
     * ⭐ 为什么这个母题需要 seed：网点是严格规则网格，若相位固定，
     * 「换一版」对画面毫无影响（只有颜色会变），而 `seedable: true`
     * 承诺了形状也会变 —— 元数据与实现不符。
     * 随机相位正是真实印刷的「套印误差」，既满足契约又符合物理。
     */
    const offsetX = (rng() - 0.5) * pitch;
    const offsetY = (rng() - 0.5) * pitch;
    const tileTransform = `translate(${api.n(offsetX)} ${api.n(offsetY)}) rotate(${api.n(angle - 45)})`;

    // 半径 0.3×pitch：2×2 交错排布下相邻圆心距为 pitch/√2 ≈ 0.707×pitch，
    // 半径 0.3 恰好让圆**相切而不重叠**（0.6 < 0.707）。
    // 早期用 0.18 太稀疏，缩略图上完全看不出是网点。
    const dotR = pitch * 0.3;
    // 单元内 2×2 网点交错半格 —— 半调制的经典排布，比正交更「印刷」
    const marks: string[] = [];
    for (let iy = 0; iy < 2; iy++) {
      for (let ix = 0; ix < 2; ix++) {
        marks.push(
          circle((ix + 0.5 + (iy % 2) * 0.5) * (pitch / 2), (iy + 0.5) * (pitch / 2), dotR, {
            fill: dotDark.paintValue,
            'fill-opacity': dotDark.opacity,
          }),
        );
      }
    }

    const tileRef = api.tile({
      // ⚠️ offset 来自 rng，必须进 key：否则换 seed 后 key 未变会命中
      // defs 去重、复用旧图案，表现为「换一版网点没变化」。
      key: `ht-${api.n(pitch)}-${api.n(offsetX)}-${api.n(offsetY)}-${api.n(angle)}`,
      w: pitch,
      h: pitch,
      content: g({}, marks.join('')),
      transform: tileTransform,
    });

    /*
     * 亮部网点：错开半个周期叠在暗部之上，形成双色分色。
     * 亮部网点更小 —— 等效于「亮处网点细、暗处网点粗」，
     * 与真实半色调方向一致（亮处网点小、留白多）。
     */
    let lightRef = '';
    if (split && dotLight.visible) {
      const lightMarks: string[] = [];
      for (let iy = 0; iy < 2; iy++) {
        for (let ix = 0; ix < 2; ix++) {
          lightMarks.push(
            circle(
              (ix + 0.75 + (iy % 2) * 0.5) * (pitch / 2),
              (iy + 0.75) * (pitch / 2),
              dotR * 0.68,
              { fill: dotLight.paintValue, 'fill-opacity': dotLight.opacity },
            ),
          );
        }
      }
      lightRef = api.tile({
        key: `ht-l-${api.n(pitch)}-${api.n(offsetX)}-${api.n(offsetY)}-${api.n(angle)}`,
        w: pitch,
        h: pitch,
        content: g({}, lightMarks.join('')),
        transform: tileTransform,
      });
    }

    /*
     * 明暗调制层：覆盖全幅的线性渐变。
     *
     * 沿「网点角度」的斜向明暗 = 印刷走纸方向的光照衰减；
     * 中部停靠点的浓淡由 `ripple` 控制。
     *
     * ⚠️ 这里的 opacity **必须很小**（峰值 0.5 以内）。
     * 踩过的坑：初版两端写成 0.95 / 0.15，视觉上网点被洗掉九成，
     * 整幅退化成「粉白渐变」—— 调制层盖过了网点本身。
     * 正确关系：网点是主角，调制层只是给它加浓淡，
     * 峰值超过 0.5 就变成「用渐变盖住网点」。
     */
    const mid = Math.max(0.05, Math.min(0.9, 0.5 - ripple * 0.3));
    const edge = Math.min(0.99, 0.5 + spread * 0.49);
    // 峰值 = spread × 0.42：spread=1 时也只有 0.42，保证网点始终可见
    const peak = spread * 0.42;
    /*
     * 渐变角度 = 网点角度 + 90°。
     *
     * ⚠️ 踩过的坑：最初直接用 `angle`（与网点同角度），
     * 结果调制层的明暗边界与网点行**平行重合**，
     * 视觉上变成一条条竖带而不是柔和的光照衰减。
     * 垂直于网点方向才能得到「自上而下逐渐变淡」的印刷观感。
     */
    const fadeRef = api.linear({
      angle: angle + 90,
      key: `ht-fade-${api.n(spread)}-${api.n(ripple)}`,
      stops: [
        { offset: 0, color: '#ffffff', opacity: 0 },
        { offset: mid, color: '#ffffff', opacity: peak * (1 - ripple * 0.5) },
        { offset: edge, color: '#ffffff', opacity: peak },
      ],
    });

    const parts: string[] = [
      // 纸色打底：让网点之间的空隙呈现纸张而非死白
      paper.visible ? rect(0, 0, W, H, { fill: paper.paintValue, 'fill-opacity': paper.opacity }) : '',
      rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
      rect(0, 0, W, H, { fill: tileRef }),
    ];
    if (lightRef !== '') parts.push(rect(0, 0, W, H, { fill: lightRef }));
    parts.push(rect(0, 0, W, H, { fill: fadeRef }));

    let body = parts.join('');

    // 网屏缓慢漂移：只在预览呈现，导出时被 stripAnimation 剥离 → 字节级可复现
    if (animate) {
      const name = api.keyframes(
        'vwHalftone',
        `from{transform:translate(0,0)}to{transform:translate(${api.n(pitch)}px,${api.n(pitch)}px)}`,
      );
      body = g({ style: `animation:${name} 2.4s steps(4) infinite` }, body);
    }

    return { body };
  },
};

export default def;
