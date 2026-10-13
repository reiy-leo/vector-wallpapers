/**
 * Pattern 数据模型 —— 与 PRD P0-2 1:1 对应。
 *
 * ⚠️ 本文件是「pattern 的输入契约」所在处：RenderApi / ResolvedConfig 定义在这里，
 * engine 反向依赖本文件（架构 §12.1 允许的唯一逆向依赖），且仅以 `import type`
 * 形式出现，编译后完全擦除 → 运行时无环。
 */

/**
 * 分类 id（值一经上线不可变更）。2026-10-12 重组：B-repeat 改名展示为「几何」，新增 E-scene「风景」。
 * ⚠️ 分类与源码文件夹无强绑定 —— 部分 pattern 的文件仍留在旧文件夹，以 `category` 字段为准。
 */
export type PatternCategory =
  | 'A-lines'
  | 'B-repeat'
  | 'C-organic'
  | 'E-scene'
  | 'D-pixel'
  // 2026-10-12 第七批：9 个新分类
  | 'F-ornament'
  | 'G-botanical'
  | 'H-cosmos'
  | 'I-optical'
  | 'J-generative'
  | 'K-texture'
  | 'L-architecture'
  | 'M-movement'
  | 'N-animal';

/** PRD 定义的元件角色。 */
export type ElementRole = 'bg' | 'primary' | 'secondary' | 'accent' | 'detail';

/** 渐变色标。 */
export interface PaintStop {
  /** 0~1 */
  offset: number;
  /** 必须是字面量 hex —— 引擎会 normalize，禁止 `var()` / `currentColor`。 */
  color: string;
  /**
   * 可选的色标透明度（0~1），渲染为 `stop-opacity`。
   *
   * 存在意义：极光的「向上快速衰减成雾」无法用纯色标表达 ——
   * 末端颜色再暗也是实色，只有把 stop 本身变透明才能得到真正的羽化。
   * 省略时引擎不输出该属性，行为与旧产物逐字节一致。
   */
  opacity?: number;
}

/**
 * 填充描述 —— PRD P0-2 核心。
 * 渐变由引擎在 `<defs>` 中生成，元件上只持有 `url(#id)` 引用。
 */
export type PaintSpec =
  | { type: 'solid'; color: string }
  | { type: 'linear'; angle: number; stops: PaintStop[] }
  | { type: 'radial'; cx: number; cy: number; r: number; stops: PaintStop[] }
  | { type: 'none' };

/** 控件值。 */
export type ParamValue = number | string | boolean;

/**
 * 元件规格 —— 数组顺序即绘制顺序（先到后 = 后者覆盖前者）。
 */
export interface ElementSpec {
  /** 稳定 id，一经上线不可重命名（URL 分享依赖它）。约定全 snake_case。 */
  id: string;
  /** 中文显示名，如「山峦 · 远」。 */
  label: string;
  role: ElementRole;
  paint: PaintSpec;
  /** 0~1 */
  opacity: number;
  visible: boolean;
  /**
   * 是否允许用户在配见面板里直接改色。
   * PRD P0-2 的「元件级配色」是核心差异化，因此绝大多数元件应为 true；
   * 仅当某元件的取值必须由其它元件推导（如高光/阴影）时才设 false。
   */
  configurable: boolean;
  /** 随机配色时不被覆盖。 */
  locked?: boolean;
}

/** 参数化控件定义 —— 驱动 UI 自动生成。 */
export type ControlDef =
  | {
      key: string;
      label: string;
      type: 'range';
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
      group?: string;
      /** 变更是否触发昂贵重渲染（UI 侧用 rAF 节流而非立即渲染）。 */
      heavy?: boolean;
    }
  | { key: string; label: string; type: 'toggle'; default: boolean; group?: string }
  | {
      key: string;
      label: string;
      type: 'select';
      options: Array<{ value: string; label: string }>;
      default: string;
      group?: string;
    }
  | { key: string; label: string; type: 'angle'; default: number; group?: string };

