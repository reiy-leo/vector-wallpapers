/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TOKENS, giscusThemeCss, giscusThemeTone, serveGiscusTheme } from './giscus-theme';
import { createHandler } from './index';

/** 从 theme.css 的某个选择器块里取 --vw-* 值 */
function themeBlock(selector: string): Record<string, string> {
  const css = readFileSync('src/styles/theme.css', 'utf8');
  const i = css.indexOf(`${selector} {`);
  expect(i, selector).toBeGreaterThan(-1);
  const body = css.slice(i, css.indexOf('}', i));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/--vw-([a-z0-9-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

describe('giscus Kumo 主题', () => {
  it('TOKENS 与 theme.css 一致（iframe 读不到父页变量，只能镜像）', () => {
    const light = themeBlock(':root');
    const dark = themeBlock(":root[data-theme='dark']");
    for (const [k, v] of Object.entries(TOKENS.light)) expect(light[k], `light ${k}`).toBe(v);
    for (const [k, v] of Object.entries(TOKENS.dark)) expect(dark[k], `dark ${k}`).toBe(v);
  });

  it('覆盖 giscus 官方主题的全部按钮/底色/文字/边框变量', () => {
    const css = giscusThemeCss('light');
    for (const name of [
      'btn-text', 'btn-bg', 'btn-border', 'btn-primary-bg', 'btn-primary-text', 'btn-primary-hover-bg',
      'fg-default', 'fg-muted', 'canvas-default', 'canvas-subtle', 'border-default', 'accent-fg',
      'segmented-control-bg', 'social-reaction-bg-hover', 'prettylights-syntax-keyword',
    ]) expect(css).toContain(`--color-${name}:`);
    // 主按钮 = 站点主色
    expect(css).toContain(`--color-btn-primary-bg:${TOKENS.light.brand}`);
    expect(giscusThemeCss('dark')).toContain(`--color-btn-primary-bg:${TOKENS.dark.brand}`);
    // 不改 data-reactions-enabled：表情区只是压紧，不能被隐藏
    expect(css).not.toMatch(/gsc-reactions[^{]*\{[^}]*display:\s*none/);
  });

  it('路由：两份 CSS，Content-Type / CORS / 缓存正确', async () => {
    expect(giscusThemeTone('/giscus/kumo-light.css')).toBe('light');
    expect(giscusThemeTone('/giscus/kumo-dark.css')).toBe('dark');
    expect(giscusThemeTone('/giscus/other.css')).toBeNull();
    const h = createHandler(() => new Response('static'));
    for (const tone of ['light', 'dark']) {
      const res = await h.fetch(new Request(`https://x.dev/giscus/kumo-${tone}.css`), {} as never);
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toMatch(/^text\/css/);
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://giscus.app');
      expect(res.headers.get('Cache-Control')).toMatch(/max-age=\d+/);
      expect(await res.text()).toContain('--color-canvas-default');
    }
    const pre = serveGiscusTheme(new Request('https://x.dev/giscus/kumo-dark.css', { method: 'OPTIONS' }), 'dark');
    expect(pre.status).toBe(204);
  });

  it('wrangler.jsonc 让 /giscus/* 先经过 Worker', () => {
    expect(readFileSync('wrangler.jsonc', 'utf8')).toMatch(/run_worker_first[^\]]*"\/giscus\/\*"/);
  });
});
