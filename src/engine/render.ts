/**
 * 唯一渲染入口（架构 §4.1）。
 *
 * ⭐ PRD P0-2 硬性约束：预览 DOM、SVG 下载、PNG 导出、源码复制**共用这一份结果**，
 * 不允许出现「预览好看但导出不一致」。因此本文件是全项目唯一的 SVG 生成点。
 *
 * 纯函数性由四件事共同保证：
 *  1. `mulberry32(seed)` 取代 `Math.random()`
 *  2. 无 `Date.now()` / DOM API / 任何外部可变状态
 *  3. `DefsRegistry` 每次调用新建，id 由内容 hash 派生而非自增
 *  4. 属性排序 + 省略默认值 → 输出稳定可 diff
 */
import { DEFAULT_SIZE, LIMITS, PRESERVE_ASPECT_RATIO } from '../shared/constants';
import { clamp } from '../shared/guards';
import { assertBudget, measure, type BudgetReport } from './budget';
import { createDefsRegistry, stripAnimation } from './defs';
import { resolveElements } from './elementStyle';
import { defaultParams, resolveControls } from './params';
import { mulberry32 } from './rng';
import { el, n } from './svg';
import type { ElementConfig, PatternConfig } from './types';
import type { PatternDef, RenderApi, ResolvedConfig, ResolvedElement } from '../patterns/types';

export interface RenderOptions {
  /**
   * 是否输出动画。
   * 导出时传 false 以获得字节级可复现产物（架构 §9.4）。
   * 默认 false —— 「不确定要不要动」时静态永远是正确的选择。
   */
  animate?: boolean;
  /** dev 下超体积红线抛错；默认取 `import.meta.env.DEV`。 */
  isDev?: boolean;
  /**
   * 跳过体积断言的**抛错 / warn**（批量预渲染体检时用）。
   *
   * ⚠️ 注意它**不跳过测量**：`nodes` / `bytes` 仍是真实值。
   * 若把它理解成「不测量」，就会写出
   * `renderSVG(..., { skipBudget: true }).nodes` 从而读到 0，
   * 让节点红线形同虚设（这个坑真的踩过）。
   */
  skipBudget?: boolean;
}

export interface RenderOutput extends BudgetReport {
  /** `<svg>` 内部内容，不含 `<defs>` 与根标签。 */
  body: string;
  /** `<defs>…</defs>`；未注册任何资源时为空串。 */
  defs: string;
  /** 完整 `<svg>…</svg>` 文本，可直接下载。 */
  svg: string;
  /** 已解析的元件表 —— UI 的配色面板直接消费它，无需二次解析。 */
  elements: ReadonlyMap<string, ResolvedElement>;
  /** 已 clamp 的参数。 */
  params: Readonly<Record<string, number | string | boolean>>;
}

function readDevFlag(explicit: boolean | undefined): boolean {
  if (typeof explicit === 'boolean') return explicit;
  try {
    // Vite 在编译期注入；Node（预渲染/测试）下该对象不存在 → false
    return Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
  } catch {
    return false;
  }
}

/**
 * 渲染一个 pattern。
 *
 * 流程（架构 §4.1，全部纯函数、逐步可测）：
 *  1. resolveControls —— clamp 数值 / 校验枚举 / 填默认
 *  2. resolveElements —— 按 id 对齐、规范化 PaintSpec、编译 paintValue
 *  3. mulberry32(seed) —— 确定性随机源
 *  4. def.render() → body
 *  5. budgetGuard —— dev 超限抛错，prod 仅 warn
 */
