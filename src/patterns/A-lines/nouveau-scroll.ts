/**
 * 涡卷曲线 —— A 极简线条。
 *
 * 构图要点：**自相似递归**的对数螺线涡卷。每一圈涡卷的起始点上
 * 再生一个缩小版涡卷，层层递归 —— 这正是新艺术运动卷草纹的核心机制。
 *
 * 与现有 A 类两个近似母题的区别（`STYLE-100-ANALYSIS.md` §4.2 的缺口论证）：
 *  - `contour-rings` 是**闭合同心圆**，无自相似、无端点
 *  - `flow-lines` 是**开放平行流线**，无递归、无卷曲
 *  - 本母题是**递归 + 有端点 + 螺旋收紧**，三者皆不同
 *
 * ⭐ 节点控制：递归深度直接决定节点数，故上限较严（默认 4 层）。
 * 深度是显式参数而非写死，用户调到 6 层时仍需确认不破 60 上限。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'nouveau-scroll',
  name: '涡卷曲线',
  category: 'A-lines',
  description: '自相似递归的对数螺线涡卷，层层收紧的卷草纹，优雅有机。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f7f3ea' }, opacity: 1, visible: true, configurable: true },
    { id: 'stem', label: '主涡卷', role: 'primary', paint: { type: 'solid', color: '#2d5a3d' }, opacity: 1, visible: true, configurable: true },
    { id: 'scroll', label: '副涡卷', role: 'secondary', paint: { type: 'solid', color: '#8b6f3e' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'bud', label: '花苞点', role: 'accent', paint: { type: 'solid', color: '#a63d40' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '单元尺寸', type: 'range', min: 80, max: 320, step: 10, default: 180, heavy: true },
    { key: 'turns', label: '旋转圈数', type: 'range', min: 1.2, max: 3.5, step: 0.1, default: 2.2 },
    { key: 'tighten', label: '收紧系数', type: 'range', min: 0.15, max: 0.6, step: 0.01, default: 0.34 },
    { key: 'depth', label: '递归层数', type: 'range', min: 1, max: 5, step: 1, default: 3 },
    { key: 'sides', label: '镜像', type: 'select', default: '2', options: [
      { value: '1', label: '单支' },
      { value: '2', label: '双支镜像' },
      { value: '4', label: '四向' },
    ] },
  ],

  presets: [
    {
      id: 'ivy',
      label: '常春藤',
      elements: {
        bg: { paint: { type: 'solid', color: '#f7f3ea' } },
        stem: { paint: { type: 'solid', color: '#2d5a3d' } },
        scroll: { paint: { type: 'solid', color: '#8b6f3e' } },
        bud: { paint: { type: 'solid', color: '#a63d40' } },
      },
    },
    {
      id: 'midnight',
      label: '午夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#131a24' } },
        stem: { paint: { type: 'solid', color: '#c9a96a' } },
        scroll: { paint: { type: 'solid', color: '#7d8ea3' } },
        bud: { paint: { type: 'solid', color: '#c96f7a' } },
      },
    },
    {
      id: 'terracotta',
      label: '赤陶',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2e4d8' } },
        stem: { paint: { type: 'solid', color: '#a8442a' } },
        scroll: { paint: { type: 'solid', color: '#6b7a4f' } },
        bud: { paint: { type: 'solid', color: '#e0a458' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['stem'], secondary: ['scroll'], accent: ['bud'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(80, Number(params.cell));
    const turns = Math.max(1.2, Math.min(3.5, Number(params.turns)));
    const tighten = Math.max(0.15, Math.min(0.6, Number(params.tighten)));
    const depth = Math.round(Math.max(1, Math.min(5, Number(params.depth))));
    const sides = Number(params.sides) === 1 ? 1 : Number(params.sides) === 4 ? 4 : 2;

    const bg = elements.get('bg')!;
    const stem = elements.get('stem')!;
    const scroll = elements.get('scroll')!;
    const bud = elements.get('bud')!;

    const marks: string[] = [];

    /**
     * 对数螺线涡卷。
     *
     * `r(θ) = r0 · tighten^(θ/2π)` —— 每转一圈半径乘以 `tighten`，
     * 因此收紧是**指数**的，这正是涡卷「越卷越小」的观感来源。
     * 采样 24 段贝塞尔足够，段数再增只是浪费字节。
     */
    const spiral = (
      cx0: number,
      cy0: number,
      r0: number,
      rot: number,
      dir: number,
      stroke: string,
      widthScale: number,
      opacity: number,
    ): { d: string; tipX: number; tipY: number } => {
      const steps = 26;
      let d = '';
      let lastX = cx0;
      let lastY = cy0;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const theta = rot + dir * turns * Math.PI * 2 * t;
        const r = r0 * Math.pow(tighten, t * turns);
        const x = cx0 + r * Math.cos(theta);
        const y = cy0 + r * Math.sin(theta);
        d += `${i === 0 ? 'M' : 'L'}${api.n(x)} ${api.n(y)}`;
        lastX = x;
        lastY = y;
      }
      marks.push(
        path(d, {
          fill: 'none',
          stroke,
          'stroke-width': Math.max(0.7, cell * 0.009 * widthScale),
          'stroke-opacity': opacity,
          'stroke-linecap': 'round',
        }),
      );
      return { d, tipX: lastX, tipY: lastY };
    };

    const unit = cell;
    const cx = unit / 2;
    const cy = unit / 2;
    const baseR = unit * 0.34;

    /**
     * 递归：在涡卷末端再生一个缩小版。
     *
     * 缩放比取 `1 - tighten × 0.5` —— 与收紧系数联动，
     * 参数调到更紧时子涡卷也相对更小，保持整体的螺旋韵律。
     */
    const childScale = 1 - tighten * 0.5;

    const branch = (
      sx: number,
      sy: number,
      r: number,
      rot: number,
      dir: number,
      level: number,
      primary: boolean,
    ): void => {
      const el = primary ? stem : scroll;
      if (!el.visible) return;
      const tip = spiral(sx, sy, r, rot, dir, el.paintValue, level === 0 ? 1 : 0.72, el.opacity);

      if (level < depth - 1) {
        branch(tip.tipX, tip.tipY, r * childScale, rot + dir * 1.5, dir, level + 1, !primary);
      } else if (bud.visible) {
        // 递归末端点一朵花苞
        marks.push(
          path(`M${api.n(tip.tipX)} ${api.n(tip.tipY)} m${api.n(-cell * 0.016)} 0 a${api.n(cell * 0.016)} ${api.n(cell * 0.016)} 0 1 0 ${api.n(cell * 0.032)} 0 a${api.n(cell * 0.016)} ${api.n(cell * 0.016)} 0 1 0 ${api.n(-cell * 0.032)} 0 Z`, {
            fill: bud.paintValue,
            'fill-opacity': bud.opacity,
          }),
        );
      }
    };

    // 主干：自单元中心向左下引出，末端开始递归。
    // 起点高度由 seed 微调（±8%），让卷草的出手位置有细微变化 ——
    // 手工卷草纹的每一次落笔都略有不同。
    const rootJitter = 1 + (rng() - 0.5) * 0.16;
    if (stem.visible) {
      marks.push(
        path(
          `M${api.n(cx + baseR * 0.2)} ${api.n(cy)}` +
            ` Q${api.n(cx - baseR * 0.4)} ${api.n(cy - baseR * 0.3 * rootJitter)}` +
            ` ${api.n(cx - baseR * 0.75)} ${api.n(cy - baseR * 0.1 * rootJitter)}`,
          {
            fill: 'none',
            stroke: stem.paintValue,
            'stroke-width': Math.max(0.9, cell * 0.011),
            'stroke-opacity': stem.opacity,
            'stroke-linecap': 'round',
          },
        ),
      );
    }

    // 各方向的涡卷组：双支镜像 / 四向
    const angles =
      sides === 1
        ? [Math.PI]
        : sides === 4
          ? [Math.PI, 0, -Math.PI / 2, Math.PI / 2]
          : [Math.PI * 0.85, Math.PI * 0.15];

    for (const a of angles) {
      branch(cx, cy, baseR, a, 1, 0, true);
    }

    const tileRef = api.tile({
      key: `nvs-${api.n(cell)}-${api.n(turns)}-${api.n(tighten)}-${depth}-${sides}`,
      w: unit,
      h: unit,
      content: g({}, marks.join('')),
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
