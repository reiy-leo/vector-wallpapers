/** @vitest-environment node */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GISCUS_ATTRS, giscusTheme, resolveDark } from './Comments';

describe('留言区 giscus', () => {
  it('参数与 Rei 配置一致', () => {
    expect(GISCUS_ATTRS['data-repo']).toBe('reiy-leo/cfw-comments');
    expect(GISCUS_ATTRS['data-category-id']).toBe('DIC_kwDOVGzwdc4DIS5N');
    expect(GISCUS_ATTRS['data-mapping']).toBe('pathname');
    expect(GISCUS_ATTRS['data-lang']).toBe('zh-CN');
  });
  it('主题跟随网站', () => {
    expect(giscusTheme(resolveDark('dark', false))).toBe('noborder_dark');
    expect(giscusTheme(resolveDark('light', true))).toBe('noborder_light');
    expect(giscusTheme(resolveDark('system', true))).toBe('noborder_dark');
    expect(giscusTheme(resolveDark('system', false))).toBe('noborder_light');
  });
  it('CSP 放行 giscus', () => {
    const h = readFileSync('public/_headers', 'utf8');
    const csp = h.split('\n').find((l) => l.includes('Content-Security-Policy:'))!;
    expect(csp).toMatch(/script-src [^;]*https:\/\/giscus\.app/);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/giscus\.app/);
    expect(csp).toMatch(/style-src [^;]*https:\/\/giscus\.app/);
  });
});