/**
 * 预设配色 —— 仅列出需要覆盖的元件，未列出的沿用 `PatternDef.elements` 默认值。
 * 与全局色板（`palettes.ts`）不同：preset 是「这个母题的成品配色」，
 * 粒度更细、可直接表达作者意图。
 */
export interface PatternPreset {
  id: string;
  label: string;
  /** element id → 覆盖值 */
  elements: Record<string, Pick<ElementSpec, 'paint'> & Partial<Pick<ElementSpec, 'opacity'>>>;
  /** 可选的参数覆盖 */
  params?: Record<string, ParamValue>;
}

/** Pattern 定义 —— 每个 pattern 模块导出一个实例。 */
export interface PatternDef {
  /** PRD 锁定，如 `dusk-ridges`，一经上线不可重命名。 */
  id: PatternId;
  name: string;
  category: PatternCategory;
  /**
   * 是否给根 <svg> 加 `shape-rendering="crispEdges"`。
   * 缺省 = `category === 'D-pixel'`。分类重组后仍需保持原渲染结果的 pattern 显式覆盖。
   */
  crispEdges?: boolean;
  /**
   * 这张图允许的壁纸底色（浅底 / 深底）。缺省 = 两种都可以。
   * 只给一种时，画布右上角的浅底/深底切换隐藏（Rei 2026-10-12：
   * 夜景如星空、月夜不该有浅底；水墨、晴空类不该有深底）。
   */
  tones?: readonly ('light' | 'dark')[];
  description: string;
  /** 顺序 = 绘制顺序 = z 轴 */
  elements: ElementSpec[];
  controls: ControlDef[];
  /** ≥ 2 套作者预设配色 */
  presets: PatternPreset[];
  seedable: boolean;
  animatable: boolean;
  /**
   * 色板 → 元件的语义映射表（PRD P0-2「预设色板」）。
   * key 是语义槽位，value 是本 pattern 内的 element id 列表。
   */
  paletteSlots: Record<string, string[]>;
  /**
   * 纯函数渲染实现。
   * ⚠️ 必须无副作用、不得触碰 DOM —— 预览 / SVG 下载 / PNG 导出 / 复制源码共用此函数。
   */
  render(def: PatternDef, cfg: ResolvedConfig, api: RenderApi): RenderResult;
}

/** 引擎解析后传给 render 的配置（已校验 + 已编译 paintValue）。 */
export interface ResolvedConfig {
  width: number;
  height: number;
  seed: number;
  animate: boolean;
  /** 按 element id 索引；始终包含 `def.elements` 的全部 id（不可见者 paintValue='none'）。 */
  elements: ReadonlyMap<string, ResolvedElement>;
  /** 控件值，已按 ControlDef clamp / 校验。 */
  params: Readonly<Record<string, ParamValue>>;
  /** 确定性随机源 —— 禁止在 pattern 内使用 Math.random()。 */
  rng: () => number;
}

export interface ResolvedElement {
  id: string;
  label: string;
  role: ElementRole;
  configurable: boolean;
  /** 单色为字面量 hex；渐变已转为 'url(#g-xxxx)'，可直接赋给 fill。 */
  paintValue: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
  /** 原始 PaintSpec，供 UI 渲染渐变编辑器（引擎不消费）。 */
  paint: PaintSpec;
}

/** 注入给 pattern 的工具 API（收敛工具函数，避免各 pattern 重复实现）。 */
export interface RenderApi {
  /** 注册线性渐变，返回可直接赋给 fill 的 `url(#id)`；同内容自动去重。 */
  linear(p: { angle: number; stops: PaintStop[]; key: string }): string;
  /** 注册径向渐变。坐标为归一化 0~1（相对各自包围盒）。 */
  radial(p: { cx: number; cy: number; r: number; stops: PaintStop[]; key: string }): string;
  /**
   * 注册可平铺图案 —— ⭐ 本项目性能与 20KB 体积红线的关键。
   * 高密度重复图形必须走此路径，DOM 节点数与密度无关。
   */
  tile(t: { w: number; h: number; content: string; key: string; transform?: string }): string;
  /** 注册裁剪路径，返回 `url(#id)`。 */
  clip(id: string, shape: string): string;
  /** 注册高斯模糊滤镜，返回可直接赋给 `filter` 的 `url(#id)`。 */
  blur(stdDeviation: number): string;
  /** 注册 CSS `@keyframes`，返回可直接用于 `class` 的动画名。 */
  keyframes(name: string, css: string): string;
  /** 数值格式化：保留 2 位小数并去尾零（直接让 SVG 体积减少 30~40%）。 */
  n(v: number): string;
}

