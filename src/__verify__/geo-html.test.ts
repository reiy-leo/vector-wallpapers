/**
 * GEO 契约（Rei 2026-10-14）：「关于 / 常见问题」只放在 <body> 的 <noscript> 里供 LLM/爬虫读取，
 * 页面上不显示；挂载点为空；FAQ 文字与 JSON-LD FAQPage 逐字一致。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const strip = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '');
const html = strip(readFileSync(resolve(__dirname, '../../index.html'), 'utf8'));
const body = html.slice(html.indexOf('<body>'));
const noscript = body.match(/<noscript>([\s\S]*?)<\/noscript>/)?.[1] ?? '';

describe('GEO 静态文案只在 noscript 中', () => {
  it('挂载点在原始 HTML 中为空', () => {
    expect(body).toMatch(/<div id="root"><\/div>/);
  });
  it('noscript 在挂载点之后，含 h1 站名、简介、h2 常见问题', () => {
    expect(body.indexOf('<noscript>')).toBeGreaterThan(body.indexOf('<div id="root">'));
    expect(noscript).toMatch(/<h1[^>]*>矢量壁纸<\/h1>/);
    expect(noscript).toContain('14 类共 98 个图案母题');
    expect(noscript).toMatch(/<h2>常见问题<\/h2>/);
  });
  it('noscript 之外没有可见的关于区块', () => {
    const outside = strip(body.replace(/<noscript>[\s\S]*?<\/noscript>/, ''));
    expect(outside).not.toContain('vw-about');
    expect(outside).not.toContain('常见问题');
    expect(strip(html.slice(0, html.indexOf('<body>')))).not.toContain('.vw-about');
  });
  it('FAQ 与 JSON-LD FAQPage 逐字一致', () => {
    const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)![1]);
    const faq = (ld as { '@type': string; mainEntity: { name: string; acceptedAnswer: { text: string } }[] }[])
      .find((x) => x['@type'] === 'FAQPage')!;
    const dts = [...noscript.matchAll(/<dt>(.*?)<\/dt>/g)].map((m) => m[1]);
    const dds = [...noscript.matchAll(/<dd>(.*?)<\/dd>/g)].map((m) => m[1]);
    expect(dts).toEqual(faq.mainEntity.map((q) => q.name));
    expect(dds).toEqual(faq.mainEntity.map((q) => q.acceptedAnswer.text));
  });
});
