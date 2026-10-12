import type { PatternDef, PatternId } from './types';

export interface PatternRegistry {
  register(defs: PatternDef[]): void;
  get(id: string): PatternDef | undefined;
  list(): PatternDef[];
  listByCategory(c: PatternDef['category']): PatternDef[];
  /** 按 name / id / description 模糊匹配（PRD 搜索框）。 */
  search(q: string): PatternDef[];
  /** 首个可用 pattern —— 未知 `p` 的兜底目标，保证不白屏。 */
  first(): PatternDef | undefined;
  readonly size: number;
}

/**
 * 创建 registry。
 *
 * 注册时立刻校验 id 唯一性：重复 id 会让分享链接指向错误图案，
 * 属于「上线即不可修」的错误，必须在开发期就炸掉。
 */
export function createRegistry(): PatternRegistry {
  const map = new Map<string, PatternDef>();

  return {
    register(defs: PatternDef[]): void {
      for (const def of defs) {
        const existing = map.get(def.id);
        if (existing && existing !== def) {
          throw new Error(`[registry] pattern id 重复：${def.id}`);
        }
        map.set(def.id, def);
      }
    },

    get(id: string): PatternDef | undefined {
      return map.get(id);
    },

    list(): PatternDef[] {
      // 固定顺序 = 注册顺序，避免 Map 迭代顺序在构建工具变动时漂移
      return Array.from(map.values());
    },

    listByCategory(c: PatternDef['category']): PatternDef[] {
      return this.list().filter((d) => d.category === c);
    },

    search(q: string): PatternDef[] {
      const needle = q.trim().toLowerCase();
      if (needle === '') return this.list();
      return this.list().filter(
        (d) =>
          d.id.toLowerCase().includes(needle) ||
          d.name.toLowerCase().includes(needle) ||
          d.description.toLowerCase().includes(needle),
      );
    },

    first(): PatternDef | undefined {
      return this.list()[0];
    },

    get size(): number {
      return map.size;
    },
  };
}

/** PRD 锁定的 19 个 id + 第二批新增 —— 断言实现与产品定义未漂移。 */
export const ALL_PATTERN_IDS: readonly PatternId[] = [
  'flow-lines',
  'offset-grid',
  'arc-composition',
  'contour-rings',
  'bauhaus-blocks',
  'polka-dots',
  'hex-grid',
  'diamond-lattice',
  'triangle-tiling',
  'checker-mesh',
  'dusk-ridges',
  'liquid-mesh',
  'cloud-bands',
  'aurora-wave',
  'blob-field',
  'memphis-grid',
  'neon-pixels',
  'new-wave-sunset',
  'pixel-terrain',
  // 第二批（2026-10-12）
  'girih-star',
  'halftone',
  'papercut',
  'glitch-rgb',
  'art-deco-fan',
  'nouveau-scroll',
  'isometric-voxel',
  'lowpoly-facet',
  // 第三批
  'stripe-bands',
  'nested-shapes',
  'spiral-polygons',
  'node-web',
  'chevron',
  'fish-scales',
  'sunburst',
  'square-rings',
  'raised-tiles',
  'tortoise-grid',
  'arrow-repeat',
  'pyramid-facets',
  'conic-mesh',
  // 第四批：不规则色块
  'scatter-blobs',
  'pebble-field',
  'terrazzo',
  'blob-contours',
];

/** 已实现的 id 清单（原 19 个 + 第二批新增）。 */
export const IMPLEMENTED_PATTERN_IDS = [
  'flow-lines',
  'offset-grid',
  'arc-composition',
  'contour-rings',
  'bauhaus-blocks',
  'polka-dots',
  'hex-grid',
  'diamond-lattice',
  'triangle-tiling',
  'checker-mesh',
  'dusk-ridges',
  'liquid-mesh',
  'aurora-wave',
  'blob-field',
  'memphis-grid',
  'neon-pixels',
  'new-wave-sunset',
  'pixel-terrain',
  'girih-star',
  'halftone',
  'papercut',
  'glitch-rgb',
  'art-deco-fan',
  'nouveau-scroll',
  'isometric-voxel',
  'lowpoly-facet',
  'stripe-bands',
  'nested-shapes',
  'spiral-polygons',
  'node-web',
  'chevron',
  'fish-scales',
  'sunburst',
  'square-rings',
  'raised-tiles',
  'tortoise-grid',
  'arrow-repeat',
  'pyramid-facets',
  'conic-mesh',
  // 第四批：不规则色块
  'scatter-blobs',
  'pebble-field',
  'terrazzo',
  'blob-contours',
] as const satisfies readonly PatternId[];

/** 按 role 批量取元件 id —— 供 UI 的「强调色 ×2」一键改色使用（PRD P0-2）。 */
export function elementIdsByRole(def: PatternDef, role: PatternDef['elements'][number]['role']): string[] {
  return def.elements.filter((e) => e.role === role).map((e) => e.id);
}