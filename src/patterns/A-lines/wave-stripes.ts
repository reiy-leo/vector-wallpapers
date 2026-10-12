/**
 * 波浪条纹 —— A 极简几何线条。
 *
 * 一组等距、等粗的平行粗条纹铺满整幅画布，全部被同一个缓慢、低幅的位移场
 * 轻轻扭动（柔和的 S 弯 / 微鼓），像织物的褶皱。条纹始终平行、永不相交。
 *
 * 实现：
 *  - 在「条纹局部坐标系」(u 沿条纹, v 垂直条纹) 内绘制，整体以画布中心 rotate(angle)。
 *  - 位移场 f(u,v) = A·env(u)·[0.62·sin(k1·u+φ1+κv) + 0.38·sin(k2·u+φ2−0.6κv)]，
 *    相位 φ 由 seed 决定；κ（drift）随条纹缓慢漂移，且被钳制到 |∂f/∂v| ≤ 0.45，
 *    保证相邻条纹间距永不塌缩 → 不交叉。
 *  - 每条条纹只在与（旋转后的）画布相交的 u 区间内采样，Catmull-Rom → 三次贝塞尔，
 *    用相对 `s` 指令输出；同元件所有条纹合并成一条描边 path（顶层节点恒定）。
 *  - BYTE_CAP：估算段数超预算时自动加大采样步长，SVG 恒 < 20KB。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 两条 path 的 d 总预算（字节）。 */
const BYTE_CAP = 15500;
/** 每段 `s` 指令的保守字节估计。 */
const BYTES_PER_SEG = 21;

/** 1 位小数的紧凑数字（去前导 0、去 -0）。 */
function f1(v: number): string {
  const r = Math.round(v * 10) / 10;
  if (r === 0) return '0';
  let s = String(r);
  if (s.startsWith('0.')) s = s.slice(1);
  else if (s.startsWith('-0.')) s = '-' + s.slice(2);
  return s;
}

/** 紧凑拼接数字：负号可直接充当分隔符。 */
function joinNums(nums: number[]): string {
  let out = '';
  for (const v of nums) {
    const s = f1(v);
    out += out === '' || s.startsWith('-') ? s : ' ' + s;
  }
  return out;
}

