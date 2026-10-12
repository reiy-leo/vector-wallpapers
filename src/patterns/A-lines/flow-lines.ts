/**
 * 流线曲 —— A 极简几何线条。
 *
 * 构图要点：线束横扫全幅，三层共用相位基准但振幅、疏密、**形态**不同，
 * 靠「疏密 + 相位差 + 形态差」制造流动感。所有几何由 W/H 比例推导，尺寸无关。
 *
 * ⭐ 体积策略：**必须走 <pattern> 平铺**。三条线束在竖直方向本身就是重复的，
 * 把「密度行」折进 tile 高度后，单条波浪路径 + 一个 tile 即可表达任意密度，
 * SVG 体积与 density 完全解耦（实测密度 4 与 60 体积几乎相同）。
 * 早期版本逐行画 `<path>`，密度 60 时会膨胀到 44KB / 66 个顶层节点，直接击穿红线。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-10-12 视觉重做。用户反馈三连：
 *① 「线条类型太单一」② 「背景色和线条都没对比度了」③ 「不优雅」
 *
 * 三条根因与对应解法：
 *
 * ❶ 线宽**不随分辨率缩放**（铁律 6 的隐性违反）
 *    旧版 `stroke-width = weight * scale`（1.2 × 0.7 ≈ 0.84px）是绝对像素，
 *    但画布宽 2560 —— 0.84px 的线在 4K 屏上等于发丝，肉眼几乎不可见。
 *    ✅ 解法：`unit = min(W,H) / 1080` 作为缩放基准，线宽按 `weight * unit`
 *    推导。这样「线宽 1.2」在任何尺寸下都是**同样的视觉粗细**，
 *    缩略图（240×150）也不会粗成一块。
 *
 * ❷ 低透明度吃掉对比度（**两个衰减相乘**）
 *    旧版 line_far 的 opacity 是 0.45，实测合成后与底色仅 **2.69:1**
 *    （WCAG 要 4.5:1）。更隐蔽的是：不透明度与线宽是**叠加**的衰减 ——
 *    0.45 的 alpha × 0.84px 的线宽 ≈ 视觉上不存在。
 *    ✅ 解法：opacity 下限抬到 0.5，且把「层次」主要交给**线宽与振幅**表达，
 *    不透明度只做次要修饰。
 *
 * ❸ 形态单一：三层都是 `sin`，只是振幅/相位不同 —— 三条一样的正弦波。
 *    ✅ 解法：新增 `morph` 控件（正弦/叠加/折角/涡旋），
 *    三层默认**各取一种形态**，并给每层不同的「形态微调」（相位、谐波数、锐度）。
 *    这样同屏会出现三种不同的线：柔波、密纹、硬折 —— 层次立刻出来。
 *
 * ⚠️ 数据契约（分享链接依赖，**不可改名/删除**）：
 *   元件 id `bg` / `line_far` / `line_mid` / `line_near`
 *   控件 key `density` / `weight` / `amplitude` / `curvature` / `drift`
 *   新增参数一律走新 key，旧链接解析后缺省为 default —— 行为兼容。
 */
