/**
 * 剪纸镂空 —— B 波点 / 网格重复。
 *
 * 构图要点：多层纯色剪影叠加，靠**遮挡关系**制造镂空感 ——
 * 后一层盖住前一层露出的部分，视觉上就是「一张纸被剪掉若干块」。
 * 真正的剪纸是「一张纸减掉若干块」，但 SVG 的 `fill-rule="evenodd"`
 * 只能处理单条路径的自交，做不出任意形状的布尔减。
 * 因此这里用**层叠遮挡**逼近：每层是一个实心大形 + 若干被下层"挖出"的洞，
 * 通过把下层的形状往上叠来"擦除"上一层。
 *
 * ⭐ 元件全部为纯色（剪纸本质就是色纸），满足「纯色占比 ≥50%」硬指标。
 */
import { circle, g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'papercut',
  name: '剪纸镂空',
  category: 'B-repeat',
  description: '多层纯色剪影叠加，靠遮挡关系形成镂空，民间剪纸的平面装饰感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#b91c1c' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer1', label: '第一层', role: 'primary', paint: { type: 'solid', color: '#fde68a' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer2', label: '第二层', role: 'secondary', paint: { type: 'solid', color: '#15803d' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer3', label: '第三层', role: 'accent', paint: { type: 'solid', color: '#1e3a8a' }, opacity: 1, visible: true, configurable: true },
    { id: 'accent', label: '点缀', role: 'detail', paint: { type: 'solid', color: '#fdf4e3' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'scale', label: '纹样大小', type: 'range', min: 60, max: 300, step: 10, default: 160, heavy: true },
    { key: 'layers', label: '叠加层数', type: 'range', min: 2, max: 4, step: 1, default: 3 },
    { key: 'holes', label: '镂空密度', type: 'range', min: 0, max: 8, step: 1, default: 4 },
    { key: 'round', label: '圆润度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.55 },
  ],

  presets: [
    {
      id: 'festive',
      label: '节庆',
      elements: {
        bg: { paint: { type: 'solid', color: '#b91c1c' } },
        layer1: { paint: { type: 'solid', color: '#fde68a' } },
        layer2: { paint: { type: 'solid', color: '#15803d' } },
        layer3: { paint: { type: 'solid', color: '#1e3a8a' } },
        accent: { paint: { type: 'solid', color: '#fdf4e3' } },
      },
    },
    {
      id: 'snow',
      label: '素雪',
      elements: {
        bg: { paint: { type: 'solid', color: '#e2e8f0' } },
        layer1: { paint: { type: 'solid', color: '#ffffff' } },
        layer2: { paint: { type: 'solid', color: '#94a3b8' } },
        layer3: { paint: { type: 'solid', color: '#475569' } },
        accent: { paint: { type: 'solid', color: '#0f172a' } },
      },
    },
    {
      id: 'night',
      label: '夜色',
      elements: {
        bg: { paint: { type: 'solid', color: '#0c0a09' } },
        layer1: { paint: { type: 'solid', color: '#7c2d12' } },
        layer2: { paint: { type: 'solid', color: '#a16207' } },
        layer3: { paint: { type: 'solid', color: '#1c1917' } },
        accent: { paint: { type: 'solid', color: '#fafaf9' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['layer1'], secondary: ['layer2'], accent: ['layer3'], detail: ['accent'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const scale = Math.max(60, Number(params.scale));
    const layers = Math.round(Math.max(2, Math.min(4, Number(params.layers))));
    const holes = Math.round(Math.max(0, Math.min(8, Number(params.holes))));
    const round = Math.max(0, Math.min(1, Number(params.round)));

    const bg = elements.get('bg')!;
    const stack = [
      elements.get('layer1')!,
      elements.get('layer2')!,
      elements.get('layer3')!,
    ].slice(0, layers);
    const accent = elements.get('accent')!;

    const cx = scale / 2;
    const cy = scale / 2;
    const R = scale * 0.42;

    /**
     * 随机量必须在进入平铺前抽完。
     *
     * ⚠️ 若在 tile 的 content 回调里调`rng()`，每次渲染结果都会变化，
     * 且无法保证「同 seed 同结果」—— 它会被 defs 的内容去重放大成
     * 整片重复单元的随机漂移。这里统一先抽成常量。
     */
    const rotJitter = rng() * 12;

    const marks: string[] = [];

    /**
     * 剪纸主形：外缘为圆角化的花瓣轮廓。
     *
     * 圆润度参数在「正多边形尖角」与「正圆」之间插值——
     * 剪纸的两端形态都成立：北方剪纸偏尖（角状），
     * 南方窗花偏圆（团花）。
     */
    const petalPath = (r: number, petals: number, roundness: number, rot: number): string => {
      const steps = petals * 2;
      const innerR = r * (0.45 + (1 - roundness) * 0.4);
      let d = '';
      for (let i = 0; i < steps; i++) {
        const rr = i % 2 === 0 ? r : innerR;
        const ang = (Math.PI / 180) * ((360 / steps) * i + rot);
        const px = cx + rr * Math.cos(ang);
        const py = cy + rr * Math.sin(ang);
        if (i === 0) d += `M${api.n(px)} ${api.n(py)}`;
        else {
          // 用二次贝塞尔把角「磨圆」：控制点取当前与下一点的中点抬高
          const angNext = (Math.PI / 180) * ((360 / steps) * (i + 1) + rot);
          const nx = cx + rr * Math.cos(angNext);
          const ny = cy + rr * Math.sin(angNext);
          const mx = (px + nx) / 2;
          const my = (py + ny) / 2;
          const lift = roundness * 0.28;
          d += `Q${api.n(mx + (mx - cx) * lift * 0.18)} ${api.n(my + (my - cy) * lift * 0.18)} ${api.n(nx)} ${api.n(ny)}`;
        }
      }
      return `${d}Z`;
    };

    // 三层由外向内缩放叠加：外层在下，层层收紧，形成「花心」的层次
    for (let li = 0; li < stack.length; li++) {
      const e = stack[li];
      if (!e.visible) continue;
      const r = R * (1 - li * 0.26);
      // 每层旋转不同角度，避免各层轮廓重合 —— 这是剪纸「错落」感的来源
      const rot = li * 24 + rotJitter;
      marks.push(
        path(petalPath(r, 6 + li * 2, round, rot), {
          fill: e.paintValue,
          'fill-opacity': e.opacity,
        }),
      );
    }

    // 镂空孔洞：同心环上的小圆。用底色画圆 = 在上层剪影上「挖洞」，
    // 这是层叠逼近布尔减的核心技巧。
    if (holes > 0 && bg.visible) {
      const ringR = R * 0.62;
      for (let i = 0; i < holes; i++) {
        const ang = (Math.PI * 2 * i) / holes + 0.4;
        const hx = cx + ringR * Math.cos(ang);
        const hy = cy + ringR * Math.sin(ang);
        marks.push(
          circle(hx, hy, scale * 0.045, { fill: bg.paintValue, 'fill-opacity': 1 }),
        );
      }
    }

    // 中心点缀
    if (accent.visible) {
      marks.push(circle(cx, cy, scale * 0.05, { fill: accent.paintValue, 'fill-opacity': accent.opacity }));
    }

    const tileRef = api.tile({
      key: `pc-${api.n(scale)}-${layers}-${holes}-${api.n(round)}`,
      w: scale,
      h: scale,
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
