/**
 * 通用下载 —— 浏览器侧工具，**不属于**纯函数层。
 *
 * ⚠️ 关键纪律：临时 Blob URL 用完立即 revoke（架构 §9.3 坑 5）。
 * 连续导出十几次后不回收，标签页内存会暴涨。
 */

function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

/** 下载文本文件（SVG / CSS / HTML 片段）。 */
export function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, filename);
  } finally {
    // 交给浏览器一帧再回收：部分浏览器在 click 后仍会异步读取该 URL
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** 下载二进制文件（PNG）。 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  try {
    triggerDownload(url, filename);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** 生成 `data:image/svg+xml` URI（用于 CSS background 片段与缩略图）。 */
export function svgToDataUri(svgText: string): string {
  const encoded = encodeURIComponent(svgText)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22');
  return `data:image/svg+xml;charset=utf-8,${encoded}`;
}

/**
 * SVG → 可直接粘贴的 CSS 背景声明（「复制 CSS」）。
 *
 * - data URI 复用 `svgToDataUri`（encodeURIComponent + 引号转义），与预览同一编码；
 *   额外把 `(` `)` 转义 —— 万一被人去掉引号写成 `url(data:…)`，括号会提前闭合 url()。
 * - `cover + center + no-repeat`：导出 SVG 带固定宽高与 viewBox（整幅壁纸，非平铺单元），
 *   按比例铺满容器、居中裁切，是作为整块背景最稳妥的取值。
 * - 注释里的 `*\/` 会提前结束 CSS 注释，先剔除。
 */
export function svgToCssBackground(svgText: string, comment?: string): string {
  const uri = svgToDataUri(svgText).replace(/\(/g, '%28').replace(/\)/g, '%29');
  const lines = [
    `background-image: url("${uri}");`,
    'background-size: cover;',
    'background-position: center;',
    'background-repeat: no-repeat;',
  ];
  if (comment) lines.unshift(`/* ${comment.replace(/\*\//g, '')} */`);
  return lines.join('\n');
}

/** 从配置派生一个语义清晰的文件名：`dusk-ridges-1920x1080.svg`。 */
export function exportFilename(
  patternId: string,
  width: number,
  height: number,
  ext: string,
  scale?: number,
): string {
  const suffix = scale && scale !== 1 ? `@${scale}x` : '';
  return `${patternId}-${width}x${height}${suffix}.${ext}`;
}