export interface RenderResult {
  /** `<svg>` 内部内容（不含 `<defs>` 与根标签）。 */
  body: string;
}

/**
 * PatternId 全集 = PRD 的 19 个原始 id + 第二批新增 8 个。
 *
 * 19 个 id 已全部落地（见 `patterns/index.ts`）。
 *
 * ⚠️ 第二批（2026-10-12，依据 `.agents/docs/STYLE-100-ANALYSIS.md` §4.2 的 6 个结构缺口）
 * 的 id 在**首次上线前**仍可调整；一旦分享链接流出即锁定，
 * 与其余 19 个遵守同一条「一经上线不可重命名」的契约。
 */
export type PatternId =
  | 'flow-lines'
  | 'offset-grid'
  | 'arc-composition'
  | 'contour-rings'
  | 'bauhaus-blocks'
  | 'polka-dots'
  | 'hex-grid'
  | 'diamond-lattice'
  | 'triangle-tiling'
  | 'checker-mesh'
  | 'dusk-ridges'
  | 'liquid-mesh'
  | 'cloud-bands'
  | 'aurora-wave'
  | 'blob-field'
  | 'memphis-grid'
  | 'neon-pixels'
  | 'new-wave-sunset'
  | 'pixel-terrain'
  | 'girih-star'
  | 'halftone'
  | 'papercut'
  | 'dither-gradient'
  | 'nouveau-scroll'
  | 'isometric-voxel'
  | 'lowpoly-facet'
  // 第三批（2026-10-12，svgbackgrounds.com 免费集风格参考，自行实现）
  | 'stripe-bands'
  | 'nested-shapes'
  | 'spiral-polygons'
  | 'node-web'
  | 'chevron'
  | 'sunburst'
  | 'square-rings'
  | 'raised-tiles'
  | 'tortoise-grid'
  | 'arrow-repeat'
  | 'pyramid-facets'
  | 'conic-mesh'
  | 'scatter-blobs'
  | 'pebble-field'
  | 'terrazzo'
  | 'blob-contours'
  | 'topo-lines'
  | 'wave-stripes'
  | 'tv-static'
  | 'christmas-trees'
  | 'pine-forest'
  | 'starry-night-sky'
  | 'ocean-moon'
  | 'mountain-lake'
  | 'sand-dunes'
  | 'rice-terraces'
  | 'city-skyline'
  | 'sakura-fall'
  | 'ukiyoe-fuji'
  | 'hot-air-balloons'
  | 'bamboo-mist'
  // 第七批：9 个新分类（2026-10-12）
  | 'seigaiha'
  | 'meander-key'
  | 'asanoha'
  | 'shippo'
  | 'leaf-chain'
  | 'petal-scatter'
  | 'palm-fronds'
  | 'ginkgo-fans'
  | 'dandelion-wind'
  | 'fern-fronds'
  | 'lotus-pond'
  | 'wisteria'
  | 'monstera'
  | 'constellations'
  | 'planet-orbits'
  | 'nebula-dust'
  | 'eclipse'
  | 'interference-rings'
  | 'moire-lines'
  | 'op-wave-grid'
  | 'impossible-cubes'
  | 'voronoi-cells'
  | 'fractal-tree'
  | 'hilbert-curve'
  | 'cellular-automaton'
  | 'wood-grain'
  | 'marble-veins'
  | 'basket-weave'
  | 'linen-weave'
  | 'arch-windows'
  | 'staircase'
  | 'encaustic-tiles'
  | 'blinds-shadow'
  | 'memphis-confetti'
  | 'swiss-grid'
  | 'constructivist'
  | 'punch-card'
  | 'paw-prints'
  | 'bird-flock'
  | 'fish-school'
  | 'butterflies';