const def: PatternDef = {
  id: 'wave-stripes',
  name: '波浪条纹',
  category: 'A-lines',
  description: '等距等粗的平行粗条纹被同一道缓慢低幅的波轻轻扭动，像织物褶皱；条纹始终平行不交叉。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0b0b0b' }, opacity: 1, visible: true, configurable: true },
    { id: 'stripe', label: '条纹', role: 'primary', paint: { type: 'solid', color: '#3a3a3a' }, opacity: 1, visible: true, configurable: true },
    { id: 'stripe_alt', label: '条纹 · 间隔', role: 'secondary', paint: { type: 'solid', color: '#4d4d4d' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '条纹数量', type: 'range', min: 6, max: 60, step: 1, default: 22, heavy: true },
    { key: 'thickness', label: '条宽占比', type: 'range', min: 0.15, max: 0.9, step: 0.01, default: 0.5 },
    { key: 'amplitude', label: '波幅', type: 'range', min: 0, max: 0.3, step: 0.005, default: 0.07 },
    { key: 'wavelength', label: '波长', type: 'range', min: 0.5, max: 4, step: 0.05, default: 1.8, heavy: true },
    { key: 'drift', label: '相位漂移', type: 'range', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'angle', label: '角度', type: 'range', min: 0, max: 180, step: 1, default: 0, unit: '°' },
    { key: 'alternate', label: '隔条换色', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'graphite',
      label: '石墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b0b0b' } },
        stripe: { paint: { type: 'solid', color: '#3a3a3a' } },
        stripe_alt: { paint: { type: 'solid', color: '#4d4d4d' } },
      },
    },
    {
      id: 'cobalt-orange',
      label: '钴蓝橙',
      elements: {
        bg: { paint: { type: 'solid', color: '#1238c9' } },
        stripe: { paint: { type: 'solid', color: '#ff7a1a' } },
        stripe_alt: { paint: { type: 'solid', color: '#ffb347' } },
      },
      params: { count: 16, thickness: 0.42, amplitude: 0.09, alternate: true, angle: 0 },
    },
    {
      id: 'terracotta',
      label: '奶油陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3e9d8' } },
        stripe: { paint: { type: 'solid', color: '#c8553d' } },
        stripe_alt: { paint: { type: 'solid', color: '#e08e5b' } },
      },
      params: { count: 14, thickness: 0.55, amplitude: 0.075, wavelength: 1.3, angle: 90 },
    },
    {
      id: 'neon-navy',
      label: '霓虹粉 · 藏青',
      elements: {
        bg: { paint: { type: 'solid', color: '#0d1440' } },
        stripe: { paint: { type: 'solid', color: '#ff3ea5' } },
        stripe_alt: { paint: { type: 'solid', color: '#7b5cff' } },
      },
      params: { count: 30, thickness: 0.35, amplitude: 0.1, wavelength: 1.4, drift: 0.6, angle: 35, alternate: true },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4f5ec' } },
        stripe: { paint: { type: 'solid', color: '#2f9e6b' } },
        stripe_alt: { paint: { type: 'solid', color: '#7fcfa4' } },
      },
      params: { count: 20, thickness: 0.48, amplitude: 0.08, angle: 150 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['stripe'], secondary: ['stripe_alt'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    // 所有尺寸都以短边 S 为基准（等价于 min(W,H)/1080 缩放），与分辨率无关
    const S = Math.min(W, H);
    const count = Math.max(2, Math.round(Number(params.count)));
    const spacing = S / count;
    const sw0 = Math.min(0.95, Math.max(0.05, Number(params.thickness)));
    const amp = Math.max(0, Number(params.amplitude)) * S;
    const lam = Math.max(0.2, Number(params.wavelength)) * S;
    const angle = Number(params.angle) || 0;
    const alternate = Boolean(params.alternate);

    const bg = elements.get('bg')!;
    const main = elements.get('stripe')!;
    const alt = elements.get('stripe_alt')!;

    // —— seeded 位移场 ——
    const TAU = Math.PI * 2;
    const ph1 = rng() * TAU;
    const ph2 = rng() * TAU;
    const ph3 = rng() * TAU;
    // 条纹基线网格的 seeded 偏移（波幅为 0 时仍随 seed 变化）
    const gridOff = rng();
    const k1 = TAU / lam;
    const k2 = TAU / (lam * 1.73);
    const kEnv = TAU / (lam * 2.6);
    // drift → v 向相位速率；钳制 |∂f/∂v| ≤ 0.45，条纹间距最多收缩 45%，永不交叉。
    const kappaRaw = Number(params.drift) * (TAU / (lam * 1.5));
    const kappa = amp > 0 ? Math.min(kappaRaw, 0.45 / (amp * 1.03)) : 0;
    const field = (u: number, v: number): number => {
      const env = 0.68 + 0.32 * Math.sin(kEnv * u + ph3);
      return amp * env * (0.62 * Math.sin(k1 * u + ph1 + kappa * v) + 0.38 * Math.sin(k2 * u + ph2 - 0.6 * kappa * v));
    };

    // —— 画布在局部坐标系中的多边形（中心为原点，逆旋转 angle）——
    const th = (-angle * Math.PI) / 180;
    const ca = Math.cos(th);
    const sa = Math.sin(th);
    const corners: Array<[number, number]> = [
      [-W / 2, -H / 2],
      [W / 2, -H / 2],
      [W / 2, H / 2],
      [-W / 2, H / 2],
    ].map(([x, y]) => [x * ca - y * sa, x * sa + y * ca]);
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const [, v] of corners) {
      vMin = Math.min(vMin, v);
      vMax = Math.max(vMax, v);
    }

    /** v ∈ [a,b] 横带与画布多边形相交部分的 u 区间。 */
    const uRange = (a: number, b: number): [number, number] | null => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 4; i++) {
        const [pu, pv] = corners[i];
        const [qu, qv] = corners[(i + 1) % 4];
        if (pv >= a && pv <= b) {
          lo = Math.min(lo, pu);
          hi = Math.max(hi, pu);
        }
        for (const c of [a, b]) {
          if ((pv - c) * (qv - c) < 0) {
            const x = pu + ((c - pv) / (qv - pv)) * (qu - pu);
            lo = Math.min(lo, x);
            hi = Math.max(hi, x);
          }
        }
      }
      return lo <= hi ? [lo, hi] : null;
    };

    // 极端长宽比 × 最大条数时条纹根数本身可能超预算：按「每根至少 ~2 段」放宽间距（视觉密度近似不变）。
    const lenV = vMax - vMin + 2 * (amp * 1.05 + spacing);
    const MIN_BYTES_PER_STRIPE = 16 + 2 * BYTES_PER_SEG;
    const maxStripes = Math.floor(BYTE_CAP / MIN_BYTES_PER_STRIPE);
    const pitch = Math.max(spacing, lenV / maxStripes);
    const sw = pitch * sw0;
    const margin = amp * 1.05 + sw; // 条纹可能偏离基线的最大量 + 线宽

    // 条纹基线网格锚定在 v=0（中心），覆盖 [vMin−margin, vMax+margin]
    const iStart = Math.floor((vMin - margin) / pitch - gridOff);
    const iEnd = Math.ceil((vMax + margin) / pitch - gridOff);
    const stripes: Array<{ i: number; v: number; lo: number; hi: number }> = [];
    for (let i = iStart; i <= iEnd; i++) {
      const v = (i + gridOff) * pitch;
      const r = uRange(v - margin, v + margin);
      if (r) stripes.push({ i, v, lo: r[0] - sw, hi: r[1] + sw });
    }
    let maxLen = 3;
    for (const st of stripes) maxLen = Math.max(maxLen, st.hi - st.lo);

    // —— 采样步长：短波长的 ~1/9，取 3 的倍数（让 2/3 步长也是整数）；超预算则放大（上限 = 最长条纹）——
    let seg = Math.max(3, Math.round(lam / 9 / 3) * 3);
    const estBytes = (s: number): number =>
      stripes.reduce((acc, st) => acc + 16 + BYTES_PER_SEG * (Math.ceil(st.hi / s) - Math.floor(st.lo / s)), 0);
    while (estBytes(seg) > BYTE_CAP && seg < maxLen) seg = Math.ceil((seg * 1.15) / 3) * 3;

    const dMain: string[] = [];
    const dAlt: string[] = [];
    let used = 0;
    for (const st of stripes) {
      const isAlt = alternate && ((st.i % 2) + 2) % 2 === 1;
      const el = isAlt ? alt : main;
      if (!el.visible) continue;
      const jA = Math.floor(st.lo / seg) - 1;
      const jB = Math.ceil(st.hi / seg) + 1;
      // 采样点（含两端各一个用于切线的外点）
      const ys: number[] = [];
      for (let j = jA; j <= jB; j++) ys.push(Math.round((st.v + field(j * seg, st.v)) * 10) / 10);
      const xs0 = (jA + 1) * seg;
      let d = `M${f1(xs0)} ${f1(ys[1])}`;
      const nums: number[] = [];
      let prevY = ys[1];
      for (let k = 2; k < ys.length - 1; k++) {
        // Catmull-Rom: 段 (k-1→k) 的第二控制点 = P_k − T_k/3，T_k=(P_{k+1}−P_{k−1})/2
        const c2y = Math.round((ys[k] - (ys[k + 1] - ys[k - 1]) / 6) * 10) / 10;
        nums.push((seg * 2) / 3, c2y - prevY, seg, ys[k] - prevY);
        prevY = ys[k];
      }
      // 首段需要 `c`（其第一控制点不是反射）；此处采用 s：首段第一控制点=起点，差异在画布外可忽略
      d += 's' + joinNums(nums);
      used += d.length;
      if (used > BYTE_CAP + 2500) break; // 兜底：估算失准时也绝不越过 20KB
      (isAlt ? dAlt : dMain).push(d);
    }

    const tf = `translate(${api.n(W / 2)} ${api.n(H / 2)})${angle % 360 === 0 ? '' : ` rotate(${api.n(angle)})`}`;
    const body = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const emit = (ds: string[], fill: string, op: number): void => {
      if (ds.length === 0) return;
      body.push(
        path(ds.join(''), {
          fill: 'none',
          stroke: fill,
          'stroke-opacity': op,
          'stroke-width': api.n(sw),
          transform: tf,
        }),
      );
    };
    emit(dMain, main.paintValue, main.opacity);
    emit(dAlt, alt.paintValue, alt.opacity);
    return { body: body.join('') };
  },
};

export default def;