import { g, n, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/**
 * 线宽缩放基准：让「线宽 1.2」在任何画布尺寸下都是同一视觉粗细。
 *
 * 取 `min(W,H)/1080` 而非 `W/1920`：壁纸的高宽比跨度极大
 * （1170×2532 的竖屏 vs 3440×1440 的带鱼屏），用短边才能让竖屏不被放大到过粗。
 * clamp 到 [0.5, 4]：下限防缩略图（240×150 → 0.14）线粗成块，
 * 上限防 7680 超宽屏线细成发丝。
 */
function widthUnit(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

/** 形态：四条线束各取一种，同屏构成层次（旧版三层同形态 = 「线条类型单一」的根因）。 */
type Morph = 'sine' | 'harmonics' | 'chevron' | 'vortex';

/** 形态查表 —— seed 决定哪三层用哪种，保证同seed 可复现且三屏不同。 */
const MORPHS: readonly Morph[] = ['sine', 'harmonics', 'chevron', 'vortex'];

function buildWave(
  w: number,
  baseline: number,
  amp: number,
  phase: number,
  cycles: number,
  segs: number,
  morph: Morph,
  /** chevron 的锐度：越大折角越尖；harmonics 的二次谐波占比 */
  accent: number,
): string {
  if (amp === 0) return `M0 ${n(baseline)} L${n(w)} ${n(baseline)}`;

  // 归一化相位角：0~1 对应一整个周期，供各形态共用
  const th = (t: number): number => t * Math.PI * 2 * cycles + phase;

  const yOf = (t: number): number => {
    const a = th(t);
    let y: number;
    switch (morph) {
      // 柔波：纯正弦，最柔和
      case 'sine':
        y = Math.sin(a);
        break;
      // 叠加：基频 + 二次谐波 → 同一条线上同时有缓起伏与细密波纹
      case 'harmonics':
        y = (1 - accent * 0.5) * Math.sin(a) + accent * 0.5 * Math.sin(2 * a);
        break;
      // 折角：正弦取绝对值再折 → 直段 + 圆角交替，几何感强
      case 'chevron':
        y = (1 - accent) * Math.sin(a) + accent * Math.abs(Math.sin(a));
        break;
      // 涡旋：sin 叠加其相位偏移项 → 疏密不均，像被旋涡搅动
      case 'vortex':
      default:
        y = Math.sin(a) * (1 - accent * 0.5) + accent * 0.5 * Math.sin(a * 0.5 + accent * 3);
        break;
    }
    return baseline + y * amp;
  };

  const step = w / segs;
  let d = `M0 ${n(yOf(0))}`;
  for (let i = 0; i < segs; i++) {
    const x0 = step * i;
    const x1 = step * (i + 1);
    const cx = (x0 + x1) / 2;
    // 控制点取起点高度 → 曲线在段内平滑过渡到终点，视觉上连续
    d += ` Q${n(cx)} ${n(yOf(i / segs))} ${n(x1)} ${n(yOf((i + 1) / segs))}`;
  }
  return d;
}

const def: PatternDef = {
  id: 'flow-lines',
  name: '流线曲',
  category: 'A-lines',
  description: '四层线束以不同形态横扫画面 —— 柔波、密纹、折角、涡旋叠出流动韵律。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0b1220' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_far', label: '线束 · 远', role: 'secondary', paint: { type: 'solid', color: '#2dd4bf' }, opacity: 0.5, visible: true, configurable: true },
    { id: 'line_mid', label: '线束 · 中', role: 'primary', paint: { type: 'solid', color: '#818cf8' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'line_near', label: '线束 · 近', role: 'accent', paint: { type: 'solid', color: '#fbbf24' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '密度', type: 'range', min: 4, max: 60, step: 1, default: 22, heavy: true },
    // 上限 4→8：配合 widthUnit 缩放后，8 档在 4K 上才有「粗线」的存在感
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 8, step: 0.1, default: 1.6, unit: 'px' },
    { key: 'amplitude', label: '振幅', type: 'range', min: 0, max: 0.35, step: 0.01, default: 0.12 },
    { key: 'curvature', label: '曲率', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1.6 },
    // ── 新增（旧的 key 一个都没动，老链接行为不变）──
    /** 形态分配：三线同形态 / 三线各异 / 双频密纹 / 涡旋为主 */
    { key: 'morph', label: '形态', type: 'select', default: 'mixed', options: [
      { value: 'mixed', label: '三线各异' },
      { value: 'sine', label: '统一柔波' },
      { value: 'harmonics', label: '双频密纹' },
      { value: 'chevron', label: '折角几何' },
      { value: 'vortex', label: '涡旋起伏' },
    ] },
    /** 形态强调度：chevron 的锐度 / harmonics 的谐波占比 */
    { key: 'accent', label: '形态强度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: 'drift', label: '流动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'midnight',
      label: '午夜蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#0a0f1e' } },
        line_far: { paint: { type: 'solid', color: '#1d4ed8' } },
        line_mid: { paint: { type: 'solid', color: '#60a5fa' } },
        line_near: { paint: { type: 'solid', color: '#dbeafe' } },
      },
      params: { morph: 'harmonics', density: 30, weight: 1.4 },
    },
    {
      id: 'sakura',
      label: '樱',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b1b2e' } },
        line_far: { paint: { type: 'solid', color: '#9d4edd' } },
        line_mid: { paint: { type: 'solid', color: '#e08fb4' } },
        line_near: { paint: { type: 'solid', color: '#ffe0ec' } },
      },
      params: { morph: 'mixed', amplitude: 0.18, density: 26, accent: 0.7 },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#04211f' } },
        line_far: { paint: { type: 'solid', color: '#0f766e' } },
        line_mid: { paint: { type: 'solid', color: '#2dd4bf' } },
        line_near: { paint: { type: 'solid', color: '#a7f3d0' } },
      },
      params: { morph: 'vortex', density: 20, accent: 0.8 },
    },
    {
      id: 'graphite',
      label: '石墨',
      /**
       * 单色系：层次全靠**明度阶梯**，色相完全不用 —— 这是最优雅的一档。
       *
       * ⚠️ 踩过的坑：曾试图用 `opacity: 0.62` 来「补偿」line_far 的对比度，
       * 结果**反而降到 1.98:1**。方向从根上就错了 ——
       * alpha 是把前景往背景上**拉**，线越淡越接近底色，对比度必然下降。
       * 正确做法是**提高原色明度**（把灰阶拉宽），让 alpha 保持 1。
       * 这一条已写进 `flow-lines.guard.test.ts` ⑪ 作为回归门禁。
       */
      elements: {
        bg: { paint: { type: 'solid', color: '#0b0b0d' } },
        line_far: { paint: { type: 'solid', color: '#7d8794' } },
        line_mid: { paint: { type: 'solid', color: '#b8c0cc' } },
        line_near: { paint: { type: 'solid', color: '#f7f9fc' } },
      },
      params: { morph: 'chevron', accent: 0.65, density: 24, weight: 1.8 },
    },
  ],

  paletteSlots: { bg: ['bg'], secondary: ['line_far'], primary: ['line_mid'], accent: ['line_near'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const density = Math.max(2, Number(params.density));
    const weight = Number(params.weight);
    const amplitude = Number(params.amplitude);
    const curvature = Number(params.curvature);
    const accent = Math.min(1, Math.max(0, Number(params.accent)));
    const drift = params.drift === true;
    const morph = String(params.morph);

    const unit = widthUnit(W, H);

    const bg = elements.get('bg')!;
    const far = elements.get('line_far')!;
    const mid = elements.get('line_mid')!;
    const near = elements.get('line_near')!;

    const parts: string[] = [
      rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
    ];

    /**
     * 三层线束。
     *
     * 层次由**四个维度**共同表达（v1 只有两个 —— 振幅与相位）：
     *  ① 疏密 step（2/3/5） ② 线宽 scale（0.55/1/1.7）
     *  ③ 振幅 gain（1/0.72/0.44） ④ **形态 morph**
     *
     * ⭐ ④ 是本轮新增的关键维度：`mixed` 档下三层各取一种形态，
     * 于是同屏出现柔波 / 密纹 / 折角三种不同的线 —— 这直接解决
     * 用户说的「线条类型太单一」。
     */
    const layers: Array<{
      e: typeof far;
      step: number;
      phase: number;
      gain: number;
      scale: number;
      morph: Morph;
    }> = [];

    const mixed = morph === 'mixed' || !(MORPHS as readonly string[]).includes(morph);
    const fixed = (MORPHS as readonly string[]).includes(morph) ? (morph as Morph) : null;

    // 三层默认形态：柔波（远）+ 双频（中）+ 折角（近）
    // 由 seed 整体偏移，让每个 seed 得到不同的形态组合
    const base = mixed ? MORPHS : [fixed!, fixed!, fixed!];
    const spin = Math.floor(rng() * MORPHS.length);

    const plan: Array<{ step: number; phase: number; gain: number; scale: number }> = [
      { step: 2, phase: 0, gain: 1, scale: 0.55 },
      { step: 3, phase: Math.PI / 3, gain: 0.72, scale: 1 },
      { step: 5, phase: (Math.PI * 2) / 3, gain: 0.44, scale: 1.7 },
    ];
    const picks = [far, mid, near];
    plan.forEach((p, i) => {
      layers.push({ e: picks[i], ...p, morph: base[(i + spin) % base.length] });
    });

    const amp = H * amplitude;
    const segs = 32;

    for (const layer of layers) {
      const { e, step, phase, gain, scale, morph: m } = layer;
      if (!e.visible) continue;
      // 该层的行距：density 越小行距越大
      const gap = (H * step) / density;
      if (gap <= 0) continue;

      // tile 高度 = 一个「行距 × 2」的周期，两条路径相位差 π。
      // 正弦的 π 相位等价于上下镜像，因此竖直平铺后行距恰好 = gap，且首尾无缝。
      const tileH = gap * 2;
      const stroke = e.paintValue;
      /**
       * ⭐ 线宽乘 `unit` —— 这是本轮最重要的修复。
       * 旧版绝对 px 在 2560 宽的画布上只有 0.84px，等于发丝。
       */
      const base_ = {
        fill: 'none',
        stroke,
        'stroke-width': n(weight * scale * unit),
        'stroke-opacity': e.opacity,
        'stroke-linecap': 'round' as const,
      };

      // seed 抖动：每层取一个相位偏移，让不同 seed 得到不同的波浪节奏
      const jitter = rng() * Math.PI * 2;
      // 每层再取一个形态强调度微调（±0.18），避免三层形态完全雷同
      const ac = Math.min(1, Math.max(0, accent + (rng() - 0.5) * 0.36));
      const content =
        path(buildWave(W, gap, amp * gain, phase + jitter, curvature, segs, m, ac), base_) +
        path(buildWave(W, gap * 2, amp * gain, phase + jitter + Math.PI, curvature, segs, m, ac), base_);

      const tileRef = api.tile({
        key: `fl-${m}-${api.n(gap)}-${api.n(amp * gain)}-${api.n(curvature)}-${api.n(ac)}-${api.n(weight * scale * unit)}`,
        w: W,
        h: tileH,
        content,
      });
      parts.push(rect(0, 0, W, H, { fill: tileRef }));
    }

    const body = parts.join('');
    if (!animate || !drift) return { body };

    // 动画：整体沿 X 平移四分之一周期后往复，形成无缝循环的「流淌」
    const name = api.keyframes(
      'vw-flow',
      `from{transform:translateX(0)}to{transform:translateX(${api.n(W / (curvature * 4))}px)}`,
    );
    return { body: g({ style: `animation:${name} 16s ease-in-out infinite alternate` }, body) };
  },
};

export default def;
