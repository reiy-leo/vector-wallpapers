/**
 * 递变网点 —— B 波点 / 网格重复。
 *
 * 构图要点：45° 网屏上的网点**真实地由大到小递变**（印刷半色调的核心观感），
 * 双色分色时另一色网点在补位格上反向递变，形成两色交叉过渡。
 *
 * ⭐ 如何在「必须平铺」的约束下做出逐渐变化的半径（2026-10-12 重写）：
 * 把画面沿递变方向切成 N 条色带，每条色带一个 <pattern>（只差半径），
 * 所有 pattern 都是 userSpaceOnUse 且原点相同 → 网点格位在色带之间**连续不断**，
 * 只有半径分档变化；色带边界刚好落在两列网点正中间、且半径 ≤ 1/4 格距，
 * 因此任何网点都不会被色带边界切开。体积 ≈ N × 一个小 pattern，与密度无关。
 *
 * 旧实现（等径网点 + 白色渐变蒙层）在全屏上只是一片细密噪点、看不出递变，已废弃。
 */
import { circle, g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'halftone',
  name: '递变网点',
  category: 'D-pixel',
  crispEdges: false, // 分类重组前的渲染结果保持不变
  description: '45° 网屏上网点由大到小平滑递变，可双色交叉分色，模拟印刷半色调。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f3eee4' }, opacity: 1, visible: true, configurable: true },
    { id: 'dot_dark', label: '暗部网点', role: 'primary', paint: { type: 'solid', color: '#3b3a3f' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'dot_light', label: '亮部网点', role: 'secondary', paint: { type: 'solid', color: '#d0705a' }, opacity: 0.75, visible: true, configurable: true },
    // 纸色：沿递变方向的一层淡淡的「墨晕」，在暗部一侧加深纸面，强化明暗走向
    { id: 'paper', label: '纸色', role: 'detail', paint: { type: 'solid', color: '#e2d6c0' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    // pitch 以 1080p 短边为基准，渲染时乘 unit = 短边/1080（2560×1440 下 ×1.33）
    { key: 'pitch', label: '网点间距', type: 'range', min: 40, max: 200, step: 4, default: 96, heavy: true },
    { key: 'angle', label: '网屏角度', type: 'angle', default: 45 },
    { key: 'spread', label: '明暗跨度', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.9 },
    { key: 'ripple', label: '波纹强度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'split', label: '双色分色', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'print',
      label: '丝网印刷',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3eee4' } },
        dot_dark: { paint: { type: 'solid', color: '#3b3a3f' } },
        dot_light: { paint: { type: 'solid', color: '#d0705a' } },
        paper: { paint: { type: 'solid', color: '#e2d6c0' } },
      },
    },
    {
      id: 'cyanotype',
      label: '蓝晒',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9eff4' } },
        dot_dark: { paint: { type: 'solid', color: '#1f4e79' } },
        dot_light: { paint: { type: 'solid', color: '#7fb0d0' } },
        paper: { paint: { type: 'solid', color: '#d3e1eb' } },
      },
    },
    {
      id: 'duotone-pink',
      label: '粉调',
      elements: {
        bg: { paint: { type: 'solid', color: '#fbf1f3' } },
        dot_dark: { paint: { type: 'solid', color: '#9c4a6b' } },
        dot_light: { paint: { type: 'solid', color: '#eaa9bf' } },
        paper: { paint: { type: 'solid', color: '#f3dbe2' } },
      },
    },
    {
      id: 'night',
      label: '夜印',
      elements: {
        bg: { paint: { type: 'solid', color: '#1b1d22' } },
        dot_dark: { paint: { type: 'solid', color: '#c9c2b4' } },
        dot_light: { paint: { type: 'solid', color: '#c98a5e' } },
        paper: { paint: { type: 'solid', color: '#262a31' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['dot_dark'], secondary: ['dot_light'], detail: ['paper'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const pitch = Math.max(8, Number(params.pitch) * unit);
    const angle = Number(params.angle);
    const spread = Math.max(0.2, Math.min(1, Number(params.spread)));
    const ripple = Math.max(0, Math.min(1, Number(params.ripple)));
    const split = params.split === true;

    const bg = elements.get('bg')!;
    const dotDark = elements.get('dot_dark')!;
    const dotLight = elements.get('dot_light')!;
    const paper = elements.get('paper')!;

    /**
     * 整体坐标系：以画布中心旋转 (angle - 45)°。默认 45° = 不旋转，
     * 此时网点本身就排成 45° 斜网（单元内两点对角放置）。
     * 旋转后色带要覆盖整幅画布，所以在旋转系里铺一块边长 = 对角线的方形区域。
     */
    const D = Math.hypot(W, H);
    const cx = W / 2;
    const cy = H / 2;
    const x0 = cx - D / 2;
    const y0 = cy - D / 2;
    const rot = angle - 45;
    const groupT = rot === 0 ? undefined : `rotate(${api.n(rot)} ${api.n(cx)} ${api.n(cy)})`;

    /**
     * seed 驱动：网屏相位（套印误差）+ 波纹相位。
     * 两者都是连续量，保证不同 seed 产物不同；网屏相位以 pitch/2 为步长取整
     * 再加小数偏移，色带边界始终跟随网点列移动，网点永不被切开。
     */
    const phase = rng();
    const ripplePhase = rng() * Math.PI * 2;
    const half = pitch / 2;
    // 色带对齐基准：x 方向以 half 为周期，带边界落在 xb = k·half + offX
    const offX = phase * half;

    /*
     * 单元（pitch × pitch）内暗点在 (¼,¼)、(¾,¾)，亮点在补位 (¾,¼)、(¼,¾)：
     * 两组都是 45° 斜网，网点列的 x 坐标都在 ¼ / ¾ 处，
     * 所以 x = 0、½ 是列与列的正中间 —— 色带边界就放在这里。
     * 同组相邻点距 = pitch/√2，异组相邻点距 = pitch/2；
     * 半径上限 0.24·pitch < ¼·pitch，保证不会被色带切开、两组也不会互相压住。
     */
    const rMax = pitch * 0.24;
    const rMin = pitch * 0.24 * (1 - spread) + pitch * 0.015;
    const q = pitch / 4;

    /** t ∈ [0,1] 沿递变方向的位置 → 暗点覆盖率（1 = 最大）。带轻微正弦波纹。 */
    const tone = (t: number): number => {
      const base = 1 - t;
      const wave = Math.sin(t * Math.PI * 3 + ripplePhase) * 0.12 * ripple;
      return Math.max(0, Math.min(1, base + wave));
    };

    // 可见区（未旋转时）在旋转系中的 x 范围：用于把递变映射到真正看得见的部分
    const visHalf = (Math.abs(W * Math.cos((rot * Math.PI) / 180)) + Math.abs(H * Math.sin((rot * Math.PI) / 180))) / 2;
    const visL = cx - visHalf;
    const visR = cx + visHalf;

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const inner: string[] = [];

    // 纸色墨晕：暗部一侧淡淡加深纸面（纯色时用其 hex 做渐变；渐变 paint 时整块低透明度铺色）
    if (paper.visible) {
      const pv = paper.paintValue;
      if (pv.startsWith('#')) {
        const wash = api.linear({
          angle: 0,
          key: `ht-wash-${api.n(spread)}`,
          stops: [
            { offset: 0, color: pv, opacity: paper.opacity },
            { offset: 0.65, color: pv, opacity: paper.opacity * 0.25 },
            { offset: 1, color: pv, opacity: 0 },
          ],
        });
        inner.push(rect(visL, y0, visR - visL, D, { fill: wash }));
      } else {
        inner.push(rect(x0, y0, D, D, { fill: pv, 'fill-opacity': paper.opacity * 0.35 }));
      }
    }

    /**
     * 色带只铺在**可见范围**内：约 16 条（递变足够细腻，体积可控），每条宽 = half 的整数倍。
     * 首尾两条分别向外延伸到旋转方形区域的边缘（复用同一个 pattern，零额外体积）。
     */
    const bandHalfs = Math.max(1, Math.round((visR - visL) / half / 16));
    const bandW = bandHalfs * half;
    // 第一条带的左边界：≤ visL，并对齐到 k·half + offX（列中线）
    const start = Math.floor((visL - offX) / half) * half + offX;
    const nBands = Math.max(1, Math.ceil((visR - start) / bandW));
    for (let i = 0; i < nBands; i++) {
      const bx = start + i * bandW;
      const t = nBands === 1 ? 0 : i / (nBands - 1);
      const k = tone(t);
      const rd = rMin + (rMax - rMin) * k;
      // 亮点反向递变：暗点小的地方亮点大
      const rl = (rMin + (rMax - rMin) * (1 - k)) * 0.6; // 亮点只做配角：上限 0.6×，留出呼吸空间

      const marks: string[] = [];
      if (dotDark.visible && rd > 0.4) {
        marks.push(
          g(
            { fill: dotDark.paintValue, 'fill-opacity': dotDark.opacity },
            circle(q, q, rd) + circle(3 * q, 3 * q, rd),
          ),
        );
      }
      if (split && dotLight.visible && rl > 0.4) {
        marks.push(
          g(
            { fill: dotLight.paintValue, 'fill-opacity': dotLight.opacity },
            circle(3 * q, q, rl) + circle(q, 3 * q, rl),
          ),
        );
      }
      if (marks.length === 0) continue;
      const ref = api.tile({
        key: `ht-${api.n(pitch)}-${api.n(rd)}-${api.n(rl)}-${api.n(offX)}`,
        w: pitch,
        h: pitch,
        content: marks.join(''),
        // 网屏原点随相位平移，使「列中线」与色带边界对齐
        transform: offX === 0 ? undefined : `translate(${api.n(offX)} 0)`,
      });
      const left = i === 0 ? x0 : bx;
      const right = i === nBands - 1 ? x0 + D : bx + bandW;
      inner.push(rect(left, y0, right - left, D, { fill: ref }));
    }

    let body = inner.join('');
    if (groupT) body = g({ transform: groupT }, body);

    // 网屏缓慢漂移：只在预览呈现，导出时被 stripAnimation 剥离 → 字节级可复现
    if (animate) {
      const name = api.keyframes(
        'vwHalftone',
        `from{transform:translate(0,0)}to{transform:translate(0,${api.n(pitch)}px)}`,
      );
      body = g({ style: `animation:${name} 6s linear infinite` }, body);
    }

    parts.push(body);
    return { body: parts.join('') };
  },
};

export default def;
