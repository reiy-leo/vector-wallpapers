/**
 * 极光波浪 —— C 渐变流体 / 有机形态。
 *
 * 2026-10-12 视觉重做（Rei 反馈「看上去让人不舒服」）：
 * 旧版是「硬边多段折线色带 + 密集硬光射线 + 满屏平铺星点」，
 * 折线锯齿与细亮竖线在暗底上产生视觉震动，星点平铺读起来像网格。
 *
 * 新版思路 —— 安静的多层极光帘幕：
 *   1. 帘幕轮廓全部是**平滑三次贝塞尔**（Catmull-Rom → Bezier），没有任何折角。
 *   2. 每层帘幕 = 「光雾」（大半径模糊、向上 stop-opacity 羽化到 0）
 *      + 「下缘柔光」（贴着下缘的一条窄亮带，轻度模糊）——
 *      保留极光「下沿亮、向上化雾」的物理特征，但没有硬边。
 *   3. 颜色默认低饱和（灰青绿 → 淡紫），层与层交替 A/B，远层更淡。
 *   4. 星点稀疏、微弱，只分布在上 3/4 天空，两档大尺寸互质单元平铺，看不出晶格。
 *
 * 体积策略：每层 2 条 path（光雾 + 柔光带），贝塞尔采样点固定 9 个，
 * 层数拉满（6）在 4K 下也远低于 20KB。
 */
