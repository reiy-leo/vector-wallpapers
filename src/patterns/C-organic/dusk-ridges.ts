/**
 * 山峦日落 —— C 渐变流体 / 有机形态。
 *
 * 构图要点：天空线性渐变打底 + 径向渐变太阳 + N 层山脊剪影。
 * 山脊线复用 E-scene 共享的 `peakRange`（与 starry-night-sky 同款）：
 * 若干「锥形山峰」取上包络（相邻山峰相交自然成谷）+ 一层分形碎石细节，
 * 再以密集等距采样输出整数相对坐标折线 —— 视觉上连续平滑，不再是 48 段大折线。
 * 同 seed 稳定、换 seed 换山形；随机数只来自 cfg.rng。
 *
 * ⚠️ 本 pattern 曾是 20KB 红线的主要风险点（6 元件 / 多段渐变），
 * 因此：山脊层数受控件上限约束（≤3 条山脊），渐变由 DefsRegistry 按内容去重，
 * 山脊在「短边 = V」的虚拟坐标里采样（与分辨率无关），总长超过 RIDGE_CAP 时自动放大步长 —— 体积有硬上限。
 */
import { circle, path, rect } from '../../engine/svg';
import { encLine, peakRange, virt } from '../E-scene/_scene';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 虚拟坐标短边。 */
const V = 1000;
/** 全部山脊路径 d 字符总长上限（≈ 字节），超出则放大采样步长。 */
const RIDGE_CAP = 6000;