export function renderSVG(
  def: PatternDef,
  cfg: PatternConfig,
  opts: RenderOptions = {},
): RenderOutput {
  const animate = opts.animate ?? false;

  // 尺寸 clamp 到合法区间；比例关系由调用方决定，引擎只做防御
  const width = Math.round(clamp(cfg.width, LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION));
  const height = Math.round(clamp(cfg.height, LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION));
  const seed = Number.isFinite(cfg.seed) ? Math.trunc(cfg.seed) : 0;

  const params = resolveControls(def.controls, cfg.params);
  const defs = createDefsRegistry();
  const elements = resolveElements(def, cfg.elements, defs);

  const resolved: ResolvedConfig = {
    width,
    height,
    seed,
    animate: animate && def.animatable,
    elements,
    params,
    rng: mulberry32(seed),
  };

  // DefsRegistry 的方法本就是箭头函数（无 this 绑定），直接展开即可，
  // 无需逐个包装 —— 但显式声明类型能让契约变化在编译期暴露。
  const api: RenderApi = {
    linear: defs.linear,
    radial: defs.radial,
    tile: defs.tile,
    clip: defs.clip,
    blur: defs.blur,
    keyframes: defs.keyframes,
    n,
  };

  const { body: rawBody } = def.render(def, resolved, api);
  // animate=false 时无条件剥离动画标记：导出产物必须字节级可复现
  const body = resolved.animate ? rawBody : stripAnimation(rawBody);
  const defsMarkup = defs.serialize();

  // D-pixel 类必须锐化边缘，否则缩放时像素会被插值糊掉（架构 §9.3 坑 1）
  //    分类重组后个别 pattern 用 `crispEdges` 显式覆盖，保证渲染结果不随分类变动。
  const crisp = def.crispEdges ?? def.category === 'D-pixel';

  const svg =
    el(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width,
        height,
        viewBox: `0 0 ${n(width)} ${n(height)}`,
        preserveAspectRatio: PRESERVE_ASPECT_RATIO,
        'shape-rendering': crisp ? 'crispEdges' : undefined,
        'aria-label': def.name,
        role: 'img',
      },
      defsMarkup + body,
    ) + '\n';

  /**
   * `skipBudget` 只关掉「抛错 / warn」，**绝不关掉测量**。
   *
   * 之前这里直接填 `nodes: 0`，于是任何人写
   * `renderSVG(def, cfg, { skipBudget: true }).nodes` 都会拿到 0，
   * 节点红线形同虚设 —— 而且这个坑非常隐蔽：体积照样报得出来，
   * 只有 nodes 一项静默失效，测试还会全绿。
   * （`verify.test.ts` 真的踩过一次，aurora-wave 的节点数被读成 0。）
   */
  const report = opts.skipBudget
    ? { ...measure(svg, body), violations: [] as string[] }
    : assertBudget(def.id, svg, body, readDevFlag(opts.isDev));

  return { ...report, body, defs: defsMarkup, svg, elements, params };
}

/**
 * 独立可打开的 SVG 文本 —— 下载 / 复制源码 / PNG 光栅化的唯一输入。
 *
 * 之所以单独提供一个函数名而不是让调用方拼字符串：根标签的
 * width/height/viewBox 必须齐备（Safari `drawImage` 坑 1），
 * 这个不变量应该由一处保证，而不是散落在三个调用点。
 */
export function renderStandaloneSVG(
  def: PatternDef,
  cfg: PatternConfig,
  opts: RenderOptions = {},
): string {
  return renderSVG(def, cfg, { animate: false, ...opts }).svg;
}

/**
 * 由 PatternDef 派生一份默认配置。
 *
 * 这是 UI / 分享链接 / 收藏的共同起点：所有「默认状态」都必须从这里生成，
 * 否则各处手搓默认值会逐渐漂移。
 */
export function createDefaultConfig(
  def: PatternDef,
  overrides: { width?: number; height?: number; seed?: number } = {},
): PatternConfig {
  const elements: ElementConfig[] = def.elements.map((e) => ({
    id: e.id,
    paint: e.paint,
    opacity: e.opacity,
    visible: e.visible,
    locked: e.locked ?? false,
  }));
  return {
    patternId: def.id,
    width: overrides.width ?? DEFAULT_SIZE.w,
    height: overrides.height ?? DEFAULT_SIZE.h,
    seed: overrides.seed ?? 0,
    elements,
    params: defaultParams(def.controls),
  };
}

/** 应用一套 preset，返回新的 PatternConfig（不改动入参）。 */
export function applyPreset(
  def: PatternDef,
  presetId: string,
  base?: PatternConfig,
): PatternConfig {
  const preset = def.presets.find((p) => p.id === presetId);
  const cfg = base ? structuredCloneConfig(base) : createDefaultConfig(def);
  if (!preset) return cfg;
  for (const e of cfg.elements) {
    const patch = preset.elements[e.id];
    if (!patch) continue;
    if (patch.paint) e.paint = patch.paint;
    if (patch.opacity !== undefined) e.opacity = patch.opacity;
  }
  if (preset.params) cfg.params = { ...cfg.params, ...preset.params };
  return cfg;
}

/**
 * 深拷贝配置。
 * 手写而非 `structuredClone`：PaintSpec 是纯数据但我们不希望引擎
 * 依赖某个宿主是否实现了 Web API（Node 旧版本 / 某些沙箱）。
 */
export function structuredCloneConfig(cfg: PatternConfig): PatternConfig {
  return {
    patternId: cfg.patternId,
    width: cfg.width,
    height: cfg.height,
    seed: cfg.seed,
    elements: cfg.elements.map((e) => ({
      id: e.id,
      opacity: e.opacity,
      visible: e.visible,
      locked: e.locked,
      paint: clonePaint(e.paint),
    })),
    params: { ...cfg.params },
  };
}

function clonePaint(paint: ElementConfig['paint']): ElementConfig['paint'] {
  switch (paint.type) {
    case 'solid':
      return { type: 'solid', color: paint.color };
    case 'none':
      return { type: 'none' };
    case 'linear':
      return { type: 'linear', angle: paint.angle, stops: paint.stops.map((s) => ({ ...s })) };
    case 'radial':
      return {
        type: 'radial',
        cx: paint.cx,
        cy: paint.cy,
        r: paint.r,
        stops: paint.stops.map((s) => ({ ...s })),
      };
  }
}