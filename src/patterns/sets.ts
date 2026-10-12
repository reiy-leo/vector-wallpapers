/**
 * 预置合集（PRD Q7 决策：预置 6–8 套固定合集）。
 *
 * 每套合集 = 一组**完整可渲染**的 PatternConfig，点击即整套应用。
 * 合集的价值在于「一次点击得到一个有整体调性的成品」，
 * 因此这里的 colors 必须成套给出，不能依赖用户逐个调元件。
 *
 * 铁律：只允许引用已实现的 pattern id；引用不存在的 id 会在测试中失败。
 */
import { LIMITS } from '../shared/constants';
import type { PaintSpec, ParamValue } from './types';

/** 合集定义 —— 刻意保持最小：够表达「一套配色」即可，不复制整份 PatternConfig。 */
export interface CuratedSet {
  id: string;
  label: string;
  description: string;
  /** 供 UI 分组展示（如「办公 / 娱乐」）。 */
  group: string;
  /** 合集内的壁纸，每项都是一份完整配方。 */
  items: SetItem[];
}

export interface SetItem {
  patternId: string;
  seed: number;
  params?: Record<string, ParamValue>;
  /** 按 element id 给出配色；未列出的元件沿用 PatternDef 默认。 */
  colors: Record<string, PaintSpec>;
}

/**
 * 8 套合集。每套 3 张，覆盖不同使用场景（办公 / 开发 / 娱乐 / 卧室 / 旅行 / 情绪）。
 */
