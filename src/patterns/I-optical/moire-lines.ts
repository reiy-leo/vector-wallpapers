/**
 * 莫尔条纹 —— I 光学错觉。
 *
 * 两组（可选三组）等距细线只差几度叠在一起：线与线交叉的疏密沿垂直方向缓慢起伏，
 * 拍出一道道比线距宽得多的明暗「拍频」带 —— 带宽 ≈ 线距 / (2·sin(夹角/2))，夹角越小带越宽。
 * 第二组线可加正弦弯曲，拍频带随之变成流动的曲线（像丝绸的水纹 / 波纹绸）。
 *
 * ⭐ 体积：每组线就是一个 `<pattern>`（单根直线 / 单周期波线）+ `patternTransform` 旋转，
 *   整幅只有 3~5 个顶层节点，体积与分辨率、线密度都无关。
 * 动画（仅预览，cfg.animate 且「缓慢转动」打开）：第二组线绕画面中心来回转一个小角度，拍频带随之翻涌。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { glowFill, numParam, unitOf } from './_helpers';

/** 波线每个波长的采样段数。 */
const WAVE_SEG = 36;
/** 波长 = 画面长边 × WAVE_LEN（长波长 → 拍频带是大尺度的流动曲线，而不是细碎抖动）。 */
const WAVE_LEN = 0.62;

