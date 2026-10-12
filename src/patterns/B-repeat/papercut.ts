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
 *
 * 2026-10-12 审美返修：旧版大红底 + 红绿蓝小花、单元 160px 绝对像素 → 密集刺眼。
 * 现在单元按短边缩放（默认约 400px @1440）、团花缩到单元 60%、斜向排布，
 * 默认配色改为暖纸色 + 赭红 / 沙色 / 灰绿；中国红保留为「节庆」预设（红金同色系）。
 */
import { circle, g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'papercut',
  name: '剪纸镂空',
  category: 'B-repeat',
  description: '疏朗的团花剪影斜向排布，多层纯色叠加形成镂空，柔和的民间剪纸装饰感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f1e9de' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer1', label: '第一层', role: 'primary', paint: { type: 'solid', color: '#c97a6a' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer2', label: '第二层', role: 'secondary', paint: { type: 'solid', color: '#e6c9a2' }, opacity: 1, visible: true, configurable: true },
    { id: 'layer3', label: '第三层', role: 'accent', paint: { type: 'solid', color: '#8a9a82' }, opacity: 1, visible: true, configurable: true },
    { id: 'accent', label: '点缀', role: 'detail', paint: { type: 'solid', color: '#b5655a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    // 纹样大小 = 团花间距（以 1080 短边为基准的设计像素，按短边等比缩放）
    { key: 'scale', label: '纹样大小', type: 'range', min: 140, max: 520, step: 10, default: 300, heavy: true },
    { key: 'layers', label: '叠加层数', type: 'range', min: 2, max: 4, step: 1, default: 3 },
    { key: 'holes', label: '镂空密度', type: 'range', min: 0, max: 8, step: 1, default: 6 },
    { key: 'round', label: '圆润度', type: 'range', min: 0, max: 1, step: 0.01, default: 0.6 },
  ],

  presets: [
    {
      // 保留一套中国红：红底 + 金/米色，去掉旧版红绿蓝硬撞
      id: 'festive',
      label: '节庆',
      elements: {
        bg: { paint: { type: 'solid', color: '#a83a32' } },
        layer1: { paint: { type: 'solid', color: '#e8cf9e' } },
        layer2: { paint: { type: 'solid', color: '#c4553f' } },
        layer3: { paint: { type: 'solid', color: '#f3e5c6' } },
        accent: { paint: { type: 'solid', color: '#e8cf9e' } },
      },
    },
    {
      id: 'snow',
      label: '素雪',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4e8ed' } },
        layer1: { paint: { type: 'solid', color: '#f8f9fb' } },
        layer2: { paint: { type: 'solid', color: '#a9b4c2' } },
        layer3: { paint: { type: 'solid', color: '#5f6e80' } },
        accent: { paint: { type: 'solid', color: '#c3ccd7' } },
      },
    },
    {
      id: 'night',
      label: '夜色',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1916' } },
        layer1: { paint: { type: 'solid', color: '#6b3a2b' } },
        layer2: { paint: { type: 'solid', color: '#a8844f' } },
        layer3: { paint: { type: 'solid', color: '#2d2520' } },
        accent: { paint: { type: 'solid', color: '#6b5641' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['layer1'], secondary: ['layer2'], accent: ['layer3'], detail: ['accent'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const scale = Math.max(60, Number(params.scale)) * unit;
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
    // 团花只占单元约 60% 直径 —— 花与花之间留出明显的「纸面」
    const R = scale * 0.3;

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
     * 剪纸主形：团花轮廓 —— petals 片圆润花瓣，瓣与瓣之间是向内的谷点。
     *
     * 每片花瓣是一段二次贝塞尔：起点/终点为相邻两个谷点，控制点在花瓣中轴外侧。
     * 二次曲线顶点 ≈ 控制点与弦中点的中点，因此控制点半径取
     * `2r − 谷半径·cos(半瓣角)`，让瓣尖恰好落在半径 r 上（轮廓尺寸可预测、左右对称）。
     *
     * 圆润度控制谷的深浅：0 → 深谷、花瓣分明（北方剪纸的利落）；1 → 浅谷、近乎圆团（南方窗花）。
     */
    const petalPath = (r: number, petals: number, roundness: number, rot: number): string => {
      const half = Math.PI / petals;
      const innerR = r * (0.5 + roundness * 0.3);
      const ctrlR = 2 * r - innerR * Math.cos(half);
      const base = (Math.PI / 180) * rot;
      const pt = (rr: number, ang: number): string => `${api.n(cx + rr * Math.cos(ang))} ${api.n(cy + rr * Math.sin(ang))}`;
      let d = `M${pt(innerR, base - half)}`;
      for (let i = 0; i < petals; i++) {
        const tip = base + i * 2 * half;
        d += `Q${pt(ctrlR, tip)} ${pt(innerR, tip + half)}`;
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
          circle(hx, hy, scale * 0.028, { fill: bg.paintValue, 'fill-opacity': 1 }),
        );
      }
    }

    // 点缀：花心一粒 + 单元四角（= 相邻团花之间的空隙）各一粒小圆，
    // 四角副本拼起来是一颗完整圆点，用来轻轻填补负空间而不显挤。
    if (accent.visible) {
      const dots = [circle(cx, cy, scale * 0.035)];
      for (const [ox, oy] of [[0, 0], [scale, 0], [0, scale], [scale, scale]]) dots.push(circle(ox, oy, scale * 0.022));
      marks.push(g({ fill: accent.paintValue, 'fill-opacity': accent.opacity }, dots.join('')));
    }

    const tileRef = api.tile({
      key: `pc-${api.n(scale)}-${layers}-${holes}-${api.n(round)}`,
      w: scale,
      h: scale,
      content: g({}, marks.join('')),
      // 旋转 45°：方格阵列变为斜向菱形排布，比横平竖直的点阵更松弛、更像窗花
      transform: 'rotate(45)',
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
