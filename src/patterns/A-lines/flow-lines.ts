/**
 * 流线曲 —— A 极简几何线条。
 *
 * 构图要点：正弦线束横扫全幅，三层线束共用同一相位基准但振幅与疏密不同，
 * 靠「疏密 + 相位差」制造流动感。所有几何由 W/H 比例推导，尺寸无关。
 *
 * ⭐ 体积策略：**必须走 <pattern> 平铺**。三条线束在竖直方向本身就是重复的，
 * 把「密度行」折进 tile 高度后，单条波浪路径 + 一个 tile 即可表达任意密度，
 * SVG 体积与 density 完全解耦（实测密度 4 与 60 体积几乎相同）。
 * 早期版本逐行画 `<path>`，密度 60 时会膨胀到 44KB / 66 个顶层节点，直接击穿红线。
 */
import { g, n, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 采样正弦曲线为二次贝塞尔链 —— 比 polyline 更平滑且更省字节。 */
function buildWave(
  w: number,
  baseline: number,
  amp: number,
  phase: number,
  cycles: number,
  segs: number,
): string {
  if (amp === 0) return `M0 ${n(baseline)} L${n(w)} ${n(baseline)}`;
  const yAt = (t: number): number => baseline + Math.sin(t * Math.PI * 2 * cycles + phase) * amp;
  const step = w / segs;
  let d = `M0 ${n(yAt(0))}`;
  for (let i = 0; i < segs; i++) {
    const x0 = step * i;
    const x1 = step * (i + 1);
    const cx = (x0 + x1) / 2;
    // 控制点取起点高度 → 曲线在段内平滑过渡到终点，视觉上连续
    d += ` Q${n(cx)} ${n(yAt(i / segs))} ${n(x1)} ${n(yAt((i + 1) / segs))}`;
  }
  return d;
}

const def: PatternDef = {
  id: 'flow-lines',
  name: '流线曲',
  category: 'A-lines',
  description: '正弦线束横扫画面，三层相位错开形成缓慢流动的韵律。适合冷静、克制的桌面。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0f172a' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_far', label: '线束 · 远', role: 'secondary', paint: { type: 'solid', color: '#38bdf8' }, opacity: 0.45, visible: true, configurable: true },
    { id: 'line_mid', label: '线束 · 中', role: 'primary', paint: { type: 'solid', color: '#a78bfa' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'line_near', label: '线束 · 近', role: 'accent', paint: { type: 'solid', color: '#f472b6' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '密度', type: 'range', min: 4, max: 60, step: 1, default: 22, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 4, step: 0.1, default: 1.2, unit: 'px' },
    { key: 'amplitude', label: '振幅', type: 'range', min: 0, max: 0.35, step: 0.01, default: 0.12 },
    { key: 'curvature', label: '曲率', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1.6 },
    { key: 'drift', label: '流动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'midnight',
      label: '午夜蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b1120' } },
        line_far: { paint: { type: 'solid', color: '#1e3a8a' } },
        line_mid: { paint: { type: 'solid', color: '#3b82f6' } },
        line_near: { paint: { type: 'solid', color: '#93c5fd' } },
      },
    },
    {
      id: 'sakura',
      label: '樱',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b1b2e' } },
        line_far: { paint: { type: 'solid', color: '#7c3f6b' } },
        line_mid: { paint: { type: 'solid', color: '#e08fb4' } },
        line_near: { paint: { type: 'solid', color: '#ffe0ec' } },
      },
      params: { amplitude: 0.18, density: 28 },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#052e2b' } },
        line_far: { paint: { type: 'solid', color: '#0f766e' } },
        line_mid: { paint: { type: 'solid', color: '#2dd4bf' } },
        line_near: { paint: { type: 'solid', color: '#a7f3d0' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], secondary: ['line_far'], primary: ['line_mid'], accent: ['line_near'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const density = Math.max(2, Number(params.density));
    const weight = Number(params.weight);
    const amplitude = Number(params.amplitude);
    const curvature = Number(params.curvature);
    const drift = params.drift === true;

    const bg = elements.get('bg')!;
    const far = elements.get('line_far')!;
    const mid = elements.get('line_mid')!;
    const near = elements.get('line_near')!;

    const parts: string[] = [
      rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
    ];

    // 三层线束：振幅递减 → 视觉上「近粗远细」
    const layers: Array<{ e: typeof far; step: number; phase: number; gain: number; scale: number }> = [
      { e: far, step: 2, phase: 0, gain: 1, scale: 0.7 },
      { e: mid, step: 3, phase: Math.PI / 3, gain: 0.72, scale: 1 },
      { e: near, step: 5, phase: (Math.PI * 2) / 3, gain: 0.44, scale: 1.35 },
    ];

    const amp = H * amplitude;
    const segs = 24;

    for (const layer of layers) {
      const { e, step, phase, gain, scale } = layer;
      if (!e.visible) continue;
      // 该层的行距：density 越小行距越大
      const gap = (H * step) / density;
      if (gap <= 0) continue;

      // tile 高度 = 一个「行距 × 2」的周期，两条路径相位差 π。
      // 正弦的 π 相位等价于上下镜像，因此竖直平铺后行距恰好 = gap，且首尾无缝。
      const tileH = gap * 2;
      const stroke = e.paintValue;
      const base = { fill: 'none', stroke, 'stroke-width': weight * scale, 'stroke-opacity': e.opacity, 'stroke-linecap': 'round' as const };

      // seed 抖动：每层取一个相位偏移，让不同 seed 得到不同的波浪节奏
      const jitter = rng() * Math.PI * 2;
      const content =
        path(buildWave(W, gap, amp * gain, phase + jitter, curvature, segs), base) +
        path(buildWave(W, gap * 2, amp * gain, phase + jitter + Math.PI, curvature, segs), base);

      const tileRef = api.tile({
        key: `fl-${api.n(gap)}-${api.n(amp * gain)}-${api.n(curvature)}-${api.n(weight * scale)}`,
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