const def: PatternDef = {
  id: 'moire-lines',
  name: '莫尔条纹',
  category: 'I-optical',
  description: '两组细线以微小夹角叠加，拍出比线距宽得多的明暗流动条纹；可让一组线弯曲成波纹绸。',
  seedable: false,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1d1f26' }, opacity: 1, visible: true, configurable: true },
    { id: 'wash', label: '柔光', role: 'detail', paint: { type: 'solid', color: '#3a3f52' }, opacity: 0.6, visible: true, configurable: true },
    { id: 'lines_a', label: '细线 · 甲', role: 'primary', paint: { type: 'solid', color: '#9fb4c7' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'lines_b', label: '细线 · 乙', role: 'secondary', paint: { type: 'solid', color: '#c7a98f' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'lines_c', label: '细线 · 丙', role: 'accent', paint: { type: 'solid', color: '#8fb59e' }, opacity: 0.45, visible: true, configurable: true },
  ],

  controls: [
    { key: 'period', label: '线距', type: 'range', min: 6, max: 28, step: 0.5, default: 14 },
    { key: 'skew', label: '夹角', type: 'range', min: 0.5, max: 15, step: 0.5, default: 2.5, unit: '°' },
    { key: 'tilt', label: '整体朝向', type: 'range', min: 0, max: 180, step: 1, default: 28, unit: '°' },
    { key: 'thickness', label: '线宽占比', type: 'range', min: 0.2, max: 0.6, step: 0.05, default: 0.5 },
    { key: 'wave', label: '波纹弯曲', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'third', label: '第三组', type: 'toggle', default: true },
    { key: 'drift', label: '缓慢转动', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'graphite-silk',
      label: '石墨绸',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1f26' } },
        wash: { paint: { type: 'solid', color: '#3a3f52' }, opacity: 0.6 },
        lines_a: { paint: { type: 'solid', color: '#9fb4c7' }, opacity: 0.7 },
        lines_b: { paint: { type: 'solid', color: '#c7a98f' }, opacity: 0.7 },
        lines_c: { paint: { type: 'solid', color: '#8fb59e' }, opacity: 0.45 },
      },
    },
    {
      id: 'moire-silk',
      label: '波纹绸',
      elements: {
        bg: { paint: { type: 'solid', color: '#2a2230' } },
        wash: { paint: { type: 'solid', color: '#5a4058' }, opacity: 0.55 },
        lines_a: { paint: { type: 'solid', color: '#c9a3b4' }, opacity: 0.65 },
        lines_b: { paint: { type: 'solid', color: '#d8bf9a' }, opacity: 0.65 },
        lines_c: { paint: { type: 'solid', color: '#9a8fc2' }, opacity: 0.4 },
      },
      params: { wave: 0.85, skew: 1.5, tilt: 62, period: 12 },
    },
    {
      id: 'linen-paper',
      label: '麻纸',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe9de' } },
        wash: { paint: { type: 'solid', color: '#fbf8f1' }, opacity: 0.85 },
        lines_a: { paint: { type: 'solid', color: '#5d6b78' }, opacity: 0.55 },
        lines_b: { paint: { type: 'solid', color: '#a8714f' }, opacity: 0.5 },
        lines_c: { paint: { type: 'solid', color: '#6f8a6a' }, opacity: 0.32 },
      },
      params: { period: 12, skew: 4, thickness: 0.4, wave: 0 },
    },
    {
      id: 'tri-weave',
      label: '三重织',
      elements: {
        bg: { paint: { type: 'solid', color: '#182424' } },
        wash: { paint: { type: 'solid', color: '#2f4a46' }, opacity: 0.6 },
        lines_a: { paint: { type: 'solid', color: '#86b8ad' }, opacity: 0.6 },
        lines_b: { paint: { type: 'solid', color: '#c4b48a' }, opacity: 0.55 },
        lines_c: { paint: { type: 'solid', color: '#a7a0c8' }, opacity: 0.5 },
      },
      params: { third: true, skew: 3, period: 12, thickness: 0.4, tilt: 0, wave: 0.3 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['lines_a'], secondary: ['lines_b'], accent: ['lines_c'], detail: ['wash'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, animate } = cfg;
    const u = unitOf(W, H);
    const p = numParam(params, 'period', 5, 20) * u;
    const skew = numParam(params, 'skew', 0.5, 15);
    const tilt = numParam(params, 'tilt', 0, 180);
    const duty = numParam(params, 'thickness', 0.2, 0.6);
    const wave = numParam(params, 'wave', 0, 1);
    const third = params.third === true;
    const drift = animate && params.drift === true;
    const n = api.n;
    const t = p * duty;

    const bg = elements.get('bg')!;
    const wash = elements.get('wash')!;
    const la = elements.get('lines_a')!;
    const lb = elements.get('lines_b')!;
    const lc = elements.get('lines_c')!;

    /** 直线组：单元内一条横向色带，旋转到目标角度。 */
    const straight = (color: string, angle: number, key: string): string =>
      api.tile({
        key,
        w: p,
        h: p,
        content: rect(0, 0, p, t, { fill: color }),
        transform: `rotate(${n(angle)})`,
      });

    /** 波线组：单元宽 = 一个波长，内含若干条上下平移 p 的同一条正弦线（振幅可跨单元）。 */
    const wavy = (color: string, angle: number, key: string): string => {
      const lam = Math.max(W, H) * WAVE_LEN;
      const A = wave * p * 7;
      const dx = lam / WAVE_SEG;
      const step = (Math.PI * 2) / WAVE_SEG;
      const y0 = A * Math.sin(-step);
      let rel = '';
      let py = y0;
      for (let i = 0; i <= WAVE_SEG + 1; i++) {
        const y = A * Math.sin(i * step);
        rel += `l${n(dx)} ${n(y - py)}`;
        py = y;
      }
      const copies = Math.ceil((A + t) / p) + 1;
      let d = '';
      for (let j = -copies; j <= copies; j++) d += `M${n(-dx)} ${n(p / 2 + j * p + y0)}${rel}`;
      return api.tile({
        key,
        w: lam,
        h: p,
        content: path(d.replace(/ -/g, '-'), { fill: 'none', stroke: color, 'stroke-width': n(t) }),
        transform: `rotate(${n(angle)})`,
      });
    };

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (wash.visible) {
      const gf = glowFill(api, wash, { cx: 0.5, cy: 0.42, r: 0.75 }, 'ml-wash');
      parts.push(rect(0, 0, W, H, { fill: gf.fill, 'fill-opacity': gf.opacity }));
    }
    if (la.visible) parts.push(rect(0, 0, W, H, { fill: straight(la.paintValue, tilt, 'ml-a'), 'fill-opacity': n(la.opacity) }));
    if (lb.visible) {
      const fill = wave > 0 ? wavy(lb.paintValue, tilt + skew, 'ml-bw') : straight(lb.paintValue, tilt + skew, 'ml-b');
      if (drift) {
        // 放大的方形填充区：绕中心转动时四角不露底
        const R = Math.hypot(W, H) / 2 + p * 2;
        const name = api.keyframes(`vw-mldrift-${n(skew)}`, `from{transform:rotate(-${n(skew * 0.6)}deg)}to{transform:rotate(${n(skew * 0.6)}deg)}`);
        parts.push(
          rect(W / 2 - R, H / 2 - R, R * 2, R * 2, {
            fill,
            'fill-opacity': n(lb.opacity),
            style: `transform-origin:${n(W / 2)}px ${n(H / 2)}px;animation:${name} 16s ease-in-out infinite alternate`,
          }),
        );
      } else {
        parts.push(rect(0, 0, W, H, { fill, 'fill-opacity': n(lb.opacity) }));
      }
    }
    if (third && lc.visible) parts.push(rect(0, 0, W, H, { fill: straight(lc.paintValue, tilt - skew, 'ml-c'), 'fill-opacity': n(lc.opacity) }));
    return { body: parts.join('') };
  },
};

export default def;