export const CURATED_SETS: readonly CuratedSet[] = [
  {
    id: 'calm-office',
    label: '冷静办公',
    description: '低饱和、高留白，长时间盯着不累',
    group: '办公',
    items: [
      {
        patternId: 'polka-dots',
        seed: 21,
        params: { density: 14, sizeL: 10 },
        colors: {
          bg: { type: 'solid', color: '#f7f5f0' },
          dot_l: { type: 'solid', color: '#334155' },
          dot_m: { type: 'solid', color: '#94a3b8' },
          dot_s: { type: 'solid', color: '#cbd5e1' },
        },
      },
      {
        patternId: 'offset-grid',
        seed: 8,
        params: { cell: 72, blocks: 2 },
        colors: {
          bg: { type: 'solid', color: '#faf9f6' },
          line_v: { type: 'solid', color: '#475569' },
          line_h: { type: 'solid', color: '#cbd5e1' },
          block: { type: 'solid', color: '#0f766e' },
        },
      },
      {
        patternId: 'flow-lines',
        seed: 55,
        params: { density: 18, amplitude: 0.07, weight: 1 },
        colors: {
          bg: { type: 'solid', color: '#f8fafc' },
          line_far: { type: 'solid', color: '#cbd5e1' },
          line_mid: { type: 'solid', color: '#94a3b8' },
          line_near: { type: 'solid', color: '#475569' },
        },
      },
    ],
  },
  {
    id: 'dark-dev',
    label: '暗黑开发',
    description: '深底 + 冷色高亮，适合 IDE 暗色主题',
    group: '开发',
    items: [
      {
        patternId: 'aurora-wave',
        seed: 3,
        params: { bands: 3, stars: 10 },
        colors: {
          sky: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#020617' },
              { offset: 1, color: '#1e293b' },
            ],
          },
          band_a: { type: 'solid', color: '#22d3ee' },
          band_b: { type: 'solid', color: '#818cf8' },
          stars: { type: 'solid', color: '#e2e8f0' },
        },
      },
      {
        patternId: 'hex-grid',
        seed: 19,
        params: { size: 28, ratio: 0.25 },
        colors: {
          bg: { type: 'solid', color: '#0a0e14' },
          line: { type: 'solid', color: '#1e293b' },
          fill: { type: 'solid', color: '#0d9488' },
          dot: { type: 'solid', color: '#5eead4' },
        },
      },
      {
        patternId: 'diamond-lattice',
        seed: 77,
        params: { cell: 56 },
        colors: {
          bg: { type: 'solid', color: '#0a0a0f' },
          dia_a: { type: 'solid', color: '#1e293b' },
          dia_b: { type: 'solid', color: '#7c3aed' },
          grid: { type: 'solid', color: '#a78bfa' },
        },
      },
    ],
  },
  {
    id: 'game-arcade',
    label: '童年游戏厅',
    description: '像素与霓虹，8-bit 记忆点',
    group: '娱乐',
    items: [
      {
        patternId: 'neon-pixels',
        seed: 128,
        params: { px: 16, density: 0.4, levels: 4 },
        colors: {
          bg: { type: 'solid', color: '#0a0612' },
          px_a: { type: 'solid', color: '#ff2d95' },
          px_b: { type: 'solid', color: '#00f0ff' },
          px_c: { type: 'solid', color: '#ffb800' },
          px_d: { type: 'solid', color: '#8b5cf6' },
        },
      },
      {
        patternId: 'memphis-grid',
        seed: 256,
        params: { gridN: 7, extra: 3 },
        colors: {
          bg: { type: 'solid', color: '#fff8e7' },
          wave: { type: 'solid', color: '#00b4d8' },
          zigzag: { type: 'solid', color: '#f15bb5' },
          dot: { type: 'solid', color: '#fee440' },
          tri: { type: 'solid', color: '#00c2a8' },
          block: { type: 'solid', color: '#6a4c93' },
        },
      },
      {
        patternId: 'new-wave-sunset',
        seed: 512,
        params: { stripes: 11, sunY: 0.46 },
        colors: {
          sky: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#1e1b4b' },
              { offset: 1, color: '#f472b6' },
            ],
          },
          sun: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fde047' }, { offset: 1, color: '#fb7185' }] },
          horizon: { type: 'solid', color: '#4c1d95' },
          silhouette: { type: 'solid', color: '#2e1065' },
          glare: { type: 'solid', color: '#f0abfc' },
        },
      },
    ],
  },
  {
    id: 'soft-bedroom',
    label: '柔光卧室',
    description: '暖调低对比，睡前不刺眼',
    group: '居家',
    items: [
      {
        patternId: 'liquid-mesh',
        seed: 404,
        params: { blobs: 3, warp: 0.2, grain: 8 },
        colors: {
          bg: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#3f2b1d' }, { offset: 1, color: '#1a1410' }] },
          blob_a: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fcd9b6' }, { offset: 1, color: '#d9a066' }] },
          blob_b: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#e8c4a0' }, { offset: 1, color: '#8b6f52' }] },
          blob_c: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#f5e0d0' }, { offset: 1, color: '#a1806a' }] },
        },
      },
      {
        patternId: 'dusk-ridges',
        seed: 99,
        params: { layers: 3, ridgeH: 0.18, sunY: 0.68 },
        colors: {
          sky: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#2d2a4a' },
              { offset: 0.6, color: '#8a6f8c' },
              { offset: 1, color: '#e8b4a0' },
            ],
          },
          sun: { type: 'solid', color: '#ffe0c2' },
          ridge_far: { type: 'solid', color: '#6b5b73' },
          ridge_mid: { type: 'solid', color: '#4a4055' },
          ridge_near: { type: 'solid', color: '#2f2a3d' },
          fore: { type: 'solid', color: '#1d1a26' },
        },
      },
      {
        patternId: 'polka-dots',
        seed: 66,
        params: { density: 10, sizeL: 8 },
        colors: {
          bg: { type: 'solid', color: '#fdf6ec' },
          dot_l: { type: 'solid', color: '#a89a8c' },
          dot_m: { type: 'solid', color: '#c9b8a8' },
          dot_s: { type: 'solid', color: '#e3d5c6' },
        },
      },
    ],
  },
  {
    id: 'polar-dawn',
    label: '极地清晨',
    description: '冷白与冰蓝，日光初醒的通透感',
    group: '自然',
    items: [
      {
        patternId: 'dusk-ridges',
        seed: 7,
        params: { layers: 5, ridgeH: 0.3, rough: 0.7 },
        colors: {
          sky: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#0c4a6e' },
              { offset: 0.55, color: '#7dd3fc' },
              { offset: 1, color: '#fef3c7' },
            ],
          },
          sun: { type: 'solid', color: '#fffbeb' },
          ridge_far: { type: 'solid', color: '#a5c4d4' },
          ridge_mid: { type: 'solid', color: '#6b8fa3' },
          ridge_near: { type: 'solid', color: '#3c5a6b' },
          fore: { type: 'solid', color: '#1e3444' },
        },
      },
      {
        patternId: 'aurora-wave',
        seed: 2024,
        params: { bands: 4, amp: 0.13 },
        colors: {
          sky: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#010409' }, { offset: 1, color: '#0f172a' }] },
          band_a: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#a7f3d0' }, { offset: 1, color: '#22d3ee' }] },
          band_b: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#bae6fd' }, { offset: 1, color: '#38bdf8' }] },
          stars: { type: 'solid', color: '#f8fafc' },
        },
      },
      {
        patternId: 'liquid-mesh',
        seed: 111,
        params: { blobs: 3, warp: 0.45 },
        colors: {
          bg: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#082f49' }, { offset: 1, color: '#020617' }] },
          blob_a: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#7dd3fc' }, { offset: 1, color: '#0369a1' }] },
          blob_b: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#cffafe' }, { offset: 1, color: '#0e7490' }] },
          blob_c: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#e0f2fe' }, { offset: 1, color: '#155e75' }] },
        },
      },
    ],
  },
  {
    id: 'sunset-road',
    label: '落日公路',
    description: '暖橙与深紫，永远的公路片',
    group: '自然',
    items: [
      {
        patternId: 'new-wave-sunset',
        seed: 1984,
        params: { stripes: 14, sunR: 0.24, horizonH: 0.7 },
        colors: {
          sky: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#1a1033' },
              { offset: 0.45, color: '#c026d3' },
              { offset: 1, color: '#fbbf24' },
            ],
          },
          sun: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fde047' }, { offset: 1, color: '#f97316' }] },
          horizon: { type: 'solid', color: '#4c1d95' },
          silhouette: { type: 'solid', color: '#1e0b3a' },
          glare: { type: 'solid', color: '#fda4af' },
        },
      },
      {
        patternId: 'dusk-ridges',
        seed: 84,
        params: { layers: 4, ridgeH: 0.26 },
        colors: {
          sky: {
            type: 'linear',
            angle: 90,
            stops: [
              { offset: 0, color: '#1e1b4b' },
              { offset: 0.45, color: '#be185d' },
              { offset: 1, color: '#fb923c' },
            ],
          },
          sun: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fff7ae' }, { offset: 1, color: '#f97316' }] },
          ridge_far: { type: 'solid', color: '#7c2d5e' },
          ridge_mid: { type: 'solid', color: '#4c1d74' },
          ridge_near: { type: 'solid', color: '#241142' },
          fore: { type: 'solid', color: '#0d0620' },
        },
      },
      {
        patternId: 'liquid-mesh',
        seed: 66,
        params: { blobs: 4, warp: 0.3 },
        colors: {
          bg: { type: 'linear', angle: 135, stops: [{ offset: 0, color: '#3f0d12' }, { offset: 1, color: '#0c0a09' }] },
          blob_a: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fb923c' }, { offset: 1, color: '#dc2626' }] },
          blob_b: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#facc15' }, { offset: 1, color: '#ea580c' }] },
          blob_c: { type: 'radial', cx: 0.5, cy: 0.5, r: 0.5, stops: [{ offset: 0, color: '#fda4af' }, { offset: 1, color: '#9f1239' }] },
        },
      },
    ],
  },
  {
    id: 'morandi',
    label: '莫兰迪',
    description: '灰调低饱和，安静而不 boring',
    group: '情绪',
    items: [
      {
        patternId: 'bauhaus-blocks',
        seed: 300,
        params: { cell: 160, radius: 0.5, outlined: true },
        colors: {
          bg: { type: 'solid', color: '#e8e2dc' },
          shape_a: { type: 'solid', color: '#a4918c' },
          shape_b: { type: 'solid', color: '#8d9a8f' },
          shape_c: { type: 'solid', color: '#b5a899' },
        },
      },
      {
        patternId: 'offset-grid',
        seed: 12,
        params: { cell: 88, weight: 1.2, blocks: 4 },
        colors: {
          bg: { type: 'solid', color: '#f0ece7' },
          line_v: { type: 'solid', color: '#9a9189' },
          line_h: { type: 'solid', color: '#c9c1b9' },
          block: { type: 'solid', color: '#93a5a3' },
        },
      },
      {
        patternId: 'flow-lines',
        seed: 45,
        params: { density: 26, amplitude: 0.1, curvature: 1.1 },
        colors: {
          bg: { type: 'solid', color: '#ece7e1' },
          line_far: { type: 'solid', color: '#cfc5bd' },
          line_mid: { type: 'solid', color: '#a8a094' },
          line_near: { type: 'solid', color: '#7d8b85' },
        },
      },
    ],
  },
  {
    id: 'mono-gray',
    label: '单色高级灰',
    description: '纯灰阶，安全到不会错',
    group: '情绪',
    items: [
      {
        patternId: 'polka-dots',
        seed: 1,
        params: { density: 20, sizeL: 12, sizeM: 6, stagger: true },
        colors: {
          bg: { type: 'solid', color: '#1a1a1a' },
          dot_l: { type: 'solid', color: '#ededed' },
          dot_m: { type: 'solid', color: '#8a8a8a' },
          dot_s: { type: 'solid', color: '#4d4d4d' },
        },
      },
      {
        patternId: 'hex-grid',
        seed: 2,
        params: { size: 40, weight: 1, ratio: 0.4 },
        colors: {
          bg: { type: 'solid', color: '#111111' },
          line: { type: 'solid', color: '#3d3d3d' },
          fill: { type: 'solid', color: '#9e9e9e' },
          dot: { type: 'solid', color: '#e0e0e0' },
        },
      },
      {
        patternId: 'bauhaus-blocks',
        seed: 3,
        params: { cell: 200, radius: 0.42, rotate: 12 },
        colors: {
          bg: { type: 'solid', color: '#e5e5e5' },
          shape_a: { type: 'solid', color: '#1f1f1f' },
          shape_b: { type: 'solid', color: '#6e6e6e' },
          shape_c: { type: 'solid', color: '#adadad' },
        },
      },
    ],
  },
];

/** 合集内壁paper 的标准尺寸 —— 与 PRD P0-4 的桌面预设一致。 */
export const SET_CANVAS = { width: 1920, height: 1080 } as const;

/** 供 UI 断言合集不会撑爆 URL（PRD Q10：Workers URL 上限 16KB，需留余量）。 */
export const MAX_SET_URL_BYTES = LIMITS.MAX_URL_LENGTH;

export function getSet(id: string): CuratedSet | undefined {
  return CURATED_SETS.find((s) => s.id === id);
}