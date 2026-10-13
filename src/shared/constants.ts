/**
 * 全局常量 —— 唯一真源（架构 §12.2）。
 * 被 engine / patterns / state / ui 各层引用，禁止在任何模块里就地重定义数值。
 */

/** localStorage 键名。全部带版本号，便于未来 schema 升级时灰度迁移。 */
export const STORAGE_KEY = {
  favorites: 'vw:favorites:v1',
  /** 收藏 v2：具体的一张壁纸（配色 + 参数 + seed，存 share 编码），见 store.SavedWallpaper。 */
  saved: 'vw:saved:v2',
  recent: 'vw:recent:v1',
  theme: 'vw:theme:v1',
  palettes: 'vw:palettes:v1',
  /** 「色板 × 母题」评分的本地待提交队列（按登录邮箱分 key：`<此前缀>:<email>`），见 ui/rating-queue.ts。 */
  ratingQueue: 'vw:rating-queue:v1',
  /** 上一次批量提交评分的结果（同样按邮箱分 key），见 ui/rating-sync.ts。 */
  ratingSync: 'vw:rating-sync:v1',
  /** 批改模式（仅管理员）：开关 + 待上传的默认值 / 打分（按邮箱分 key），见 ui/admin-review.ts。 */
  review: 'vw:review:v1',
  /** 上一次成功上传默认值的 updatedAt（绕过 GET /api/defaults 的 60 秒缓存）。 */
  defaultsStamp: 'vw:defaults-stamp:v1',
} as const;

/** URL query 参数名 —— 严格对齐 PRD P0-6。 */
export const URL_PARAM = {
  pattern: 'p',
  width: 'w',
  height: 'h',
  seed: 'seed',
  colors: 'cols',
  params: 'params',
  ui: 'ui',
} as const;

export const LIMITS = {
  /** PRD NFR：单 Pattern SVG 体积红线。 */
  MAX_SVG_BYTES: 20 * 1024,
  /** body 直接子节点上限。 */
  MAX_BODY_NODES: 60,
  /** URL 超过此长度触发键名压缩 / blob 降级。 */
  MAX_URL_LENGTH: 2000,
  /** PRD NFR：首屏 JS gzip 预算。 */
  MAX_JS_GZIP_BYTES: 300 * 1024,
  /** 画布像素上限（iOS Safari ≈ 16.7M）。 */
  MAX_CANVAS_PIXELS: 16_000_000,
  MAX_FAVORITES: 200,
  /** PRD P0-7：最近使用 8 个。 */
  MAX_RECENT: 8,
  MAX_CUSTOM_PALETTES: 30,
  /** 尺寸 clamp 区间（PRD P0-6：正整数，clamp 到 [64, 7680]）。 */
  MIN_DIMENSION: 64,
  MAX_DIMENSION: 7680,
} as const;

/** PRD P0-4 尺寸预设 + 通用自定义能力。 */
export interface SizePreset {
  w: number;
  h: number;
  label: string;
  ratio: string;
  group: 'mac' | 'desktop' | 'mobile' | 'tablet';
}

export const SIZE_PRESETS: readonly SizePreset[] = [
  // ── Mac 16:10 优先：MacBook 是 16:10，16:9 壁纸铺上去会裁掉上下约 10%。
  //    用Mac 真实物理像素（非等比缩放值），保证 1:1 落在屏幕上不重采样。
  { w: 3024, h: 1964, label: 'MacBook 14"', ratio: '16:10', group: 'mac' },
  { w: 3456, h: 2234, label: 'MacBook 16"', ratio: '16:10', group: 'mac' },
  { w: 2560, h: 1664, label: 'MacBook Air', ratio: '16:10', group: 'mac' },
  { w: 5120, h: 2880, label: 'Studio Display', ratio: '16:9', group: 'mac' },
  { w: 1920, h: 1080, label: '1920×1080', ratio: '16:9', group: 'desktop' },
  { w: 2560, h: 1440, label: '2560×1440', ratio: '16:9', group: 'desktop' },
  { w: 3440, h: 1440, label: '3440×1440', ratio: '21:9', group: 'desktop' },
  { w: 3840, h: 2160, label: '3840×2160', ratio: '16:9', group: 'desktop' },
  { w: 1170, h: 2532, label: 'iPhone 竖屏', ratio: '9:19.5', group: 'mobile' },
  { w: 1290, h: 2796, label: 'iPhone Pro Max', ratio: '19.5:9', group: 'mobile' },
  { w: 2048, h: 2732, label: 'iPad 竖屏', ratio: '3:4', group: 'tablet' },
];

