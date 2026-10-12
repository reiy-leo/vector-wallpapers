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
 *
 * 2026-10-12 审美返修：旧版紫底满屏碎块（平铺的条带单元）→ 混乱、刺眼。
 * 现在以**大块平静底色**为主：一条宽而淡的色域横贯画面，
 * 少量（默认 5 条）错位切片聚成 1~2 簇，每条切片按 R/G/B 三色水平错开叠印，
 * 再散落几粒同样三色错位的小像素块。其余大面积留白。
 * 全部尺寸按短边归一化（与分辨率无关），配色降饱和。
 */
import { g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'glitch-rgb',
  name: '通道错位',
  category: 'D-pixel',
  description: '大块平静底色上稀疏点缀 RGB 三通道错位切片，克制的数字显示故障感。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1c2030' }, opacity: 1, visible: true, configurable: true },
    { id: 'ch_r', label: 'R 通道', role: 'primary', paint: { type: 'solid', color: '#c9798c' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'ch_g', label: 'G 通道', role: 'secondary', paint: { type: 'solid', color: '#8bb8c8' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'ch_b', label: 'B 通道', role: 'accent', paint: { type: 'solid', color: '#6f6db0' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'scan', label: '扫描线', role: 'detail', paint: { type: 'solid', color: '#000000' }, opacity: 0.16, visible: true, configurable: true },
  ],

  controls: [
    // 散落的三色错位小像素块数量（旧版为满屏条带密度；key 沿用以保持分享链接兼容）
    { key: 'blocks', label: '色块数量', type: 'range', min: 6, max: 40, step: 1, default: 8, heavy: true },
    // 以 1080 短边为基准的设计像素，按短边等比缩放
    { key: 'shift', label: '通道错位', type: 'range', min: 0, max: 40, step: 1, default: 14, unit: 'px' },
    { key: 'scanGap', label: '扫描线间距', type: 'range', min: 2, max: 12, step: 1, default: 5 },
    { key: 'bands', label: '错位色带', type: 'range', min: 0, max: 12, step: 1, default: 5 },
    { key: 'animate', label: '滚动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'corrupt',
      label: '损坏',
      elements: {
        bg: { paint: { type: 'solid', color: '#15151d' } },
        ch_r: { paint: { type: 'solid', color: '#d9667e' } },
        ch_g: { paint: { type: 'solid', color: '#6fc3d1' } },
        ch_b: { paint: { type: 'solid', color: '#7a62c4' } },
        scan: { paint: { type: 'solid', color: '#000000' } },
      },
    },
    {
      id: 'matrix',
      label: '矩阵',
      elements: {
        bg: { paint: { type: 'solid', color: '#0d1a13' } },
        ch_r: { paint: { type: 'solid', color: '#4f9e6e' } },
        ch_g: { paint: { type: 'solid', color: '#9fd4ae' } },
        ch_b: { paint: { type: 'solid', color: '#2b5c40' } },
        scan: { paint: { type: 'solid', color: '#000000' } },
      },
    },
    {
      id: 'amber-crt',
      label: '琥珀显像管',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d150c' } },
        ch_r: { paint: { type: 'solid', color: '#d29a4a' } },
        ch_g: { paint: { type: 'solid', color: '#eccb8a' } },
        ch_b: { paint: { type: 'solid', color: '#7a4a24' } },
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
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const blockCount = Math.round(Math.max(6, Math.min(40, Number(params.blocks))));
    const shift = Math.max(0, Number(params.shift)) * unit;
    const scanGap = Math.max(2, Math.min(12, Number(params.scanGap))) * unit;
    const bandCount = Math.round(Math.max(0, Math.min(12, Number(params.bands))));
    const doAnimate = params.animate === true;

    const bg = elements.get('bg')!;
    const chR = elements.get('ch_r')!;
    const chG = elements.get('ch_g')!;
    const chB = elements.get('ch_b')!;
    const scan = elements.get('scan')!;

    /**
     * 三通道水平偏移：R 左 / G 居中略偏 / B 右，形成清晰的色差阶梯。
     * ⚠️ G 偏移必须显著且 G 层画在最上 —— 否则被 R/B 完全覆盖，改 G 色无效（死元件）。
     * shift = 0 时三层重合，G 在顶层仍可见，命中率不受影响。
     */
    const dR = -shift * (0.8 + rng() * 0.4);
    const dG = shift * (0.15 + rng() * 0.2);
    const dB = shift * (0.8 + rng() * 0.4);

    const n = api.n;
    const R: string[] = [];
    const G: string[] = [];
    const B: string[] = [];
    /**
     * 一块「被错位的数据」：同一矩形按三通道各画一份，且每个通道被撕开的范围略有不同
     * （R 最长、B 偏右一截、G 最短且更薄居中）→ 三色都能读到，而不是只剩一圈色边。
     */
    const slice = (x: number, y: number, w: number, h: number): void => {
      R.push(rect(x + dR, y, w * (0.75 + rng() * 0.25), h));
      const bOff = w * rng() * 0.3;
      B.push(rect(x + dB + bOff, y, w * (0.5 + rng() * 0.4), h));
      const gOff = w * (0.1 + rng() * 0.3);
      G.push(rect(x + dG + gOff, y + h * 0.2, w * (0.3 + rng() * 0.3), h * 0.6));
    };

    // ① 平静的大色域：一条宽而淡的横向色带（B 通道色，低不透明度），占画面 25%~40% 高
    const fieldH = H * (0.25 + rng() * 0.15);
    const fieldY = H * (0.12 + rng() * 0.5);

    // ② 错位切片聚成 1~2 簇（真实故障是成片发生的，不是均匀撒满）
    const clusters = [H * (0.15 + rng() * 0.7)];
    if (rng() < 0.6) clusters.push(H * (0.15 + rng() * 0.7));
    const near = (): number => {
      const c = clusters[Math.floor(rng() * clusters.length)];
      return Math.max(0, Math.min(H, c + (rng() + rng() - 1) * H * 0.12));
    };
    for (let i = 0; i < bandCount; i++) {
      const y = near();
      // 大多是细条，偶尔一条较厚 —— 主次分明
      const h = H * (rng() < 0.25 ? 0.025 + rng() * 0.03 : 0.004 + rng() * 0.01);
      const w = W * (0.18 + rng() * 0.5);
      const x = rng() * (W - w);
      slice(x, y, w, h);
    }

    // ③ 零星像素块：贴着切片簇散落，尺寸按短边归一化
    for (let i = 0; i < blockCount; i++) {
      const s = unit * (10 + rng() * 30);
      slice(rng() * W, near(), s * (1 + rng() * 3), s);
    }

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (chB.visible) parts.push(rect(0, fieldY, W, fieldH, { fill: chB.paintValue, 'fill-opacity': chB.opacity * 0.14 }));
    // 叠印顺序：R、B 在下，G 在上（保证 G 可见）
    const layers: Array<[typeof chR, string[]]> = [
      [chR, R],
      [chB, B],
      [chG, G],
    ];
    for (const [e, list] of layers) {
      if (!e.visible || list.length === 0) continue;
      parts.push(g({ fill: e.paintValue, 'fill-opacity': e.opacity }, list.join('')));
    }

    // 扫描线：低不透明度细横线平铺（间距按短边缩放，避免高分屏上过密产生摩尔纹）
    if (scan.visible && scan.opacity > 0) {
      const scanRef = api.tile({
        key: `gx-scan-${n(scanGap)}`,
        w: 4,
        h: scanGap,
        content: rect(0, 0, 4, Math.max(1, scanGap * 0.4), { fill: scan.paintValue, 'fill-opacity': scan.opacity }),
      });
      parts.push(rect(0, 0, W, H, { fill: scanRef }));
    }

    let body = parts.join('');

    // 滚动动画：整幅缓慢下移，导出时被 stripAnimation 剥离 → 产物字节级可复现
    if (animate && doAnimate) {
      // keyframes() 的第二个参数是**声明体**，函数内部会自行拼 `@keyframes 名称{...}`
      const name = api.keyframes(
        'vwGlitchScroll',
        `from{transform:translateY(0)}to{transform:translateY(${n(scanGap)}px)}`,
      );
      body = g({ style: `animation:${name} 0.4s linear infinite` }, body);
    }

    return { body };
  },
};

export default def;
