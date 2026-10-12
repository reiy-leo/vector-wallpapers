/**
 * 首屏主题预置（PRD P0-8）。
 *
 * 必须是独立文件而非内联脚本 —— public/_headers 的 CSP `script-src`
 * 不含 'unsafe-inline'。同步 <script src> 仍是阻塞式执行，
 * 早于 React 挂载，因此不会看到主题闪烁。
 */
(function () {
  try {
    var raw = localStorage.getItem('vw:theme:v1');
    var theme = raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system';
    var resolved =
      theme === 'system'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
          ? 'dark'
          : 'light'
        : theme;
    document.documentElement.dataset.theme = resolved;
    document.documentElement.dataset.themePref = theme;
  } catch (e) {
    /* localStorage 不可用（隐私模式 / 损坏）→ 保持 HTML 上的默认值，绝不白屏 */
    document.documentElement.dataset.theme = 'light';
  }
})();