/** 默认画布尺寸（PRD Q5：默认首屏用 1920×1080 的桌面比例）。 */
export const DEFAULT_SIZE = { w: 1920, h: 1080 } as const;

/**
 * 默认首屏母题（PRD Q5 决策）。
 *
 * ⭐ 之所以放在 `shared/` 而不是 `ui/store.ts`：工程铁律 10 要求
 * **UI 层零硬编码**（`src/ui/` 内不得出现任何 pattern id 字面量，
 * 以此证明「新增母题零改动界面」这条架构约束真实成立）。
 * 常量层是中立的单一真源，UI 与 URL 编解码器都从这里取。
 */
export const DEFAULT_PATTERN_ID = 'polka-dots';

/**
 * 默认随机种子。
 *
 * ⭐ 必须是**固定值而非随机**：首屏每次加载都渲染同一张图，
 * 用户才能对照分享链接、截图与首屏是否一致；测试也能断言确定的内容。
 * 放在 shared 里是因为 UI 的 store 与 URL 编码器都要用它判断「是否默认值」。
 */
export const DEFAULT_SEED = 7;

/** 全出血铺满：切尺寸不裁切主体（PRD P0-4）。 */
export const PRESERVE_ASPECT_RATIO = 'xMidYMid slice';

/** 分类展示名与顺序 —— UI 的分类 Tab 由此生成。 */
export const CATEGORY_META: ReadonlyArray<{
  id: import('../patterns/types').PatternCategory;
  label: string;
  /** 分类 Tabs 用的短名：「全部」+ 5 类共 6 个分段，两字短名才能在栏宽内一行放下，不触发 kumo Tabs 的横向滚动。 */
  short: string;
  hint: string;
}> = [
  { id: 'A-lines', label: '极简线条', short: '线条', hint: '线束、等高线、条纹与放射' },
  { id: 'B-repeat', label: '几何构成', short: '几何', hint: '几何块面与重复平铺纹样' },
  { id: 'C-organic', label: '渐变流体', short: '流体', hint: '柔和过渡与有机形态' },
  { id: 'E-scene', label: '风景意境', short: '风景', hint: '山峦、云霞、极光、森林' },
  { id: 'D-pixel', label: '像素复古', short: '像素', hint: '游戏厅、霓虹、复古印刷' },
  { id: 'F-ornament', label: '传统纹样', short: '纹样', hint: '青海波、回纹、麻叶、七宝、星纹' },
  { id: 'G-botanical', label: '植物花卉', short: '植物', hint: '叶片、花瓣、藤蔓、银杏' },
  { id: 'H-cosmos', label: '宇宙天文', short: '宇宙', hint: '星座、轨道、星云、日食' },
  { id: 'I-optical', label: '光学错觉', short: '错觉', hint: '干涉、莫尔、欧普、不可能图形' },
  { id: 'J-generative', label: '数学生成', short: '生成', hint: '沃罗诺伊、分形、空间填充曲线' },
  { id: 'K-texture', label: '材质纹理', short: '材质', hint: '木纹、大理石、编织、布纹' },
  { id: 'L-architecture', label: '建筑空间', short: '建筑', hint: '拱窗、楼梯、拼花瓷砖、光影' },
  { id: 'M-movement', label: '设计流派', short: '流派', hint: '孟菲斯、包豪斯、瑞士网格、构成主义' },
  { id: 'N-animal', label: '动物形象', short: '动物', hint: '爪印、鸟群、鱼群、蝴蝶' },
];

/** URL 写入防抖（PRD P0-6：拖动滑块不应刷历史记录）。 */
export const URL_WRITE_DEBOUNCE_MS = 300;