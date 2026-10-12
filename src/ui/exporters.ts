/**
 * 导出器 —— SVG 下载与 PNG 光栅化。
 *
 * ⭐ 铁律：预览 / 下载 / 导出**共用 `renderStandaloneSVG` 的同一份产物**。
 * 任何一条路径自己拼 SVG 都会引入「预览好看、导出不一致」的风险。
 *
 * 两条平台约束（均已在PRD Q8 拍板）：
 *  1. **导出静态**（Q1）—— 一律 `animate: false`，保证字节级可复现。
 *  2. **iOS 不支持 PNG** —— 不做技术绕过（wasm 会击穿 300KB 首屏预算，
 *     且 resvg 与浏览器渲染引擎不同，`feGaussianBlur` 会有像素差异，
 *     破坏「导出与预览逐像素一致」这条验收标准）。
 */
import { renderStandaloneSVG } from '../engine/render';
import { downloadBlob, downloadText, exportFilename } from '../shared/download';
import { detectPlatform, guardCanvasSize, IOS_PNG_UNSUPPORTED_HINT } from '../shared/guards';
import type { ExportScale } from '../shared/guards';
import type { PatternConfig } from '../engine/types';
import type { PatternDef } from '../patterns/types';

/** 导出结果。`notice` 非空表示发生了降级，UI 必须明示（不可静默失败）。 */
export interface ExportResult {
  ok: boolean;
  notice: string | null;
}

export interface ExportMeta {
  bytes: number;
  nodes: number;
  overBudget: boolean;
  maxBytes: number;
}

/** SVG 导出 —— 矢量、体积小，任何平台都可用，作为 iOS 上的推荐路径。 */
export function exportSVG(def: PatternDef, cfg: PatternConfig): ExportResult {
  const svg = renderStandaloneSVG(def, cfg);
  downloadText(
    exportFilename(def.id, cfg.width, cfg.height, 'svg'),
    svg,
    'image/svg+xml;charset=utf-8',
  );
  return { ok: true, notice: null };
}

/** 导出 PNG。返回 notice 而非抛错 —— 降级与不支持都要让用户看见。 */
export async function exportPNG(
  def: PatternDef,
  cfg: PatternConfig,
  scale: ExportScale,
): Promise<ExportResult> {
  // ① 平台能力：iPadOS 会伪装成 Mac，靠 maxTouchPoints 区分
  if (detectPlatform() === 'ios') {
    return { ok: false, notice: IOS_PNG_UNSUPPORTED_HINT };
  }

  // ② 尺寸守卫：超限时**自动降级**并说明，用户要的是「高清」不是「报错」
  const guard = guardCanvasSize(cfg.width, cfg.height, scale);
  const finalScale = guard.scale;

  const svg = renderStandaloneSVG(def, cfg);

  try {
    const blob = await rasterize(svg, guard.width, guard.height);
    downloadBlob(
      exportFilename(def.id, guard.width, guard.height, 'png', finalScale),
      blob,
    );
    return { ok: true, notice: guard.notice };
  } catch (err) {
    return {
      ok: false,
      notice: `PNG 导出失败：${err instanceof Error ? err.message : '未知错误'}。可改用 SVG 导出（矢量、体积更小）。`,
    };
  }
}

/**
 * SVG → PNG Blob。
 *
 * ⚠️ 一个不能省的细节：**必须带 width/height 属性**，SVG 只有 viewBox 时
 * Safari 会按 300×150 渲染。`renderStandaloneSVG` 已保证根标签属性齐备。
 *
 * 走 `<img>` + data URI 而非 blob URL：data URI 不触发 canvas 的「跨源污染」，
 * 因此不需要给 img 挂 crossorigin，`toBlob` 也不会抛 SecurityError
 * （这正是本项目禁用 `<foreignObject>` 的同一个原因）。
 * 用 data URI 的代价是不必 revoke —— 没有创建任何 object URL。
 */
async function rasterize(svg: string, width: number, height: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建 canvas 2D 上下文');

  const dataUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22')}`;

  const img = new Image();
  img.decoding = 'sync';

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('SVG 光栅化失败'));
    img.src = dataUri;
  });

  ctx.drawImage(img, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('canvas.toBlob 返回空结果（可能超出浏览器尺寸上限）'));
    }, 'image/png');
  });
}

/** 复制 SVG 源码到剪贴板 —— 供「查看源码」面板使用。 */
export async function copySVGSource(def: PatternDef, cfg: PatternConfig): Promise<boolean> {
  const svg = renderStandaloneSVG(def, cfg);
  try {
    await navigator.clipboard.writeText(svg);
    return true;
  } catch {
    return false;
  }
}

/** 渲染开销体检数据 —— 供 UI 展示体积 / 节点数。 */
export function measureConfig(def: PatternDef, cfg: PatternConfig, maxBytes: number): ExportMeta {
  const svg = renderStandaloneSVG(def, cfg);
  const bytes = new TextEncoder().encode(svg).length;
  return {
    // 与引擎 measure() 同口径：UTF-8 字节数，不是 .length（中文标签会算错）
    bytes,
    nodes: (svg.match(/<(rect|circle|path|line|polygon|ellipse|g)\b/g) ?? []).length,
    overBudget: bytes > maxBytes,
    maxBytes,
  };
}
