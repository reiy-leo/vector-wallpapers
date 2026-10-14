/**
 * giscus 自定义主题（Kumo 风格）—— Rei 2026-10-14。
 *
 *   GET /giscus/kumo-light.css
 *   GET /giscus/kumo-dark.css
 *
 * giscus 在自己的 iframe（https://giscus.app）里用 `<link crossorigin="anonymous">` 加载主题，
 * 所以响应必须带 `Access-Control-Allow-Origin: https://giscus.app`，Content-Type 必须是 text/css。
 *
 * 基础：giscus 官方 light / dark 主题（MIT, GitHub Primer）的 `--color-*` 变量全集，
 * 逐个映射到本站 Kumo token（src/styles/theme.css 的 --vw-*）。
 * ⚠️ TOKENS 是 theme.css 的镜像（iframe 读不到父页 CSS 变量），
 *    giscus-theme.test.ts 会逐项对照 theme.css，改了主题色两边必须一起改。
 *
 * 版式：圆角 6/8px、1px 细边框、无投影、14px 正文、主按钮用站点主色；
 * 顶部「N 个表情 + 笑脸」压成一行，和「N 条评论」同一行（不改 data-reactions-enabled）。
 */

export type GiscusTone = 'light' | 'dark';

/** 与 theme.css `:root` / `:root[data-theme='dark']` 完全一致（测试守护）。 */
export const TOKENS: Record<GiscusTone, Record<string, string>> = {
  light: {
    canvas: 'oklch(0.985 0.002 264)',
    surface: 'oklch(1 0 0)',
    'surface-2': 'oklch(0.972 0.003 264)',
    'surface-3': 'oklch(0.945 0.004 264)',
    line: 'oklch(0.912 0.005 264)',
    'line-strong': 'oklch(0.8 0.008 264)',
    'line-input': 'oklch(0.56 0.008 264)',
    text: 'oklch(0.22 0.014 264)',
    'text-soft': 'oklch(0.44 0.016 264)',
    'text-mute': 'oklch(0.52 0.016 264)',
    'text-inverse': 'oklch(0.99 0.002 264)',
    brand: 'oklch(0.5 0.19 256)',
    'brand-hover': 'oklch(0.44 0.19 256)',
    'brand-active': 'oklch(0.56 0.18 256)',
    'brand-tint': 'oklch(0.5 0.19 256 / 0.1)',
    'on-brand': 'oklch(0.99 0.002 264)',
    danger: 'oklch(0.55 0.2 25)',
    'danger-tint': 'oklch(0.55 0.2 25 / 0.1)',
    warning: 'oklch(0.52 0.14 70)',
    'warning-tint': 'oklch(0.52 0.14 70 / 0.12)',
    success: 'oklch(0.52 0.14 155)',
  },
  dark: {
    canvas: 'oklch(0.18 0.012 264)',
    surface: 'oklch(0.222 0.014 264)',
    'surface-2': 'oklch(0.268 0.016 264)',
    'surface-3': 'oklch(0.31 0.018 264)',
    line: 'oklch(0.32 0.016 264)',
    'line-strong': 'oklch(0.44 0.022 264)',
    'line-input': 'oklch(0.6 0.02 264)',
    text: 'oklch(0.97 0.003 264)',
    'text-soft': 'oklch(0.78 0.014 264)',
    'text-mute': 'oklch(0.68 0.016 264)',
    'text-inverse': 'oklch(0.18 0.014 264)',
    brand: 'oklch(0.7 0.16 256)',
    'brand-hover': 'oklch(0.78 0.15 256)',
    'brand-active': 'oklch(0.62 0.17 256)',
    'brand-tint': 'oklch(0.7 0.16 256 / 0.14)',
    'on-brand': 'oklch(0.16 0.02 256)',
    danger: 'oklch(0.7 0.18 22)',
    'danger-tint': 'oklch(0.7 0.18 22 / 0.14)',
    warning: 'oklch(0.8 0.15 85)',
    'warning-tint': 'oklch(0.8 0.15 85 / 0.14)',
    success: 'oklch(0.74 0.16 155)',
  },
};

