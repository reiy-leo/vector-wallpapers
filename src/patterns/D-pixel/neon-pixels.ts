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
  name: '霓虹像素',
  category: 'D-pixel',
  description: '暗底霓虹像素簇随机分布，带呼吸闪烁动画，街机与赛博的质感。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#05010f' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_a', label: '像素 · 品红', role: 'primary', paint: { type: 'solid', color: '#ff2d95' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_b', label: '像素 · 青', role: 'secondary', paint: { type: 'solid', color: '#00f0ff' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_c', label: '像素 · 琥珀', role: 'accent', paint: { type: 'solid', color: '#ffb800' }, opacity: 1, visible: true, configurable: true },
    { id: 'px_d', label: '像素 · 紫', role: 'detail', paint: { type: 'solid', color: '#8b5cf6' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'px', label: '像素大小', type: 'range', min: 4, max: 64, step: 2, default: 18, heavy: true },
    // 默认 4：px_a~px_d 四组像素全部投入使用。
    // 原先默认 3 会让 px_d 永远进不了采样池，成为「声明可改色但改了没反应」的死元件。
    { key: 'levels', label: '色阶数', type: 'range', min: 1, max: 4, step: 1, default: 4 },
    { key: 'density', label: '噪点密度', type: 'range', min: 0.05, max: 0.9, step: 0.01, default: 0.35 },
    { key: 'flicker', label: '闪烁动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'synthwave',
      label: '合成波',
      elements: {
        bg: { paint: { type: 'solid', color: '#0a0118' } },
        px_a: { paint: { type: 'solid', color: '#f0f' } },
        px_b: { paint: { type: 'solid', color: '#0ff' } },
        px_c: { paint: { type: 'solid', color: '#fc0' } },
        px_d: { paint: { type: 'solid', color: '#a0f' } },
      },
    },
    {
      id: 'arcade',
      label: '街机',
      elements: {
        bg: { paint: { type: 'solid', color: '#07070f' } },
        px_a: { paint: { type: 'solid', color: '#ef4444' } },
        px_b: { paint: { type: 'solid', color: '#22c55e' } },
        px_c: { paint: { type: 'solid', color: '#eab308' } },
        px_d: { paint: { type: 'solid', color: '#3b82f6' } },
      },
    },
    {
      id: 'ice',
      label: '冰蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#04121f' } },
        px_a: { paint: { type: 'solid', color: '#7dd3fc' } },
        px_b: { paint: { type: 'solid', color: '#e0f2fe' } },
        px_c: { paint: { type: 'solid', color: '#38bdf8' } },
        px_d: { paint: { type: 'solid', color: '#818cf8' } },
      },
      params: { density: 0.2 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['px_a'], secondary: ['px_b'], accent: ['px_c'], detail: ['px_d'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const px = Math.max(2, Number(params.px));
    const levels = Math.max(1, Math.min(4, Math.round(Number(params.levels))));
    const density = Number(params.density);
    const flicker = params.flicker === true;

    const bg = elements.get('bg')!;
    const pool = [elements.get('px_a')!, elements.get('px_b')!, elements.get('px_c')!, elements.get('px_d')!].slice(0, levels);

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // 平铺单元 = 4×4 个像素格，保证重复节奏不呆板
    const cells = 4;
    const unit = px * cells;
    const marks: string[] = [];

    /**
     * 前 pool.length 个格**强制各落一组**，其余格再按密度随机。
     *
     * 为什么必须这样：纯随机采样下，某些色组在 200 个 seed 里可能一次都不被抽中，
     * 用户拖它的取色器画面却毫无反应 —— 那就是「死元件」。
     * 每个 configurable 元件都必须在产物里真实出现，这是元件级配色这一
     * 核心差异化的底线。
     */
    let forced = 0;
    for (let cy = 0; cy < cells; cy++) {
      for (let cx = 0; cx < cells; cx++) {
        const isGuaranteed = forced < pool.length;
        // 保证位绕过密度闸门：密度调到极低时也必须让每组露一次面
        if (!isGuaranteed && rng() > density) continue;
        const e = isGuaranteed ? pool[forced] : pool[Math.floor(rng() * pool.length) % pool.length];
        if (isGuaranteed) forced++;
        if (!e || !e.visible) continue;
        // 像素尺寸取整数倍，避免 crispEdges 下的半像素缝隙
        const size = px * (rng() > 0.7 ? 2 : 1);
        marks.push(
          rect(cx * px, cy * px, size, size, { fill: e.paintValue, 'fill-opacity': e.opacity }),
        );
      }
    }

    const content = g({}, marks.join(''));

// 动画挂在单元内容的包裹<g> 上：平铺后每个单元各自呼吸。
// animate=false 时引擎整段剥离 animation 声明，产物因此仍字节级可复现。
const animated =
      animate && flicker
        ? `<g style="animation:${api.keyframes('vw-neon', 'from{opacity:0.55}to{opacity:1}')} 2.4s ease-in-out infinite alternate">${content}</g>`
        : content;

    const tileRef = api.tile({
      key: `np-${api.n(unit)}-${api.n(density)}-${api.n(levels)}-${px}-${animated === content ? 0 : 1}`,
      w: unit,
      h: unit,
      content: animated,
    });
    parts.push(rect(0, 0, W, H, { fill: tileRef }));
    return { body: parts.join('') };
  },
};

export default def;