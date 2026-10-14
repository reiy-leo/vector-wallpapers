/**
 * 留言区 —— giscus（GitHub Discussions）。Rei 2026-10-13。
 *
 * 讨论存在公开仓库 reiy-leo/cfw-comments 的「vector-wallpapers」分类里，
 * 按 pathname 映射（整个工作台都在 `/`，状态在 query string，所以全站一个帖子）。
 *
 * 形态：顶栏「留言」按钮 → 右侧抽屉。工作台是满屏三栏、没有「页面底部」，
 * 抽屉不挤占画布，打开时才注入 giscus 脚本（首次打开前零第三方请求）。
 *
 * ⭐ 外壳常驻 DOM，用 hidden 控制显隐（Kumo dialog-rendering），
 *   giscus 的 iframe 注入一次后保留，关了再开不会重新加载。
 * ⭐ 主题跟随网站：light/dark 直接对应，system 读 prefers-color-scheme；
 *   主题是本站 Worker 提供的 Kumo 风格 CSS（绝对 URL，/giscus/kumo-{light,dark}.css）；
 *   切换时 postMessage 给 iframe（giscus 官方 setConfig 协议），不重建。
 * ⚠️ CSP：public/_headers 的 script-src / style-src / frame-src 已放行 https://giscus.app。
 */
import { useEffect, useRef, useState } from 'react';
import { useWorkbenchSelector } from './store';
import { IconButton } from './primitives';
import { IconClose } from './icons';
import type { UIState } from '../engine/types';

export const GISCUS_ORIGIN = 'https://giscus.app';

/** giscus 固定参数（Rei 在 reiy-leo/cfw-comments 配好的）。 */
export const GISCUS_ATTRS: Readonly<Record<string, string>> = {
  'data-repo': 'reiy-leo/cfw-comments',
  'data-repo-id': 'R_kgDOVGzwdQ',
  'data-category': 'vector-wallpapers',
  'data-category-id': 'DIC_kwDOVGzwdc4DIS5N',
  'data-mapping': 'pathname',
  'data-strict': '1',
  'data-reactions-enabled': '1',
  'data-emit-metadata': '0',
  'data-input-position': 'top',
  'data-lang': 'zh-CN',
  'data-loading': 'lazy',
};

/**
 * giscus 主题 CSS 的来源：本站 Worker（src/worker/giscus-theme.ts，Kumo 风格，Rei 2026-10-14）。
 * giscus 要求自定义主题是**绝对 URL**，由 giscus.app 的 iframe 跨域加载（Worker 已带 CORS）。
 * 固定用线上域名：本地 vite dev 不跑 Worker，用线上那份同样能预览。
 */
export const GISCUS_THEME_ORIGIN = 'https://vector-wallpapers.rei8t.dev';

/** 网站主题 → giscus 主题（绝对 URL）。 */
export function giscusTheme(dark: boolean): string {
  return `${GISCUS_THEME_ORIGIN}/giscus/kumo-${dark ? 'dark' : 'light'}.css`;
}

export function resolveDark(theme: UIState['theme'], systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark);
}

function useSystemDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

export function CommentsDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const theme = useWorkbenchSelector((s) => s.ui.theme);
  const systemDark = useSystemDark();
  const gTheme = giscusTheme(resolveDark(theme, systemDark));
  const hostRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  // 最新主题；iframe 晚于主题切换才加载完时，在 load 事件里补发一次
  const themeRef = useRef(gTheme);
  themeRef.current = gTheme;

  // 首次打开才注入脚本
  useEffect(() => {
    if (!open || mounted || !hostRef.current) return;
    const s = document.createElement('script');
    s.src = `${GISCUS_ORIGIN}/client.js`;
    s.async = true;
    s.crossOrigin = 'anonymous';
    for (const [k, v] of Object.entries(GISCUS_ATTRS)) s.setAttribute(k, v);
    s.setAttribute('data-theme', gTheme);
    hostRef.current.appendChild(s);
    setMounted(true);
  }, [open, mounted, gTheme]);

  // 主题变化 → 通知已加载的 iframe（giscus 官方 setConfig 协议）
  useEffect(() => {
    if (!mounted) return;
    postTheme(hostRef.current, gTheme);
  }, [gTheme, mounted]);

  // iframe 由 client.js 异步插入：插入后挂 load 监听，加载完按「当前」主题再同步一次。
  // 首次加载本身已按注入时的 data-theme 渲染（服务端直出主题 link），这里只兜底「加载途中切了主题」。
  useEffect(() => {
    if (!mounted || !hostRef.current) return;
    const host = hostRef.current;
    let frame: HTMLIFrameElement | null = null;
    const onLoad = () => postTheme(host, themeRef.current);
    const attach = () => {
      if (frame) return;
      frame = host.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
      frame?.addEventListener('load', onLoad);
    };
    attach();
    const mo = new MutationObserver(attach);
    mo.observe(host, { childList: true, subtree: true });
    return () => {
      mo.disconnect();
      frame?.removeEventListener('load', onLoad);
    };
  }, [mounted]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <div hidden={!open} className="fixed inset-0 z-50" role="presentation">
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="留言"
        className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-surface shadow-pop"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line px-5 py-3">
          <div className="grid gap-0.5">
            <h2 className="text-md font-semibold text-fg">留言</h2>
            <p className="text-sm text-fg-soft">用 GitHub 账号登录后即可留言</p>
          </div>
          <IconButton label="关闭" size="sm" onClick={onClose}>
            <IconClose size={15} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div ref={hostRef} className="giscus" />
        </div>
      </aside>
    </div>
  );
}

function postTheme(host: HTMLElement | null, theme: string) {
  const frame = host?.querySelector<HTMLIFrameElement>('iframe.giscus-frame');
  frame?.contentWindow?.postMessage({ giscus: { setConfig: { theme } } }, GISCUS_ORIGIN);
}

/** 留言气泡图标（与 icons.tsx 同规格）。 */
export function IconChat({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5v-3.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <path d="M8 10h8M8 13h5" />
    </svg>
  );
}
