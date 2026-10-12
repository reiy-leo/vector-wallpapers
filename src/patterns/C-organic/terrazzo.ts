/**
 * 水磨石 —— C 有机形态。
 *
 * 与「随机色块」刻意拉开：这里是**直边碎石片**（4~6 边的不规则多边形，不做贝塞尔平滑），
 * 大小三档悬殊（少量大石、中量中石、大量碎屑），配色走天然石材的低饱和色（锈红、板岩、
 * 赭黄、灰绿、云白），再撒一层细砂点。四色固定轮转（i % 4），压边复制 → 可无缝平铺。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderResult } from '../types';
import { scatter, wrapCenters } from './_blob';

/** path 数据体积上限：保证任意尺寸/参数都不击穿 20KB。 */
const BYTE_CAP = 17000;

const f = (v: number): string => String(Math.round(v * 10) / 10);

/** 一片直边碎石：k 个角，半径与角度都抖动，略压扁，随机朝向。 */
function shard(r: number, rng: () => number): Array<[number, number]> {
  const k = 4 + Math.floor(rng() * 3);
  const a0 = rng() * Math.PI * 2;
  const squash = 0.55 + rng() * 0.4;
  const rot = rng() * Math.PI;
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < k; i++) {
    const a = a0 + (i / k) * Math.PI * 2 + (rng() - 0.5) * (Math.PI / k) * 0.9;
    const rr = r * (0.55 + rng() * 0.6);
    const x = Math.cos(a) * rr;
    const y = Math.sin(a) * rr * squash;
    pts.push([x * Math.cos(rot) - y * Math.sin(rot), x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return pts;
}

function shardD(pts: ReadonlyArray<readonly [number, number]>, cx: number, cy: number): string {
  let px = Math.round((cx + pts[0][0]) * 10) / 10;
  let py = Math.round((cy + pts[0][1]) * 10) / 10;
  let d = `M${f(px)} ${f(py)}`;
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round((cx + pts[i][0]) * 10) / 10;
    const y = Math.round((cy + pts[i][1]) * 10) / 10;
    d += `l${f(x - px)} ${f(y - py)}`;
    px = x;
    py = y;
  }
  return d + 'z';
}

const def: PatternDef = {
  id: 'terrazzo',
  name: '水磨石',
  category: 'C-organic',
  description: '石底里嵌着直边的碎石片和细砂，大小三档悬殊，天然石材的低饱和配色，沉稳耐看。',
  seedable: true,
  animatable: false,
  elements: [
    { id: 'bg', label: '石底', role: 'bg', paint: { type: 'solid', color: '#e6e1d8' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_a', label: '碎石 · 锈红', role: 'primary', paint: { type: 'solid', color: '#a8573d' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_b', label: '碎石 · 板岩', role: 'secondary', paint: { type: 'solid', color: '#3e4548' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_c', label: '碎石 · 赭黄', role: 'accent', paint: { type: 'solid', color: '#c49a5c' }, opacity: 1, visible: true, configurable: true },
    { id: 'chip_d', label: '碎石 · 云白', role: 'detail', paint: { type: 'solid', color: '#f7f5f0' }, opacity: 1, visible: true, configurable: true },
  ],
  controls: [
    { key: 'size', label: '单元尺寸', type: 'range', min: 120, max: 360, step: 10, default: 160, heavy: true },
    { key: 'scale', label: '碎石大小', type: 'range', min: 0.5, max: 1.6, step: 0.05, default: 1 },
    { key: 'big', label: '大石比例', type: 'range', min: 0, max: 0.4, step: 0.02, default: 0.12 },
    { key: 'specks', label: '细砂', type: 'toggle', default: true },
  ],
  presets: [
    {
      id: 'nero',
      label: '黑底',
      elements: {
        bg: { paint: { type: 'solid', color: '#26282b' } },
        chip_a: { paint: { type: 'solid', color: '#b8674a' } },
        chip_b: { paint: { type: 'solid', color: '#8c9290' } },
        chip_c: { paint: { type: 'solid', color: '#d3ad6d' } },
        chip_d: { paint: { type: 'solid', color: '#ece8e0' } },
      },
    },
    {
      id: 'verde',
      label: '青石',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe3dc' } },
        chip_a: { paint: { type: 'solid', color: '#5f7a6a' } },
        chip_b: { paint: { type: 'solid', color: '#2f3a36' } },
        chip_c: { paint: { type: 'solid', color: '#a8b7a0' } },
        chip_d: { paint: { type: 'solid', color: '#f5f4ef' } },
      },
    },
    {
      id: 'rosa',
      label: '粉石',
      elements: {
        bg: { paint: { type: 'solid', color: '#f0e3dc' } },
        chip_a: { paint: { type: 'solid', color: '#c97a6b' } },
        chip_b: { paint: { type: 'solid', color: '#6b5652' } },
        chip_c: { paint: { type: 'solid', color: '#e2b8a4' } },
        chip_d: { paint: { type: 'solid', color: '#fbf7f3' } },
      },
    },
  ],
  paletteSlots: { bg: ['bg'], primary: ['chip_a'], secondary: ['chip_b'], accent: ['chip_c'] },

  render(_def, cfg: ResolvedConfig): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const step = Math.max(120, Number(params.size)) * unitPx;
    const scale = Math.max(0.1, Number(params.scale));
    const bigRatio = Math.max(0, Math.min(0.4, Number(params.big)));
    // 直边碎片体积小，可以比随机色块密得多
    const count = Math.max(12, Math.min(260, Math.round(((W * H) / (step * step)) * 2.4)));
    const groups = ['chip_a', 'chip_b', 'chip_c', 'chip_d'].map((id) => elements.get(id)!);
    const ds = ['', '', '', '', '', '', '', ''];
    let used = 0;
    scatter(count, W, H, rng, 4).forEach(([cx, cy], i) => {
      const gi = i % 4;
      const roll = rng();
      // 三档大小：大石 / 中石 / 碎屑
      const r = step * 0.22 * scale * (roll < bigRatio ? 1.5 + rng() * 0.7 : roll < bigRatio + 0.35 ? 0.65 + rng() * 0.35 : 0.22 + rng() * 0.25);
      const pts = shard(r, rng);
      if (!groups[gi].visible || used > BYTE_CAP) return;
      for (const [x, y] of wrapCenters(cx, cy, r * 1.2, W, H)) {
        const d = shardD(pts, x, y);
        ds[gi] += d;
        used += d.length;
      }
    });
    // 细砂：零长度圆头线段画点，最省体积
    if (params.specks !== false) {
      const nSpeck = Math.min(160, count);
      for (let i = 0; i < nSpeck && used < BYTE_CAP + 1800; i++) {
        const gi = i % 4;
        const s = `M${Math.round(rng() * W)} ${Math.round(rng() * H)}h0`;
        if (groups[gi].visible) {
          ds[gi + 4] += s;
          used += s.length;
        }
      }
    }
    const bg = elements.get('bg')!;
    const sw = Math.max(2, step * 0.028);
    const parts = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    groups.forEach((e, gi) => {
      if (!e.visible) return;
      if (ds[gi]) parts.push(path(ds[gi], { fill: e.paintValue, 'fill-opacity': e.opacity }));
      if (ds[gi + 4]) parts.push(path(ds[gi + 4], { fill: 'none', stroke: e.paintValue, 'stroke-opacity': e.opacity, 'stroke-width': sw, 'stroke-linecap': 'round' }));
    });
    return { body: parts.join('') };
  },
};

export default def;