import { g, path, rect } from '../../engine/svg';
import type { PaintSpec, PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

/** 帘幕轮廓的采样点数（含两端）。曲线由贝塞尔插值，9 点已足够平滑。 */
const PTS = 9;
/** 上缘采样点数：上缘带「火焰状」褶皱，需要更密的采样。 */
const TOP_PTS = 21;

const def: PatternDef = {
  id: 'aurora-wave',
  name: '极光波浪',
  category: 'E-scene',
  description: '深蓝夜空中几层柔和的极光帘幕，下缘微亮、向上化作光雾，星点稀疏。',
  seedable: true,
  animatable: true,

  elements: [
    {
      id: 'sky',
      label: '夜空',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#070b16' },
          { offset: 0.6, color: '#0e1626' },
          { offset: 1, color: '#18212f' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'band_a', label: '极光带 · A', role: 'primary', paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#8fd6c0' }, { offset: 1, color: '#5f9fb0' }] }, opacity: 0.8, visible: true, configurable: true },
    { id: 'band_b', label: '极光带 · B', role: 'secondary', paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#aea6d8' }, { offset: 1, color: '#7f86bf' }] }, opacity: 0.65, visible: true, configurable: true },
    { id: 'stars', label: '星点', role: 'detail', paint: { type: 'solid', color: '#dfe6ef' }, opacity: 0.55, visible: true, configurable: true },
  ],

  controls: [
    { key: 'bands', label: '层数', type: 'range', min: 2, max: 6, step: 1, default: 3, heavy: true },
    { key: 'amp', label: '波幅', type: 'range', min: 0.01, max: 0.25, step: 0.01, default: 0.08 },
    { key: 'thickness', label: '厚度', type: 'range', min: 0.04, max: 0.35, step: 0.01, default: 0.2 },
    { key: 'stars', label: '星点密度', type: 'range', min: 0, max: 30, step: 1, default: 8 },
    { key: 'sway', label: '摆动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'boreal',
      label: '极北',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#050a10' }, { offset: 0.6, color: '#0b1a1c' }, { offset: 1, color: '#14222a' }] } },
        band_a: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#9adbb8' }, { offset: 1, color: '#5c9c9a' }] } },
        band_b: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#9fc7d6' }, { offset: 1, color: '#6d86b5' }] } },
        stars: { paint: { type: 'solid', color: '#e6efef' } },
      },
    },
    {
      id: 'nebula',
      label: '星云',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#0b0915' }, { offset: 0.6, color: '#161229' }, { offset: 1, color: '#211b33' }] } },
        band_a: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#c7a9d6' }, { offset: 1, color: '#8a78b8' }] } },
        band_b: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#9cc3d4' }, { offset: 1, color: '#6a7fb4' }] } },
        stars: { paint: { type: 'solid', color: '#e4def0' } },
      },
    },
    {
      id: 'ember',
      label: '余烬',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#0f0b0a' }, { offset: 0.6, color: '#1e1512' }, { offset: 1, color: '#2a1d18' }] } },
        band_a: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#e6b98f' }, { offset: 1, color: '#b77a64' }] } },
        band_b: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#d79a9a' }, { offset: 1, color: '#8f6178' }] } },
        stars: { paint: { type: 'solid', color: '#f1e3d3' } },
      },
    },
    {
      id: 'dawn',
      label: '晨雾',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#3b4a66' }, { offset: 0.6, color: '#6f7f99' }, { offset: 1, color: '#b9b8c4' }] } },
        band_a: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#c9ecdf' }, { offset: 1, color: '#9cc9cf' }] } },
        band_b: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#e2d6ee' }, { offset: 1, color: '#b7b4dc' }] } },
        stars: { paint: { type: 'solid', color: '#f4f6fa' } },
      },
      params: { stars: 4 },
    },
  ],

  paletteSlots: { bg: ['sky'], primary: ['band_a'], secondary: ['band_b'], detail: ['stars'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const bandCount = Math.max(1, Math.min(6, Math.round(Number(params.bands))));
    const amp = Number(params.amp);
    const thickness = Number(params.thickness);
    const starDensity = Math.round(Number(params.stars));
    const sway = params.sway === true;
    const S = Math.min(W, H);

    const sky = elements.get('sky')!;
    const bandA = elements.get('band_a')!;
    const bandB = elements.get('band_b')!;
    const stars = elements.get('stars')!;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // ── 星点：稀疏、微弱；两档大尺寸互质单元，只铺上 3/4 天空 ─────────
    // 随机量一律在此处抽完（无论是否绘制），保证极光形态不随星点密度变化。
    const starCells: Array<{ cell: number; dots: string }> = [];
    const starScales: Array<[number, number]> = [
      [0.53, 1],
      [0.37, 0.6],
    ];
    for (const [ratio, bright] of starScales) {
      const cell = S * ratio;
      const count = Math.max(0, Math.round((starDensity / 30) * 7 * bright));
      let dots = '';
      for (let i = 0; i < count; i++) {
        const x = rng() * cell;
        const y = rng() * cell;
        const r = S * (0.0011 + rng() * 0.0016) * (0.8 + bright * 0.4);
        const o = (0.35 + rng() * 0.65) * bright * stars.opacity;
        dots += `<circle cx="${api.n(x)}" cy="${api.n(y)}" r="${api.n(r)}" fill="${stars.paintValue}" fill-opacity="${api.n(o)}"/>`;
      }
      starCells.push({ cell, dots });
    }
    if (stars.visible && starDensity > 0) {
      for (const { cell, dots } of starCells) {
        if (dots === '') continue;
        parts.push(
          rect(0, 0, W, H * 0.78, {
            fill: api.tile({ key: `aw-s${api.n(cell)}`, w: cell, h: cell, content: dots }),
          }),
        );
      }
    }

    // ── 极光帘幕 ──────────────────────────────────────────────
    // 共享一股「气流」：各层同频、相位相邻偏移 → 像同一片极光的几层幕，而非乱线。
    const basePhase = rng() * Math.PI * 2;
    const cycles = 0.8 + rng() * 0.9; // 低频：整幅只有 1~2 个大起伏，安静
    const tilt = (rng() - 0.5) * 0.12; // 整体轻微倾斜，避免死板的水平构图

    const curtainBodies: string[] = [];
    const curtainEdges: string[] = [];

    /*
     * ⚠️ 帘幕**不横贯全幅**，两端在画布内收尖、淡出。
     * 原因有二：
     *   1. 真实极光是有起止的弧幕，横贯全幅反而像一条「发光管」；
     *      错开起止也给画面留出呼吸的空白。
     *   2. feGaussianBlur 在多数光栅器里只在可视区域内取样，
     *      图形贴着画布边缘时，边缘外的像素按透明处理 → 两侧出现一条「暗边」。
     *      让模糊内容整体离开边缘（≥ 4% W）即可根治。
     */
    const EDGE = W * 0.04;
    for (let i = 0; i < bandCount; i++) {
      const e = i % 2 === 0 ? bandA : bandB;
      // 远层（i 大）更淡、更薄
      const depth = bandCount === 1 ? 0 : i / (bandCount - 1);
      const t = (i + 1) / (bandCount + 1);
      const curtainH = H * thickness * (1.15 - depth * 0.35);
      const waveA = H * amp * (0.5 + 0.18 * (1 - depth));
      const phase = basePhase + i * 0.7 + rng() * 0.4;
      const c2 = cycles * (1.8 + rng() * 0.6);
      const p2 = rng() * Math.PI * 2;
      // 上缘褶皱：中频起伏，让帘幕顶端像一簇簇升起的光焰
      const fold = 2.5 + rng() * 1.5;
      const pf = rng() * Math.PI * 2;
      // 起止：跨度 80%~100% 的可用宽度，位置随 seed 错开
      const avail = W - EDGE * 2;
      const span = avail * (0.8 + rng() * 0.2);
      const x0 = EDGE + rng() * (avail - span);

      // 基线：帘幕集中在上 1/4 ~ 中部，并保证顶端（含波幅）不越出画布
      const topMargin = H * 0.04;
      const minBase = curtainH + waveA * 1.3 + topMargin;
      const baseY = Math.min(H * 0.9, Math.max(H * (0.22 + t * 0.5), minBase));

      const bottomY = (x: number): number => {
        const u = x / W;
        const y =
          baseY +
          Math.sin(u * Math.PI * 2 * cycles + phase) * waveA +
          Math.sin(u * Math.PI * 2 * c2 + p2) * waveA * 0.28 +
          (u - 0.5) * tilt * H;
        return Math.max(topMargin, Math.min(H, y));
      };
      const topY = (x: number): number => {
        const u = x / W;
        const v = (x - x0) / span; // 0~1 沿帘幕
        // 两端收尖：平顶包络，中段保持满高、只在两端约 20% 内平滑收到 0
        const env = Math.pow(Math.min(1, Math.max(0, Math.sin(Math.PI * v)) * 1.9), 0.85);
        // 帘幕高度沿横向缓慢起伏：有的地方高耸、有的地方矮，像真实的光幕
        const k =
          0.62 +
          0.22 * Math.sin(u * Math.PI * 2 * cycles * 1.3 + phase + 1.7) +
          0.16 * Math.sin(u * Math.PI * 2 * fold + pf);
        return Math.max(0, bottomY(x) - curtainH * k * env);
      };

      const xs: number[] = [];
      for (let k = 0; k < PTS; k++) xs.push(x0 + (k / (PTS - 1)) * span);
      const xt: number[] = [];
      for (let k = 0; k < TOP_PTS; k++) xt.push(x0 + (k / (TOP_PTS - 1)) * span);
      const bottom = xs.map((x) => [x, bottomY(x)] as [number, number]);
      const top = xt.map((x) => [x, topY(x)] as [number, number]);

      // 隐藏的元件不注册任何渐变（否则其颜色会残留在 <defs> 里）；随机量已在上方抽完
      if (!e.visible) {
        curtainBodies.push('');
        curtainEdges.push('');
        continue;
      }
      const lo = colorOf(e.paint, 0);
      const hi = colorOf(e.paint, 1);

      // 光雾：下缘起亮，向上平滑羽化到完全透明
      const fade = api.linear({
        angle: 270,
        key: `aw-fade-${e.id}`,
        stops: [
          { offset: 0, color: lo, opacity: 0.2 },
          { offset: 0.1, color: lo, opacity: 0.85 },
          { offset: 0.32, color: hi, opacity: 0.5 },
          { offset: 0.65, color: hi, opacity: 0.16 },
          { offset: 1, color: hi, opacity: 0 },
        ],
      });
      const d = `${smooth(top, api, true)} L${api.n(bottom[PTS - 1][0])} ${api.n(bottom[PTS - 1][1])}${smooth([...bottom].reverse(), api, false)} Z`;
      curtainBodies.push(path(d, { fill: fade, 'fill-opacity': e.opacity * (1 - depth * 0.35) }));

      // 下缘柔光：沿下缘的一条柔和亮线（描边 + 轻度模糊），两端横向淡出
      const edgeFade = api.linear({
        angle: 0,
        key: `aw-edge-${e.id}`,
        stops: [
          { offset: 0, color: lo, opacity: 0 },
          { offset: 0.14, color: lo, opacity: 1 },
          { offset: 0.86, color: lo, opacity: 1 },
          { offset: 1, color: lo, opacity: 0 },
        ],
      });
      curtainEdges.push(
        path(smooth(bottom, api, true), {
          fill: 'none',
          stroke: edgeFade,
          'stroke-width': H * (0.008 + thickness * 0.025),
          'stroke-opacity': Math.min(1, e.opacity * 0.75) * (1 - depth * 0.4),
          'stroke-linecap': 'round',
        }),
      );
    }

    // 远层先画（数组倒序），近层压在上面
    const visibleIdx = (i: number): boolean => (i % 2 === 0 ? bandA : bandB).visible;
    const bodyOut: string[] = [];
    const edgeOut: string[] = [];
    for (let i = bandCount - 1; i >= 0; i--) {
      if (!visibleIdx(i)) continue;
      bodyOut.push(curtainBodies[i]);
      edgeOut.push(curtainEdges[i]);
    }
    if (bodyOut.length > 0) {
      parts.push(g({ filter: api.blur(H * 0.018) }, bodyOut.join('')));
      parts.push(g({ filter: api.blur(H * 0.007) }, edgeOut.join('')));
    }

    const body = parts.join('');
    if (!animate || !sway) return { body };

    // 摆动：光帘整体缓慢横移
    const name = api.keyframes(
      'vw-aurora',
      `from{transform:translateX(0)}to{transform:translateX(${api.n(W * 0.03)}px)}`,
    );
    return { body: g({ style: `animation:${name} 24s ease-in-out infinite alternate` }, body) };
  },
};

/**
 * 过点序列 → 平滑三次贝塞尔（Catmull-Rom，张力 1/6）。
 * `move=true` 时以 M 起笔；否则直接接 C 段（调用方已用 L 连到首点）。
 */
function smooth(pts: Array<[number, number]>, api: RenderApi, move: boolean): string {
  const n = api.n;
  let d = move ? `M${n(pts[0][0])} ${n(pts[0][1])}` : '';
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = Math.max(0, p1[1] + (p2[1] - p0[1]) / 6);
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = Math.max(0, p2[1] - (p3[1] - p1[1]) / 6);
    d += ` C${n(c1x)} ${n(c1y)} ${n(c2x)} ${n(c2y)} ${n(p2[0])} ${n(p2[1])}`;
  }
  return d;
}

/** 取 PaintSpec 的代表色（实色直取；渐变取首/末色标）。 */
function colorOf(paint: PaintSpec, end: 0 | 1): string {
  if (paint.type === 'solid') return paint.color;
  if (paint.type === 'none') return '#000000';
  const stops = paint.stops;
  if (stops.length === 0) return '#000000';
  return (end === 0 ? stops[0] : stops[stops.length - 1]).color;
}

export default def;
