/**
 * giscus 登录回跳接收 —— 必须在应用其他模块之前执行（main.tsx 第一个 import）。
 *
 * ⚠️ Bug（Rei 2026-10-13）：点「用 GitHub 登录」后页面刷新一下，什么也没发生。
 * 原因：giscus 授权后跳回 `原地址?giscus=<session>`，由 client.js 读取该参数写入
 * localStorage('giscus-session')。但我们的 client.js 只在打开留言抽屉时才注入，
 * 回跳后它根本没加载，同时工作台把配置同步回 URL 时把 `giscus` 参数抹掉了 → 会话丢失。
 *
 * 修复：启动时先把 `giscus` 参数按 client.js 同样的格式（JSON 字符串）存进 localStorage，
 * 从地址栏去掉，并标记「刚登录」让留言抽屉自动打开。之后 client.js 照常读 localStorage。
 */
export const GISCUS_SESSION_KEY = 'giscus-session';

/** 返回本次加载是否刚从 giscus 登录回跳。可传入参数以便测试。 */
export function consumeGiscusSession(
  loc: Pick<Location, 'href'> = window.location,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
  replace: (url: string) => void = (url) => window.history.replaceState(window.history.state, '', url),
): boolean {
  try {
    const url = new URL(loc.href);
    const session = url.searchParams.get('giscus');
    if (!session) return false;
    storage.setItem(GISCUS_SESSION_KEY, JSON.stringify(session));
    url.searchParams.delete('giscus');
    replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

/** 模块加载时执行一次；TopBar 用它决定留言抽屉的初始开合。 */
export const JUST_SIGNED_IN_TO_GISCUS: boolean =
  typeof window !== 'undefined' ? consumeGiscusSession() : false;