/** 代码高亮沿用 giscus 官方配色（Primer prettylights），只保证与底色对比度。 */
const SYNTAX: Record<GiscusTone, string> = {
  light:
    '--color-prettylights-syntax-comment:#6e7781;--color-prettylights-syntax-constant:#0550ae;--color-prettylights-syntax-entity:#8250df;--color-prettylights-syntax-storage-modifier-import:#24292f;--color-prettylights-syntax-entity-tag:#116329;--color-prettylights-syntax-keyword:#cf222e;--color-prettylights-syntax-string:#0a3069;--color-prettylights-syntax-variable:#953800;--color-prettylights-syntax-brackethighlighter-unmatched:#82071e;--color-prettylights-syntax-invalid-illegal-text:#f6f8fa;--color-prettylights-syntax-invalid-illegal-bg:#82071e;--color-prettylights-syntax-carriage-return-text:#f6f8fa;--color-prettylights-syntax-carriage-return-bg:#cf222e;--color-prettylights-syntax-string-regexp:#116329;--color-prettylights-syntax-markup-list:#3b2300;--color-prettylights-syntax-markup-heading:#0550ae;--color-prettylights-syntax-markup-italic:#24292f;--color-prettylights-syntax-markup-bold:#24292f;--color-prettylights-syntax-markup-deleted-text:#82071e;--color-prettylights-syntax-markup-deleted-bg:#ffebe9;--color-prettylights-syntax-markup-inserted-text:#116329;--color-prettylights-syntax-markup-inserted-bg:#dafbe1;--color-prettylights-syntax-markup-changed-text:#953800;--color-prettylights-syntax-markup-changed-bg:#ffd8b5;--color-prettylights-syntax-markup-ignored-text:#eaeef2;--color-prettylights-syntax-markup-ignored-bg:#0550ae;--color-prettylights-syntax-meta-diff-range:#8250df;--color-prettylights-syntax-brackethighlighter-angle:#57606a;--color-prettylights-syntax-sublimelinter-gutter-mark:#8c959f;--color-prettylights-syntax-constant-other-reference-link:#0a3069;',
  dark:
    '--color-prettylights-syntax-comment:#8b949e;--color-prettylights-syntax-constant:#79c0ff;--color-prettylights-syntax-entity:#d2a8ff;--color-prettylights-syntax-storage-modifier-import:#c9d1d9;--color-prettylights-syntax-entity-tag:#7ee787;--color-prettylights-syntax-keyword:#ff7b72;--color-prettylights-syntax-string:#a5d6ff;--color-prettylights-syntax-variable:#ffa657;--color-prettylights-syntax-brackethighlighter-unmatched:#f85149;--color-prettylights-syntax-invalid-illegal-text:#f0f6fc;--color-prettylights-syntax-invalid-illegal-bg:#8e1519;--color-prettylights-syntax-carriage-return-text:#f0f6fc;--color-prettylights-syntax-carriage-return-bg:#b62324;--color-prettylights-syntax-string-regexp:#7ee787;--color-prettylights-syntax-markup-list:#f2cc60;--color-prettylights-syntax-markup-heading:#1f6feb;--color-prettylights-syntax-markup-italic:#c9d1d9;--color-prettylights-syntax-markup-bold:#c9d1d9;--color-prettylights-syntax-markup-deleted-text:#ffdcd7;--color-prettylights-syntax-markup-deleted-bg:#67060c;--color-prettylights-syntax-markup-inserted-text:#aff5b4;--color-prettylights-syntax-markup-inserted-bg:#033a16;--color-prettylights-syntax-markup-changed-text:#ffdfb6;--color-prettylights-syntax-markup-changed-bg:#5a1e02;--color-prettylights-syntax-markup-ignored-text:#c9d1d9;--color-prettylights-syntax-markup-ignored-bg:#1158c7;--color-prettylights-syntax-meta-diff-range:#d2a8ff;--color-prettylights-syntax-brackethighlighter-angle:#8b949e;--color-prettylights-syntax-sublimelinter-gutter-mark:#484f58;--color-prettylights-syntax-constant-other-reference-link:#a5d6ff;',
};

const FONT_SANS =
  "system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif";
const FONT_MONO = "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";

