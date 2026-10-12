/**
 * @vitest-environment node
 *
 * 「复制 CSS」产物的契约测试（Rei 2026-10-12：分享替换成复制 CSS）。
 *
 * ⭐ 复用引擎真源：SVG 一律来自 `renderStandaloneSVG(createDefaultConfig(...))`，
 * 与「导出 SVG」同一份静态产物，绝不手搓 SVG 字符串当样本。
 * ⭐ 判定按「解码回来是否逐字节等于原 SVG」，而不是只看有没有 `url(`。
 */
import { describe, expect, it } from 'vitest';
import { registry } from '../patterns';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import { svgToCssBackground } from '../shared/download';
import { buildBackgroundCSS } from './exporters';

/** 从 CSS 文本里取出 `url("…")` 的内容。 */
function extractUri(css: string): string {
  const m = css.match(/background-image: url\("([^"]*)"\);/);
  expect(m, `CSS 中没有合法的 background-image: url("…")：\n${css.slice(0, 200)}`).not.toBeNull();
  return m![1]!;
}

const PREFIX = 'data:image/svg+xml;charset=utf-8,';

describe('复制 CSS', () => {
  const defs = registry.list();

  it('每个母题：data URI 解码后与导出 SVG 逐字节一致，且无未转义的危险字符', () => {
    expect(defs.length).toBeGreaterThan(0);
    for (const def of defs) {
      const cfg = createDefaultConfig(def, { width: 1920, height: 1080, seed: 7 });
      const svg = renderStandaloneSVG(def, cfg);
      const css = buildBackgroundCSS(def, cfg);
      const uri = extractUri(css);
      expect(uri.startsWith(PREFIX), def.id).toBe(true);
      const payload = uri.slice(PREFIX.length);
      // 引号会提前闭合 url("…")；括号在无引号写法下会提前闭合 url()；
      // # 会被当成片段标识截断；< > 换行在 CSS 字符串里非法或不安全
      expect(payload, `${def.id}：payload 含未转义字符`).not.toMatch(/["'()#<>\s]/);
      expect(decodeURIComponent(payload), def.id).toBe(svg);
    }
  });

  it('带 cover / center / no-repeat 三行，且是静态（无动画）产物', () => {
    const def = registry.first()!;
    const cfg = createDefaultConfig(def, { width: 2560, height: 1440, seed: 3 });
    const css = buildBackgroundCSS(def, cfg);
    expect(css).toContain('background-size: cover;');
    expect(css).toContain('background-position: center;');
    expect(css).toContain('background-repeat: no-repeat;');
    expect(css.startsWith(`/* Vector Wallpapers · ${def.name} · 2560×1440 */`)).toBe(true);
    const svg = decodeURIComponent(extractUri(css).slice(PREFIX.length));
    expect(svg).not.toMatch(/<animate/);
  });

  it('注释中的 */ 被剔除，不会提前结束 CSS 注释', () => {
    const css = svgToCssBackground('<svg xmlns="http://www.w3.org/2000/svg"/>', 'a */ b');
    const firstLine = css.split('\n')[0]!;
    expect(firstLine).toBe('/* a  b */');
  });
});
