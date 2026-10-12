/**
 * 霓虹像素 —— D 像素 / 复古游戏。
 *
 * 构图要点：暗底上分布若干「像素簇」，每个簇是 2~5 个大小不一的方块，
 * 颜色从 4 组元件中按seeded rng 取，形成街机/赛博的霓虹质感。
 *
 * ⭐ 必须 tile：像素数是唯一的高密度来源，靠 pattern 单元把 DOM 压到常数。
 * 动画为「簇内亮度呼吸」，animate=false 时被stripAnimation 整段剥离。
 */
import { g, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'neon-pixels',
  tones: ['dark'],
  name: '霓虹像素',
  category: 'D-pixel',
  description: '暗底稀疏霓虹像素点缀，三档亮度错落，带可选呼吸闪烁，街机与赛博的质感。',
  seedable: true,
  animatable: true,

  elements: [
    // 2026-10-12 审美复核：原默认品红/青满屏细密格刺眼。现改为深靛底 + 同色系
    // 兰紫 / 薰衣草 + 少量琥珀点缀，像素稀疏、分三档亮度，霓虹感保留为「点缀」。
    // 元件 id 不变（px_a~px_d），仅中文名随默认色更新。
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#100c1f' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_a', label: '像素 · 兰紫', role: 'primary', paint: { type: 'solid', color: '#d7709f' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_b', label: '像素 · 薰衣草', role: 'secondary', paint: { type: 'solid', color: '#9384e8' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_c', label: '像素 · 琥珀', role: 'accent', paint: { type: 'solid', color: '#f0b46a' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_d', label: '像素 · 暗紫', role: 'detail', paint: { type: 'solid', color: '#3d3175' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    // px 以 1080p 短边为基准，渲染时乘 unit = 短边/1080（2560×1440 下 ×1.33）
    { key: 'px', label: '像素大小', type: 'range', min: 8, max: 64, step: 2, default: 22, heavy: true },
    // 默认 4：px_a~px_d 四组像素全部投入使用（px_d 不能成为死元件）。
    { key: 'levels', label: '色阶数', type: 'range', min: 1, max: 4, step: 1, default: 4 },
    { key: 'density', label: '噪点密度', type: 'range', min: 0.02, max: 0.3, step: 0.01, default: 0.06 },
    { key: 'flicker', label: '闪烁动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'synthwave',
      label: '合成波',
      elements: {
        bg: { paint: { type: 'solid', color: '#140a26' } },
        px_a: { paint: { type: 'solid', color: '#e2649c' } },
        px_b: { paint: { type: 'solid', color: '#a184f0' } },
        px_c: { paint: { type: 'solid', color: '#f6bd73' } },
        px_d: { paint: { type: 'solid', color: '#45307e' } },
      },
    },
    {
      id: 'arcade',
      label: '街机',
      elements: {
        bg: { paint: { type: 'solid', color: '#14161f' } },
        px_a: { paint: { type: 'solid', color: '#e07a5f' } },
        px_b: { paint: { type: 'solid', color: '#81b29a' } },
        px_c: { paint: { type: 'solid', color: '#f2cc8f' } },
        px_d: { paint: { type: 'solid', color: '#3d405b' } },
      },
      params: { density: 0.08 },
    },
    {
      id: 'ice',
      label: '冰蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#081624' } },
        px_a: { paint: { type: 'solid', color: '#7cc4e8' } },
        px_b: { paint: { type: 'solid', color: '#d6ecf7' } },
        px_c: { paint: { type: 'solid', color: '#4f9fd1' } },
        px_d: { paint: { type: 'solid', color: '#1f3d5c' } },
      },
      params: { density: 0.045 },
    },
    {
      id: 'dawn',
      label: '晨雾',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3eef6' } },
        px_a: { paint: { type: 'solid', color: '#c98bb9' } },
        px_b: { paint: { type: 'solid', color: '#9d95d6' } },
        px_c: { paint: { type: 'solid', color: '#e8a76a' } },
        px_d: { paint: { type: 'solid', color: '#ddd3ea' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['px_a'], secondary: ['px_b'], accent: ['px_c'], detail: ['px_d'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const px = Math.max(2, Math.round(Number(params.px) * unit));
    const levels = Math.max(1, Math.min(4, Math.round(Number(params.levels))));
    const density = Number(params.density);
    const flicker = params.flicker === true;

    const bg = elements.get('bg')!;
    const pool = [elements.get('px_a')!, elements.get('px_b')!, elements.get('px_c')!, elements.get('px_d')!].slice(0, levels);
    /**
     * 采样权重：琥珀（px_c）是点缀色，只占小份额；暗紫（px_d）是衬底的「暗像素」，
     * 份额最大 —— 亮像素少而精，画面才安静。
     */
    const weights = [0.28, 0.28, 0.1, 0.34].slice(0, levels);
    const wSum = weights.reduce((a, b) => a + b, 0);
    const pick = (): number => {
      let r = rng() * wSum;
      for (let i = 0; i < weights.length; i++) {
        r -= weights[i];
        if (r <= 0) return i;
      }
      return weights.length - 1;
    };

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    /**
     * 平铺单元 = 20×20 个像素格（原 4×4 太小，重复节奏一眼可见）。
     * 大单元 + 低密度 = 稀疏的「星点」分布，而非满屏噪点。
     */
    const cells = 20;
    const tileSize = px * cells;
    const occupied = new Set<number>();
    const marks: string[] = [];

    /** 三档亮度：大部分像素偏暗，只有少数满亮 —— 霓虹是点缀不是主体。 */
    const tierOpacity = (): number => {
      const r = rng();
      return r < 0.2 ? 1 : r < 0.55 ? 0.6 : 0.32;
    };

    const place = (idx: number, e: (typeof pool)[number]): void => {
      if (occupied.has(idx)) return;
      occupied.add(idx);
      if (!e || !e.visible) return;
      const cx = idx % cells;
      const cy = Math.floor(idx / cells);
      // 2×2 大像素只允许落在不跨单元边界的位置（否则被 pattern 裁成残块）
      const big = cx < cells - 1 && cy < cells - 1 && rng() > 0.82;
      const size = px * (big ? 2 : 1);
      marks.push(
        rect(cx * px, cy * px, size, size, { fill: e.paintValue, 'fill-opacity': e.opacity * tierOpacity() }),
      );
    };

    /**
     * 每组色**强制至少出现一次**（落点由 rng 决定，避免固定在角上排成一行），
     * 其余格再按密度随机 —— 保证任何 configurable 元件都不会成为死元件。
     */
    for (let i = 0; i < pool.length; i++) {
      let idx = Math.floor(rng() * cells * cells);
      while (occupied.has(idx)) idx = (idx + 7) % (cells * cells);
      place(idx, pool[i]);
    }
    for (let idx = 0; idx < cells * cells; idx++) {
      if (rng() > density) continue;
      place(idx, pool[pick()]);
    }

    const content = g({}, marks.join(''));

    // 动画挂在单元内容的包裹 <g> 上：平铺后每个单元各自呼吸。
    // animate=false 时引擎整段剥离 animation 声明，产物因此仍字节级可复现。
    const animated =
      animate && flicker
        ? `<g style="animation:${api.keyframes('vw-neon', 'from{opacity:0.55}to{opacity:1}')} 2.4s ease-in-out infinite alternate">${content}</g>`
        : content;

    const tileRef = api.tile({
      key: `np-${api.n(tileSize)}-${api.n(density)}-${api.n(levels)}-${px}-${animated === content ? 0 : 1}`,
      w: tileSize,
      h: tileSize,
      content: animated,
    });
    parts.push(rect(0, 0, W, H, { fill: tileRef }));
    return { body: parts.join('') };
  },
};

export default def;