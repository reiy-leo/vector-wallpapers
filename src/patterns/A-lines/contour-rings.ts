/**
 * 等高线圈 —— A 极简线条 / 几何。
 *
 * 构图要点（2026-10-12 审美返修）：画面上只有**少量（2~4 组）大尺度等高线组**，
 * 每组是一串嵌套的椭圆环，环心朝 seeded 方向缓慢漂移（偏心嵌套）→ 像地形图上的山丘。
 * 组心用 best-candidate 采样（随机但不扎堆），每组外径受「到最近邻组距离」约束，
 * 因此组与组的线**永不交叉**，线条始终清晰。
 *
 * ⚠️ 返修原因：旧版是三档小单元同心圆 <pattern> 叠加，暗底满屏小圈 → 浑浊、像噪点。
 *
 * 命中率：每组的环由内向外分三段色带（内 / 中 / 外），环数 ≥ 3 → 三个元件
 * 在每组内都必然出现，改色命中率恒为 100%。
 */
import { ellipse, g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'contour-rings',
  name: '等高线圈',
  category: 'A-lines',
  description: '少量大尺度的偏心等高线组，像地形图上的山丘，线条清晰安静。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#151a21' }, opacity: 1, visible: true, configurable: true },
    { id: 'ring_inner', label: '圈层 · 内', role: 'accent', paint: { type: 'solid', color: '#e2c48e' }, opacity: 0.95, visible: true, configurable: true },
    { id: 'ring_mid', label: '圈层 · 中', role: 'secondary', paint: { type: 'solid', color: '#86a9b6' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'ring_outer', label: '圈层 · 外', role: 'primary', paint: { type: 'solid', color: '#6a8794' }, opacity: 0.75, visible: true, configurable: true },
  ],

  controls: [
    // 单元尺寸 = 每组等高线的最大外径（以 1080 短边为基准的设计像素，按短边等比缩放）
    { key: 'size', label: '单元尺寸', type: 'range', min: 200, max: 900, step: 10, default: 560, heavy: true },
    { key: 'rings', label: '环数', type: 'range', min: 3, max: 14, step: 1, default: 9 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.5, max: 6, step: 0.1, default: 2, unit: 'px' },
    // 组数 = layers + 1（2~4 组）；key 沿用旧名以保持分享链接兼容
    { key: 'layers', label: '等高线组', type: 'range', min: 1, max: 3, step: 1, default: 2 },
  ],

  presets: [
    {
      id: 'sonar',
      label: '声呐',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f2624' } },
        ring_inner: { paint: { type: 'solid', color: '#9fd8c8' } },
        ring_mid: { paint: { type: 'solid', color: '#4f9a8d' } },
        ring_outer: { paint: { type: 'solid', color: '#2f6660' } },
      },
    },
    {
      id: 'dusk',
      label: '暮紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f1c35' } },
        ring_inner: { paint: { type: 'solid', color: '#ead8a8' } },
        ring_mid: { paint: { type: 'solid', color: '#a893c9' } },
        ring_outer: { paint: { type: 'solid', color: '#62558f' } },
      },
    },
    {
      id: 'paper',
      label: '纸感',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3efe6' } },
        ring_inner: { paint: { type: 'solid', color: '#b86a52' } },
        ring_mid: { paint: { type: 'solid', color: '#5f7c95' } },
        ring_outer: { paint: { type: 'solid', color: '#3a4552' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['ring_outer'], secondary: ['ring_mid'], accent: ['ring_inner'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const maxR = Math.max(200, Number(params.size)) * unit;
    const ringCount = Math.max(3, Math.min(14, Math.round(Number(params.rings))));
    const weight = Math.max(0.3, Number(params.weight)) * unit;
    const groups = Math.max(1, Math.min(3, Math.round(Number(params.layers)))) + 1;

    const bg = elements.get('bg')!;
    const BANDS = [elements.get('ring_inner')!, elements.get('ring_mid')!, elements.get('ring_outer')!];

    // ① 组心：首组随机落在画面中部 60% 区域；其余组 best-candidate（离已有组最远），
    // 落点范围放宽到 5%~95%，山丘偶尔贴边露出一部分，构图更松弛。
    const centers: Array<[number, number]> = [[(0.2 + rng() * 0.6) * W, (0.2 + rng() * 0.6) * H]];
    for (let i = 1; i < groups; i++) {
      let best: [number, number] = [W / 2, H / 2];
      let bestD = -1;
      for (let k = 0; k < 16; k++) {
        const x = (0.05 + rng() * 0.9) * W;
        const y = (0.05 + rng() * 0.9) * H;
        let d = Infinity;
        for (const [px, py] of centers) d = Math.min(d, Math.hypot(px - x, py - y));
        if (d > bestD) {
          bestD = d;
          best = [x, y];
        }
      }
      centers.push(best);
    }

    // 每组的「安全外径」：到最近邻组心距离的一半 —— 组间线条永不交叉
    const safeR = centers.map(([x, y], i) => {
      let d = Infinity;
      centers.forEach(([px, py], j) => {
        if (j !== i) d = Math.min(d, Math.hypot(px - x, py - y));
      });
      return d * 0.5;
    });

    const bands: string[][] = [[], [], []];
    centers.forEach(([cx, cy], gi) => {
      // 椭圆度与朝向：同组共享，不同组各异
      const squash = 0.72 + rng() * 0.26;
      const tilt = rng() * 180;
      const dir = rng() * Math.PI * 2;
      const ecc = 0.18 + rng() * 0.2; // 偏心漂移强度（< 1 → 相邻环永不相交）
      const R = Math.min(maxR * (0.85 + rng() * 0.3), safeR[gi] * 0.97);
      const r0 = R * (0.08 + rng() * 0.06);
      const ringsSvg: string[][] = [[], [], []];
      for (let i = 0; i < ringCount; i++) {
        // 环距由内向外略微变疏（指数 0.9），再叠一点 seeded 起伏 —— 像真实坡度变化
        const t = ringCount === 1 ? 1 : i / (ringCount - 1);
        const jitter = i === 0 || i === ringCount - 1 ? 0 : (rng() - 0.5) * 0.35 / ringCount;
        const r = r0 + (R - r0) * Math.min(1, Math.max(0, t ** 0.9 + jitter));
        const shift = (R - r) * ecc;
        const band = t < 1 / 3 ? 0 : t < 2 / 3 ? 1 : 2;
        ringsSvg[band].push(ellipse(Math.cos(dir) * shift, Math.sin(dir) * shift, r, r * squash));
      }
      for (let b = 0; b < 3; b++) {
        if (ringsSvg[b].length === 0) continue;
        bands[b].push(
          g({ transform: `translate(${api.n(cx)} ${api.n(cy)}) rotate(${api.n(tilt)})` }, ringsSvg[b].join('')),
        );
      }
    });

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    // 内圈线最粗、外圈最细 —— 主次分明（山顶清晰、山脚渐隐）
    const widthBy = [1.15, 1, 0.85];
    for (let b = 0; b < 3; b++) {
      const e = BANDS[b];
      if (!e.visible || bands[b].length === 0) continue;
      parts.push(
        g(
          { fill: 'none', stroke: e.paintValue, 'stroke-width': weight * widthBy[b], 'stroke-opacity': e.opacity },
          bands[b].join(''),
        ),
      );
    }

    return { body: parts.join('') };
  },
};

export default def;