const def: PatternDef = {
  id: 'dusk-ridges',
  name: '山峦日落',
  category: 'E-scene',
  description: '渐变天空、径向光晕太阳与多层山脊剪影，构图的经典壁纸母题。',
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
          { offset: 0, color: '#1e1b4b' },
          { offset: 0.45, color: '#be185d' },
          { offset: 1, color: '#fb923c' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'sun', label: '太阳', role: 'accent', paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fff7ae' }, { offset: 0.55, color: '#fbbf24' }, { offset: 1, color: '#f97316' }] }, opacity: 1, visible: true, configurable: true },
    { id: 'ridge_far', label: '山峦 · 远', role: 'secondary', paint: { type: 'solid', color: '#7c2d5e' }, opacity: 1, visible: true, configurable: true },
    { id: 'ridge_mid', label: '山峦 · 中', role: 'secondary', paint: { type: 'solid', color: '#4c1d74' }, opacity: 1, visible: true, configurable: true },
    { id: 'ridge_near', label: '山峦 · 近', role: 'primary', paint: { type: 'solid', color: '#241142' }, opacity: 1, visible: true, configurable: true },
    { id: 'fore', label: '前景', role: 'detail', paint: { type: 'solid', color: '#0d0620' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'layers', label: '层数', type: 'range', min: 2, max: 6, step: 1, default: 4, heavy: true },
    { key: 'ridgeH', label: '山高', type: 'range', min: 0.08, max: 0.55, step: 0.01, default: 0.24 },
    { key: 'sunSize', label: '太阳大小', type: 'range', min: 0.04, max: 0.3, step: 0.01, default: 0.12 },
    { key: 'sunY', label: '太阳高度', type: 'range', min: 0.15, max: 0.85, step: 0.01, default: 0.52 },
    { key: 'rough', label: '崎岖度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.45 },
  ],

  presets: [
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#1e1b4b' },
              { offset: 0.45, color: '#be185d' },
              { offset: 1, color: '#fb923c' },
            ],
          },
        },
        ridge_far: { paint: { type: 'solid', color: '#7c2d5e' } },
        ridge_mid: { paint: { type: 'solid', color: '#4c1d74' } },
        ridge_near: { paint: { type: 'solid', color: '#241142' } },
        fore: { paint: { type: 'solid', color: '#0d0620' } },
      },
    },
    {
      id: 'arctic',
      label: '极地',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#0c4a6e' },
              { offset: 0.5, color: '#7dd3fc' },
              { offset: 1, color: '#fef3c7' },
            ],
          },
        },
        sun: { paint: { type: 'solid', color: '#fffbeb' } },
        ridge_far: { paint: { type: 'solid', color: '#a5c4d4' } },
        ridge_mid: { paint: { type: 'solid', color: '#6b8fa3' } },
        ridge_near: { paint: { type: 'solid', color: '#3c5a6b' } },
        fore: { paint: { type: 'solid', color: '#1e3444' } },
      },
    },
    {
      id: 'neon',
      label: '霓虹夜',
      elements: {
        sky: {
          paint: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#020617' },
              { offset: 0.55, color: '#4c1d95' },
              { offset: 1, color: '#db2777' },
            ],
          },
        },
        sun: { paint: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#f0abfc' }, { offset: 0.6, color: '#d946ef' }, { offset: 1, color: '#7c3aed' }] } },
        ridge_far: { paint: { type: 'solid', color: '#4c1d95' } },
        ridge_mid: { paint: { type: 'solid', color: '#2e1065' } },
        ridge_near: { paint: { type: 'solid', color: '#1e1b4b' } },
        fore: { paint: { type: 'solid', color: '#020617' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['sky'],
    accent: ['sun'],
    secondary: ['ridge_far', 'ridge_mid'],
    primary: ['ridge_near'],
    detail: ['fore'],
  },

  render(_def, cfg: ResolvedConfig, _api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const layerCount = Math.max(1, Math.min(6, Math.round(Number(params.layers))));
    const ridgeH = Number(params.ridgeH);
    const sunSize = Number(params.sunSize);
    const sunY = Number(params.sunY);
    const rough = Number(params.rough);

    const sky = elements.get('sky')!;
    const sun = elements.get('sun')!;
    const fore = elements.get('fore')!;

    // 山脊自远及近：越近基线越低、越高。数量不足时优先保留近景（构图更稳）。
    const RIDGE_IDS = ['ridge_far', 'ridge_mid', 'ridge_near'] as const;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // 太阳：本体 + 外圈柔光。
    // 柔光用一个同心大圆、低不透明度叠出，避免引入 <filter> ——
    // filter 在 canvas 光栅化时是 Safari 的重灾区，且会显著拖慢导出。
    if (sun.visible) {
      const r = Math.min(W, H) * sunSize;
      const cx = W * 0.5;
      const cy = H * sunY;
      parts.push(circle(cx, cy, r * 2.4, { fill: sun.paintValue, 'fill-opacity': sun.opacity * 0.18 }));
      parts.push(circle(cx, cy, r, { fill: sun.paintValue, 'fill-opacity': sun.opacity }));
    }

    // 山脊层：数量不足时优先保留近景（构图更稳）
    // 同pixel-terrain：切片起点必须用「实际保留层数」，
    // 写成 `length - (layerCount - 1)` 会 off-by-one，在 layers=2 时少画一层。
    const keep = Math.min(layerCount - 1, RIDGE_IDS.length);
    const chosen = RIDGE_IDS.slice(RIDGE_IDS.length - keep);

    // 虚拟坐标（短边 = V）：几何与分辨率解耦，整条 path 用 transform 放大。
    const { Wv, Hv, tf } = virt(W, H, V);
    const k = Wv / V;
    const x0 = -V * 0.2;
    const x1 = Wv + V * 0.2;
    const bottom = Math.ceil(Hv) + 2;

    // 先按固定顺序生成全部山脊高度场（rng 消耗与显隐无关 → 切换显隐不改山形）。
    const ridges = chosen.map((_, i) => {
      // t：0 远 → 1 近
      const t = chosen.length === 1 ? 1 : i / (chosen.length - 1);
      const depth = (i + 1) / (chosen.length + 1);
      const baseY = Hv * (0.54 + depth * 0.34);
      const height = Hv * ridgeH * (0.6 + depth * 0.9);
      // 远山：峰更多、坡更缓、细节更少 → 柔和；近山：峰少而大、坡陡、带碎石细节。
      const count = Math.max(2, Math.round(k * (3.4 - t * 1.4)));
      const s0 = 0.16 + rough * 0.28 + t * 0.1;
      const R = peakRange(rng, {
        x0,
        x1,
        count,
        height,
        slope: [s0, s0 + 0.2 + rough * 0.2],
        detail: height * (0.01 + rough * 0.035) * (0.4 + t * 0.6),
      });
      // 5 抽头盒式平滑：把锥顶磨圆、压掉残余高频抖动（半径按 V 取，与分辨率无关）。
      const r = V * (0.006 + (1 - rough) * 0.008);
      const h = (x: number): number => (R(x - 2 * r) + R(x - r) + R(x) + R(x + r) + R(x + 2 * r)) / 5;
      return (x: number): number => baseY + height * 0.15 - h(x);
    });

    let step = 4;
    let ds: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      ds = ridges.map((f) => {
        const pts: Array<[number, number]> = [];
        for (let x = -step; x <= Wv + step; x += step) pts.push([x, f(x)]);
        return `${encLine(pts)}V${bottom}H${-step}z`;
      });
      if (ds.reduce((s, d) => s + d.length, 0) <= RIDGE_CAP) break;
      step *= 1.25;
    }

    for (let i = 0; i < chosen.length; i++) {
      const e = elements.get(chosen[i])!;
      if (!e.visible) continue;
      parts.push(path(ds[i], { transform: tf, fill: e.paintValue, 'fill-opacity': e.opacity }));
    }

    // 前景：底部暗带，压住画面下缘
    if (fore.visible) {
      const fh = H * 0.08;
      parts.push(rect(0, H - fh, W, fh, { fill: fore.paintValue, 'fill-opacity': fore.opacity }));
    }

    return { body: parts.join('') };
  },
};

export default def;