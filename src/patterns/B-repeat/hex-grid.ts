/**
 * 六边形网格 —— B 波点 / 网格重复。
 *
 * 构图要点：正六边形描边网格 + 按填充率随机填充部分单元。
 * 蜂窝平铺的「错位」由单元内容偏移半个高度实现，因此单元高度 = 2 × 行高。
 *
 * ⭐ 必须 tile：网格密度拉到 40 时若逐个画，六边形数量会突破千级。
 */
import { circle, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'hex-grid',
  name: '六边形网格',
  category: 'B-repeat',
  description: '清晰安静的蜂窝六边形网格，按填充率低调点亮部分单元，缀以少量节点圆点。',
  seedable: true,
  animatable: false,

  elements: [
    // 2026-10-12 审美复核：原实现每个单元只画了 1 个完整 + 2 个「四分之一」六边形，
    // 跨边界的另一半从未画出 → 全屏只剩稀疏的青色短划，六边形几乎不可见。
    // 现改为「超单元」完整画出蜂窝，默认深石板底 + 清晰而安静的网格线 + 少量低调填充。
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#151a21' }, opacity: 1, visible: true, configurable: true },
    { id: 'line', label: '网格线', role: 'secondary', paint: { type: 'solid', color: '#445163' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'fill', label: '填充六边形', role: 'primary', paint: { type: 'solid', color: '#2c4152' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'dot', label: '节点圆点', role: 'accent', paint: { type: 'solid', color: '#d9b26f' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    // size / weight 以 1080p 短边为基准，渲染时乘 unit = 短边/1080（2560×1440 下 ×1.33）
    { key: 'size', label: '边长', type: 'range', min: 24, max: 180, step: 2, default: 72, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 5, step: 0.1, default: 1.4, unit: 'px' },
    { key: 'ratio', label: '填充率', type: 'range', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'nodes', label: '节点圆点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'cyber',
      label: '深海',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f1820' } },
        line: { paint: { type: 'solid', color: '#2a4356' } },
        fill: { paint: { type: 'solid', color: '#1d4a57' } },
        dot: { paint: { type: 'solid', color: '#7fcdbb' } },
      },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1f5f0' } },
        line: { paint: { type: 'solid', color: '#c4d6c6' } },
        fill: { paint: { type: 'solid', color: '#dce9dc' } },
        dot: { paint: { type: 'solid', color: '#5f8f6f' } },
      },
    },
    {
      id: 'amber',
      label: '琥珀',
      elements: {
        bg: { paint: { type: 'solid', color: '#1b1610' } },
        line: { paint: { type: 'solid', color: '#3d3122' } },
        fill: { paint: { type: 'solid', color: '#4a3923' } },
        dot: { paint: { type: 'solid', color: '#e0b25e' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], secondary: ['line'], primary: ['fill'], accent: ['dot'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const s = Math.max(4, Number(params.size) * unit);
    const weight = Number(params.weight) * unit;
    const ratio = Number(params.ratio);
    const showNodes = params.nodes === true;

    const bg = elements.get('bg')!;
    const line = elements.get('line')!;
    const fill = elements.get('fill')!;
    const dot = elements.get('dot')!;

    // 尖角朝上的正六边形：外接圆半径 s，宽 √3·s，行距 1.5·s，奇数行右移半个宽度
    const hexW = Math.sqrt(3) * s;
    const rowH = s * 1.5;

    /** 以 (cx, cy) 为中心、外接圆半径 r 的尖角朝上六边形（子路径，可拼接）。 */
    const hexPath = (cx: number, cy: number, r: number): string => {
      let d = '';
      for (let i = 0; i < 6; i++) {
        const ang = (Math.PI / 180) * (60 * i - 90);
        d += `${i === 0 ? 'M' : 'L'}${api.n(cx + r * Math.cos(ang))} ${api.n(cy + r * Math.sin(ang))}`;
      }
      return `${d}Z`;
    };

    /**
     * 超单元：C 列 × R 行（R 必须为偶数，奇偶行错位才能无缝衔接）。
     * 每个逻辑六边形 (i, j) 跨单元边界时，在所有可见的复制位置各画一份，
     * pattern 裁切后拼回完整的蜂窝。超单元越大，填充分布的重复感越弱。
     */
    const C = 6;
    const R = 4;
    const tileW = C * hexW;
    const tileH = R * rowH;

    // 填充率 → **精确个数**，seeded 洗牌决定填哪几格
    const total = C * R;
    const fillCount = Math.round(Math.max(0, Math.min(1, ratio)) * total);
    const order = Array.from({ length: total }, (_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    // 每个被填充格的 seeded 明度（0.55~1）：不同 seed 必得不同产物，也让填充有深浅层次
    const fillTone = new Map<number, number>();
    for (let i = 0; i < fillCount; i++) fillTone.set(order[i], 0.55 + rng() * 0.45);
    // 节点圆点：只落在第 1 个填充格的中心（克制的点缀）
    const dotCells = new Set(order.slice(0, Math.min(1, fillCount)));

    let outline = '';
    const fills: string[] = [];
    const dots: string[] = [];
    for (let j = -1; j <= R; j++) {
      for (let i = -1; i <= C; i++) {
        const cx = i * hexW + (((j % 2) + 2) % 2 === 1 ? hexW / 2 : 0);
        const cy = j * rowH;
        // 只保留与单元相交的六边形
        if (cx + hexW / 2 < 0 || cx - hexW / 2 > tileW || cy + s < 0 || cy - s > tileH) continue;
        outline += hexPath(cx, cy, s);
        const li = ((i % C) + C) % C;
        const lj = ((j % R) + R) % R;
        const idx = lj * C + li;
        const tone = fillTone.get(idx);
        if (tone !== undefined && fill.visible) {
          // 内缩到 0.84：填充与网格线之间留一圈底色，线条保持清晰
          fills.push(path(hexPath(cx, cy, s * 0.84), { fill: fill.paintValue, 'fill-opacity': fill.opacity * tone }));
        }
        if (dotCells.has(idx) && showNodes && dot.visible) {
          dots.push(circle(cx, cy, Math.max(0.6, s * 0.09), { fill: dot.paintValue, 'fill-opacity': dot.opacity }));
        }
      }
    }

    const marks: string[] = [...fills];
    if (line.visible && weight > 0) {
      marks.push(
        path(outline, {
          fill: 'none',
          stroke: line.paintValue,
          'stroke-width': weight,
          'stroke-opacity': line.opacity,
          'stroke-linejoin': 'round',
        }),
      );
    }
    marks.push(...dots);

    const tileRef = api.tile({
      key: `hg-${api.n(s)}-${api.n(weight)}-${api.n(ratio)}-${showNodes ? 1 : 0}`,
      w: tileW,
      h: tileH,
      content: marks.join(''),
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;