export function giscusThemeCss(tone: GiscusTone): string {
  const t = TOKENS[tone];
  const v = (k: string) => {
    const x = t[k];
    if (!x) throw new Error(`giscus theme: missing token ${k}`);
    return x;
  };
  const vars = [
    // 按钮（次要）：Kumo secondary —— 浅底、细边框、无投影
    `--color-btn-text:${v('text')}`,
    `--color-btn-bg:${v('surface')}`,
    `--color-btn-border:${v('line-strong')}`,
    `--color-btn-shadow:none`,
    `--color-btn-inset-shadow:none`,
    `--color-btn-hover-bg:${v('surface-2')}`,
    `--color-btn-hover-border:${v('line-strong')}`,
    `--color-btn-active-bg:${v('surface-3')}`,
    `--color-btn-active-border:${v('line-strong')}`,
    `--color-btn-selected-bg:${v('surface-3')}`,
    // 按钮（主）：站点主色
    `--color-btn-primary-text:${v('on-brand')}`,
    `--color-btn-primary-bg:${v('brand')}`,
    `--color-btn-primary-border:transparent`,
    `--color-btn-primary-shadow:none`,
    `--color-btn-primary-inset-shadow:none`,
    `--color-btn-primary-hover-bg:${v('brand-hover')}`,
    `--color-btn-primary-hover-border:transparent`,
    `--color-btn-primary-selected-bg:${v('brand-active')}`,
    `--color-btn-primary-selected-shadow:none`,
    `--color-btn-primary-disabled-text:${v('on-brand')}`,
    `--color-btn-primary-disabled-bg:${v('brand-tint')}`,
    `--color-btn-primary-disabled-border:transparent`,
    `--color-action-list-item-default-hover-bg:${v('surface-2')}`,
    // 分段控件：Kumo segmented（凹槽 + 白色浮起）
    `--color-segmented-control-bg:${v('surface-3')}`,
    `--color-segmented-control-button-bg:${v('surface')}`,
    `--color-segmented-control-button-selected-border:${v('line-strong')}`,
    // 文字
    `--color-fg-default:${v('text')}`,
    `--color-fg-muted:${v('text-soft')}`,
    `--color-fg-subtle:${v('text-mute')}`,
    // 底色：与抽屉同为 surface，iframe 不出现色块
    `--color-canvas-default:${v('surface')}`,
    `--color-canvas-overlay:${v('surface')}`,
    `--color-canvas-inset:${v('surface-2')}`,
    `--color-canvas-subtle:${v('surface-2')}`,
    // 细边框
    `--color-border-default:${v('line')}`,
    `--color-border-muted:${v('line')}`,
    `--color-neutral-muted:${v('surface-3')}`,
    // 强调 = 品牌色
    `--color-accent-fg:${v('brand')}`,
    `--color-accent-emphasis:${v('brand')}`,
    `--color-accent-muted:${v('brand-tint')}`,
    `--color-accent-subtle:${v('brand-tint')}`,
    `--color-success-fg:${v('success')}`,
    `--color-attention-fg:${v('warning')}`,
    `--color-attention-muted:${v('warning-tint')}`,
    `--color-attention-subtle:${v('warning-tint')}`,
    `--color-danger-fg:${v('danger')}`,
    `--color-danger-muted:${v('danger-tint')}`,
    `--color-danger-subtle:${v('danger-tint')}`,
    `--color-primer-shadow-inset:none`,
    `--color-scale-gray-1:${v('surface-3')}`,
    `--color-scale-blue-1:${v('brand-tint')}`,
    `--color-social-reaction-bg-hover:${v('surface-3')}`,
    `--color-social-reaction-bg-reacted-hover:${v('brand-tint')}`,
  ].join(';');

  return `/*! giscus Kumo theme (${tone}) for vector-wallpapers.rei8t.dev — variable set based on giscus light/dark (MIT, GitHub Primer) */
main{${SYNTAX[tone]}${vars};color-scheme:${tone};font-family:${FONT_SANS};font-size:14px;color:var(--color-fg-default)}
main code,main pre,main .gsc-comment-box-textarea.font-mono{font-family:${FONT_MONO}}
main .pagination-loader-container{background-image:url(https://github.com/images/modules/pulls/progressive-disclosure-line${tone === 'dark' ? '-dark' : ''}.svg)}
main .gsc-loading-image{background-image:url(https://github.githubassets.com/images/mona-loading-${tone === 'dark' ? 'dimmed' : 'default'}.gif)}

/* ── 顶部：表情反应压成一行，和「N 条评论」同一行 ── */
main .gsc-main{flex-direction:row;flex-wrap:wrap;align-items:center;column-gap:12px;row-gap:16px}
main .gsc-comments{display:contents}
main .gsc-comments>*{order:2;flex:1 0 100%;min-width:0}
main .gsc-comments>.gsc-header{order:0;flex:0 1 auto;margin:0;padding:0;border:0}
main .gsc-comments>.gsc-header .gsc-left-header{flex:0 1 auto}
main .gsc-reactions{order:1;flex:0 1 auto!important;flex-direction:row;align-items:center;justify-content:flex-start;gap:6px;padding-left:12px;border-left:1px solid var(--color-border-default)}
main .gsc-reactions-count{order:1;margin:0;font-size:12px;font-weight:400;line-height:16px;color:var(--color-fg-subtle);text-align:left}
main .gsc-reactions>div{order:2;flex:0 0 auto!important;margin:0!important;justify-content:flex-start!important;gap:4px}
main .gsc-reactions-button{width:22px;height:22px;border-radius:6px;border:1px solid var(--color-border-default);background:var(--color-canvas-default)}
main .gsc-reactions-button:hover{background:var(--color-canvas-subtle)}
main .gsc-comments-count,main .gsc-comments-count-separator{font-size:14px;font-weight:600;line-height:20px}
main .gsc-header{padding-bottom:0}

/* ── 圆角 / 细边框 / 无投影 ── */
main .gsc-comment>div:not(.gsc-comment-author-avatar){border-radius:8px;border-width:1px;border-color:var(--color-border-default);box-shadow:none}

/* ── 评论输入框：只保留一层边框（Rei 2026-10-14）──
 * 默认是「表单外框 + textarea 自己的框 + Markdown 栏上方虚线」三层线。
 * 现在：表单本身无框无底；唯一一圈细边框画在 .gsc-comment-box-write 上，聚焦时只这一圈变色 + ring；
 * textarea 与底部 Markdown 栏自身一律无 border / outline / box-shadow，也没有虚线分隔。 */
main .gsc-comment-box,main .gsc-comment-box:not(.gsc-comment-box-is-reply),main .gsc-comment-box-is-reply{border:0!important;border-radius:0;background:transparent!important;box-shadow:none}
main .gsc-comment-box-tabs{border:0!important;background:transparent!important;border-radius:0;align-items:center}
main .gsc-comment-box-tabs>div:first-child{margin:0 0 8px!important;display:flex;gap:4px}
main .gsc-comment-box-tabs button{border:0!important;border-radius:6px;padding:4px 10px;font-size:14px;line-height:20px;background:transparent;color:var(--color-fg-muted)}
main .gsc-comment-box-tabs button.color-bg-canvas,main .gsc-comment-box-tabs button.color-text-primary{background:var(--color-segmented-control-bg)!important;color:var(--color-fg-default)}
main .gsc-comment-box-md-toolbar{margin:0 0 8px;padding:0}
main .gsc-comment-box-main{padding:0!important;margin:0!important}
main .gsc-comment-box-bottom{padding:0!important;margin:8px 0 0!important;border:0!important}
main .gsc-comment-box-write{border:1px solid var(--color-border-default);border-radius:8px;background:var(--color-canvas-default);box-shadow:none;outline:none;overflow:hidden}
main .gsc-comment-box-write:focus-within{border-color:var(--color-accent-fg);box-shadow:0 0 0 3px ${v('brand-tint')};outline:none}
main .gsc-comment-box-textarea,main .gsc-comment-box-textarea:hover,main .gsc-comment-box-textarea:focus,main .gsc-comment-box-textarea:focus-visible,main .gsc-comment-box-textarea:disabled{border:0!important;border-style:none!important;outline:none!important;box-shadow:none!important;border-radius:0;background:transparent!important;font-size:14px;line-height:20px;padding:8px 12px}
main .gsc-comment-box-textarea-extras,main .gsc-comment-box-textarea-extras:focus,main .gsc-comment-box-textarea-extras:focus-within{border:0!important;border-style:none!important;outline:none!important;box-shadow:none!important;border-radius:0;background:transparent!important;padding:4px 10px 6px}
main .gsc-comment-box-preview{border:0!important;box-shadow:none}
main .form-control:not(.gsc-comment-box-textarea):not(.gsc-comment-box-textarea-extras){border-radius:6px;border-color:var(--color-border-default);background:var(--color-canvas-default);box-shadow:none;font-size:14px}
main .form-control:not(.gsc-comment-box-textarea):not(.gsc-comment-box-textarea-extras):focus{outline:none;border-color:var(--color-accent-fg);box-shadow:0 0 0 3px ${v('brand-tint')}}
main .btn{border-radius:6px;font-size:14px;font-weight:500;line-height:20px;padding:5px 12px;box-shadow:none;transition:none}
main .btn-primary{border-color:transparent}
main .gsc-reactions-popover,main .gsc-reply-box{border-radius:8px;border-color:var(--color-border-default)}
main .gsc-social-reaction-summary-item{border-radius:999px;border-color:var(--color-border-default)}
main .gsc-emoji-button{border-radius:6px}
main a,main .color-text-link{color:var(--color-accent-fg)}
main .gsc-comment-author-avatar img,main .gsc-reply-author-avatar img{border-radius:999px}
main .gsc-timeline{gap:16px}
`;
}

const CORS_ORIGIN = 'https://giscus.app';

/** 路径 → 主题；不是主题路径返回 null。 */
export function giscusThemeTone(pathname: string): GiscusTone | null {
  if (pathname === '/giscus/kumo-light.css') return 'light';
  if (pathname === '/giscus/kumo-dark.css') return 'dark';
  return null;
}

export function serveGiscusTheme(req: Request, tone: GiscusTone): Response {
  const headers = new Headers({
    'Content-Type': 'text/css; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    Vary: 'Origin',
    // 一小时浏览器缓存 + 一天边缘缓存；改样式后最多一小时生效（不带版本号，URL 必须稳定以便 setConfig）
    'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    return new Response(null, { status: 204, headers });
  }
  return new Response(req.method === 'HEAD' ? null : giscusThemeCss(tone), { headers });
}
