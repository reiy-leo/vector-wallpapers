/**
 * 节点连线网（plexus）—— A 极简几何线条。
 *
 * seeded 抖动网格撒点（比纯随机均匀，不会结团）→ 每个节点只连最近的若干邻居
 * （距离阈值内、最多 MAX_LINKS 条），连线按长度分三档透明度：近的实、远的虚，
 * 网自然有景深。度数最高的少数节点升格为「枢纽」，用点缀色放大。
 *
 * ⭐ 体积策略：单幅不平铺，但所有连线合并为 3 条 <path>（按长度分档），
 * 所有节点合并为 1 条 <path>（零长度线段 + round cap 画圆点），坐标取整像素。
 * 节点数上限 140 × 每点最多 4 条连线 → 拉满也远低于 20KB。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

function unitOf(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

/** 每个节点最多连出的边数 —— 控制视觉密度与体积上限。 */
const MAX_LINKS = 4;

const def: PatternDef = {
  id: 'node-web',
  name: '节点连线网',
  category: 'A-lines',
  description: '随机节点与近邻连线织成的网（plexus），近实远虚，少数枢纽节点点缀。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#121820' }, opacity: 1, visible: true, configurable: true },
    { id: 'links', label: '连线', role: 'secondary', paint: { type: 'solid', color: '#5d7387' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'nodes', label: '节点', role: 'primary', paint: { type: 'solid', color: '#9fb2c3' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'hubs', label: '枢纽', role: 'accent', paint: { type: 'solid', color: '#d4b071' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '节点数', type: 'range', min: 20, max: 140, step: 1, default: 64, heavy: true },
    { key: 'reach', label: '连线距离', type: 'range', min: 0.6, max: 2.4, step: 0.05, default: 1.5 },
    { key: 'jitter', label: '随机度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: 'nodeSize', label: '节点大小', type: 'range', min: 1, max: 12, step: 0.5, default: 4, unit: 'px' },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 4, step: 0.1, default: 1.4, unit: 'px' },
    { key: 'hubRatio', label: '枢纽比例', type: 'range', min: 0, max: 0.2, step: 0.01, default: 0.06 },
  ],

  presets: [
    {
      id: 'night',
      label: '夜网',
      elements: {
        bg: { paint: { type: 'solid', color: '#121820' } },
        links: { paint: { type: 'solid', color: '#5d7387' } },
        nodes: { paint: { type: 'solid', color: '#9fb2c3' } },
        hubs: { paint: { type: 'solid', color: '#d4b071' } },
      },
    },
    {
      id: 'paper',
      label: '纸面',
      elements: {
        bg: { paint: { type: 'solid', color: '#eeefeb' } },
        links: { paint: { type: 'solid', color: '#959fa6' } },
        nodes: { paint: { type: 'solid', color: '#66747e' } },
        hubs: { paint: { type: 'solid', color: '#bf7b5c' } },
      },
    },
    {
      id: 'dusk',
      label: '暮紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#211d2b' } },
        links: { paint: { type: 'solid', color: '#6e6286' }, opacity: 0.75 },
        nodes: { paint: { type: 'solid', color: '#b3a6c9' } },
        hubs: { paint: { type: 'solid', color: '#e0a98a' } },
      },
      params: { count: 80, reach: 1.4 },
    },
    {
      id: 'sparse-sage',
      label: '疏 · 鼠尾草',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4e9e2' } },
        links: { paint: { type: 'solid', color: '#93a68d' } },
        nodes: { paint: { type: 'solid', color: '#6b7f66' } },
        hubs: { paint: { type: 'solid', color: '#b78f5e' } },
      },
      params: { count: 40, reach: 1.7, nodeSize: 5 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['nodes'], secondary: ['links'], accent: ['hubs'] },

  render(_def, cfg: ResolvedConfig, _api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const u = unitOf(W, H);
    const count = Math.max(4, Math.round(Number(params.count)));
    const reach = Math.max(0.1, Number(params.reach));
    const jitter = Math.min(1, Math.max(0, Number(params.jitter)));
    const nodeR = Math.max(0.5, Number(params.nodeSize) * u);
    const sw = Math.max(0.3, Number(params.weight) * u);
    const hubRatio = Math.max(0, Number(params.hubRatio));

    const bg = elements.get('bg')!;
    const links = elements.get('links')!;
    const nodes = elements.get('nodes')!;
    const hubs = elements.get('hubs')!;

    // ── 抖动网格撒点：行列数按画幅比例分配，格内随机偏移 ──
    const cols = Math.max(2, Math.round(Math.sqrt((count * W) / H)));
    const rows = Math.max(2, Math.ceil(count / cols));
    // 网格略微外扩到画布外，边缘的连线会自然出血，不留硬边框
    const pad = Math.min(W, H) * 0.04;
    const cw = (W + pad * 2) / cols;
    const ch = (H + pad * 2) / rows;
    const pts: Array<[number, number]> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (pts.length >= count) break;
        const jx = (rng() - 0.5) * jitter;
        const jy = (rng() - 0.5) * jitter;
        pts.push([Math.round(-pad + (c + 0.5 + jx) * cw), Math.round(-pad + (r + 0.5 + jy) * ch)]);
      }
    }

    // ── 近邻连线：每点取阈值内最近的 MAX_LINKS 个，去重 ──
    const spacing = Math.sqrt(cw * ch);
    const maxD = spacing * reach;
    const degree = new Array<number>(pts.length).fill(0);
    const seen = new Set<number>();
    const bands: string[] = ['', '', ''];
    for (let i = 0; i < pts.length; i++) {
      const cand: Array<[number, number]> = [];
      for (let j = 0; j < pts.length; j++) {
        if (j === i) continue;
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d <= maxD) cand.push([d, j]);
      }
      cand.sort((a, b) => a[0] - b[0]);
      for (const [d, j] of cand.slice(0, MAX_LINKS)) {
        const key = i < j ? i * 1024 + j : j * 1024 + i;
        if (seen.has(key)) continue;
        if (degree[j] >= MAX_LINKS + 1) continue;
        seen.add(key);
        degree[i]++;
        degree[j]++;
        const b = Math.min(2, Math.floor((d / maxD) * 3));
        bands[b] += `M${pts[i][0]} ${pts[i][1]}L${pts[j][0]} ${pts[j][1]}`;
      }
    }

    const body = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    if (links.visible) {
      // 近 → 远：透明度 1 / 0.6 / 0.3，乘以元件不透明度
      const fade = [1, 0.62, 0.34];
      bands.forEach((d, b) => {
        if (d) body.push(path(d, { fill: 'none', stroke: links.paintValue, 'stroke-opacity': links.opacity * fade[b], 'stroke-width': sw }));
      });
    }

    // ── 枢纽：度数最高的前 hubRatio 比例（稳定排序，结果确定）──
    const nHub = Math.round(pts.length * hubRatio);
    // 度数相同的节点很多，用 seeded 随机分打破平局，否则枢纽全挤在左上角（索引小的一侧）
    const score = pts.map((_, i) => degree[i] + rng() * 0.95);
    const order = pts.map((_, i) => i).sort((a, b) => score[b] - score[a] || a - b);
    const hubSet = new Set(order.slice(0, nHub));

    const dots = (idx: number[]): string => idx.map((i) => `M${pts[i][0]} ${pts[i][1]}h0`).join('');
    const plain = pts.map((_, i) => i).filter((i) => !hubSet.has(i) && degree[i] > 0);
    if (nodes.visible && plain.length) {
      body.push(path(dots(plain), { fill: 'none', stroke: nodes.paintValue, 'stroke-opacity': nodes.opacity, 'stroke-width': nodeR * 2, 'stroke-linecap': 'round' }));
    }
    if (hubs.visible && hubSet.size) {
      const hubIdx = [...hubSet];
      // 外圈淡晕 + 实心芯，枢纽更醒目但不刺眼
      body.push(path(dots(hubIdx), { fill: 'none', stroke: hubs.paintValue, 'stroke-opacity': hubs.opacity * 0.22, 'stroke-width': nodeR * 6, 'stroke-linecap': 'round' }));
      body.push(path(dots(hubIdx), { fill: 'none', stroke: hubs.paintValue, 'stroke-opacity': hubs.opacity, 'stroke-width': nodeR * 2.6, 'stroke-linecap': 'round' }));
    }

    return { body: body.join('') };
  },
};

export default def;
