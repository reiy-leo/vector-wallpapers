import type { PaintSpec } from '../patterns/types';

/**
 * 用户配置与界面态 —— 可序列化，是 localStorage / URL 的唯一载体。
 *
 * ⚠️ 对 `patterns/types` 的引用是 `import type`，编译后擦除，
 * 因此不构成运行时循环依赖（架构 §12.1 的意图是「无运行时环」）。
 */

export type { PaintSpec };

/** 单个元件的用户配置。数组顺序由 PatternDef 决定，此处仅承载值。 */
export interface ElementConfig {
  /** 与 ElementSpec.id 对齐；匹配不到的配置项会被忽略。 */
  id: string;
  paint: PaintSpec;
  /** 0~1 */
  opacity: number;
  visible: boolean;
  locked: boolean;
}

/** 完整可序列化的用户配置。 */
export interface PatternConfig {
  patternId: string;
  width: number;
  height: number;
  seed: number;
  /** 有序数组，长度/顺序不必与 PatternDef.elements 一致，引擎按 id 对齐。 */
  elements: ElementConfig[];
  params: Record<string, number | string | boolean>;
}

/** 界面态 —— PRD 明确要求进 URL 的 `ui` 段。 */
export interface UIState {
  theme: 'light' | 'dark' | 'system';
  /** 三栏布局的面板位置（PRD `ui=panel:right`）。 */
  panel: 'left' | 'right';
  /** 是否聚焦全屏预览。 */
  focus: boolean;
  /** 栅格 / 标尺叠加。 */
  grid: boolean;
}