/**
 * 有机斑点场 —— C 渐变流体 / 有机形态。
 *
 * 构图要点（2026-10-12 审美返修）：整幅画布上 seeded 随机散布**少量大而柔的斑点**，
 * 每团由数个重叠的径向渐变圆构成（stop-opacity 羽化 → 边缘雾化消融，无硬边），
 * 再点缀极少量同色小实心圆点作景深（bokeh）。
 *
 * ⚠️ 返修原因：旧版走 <pattern> 平铺小单元，2560 宽下一眼可见重复的泡泡阵列。
 * 斑点数量本就很少（默认约 10 团），**不平铺**、整幅直接绘制体积反而更小，
 * 也彻底消除了重复感。斑点数按短边归一化的「间距」推导 → 与分辨率无关、体积有上限。
 *
 * ⭐⭐ 命中率（memphis-grid 教训）：槽位 → 色组是**固定映射**（i % 3），
 * 三组色在任意 seed / 参数下都必然出现；seed 只改变位置、大小与子圆排布。
 */
import { circle, g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'blob-field',
  name: '有机斑点场',
  category: 'C-organic',
  description: '大而柔的雾化斑点在整幅画面中随机散布，三组配色互相消融，柔软安静。',
  seedable: true,
  animatable: false,

  elements: [
    {
      id: 'bg',
      label: '底色',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#f7f2f8' },
          { offset: 1, color: '#e6e9f4' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'blob_a', label: '斑点 · A', role: 'primary', paint: { type: 'solid', color: '#c4a3d9' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'blob_b', label: '斑点 · B', role: 'secondary', paint: { type: 'solid', color: '#9cc7d6' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'blob_c', label: '斑点 · C', role: 'accent', paint: { type: 'solid', color: '#e8b4bc' }, opacity: 0.7, visible: true, configurable: true },
  ],

  controls: [
    // 「单元尺寸」= 斑点间距（以 1080 短边为基准的设计像素，按短边等比缩放）。
    // 下限 300：再密就回到「满屏泡泡」，且斑点数 × 子圆数会逼近体积红线。
    { key: 'size', label: '单元尺寸', type: 'range', min: 300, max: 900, step: 10, default: 520, heavy: true },
    { key: 'scale', label: '斑点大小', type: 'range', min: 0.6, max: 2.4, step: 0.05, default: 1.5 },
    { key: 'lobes', label: '重叠子圆', type: 'range', min: 2, max: 5, step: 1, default: 3 },
    { key: 'jitter', label: '随机游走', type: 'range', min: 0, max: 0.14, step: 0.01, default: 0.1 },
  ],

  presets: [
    {
      id: 'candy',
      label: '糖果',
      elements: {
        bg: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fbf3f1' }, { offset: 1, color: '#f3ecf6' }] } },
        blob_a: { paint: { type: 'solid', color: '#eba3a8' } },
        blob_b: { paint: { type: 'solid', color: '#f2cf94' } },
        blob_c: { paint: { type: 'solid', color: '#a9d4bf' } },
      },
    },
    {
      id: 'moss',
      label: '苔痕',
      elements: {
        bg: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#f3f5ea' }, { offset: 1, color: '#e3efe9' }] } },
        blob_a: { paint: { type: 'solid', color: '#9bb47a' } },
        blob_b: { paint: { type: 'solid', color: '#7fb0a6' } },
        blob_c: { paint: { type: 'solid', color: '#d2b673' } },
      },
    },
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1f1d3a' }, { offset: 1, color: '#352a55' }] } },
        blob_a: { paint: { type: 'solid', color: '#8f7cc8' } },
        blob_b: { paint: { type: 'solid', color: '#c98fb8' } },
        blob_c: { paint: { type: 'solid', color: '#6fa3c0' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['blob_a'], secondary: ['blob_b'], accent: ['blob_c'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unitPx = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const step = Math.max(300, Number(params.size)) * unitPx;
    const scale = Math.max(0.1, Number(params.scale));
    const lobes = Math.max(2, Math.min(5, Math.round(Number(params.lobes))));
    // jitter 0~0.14 → 子圆偏离团心的幅度 0.3~1（越大轮廓越不规则），同时让落位更随性
    const jitter = Math.max(0, Math.min(0.14, Number(params.jitter)));
    const wander = 0.3 + (jitter / 0.14) * 0.7;

    const bg = elements.get('bg')!;
    const GROUPS = [elements.get('blob_a')!, elements.get('blob_b')!, elements.get('blob_c')!];

    // 每组一个径向渐变：中心实、向外经 stop-opacity 羽化到全透明 —— 雾化边缘的来源。
    // 元件若被用户改成渐变（paintValue 为 url），退化为直接使用其 paintValue。
    const fills = GROUPS.map((e, gi) => {
      if (!e.visible || e.paint.type !== 'solid') return e.paintValue;
      const c = e.paintValue;
      return api.radial({
        key: `bf-${gi}-${c}`,
        cx: 0.5,
        cy: 0.5,
        r: 0.5,
        stops: [
          { offset: 0, color: c, opacity: 1 },
          { offset: 0.45, color: c, opacity: 0.78 },
          { offset: 0.78, color: c, opacity: 0.26 },
          { offset: 1, color: c, opacity: 0 },
        ],
      });
    });

    /**
     * 斑点落位：best-candidate（Mitchell）采样 —— 每颗斑点从若干 seeded 候选点里
     * 取「离已有斑点最远」的那个。结果是**随机但均匀**：没有网格感，也不会扎堆或留大空洞。
     * 采样区域向外出血 8%，让部分斑点从画布边缘探入，构图更松弛。
     * 数量由「间距」按面积推导，且所有尺寸按短边归一化 → 与分辨率无关、体积有上限。
     */
    const count = Math.max(6, Math.round(((W * H) / (step * step)) * 1.5));
    const bx = W * 0.08;
    const by = H * 0.08;
    // 候选数随 jitter 增大而减少：jitter 越大越「随性」，越小越均匀
    const cand = Math.max(2, Math.round(10 - (jitter / 0.14) * 7));
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < count; i++) {
      let best: [number, number] = [0, 0];
      let bestD = -1;
      for (let k = 0; k < cand; k++) {
        const x = -bx + rng() * (W + 2 * bx);
        const y = -by + rng() * (H + 2 * by);
        let d = Infinity;
        for (const [px, py] of pts) d = Math.min(d, (px - x) ** 2 + (py - y) ** 2);
        if (d > bestD) {
          bestD = d;
          best = [x, y];
        }
      }
      pts.push(best);
    }

    const soft: string[][] = [[], [], []];
    const dots: string[][] = [[], [], []];
    pts.forEach(([cx, cy], i) => {
      const gi = i % 3;
      const e = GROUPS[gi];
      // 大小起伏要明显：大团 + 小团交错，才有主次
      const big = rng() < 0.45;
      const r0 = step * 0.3 * scale * (big ? 1 + rng() * 0.4 : 0.45 + rng() * 0.3);
      const wobble: number[] = [];
      for (let k = 0; k < lobes * 3; k++) wobble.push(rng());
      const dotRoll = [rng(), rng(), rng(), rng()];
      if (!e.visible) return;
      for (let k = 0; k < lobes; k++) {
        const a = wobble[k * 3] * Math.PI * 2;
        const off = k === 0 ? 0 : r0 * (0.3 + wobble[k * 3 + 1] * 0.4) * wander;
        const rr = k === 0 ? r0 : r0 * (0.55 + wobble[k * 3 + 2] * 0.35);
        soft[gi].push(circle(cx + Math.cos(a) * off, cy + Math.sin(a) * off, rr));
      }
      // 景深小圆点：约 1/4 的斑点附带一颗（前 3 个必带，保证每组可见），同色实心
      if (dotRoll[0] < 0.25 || i < 3) {
        const a = dotRoll[1] * Math.PI * 2;
        const d = r0 * (1.05 + dotRoll[2] * 0.45);
        const rd = Math.max(3, step * (0.014 + dotRoll[3] * 0.014));
        dots[gi].push(circle(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rd, { fill: e.paintValue }));
      }
    });

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    for (let gi = 0; gi < 3; gi++) {
      const e = GROUPS[gi];
      if (!e.visible) continue;
      // 子圆叠加会累积不透明度 → 按子圆数折算，使「重叠子圆」只改轮廓不改浓淡
      if (soft[gi].length) parts.push(g({ fill: fills[gi], 'fill-opacity': Math.min(1, (e.opacity * 2) / lobes) }, soft[gi].join('')));
      if (dots[gi].length) parts.push(g({ 'fill-opacity': e.opacity * 0.6 }, dots[gi].join('')));
    }

    return { body: parts.join('') };
  },
};

export default def;
