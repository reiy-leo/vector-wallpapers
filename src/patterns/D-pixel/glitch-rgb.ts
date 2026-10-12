/**
 * 通道错位 —— D 像素 / 复古游戏。
 *
 * 构图要点：把同一份像素图形按 R/G/B 三通道**水平错位**叠印，
 * 叠加横向扫描线与色块条带。错位量随 seed 变化。
 *
 * 与 `neon-pixels` 的本质区别：后者是「像素块 + 描边」，
 * 本者是**通道分离**的显示故障模拟 —— 依赖的是色彩通道的空间偏移，
 * 而非像素形状本身。这是 `STYLE-100-ANALYSIS.md` §4.2 列出的缺口。
 *
 * ⭐ D 类由引擎自动加`shape-rendering="crispEdges"`，
 * 像素必须硬边，缺了会被插值糊掉。
 */
import { g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'glitch-rgb',
  name: '通道错位',
  category: 'D-pixel',
  description: 'RGB 三通道分离错位叠印，横向扫描线，数字显示故障感。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0a0a0f' }, opacity: 1, visible: true, configurable: true },
    { id: 'ch_r', label: 'R 通道', role: 'primary', paint: { type: 'solid', color: '#ff2d55' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'ch_g', label: 'G 通道', role: 'secondary', paint: { type: 'solid', color: '#00f0ff' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'ch_b', label: 'B 通道', role: 'accent', paint: { type: 'solid', color: '#7c3aed' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'scan', label: '扫描线', role: 'detail', paint: { type: 'solid', color: '#000000' }, opacity: 0.35, visible: true, configurable: true },
  ],

  controls: [
    { key: 'blocks', label: '色块密度', type: 'range', min: 6, max: 40, step: 1, default: 18, heavy: true },
    { key: 'shift', label: '通道错位', type: 'range', min: 0, max: 40, step: 1, default: 14, unit: 'px' },
    { key: 'scanGap', label: '扫描线间距', type: 'range', min: 2, max: 12, step: 1, default: 4 },
    { key: 'bands', label: '错位色带', type: 'range', min: 0, max: 12, step: 1, default: 5 },
    { key: 'animate', label: '滚动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'corrupt',
      label: '损坏',
      elements: {
        bg: { paint: { type: 'solid', color: '#0a0a0f' } },
        ch_r: { paint: { type: 'solid', color: '#ff2d55' } },
        ch_g: { paint: { type: 'solid', color: '#00f0ff' } },
        ch_b: { paint: { type: 'solid', color: '#7c3aed' } },
        scan: { paint: { type: 'solid', color: '#000000' } },
      },
    },
    {
      id: 'matrix',
      label: '矩阵',
      elements: {
        bg: { paint: { type: 'solid', color: '#04140a' } },
        ch_r: { paint: { type: 'solid', color: '#22c55e' } },
        ch_g: { paint: { type: 'solid', color: '#4ade80' } },
        ch_b: { paint: { type: 'solid', color: '#14532d' } },
        scan: { paint: { type: 'solid', color: '#000000' } },
      },
    },
    {
      id: 'amber-crt',
      label: '琥珀显像管',
      elements: {
        bg: { paint: { type: 'solid', color: '#1a1206' } },
        ch_r: { paint: { type: 'solid', color: '#f59e0b' } },
        ch_g: { paint: { type: 'solid', color: '#fbbf24' } },
        ch_b: { paint: { type: 'solid', color: '#78350f' } },
        scan: { paint: { type: 'solid', color: '#000000' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['ch_r'],
    secondary: ['ch_g'],
    accent: ['ch_b'],
    detail: ['scan'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const blocks = Math.round(Math.max(6, Math.min(40, Number(params.blocks))));
    const shift = Math.max(0, Number(params.shift));
    const scanGap = Math.max(2, Math.min(12, Number(params.scanGap)));
    const bandCount = Math.round(Math.max(0, Math.min(12, Number(params.bands))));
    const doAnimate = params.animate === true;

    const bg = elements.get('bg')!;
    const chR = elements.get('ch_r')!;
    const chG = elements.get('ch_g')!;
    const chB = elements.get('ch_b')!;
    const scan = elements.get('scan')!;

    /**
     * 随机量必须在进平铺前抽完（与 papercut 同理）。
     *
     * 通道错位量：三通道各自独立偏移，形成阶梯式重影。
     *
     * ⚠️ G 通道的偏移必须**显著**。原写成 `shift × (rng−0.5) × 0.5`
     * （最大 ±2.5px），结果 G 层被错位更大的 R/B 完全覆盖 ——
     * 改 G 的颜色时产物一个字节都不变，命中率 0%，
     * 即「声明可配置实则死元件」。这是元数据与实现不一致的典型，
     * 由 `patterns.test.ts` 的死元件检测抓到。
     * 现在 G 取 0.2~0.45 倍错位量，三层呈 R-左 / G-中 / B-右 的清晰阶梯。
     */
    const shiftR = -shift * (0.8 + rng() * 0.4);
    const shiftG = shift * (0.2 + rng() * 0.25);
    const shiftB = shift * (0.8 + rng() * 0.4);

    /**
     * 像素条带图形单元。
     *
     * 横向长条为主 + 少量竖向块，构成「数据块被截断」的观感。
     * 单元为 `blocks × blocks` 的正方形，高密度时靠 <pattern> 铺满。
     */
    const unit = Math.max(8, Math.min(W, H) / 8);
    const barH = Math.max(2, unit / blocks);
    const bars: string[] = [];

    for (let i = 0; i < blocks; i++) {
      const y = (i * unit) / blocks;
      // 每行的宽度与水平位置由 seed 决定，制造「有的行被截断」的效果
      const wFrac = 0.25 + rng() * 0.75;
      const xFrac = rng() * (1 - wFrac);
      bars.push(
        rect(unit * xFrac, y, unit * wFrac, barH, { fill: '#ffffff' }),
      );
      // 约 1/4 的行额外加一个竖向短块，打破全横向的单调
      if (rng() > 0.75) {
        const bx = rng() * unit;
        const by = rng() * unit;
        bars.push(rect(bx, by, barH * 2, unit * (0.1 + rng() * 0.25), { fill: '#ffffff' }));
      }
    }

    /*
     * 通道合成用「不透明度叠印」而非 mix-blend-mode。
     *
     * ⚠️ 不用 `mix-blend-mode: screen` 的原因：它需要 CSS，
     * 而本项目只在 `animate=true` 时才注入 `<style>`，
     * 而导出产物必须无外部依赖（架构 §9.4 字节级可复现）。
     * 在深底上叠印三个半透明通道，观感与滤色接近。
     */

    /*
     * 通道层：把同一份「条带布局」用三个通道各自的**颜色**各画一遍，
     * 再各自水平平移后叠印。
     *
     * ⚠️⚠️ 这里踩过两个叠加在一起的坑，都表现为「G 通道改色毫无效果」：
     *
     * 坑一：条带画成白色（`fill: '#ffffff'`），通道 rect 只写 `fill: url(#tile)`
     *      —— 于是三个通道的颜色**根本没进产物**，改 ch_g 的颜色无任何变化。
     *      「通道」变成了「同色重复三次」，只有位移没有分色。
     *
     * 坑二：若把条带做成白色 pattern 再让三个 rect 引用它，
     *      三个 channel pattern 的 content 逐字节相同 → defs 签名撞车 →
     *      只剩一层。**平移必须写在 patternTransform**（进签名），
     *      且每层用各自颜色（content 不同），两条同时满足才不会合并。
     *
     * 正确做法：条带布局用**占位符**生成一次，再按通道替换 fill 字符串，
     * 保证三层的 content 天然不同。
     */
    const layout = bars.join('').split('#ffffff').join('%C%');

    const layers: string[] = [];
    const channels: Array<[typeof chR, number]> = [
      [chR, shiftR],
      [chG, shiftG],
      [chB, shiftB],
    ];
    for (const [e, dx] of channels) {
      if (!e.visible) continue;
      const fillRef = api.tile({
        // key 含 element id：颜色不同 → content 不同 → 签名不同，三层不会合并
        key: `gx-ch-${e.id}`,
        w: unit,
        h: unit,
        content: g({}, layout.split('%C%').join(e.paintValue)),
        // ⭐ 平移写在这里 —— patternTransform 参与签名去重
        transform: `translate(${api.n(dx)} 0)`,
      });
      layers.push(rect(0, 0, W, H, { fill: fillRef, 'fill-opacity': e.opacity }));
    }


    // 横向错位色带：模拟「整行数据被搬到别处」的撕裂
    const bandMarks: string[] = [];
    for (let i = 0; i < bandCount; i++) {
      const y = rng() * H;
      const h = Math.max(3, H * (0.004 + rng() * 0.02));
      const w = W * (0.2 + rng() * 0.8);
      const x = rng() * (W - w);
      const use = rng() > 0.5 ? chR : chB;
      if (!use.visible) continue;
      bandMarks.push(
        rect(x, y, w, h, { fill: use.paintValue, 'fill-opacity': Math.min(1, use.opacity * 1.2) }),
      );
    }

    // 扫描线：整幅平铺的细横线
    let scanRef = '';
    if (scan.visible && scan.opacity > 0) {
      const g0 = scanGap;
      scanRef = api.tile({
        key: `gx-scan-${api.n(g0)}`,
        w: 4,
        h: g0,
        content: rect(0, 0, 4, Math.max(1, g0 * 0.5), {
          fill: scan.paintValue,
          'fill-opacity': scan.opacity,
        }),
      });
    }

    const parts = [
      rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
      ...layers,
      ...bandMarks,
    ];
    if (scanRef !== '') parts.push(rect(0, 0, W, H, { fill: scanRef }));

    let body = parts.join('');

    // 滚动动画：整幅缓慢下移，导出时被 stripAnimation 剥离 → 产物字节级可复现
    if (animate && doAnimate) {
      // keyframes() 的第二个参数是**声明体**，函数内部会自行拼 `@keyframes 名称{...}`
      const name = api.keyframes(
        'vwGlitchScroll',
        `from{transform:translateY(0)}to{transform:translateY(${api.n(scanGap)}px)}`,
      );
      body = g({ style: `animation:${name} 0.4s linear infinite` }, body);
    }

    return { body };
  },
};

export default def;
