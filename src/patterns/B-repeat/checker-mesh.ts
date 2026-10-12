/**
 * 棋盘格 —— B 波点 / 网格重复。
 *
 * 构图要点：经典棋盘二染色 + 可选的网格线（mesh）。
 * 棋盘的「咬合」由2×2 单元实现：单元内 4 格按 A/B/A/B 交错，
 * 平铺后自然形成连续的棋盘，而不是每 2 格重来一遍的条纹。
 *
 * ⭐ 色值可达性：A、B 各在每��单元内出现 2 次，mesh 恒在，
 * 因此三个元件的改色命中率恒为 100%。
 *
 * ⭐ seed 的作用：棋盘是规则几何，**不能**靠随机它来变。
 * 种子做两件都不会破坏几何的事：(1) 决定 A/B 的相位（哪个是起点），
 * (2) 给每格加 seeded 微缩进。两者叠加保证任意两个 seed 产物都不相同。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'checker-mesh',
  name: '棋盘格',
  category: 'B-repeat',
  description: '二染色棋盘格，可叠加细网格线，克制而有秩序感。',
  seedable: true,
  animatable: false,

  elements: [
    // 2026-10-12 审美复核：原默认纯黑白 64px 小棋盘在 2560 宽下产生强烈视觉震动。
    // 改为同色系低对比双色（燕麦 / 亚麻），格子放大，网格线退为极淡的分隔。
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#e6dfd3' }, opacity: 1, visible: true, configurable: true },
    { id: 'cell_a', label: '格 · A', role: 'primary', paint: { type: 'solid', color: '#efe9df' }, opacity: 1, visible: true, configurable: true },
    { id: 'cell_b', label: '格 · B', role: 'secondary', paint: { type: 'solid', color: '#ddd4c5' }, opacity: 1, visible: true, configurable: true },
    { id: 'mesh', label: '网格线', role: 'detail', paint: { type: 'solid', color: '#b9ad99' }, opacity: 0.35, visible: true, configurable: true },
  ],

  controls: [
    // size / meshW 以 1080p 短边为基准，渲染时乘 unit = 短边/1080（2560×1440 下 ×1.33）
    { key: 'size', label: '格边长', type: 'range', min: 24, max: 320, step: 2, default: 132, heavy: true },
    { key: 'grout', label: '留缝', type: 'range', min: 0, max: 0.42, step: 0.01, default: 0.04 },
    { key: 'meshW', label: '网格线宽', type: 'range', min: 0, max: 5, step: 0.1, default: 1, unit: 'px' },
    { key: 'mesh', label: '显示网格线', type: 'toggle', default: true },
  ],

  presets: [
    {
      // 保留 id；不再是纯黑白高对比，而是炭灰双色的「暗色版」
      id: 'noir',
      label: '炭灰',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1e21' } },
        cell_a: { paint: { type: 'solid', color: '#2a2b2f' } },
        cell_b: { paint: { type: 'solid', color: '#222326' } },
        mesh: { paint: { type: 'solid', color: '#4a4c52' }, opacity: 0.4 },
      },
    },
    {
      id: 'sherbet',
      label: '汽水',
      elements: {
        bg: { paint: { type: 'solid', color: '#f8ece3' } },
        cell_a: { paint: { type: 'solid', color: '#f6d9c6' } },
        cell_b: { paint: { type: 'solid', color: '#f3e6da' } },
        mesh: { paint: { type: 'solid', color: '#d9a98a' }, opacity: 0.3 },
      },
    },
    {
      id: 'terminal',
      label: '墨绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#11251f' } },
        cell_a: { paint: { type: 'solid', color: '#1a352c' } },
        cell_b: { paint: { type: 'solid', color: '#142c25' } },
        mesh: { paint: { type: 'solid', color: '#3f6b5a' }, opacity: 0.45 },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['cell_a'], secondary: ['cell_b'], detail: ['mesh'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    // 尺寸以 1080p 短边为基准：取短边而非宽边，竖屏到带鱼屏都保持同样的观感密度
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const s = Math.max(6, Number(params.size) * unit);
    const grout = Math.max(0, Math.min(0.42, Number(params.grout)));
    const meshW = Math.max(0, Number(params.meshW) * unit);
 const showMesh = params.mesh === true;

    const bg = elements.get('bg')!;
    const cellA = elements.get('cell_a')!;
    const cellB = elements.get('cell_b')!;
    const mesh = elements.get('mesh')!;

    // 相位：决定单元内哪个格子是 A。两种相位构成不同的棋盘。
    const phaseA = rng() < 0.5 ? 0 : 1;
    // 每格 seeded 微缩进（连续量）—— 与相位叠加后碰撞概率可忽略。
    const jitter = rng() * s * 0.04; // 0.12 → 0.04：大格下 12% 的缩进会露出过宽的底色缝

    const tileW = s * 2;
    const tileH = s * 2;
    // 留缝后的实际格边长：grout 上限 0.42 保证格子**永远可见**，
 // 否则「A/B 相位」这一 seed 来源会在极端参数下失效。
    const inner = s * (1 - grout) - jitter;
 const off = (s - inner) / 2;

    const marks: string[] = [];
    for (let gy = 0; gy < 2; gy++) {
      for (let gx = 0; gx < 2; gx++) {
    const e = (gx + gy + phaseA) % 2 === 0 ? cellA : cellB;
        if (!e.visible || inner <= 0) continue;
  marks.push(
  rect(gx * s + off, gy * s + off, inner, inner, { fill: e.paintValue, 'fill-opacity': e.opacity }),
      );
      }
    }

    // 网格线：画在单元边界上，平铺后连成连续网格。
    // 用 fill 的细长矩形而非 stroke：省字节，且与 crispEdges 无关。
    if (showMesh && meshW > 0 && mesh.visible) {
      const t = Math.min(meshW, s * 0.4);
      /**
       * 网格线必须**完整落在tile 内**，且彼此等距。
       *
       * ⚠️ 踩过的坑：早先写成 `rect(i * s - t / 2, 0, t, tileH)`，在 i=0 时
       * x = -t/2 落在 tile 之外 → 被 pattern 裁掉一半，而相邻 tile 的
       * `i=2` 那条又完整，于是每 2 格出现一条「双倍深」的线，
       * 整体看上去是疏密不一的横向黑带（实测可见）。
       *
       * 正确做法：三个位置全部落在 tile 内 —— 起点 0、中间 s、末端 tileW - t。
       * 平铺时本 tile 的末端与右邻 tile 的起点相接，拼成一条等宽的完整线。
       */
      for (const gx of [0, s, tileW - t]) {
        marks.push(rect(gx, 0, t, tileH, { fill: mesh.paintValue, 'fill-opacity': mesh.opacity }));
      }
      for (const gy of [0, s, tileH - t]) {
        marks.push(rect(0, gy, tileW, t, { fill: mesh.paintValue, 'fill-opacity': mesh.opacity }));
      }
    }

    const tileRef = api.tile({
      key: `cm-${api.n(s)}-${api.n(grout)}-${api.n(meshW)}-${showMesh ? 1 : 0}`,
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
