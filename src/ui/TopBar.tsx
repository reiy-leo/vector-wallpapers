/**
 * 顶栏 —— 全局动作的唯一入口。
 *
 * 信息层级（从左到右对应「身份 → 全局视图 → 全局操作」）：
 *   品牌 → 面板开关 → 收藏 → 主题 → 分享 → 导出
 *
 * 导出做成「主动作 + 菜单」而不是两个并排按钮：SVG 与 PNG 是同一意图的
 * 两种格式，并排会让顶栏被两个同类按钮占满，且用户每次都要先做一次选择。
 */
import { useEffect, useState } from 'react';
import { registry } from '../patterns';
import { LIMITS } from '../shared/constants';
import { detectPlatform, guardCanvasSize, type ExportScale } from '../shared/guards';
import { copySVGSource, exportPNG, exportSVG } from './exporters';
import {
  getConfig,
  readFavorites,
  setUI,
  usePatternDef,
  useWorkbenchSelector,
  writeFavorites,
} from './store';
import { shareUrl } from './share';
import { Button, Dialog, IconButton, Segmented, Tooltip } from './primitives';
import {
  IconAuto,
  IconCode,
  IconDownload,
  IconMoon,
  IconPanel,
  IconShare,
  IconStar,
  IconSun,
} from './icons';
import type { UIState } from '../engine/types';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';
export type NoticeFn = (message: string, tone?: NoticeTone) => void;

export function TopBar({ onNotice }: { onNotice: NoticeFn }) {
  const def = usePatternDef();
  const theme = useWorkbenchSelector((s) => s.ui.theme);
  const panel = useWorkbenchSelector((s) => s.ui.panel);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [exportOpen, setExportOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);

  // 收藏只在挂载时读一次：它是持久化数据，不参与渲染高频变化
  useEffect(() => {
    setFavorites(readFavorites());
  }, []);

  const isFavorite = favorites.includes(def.id);

  const toggleFavorite = () => {
    const next = isFavorite
      ? favorites.filter((x) => x !== def.id)
      : [def.id, ...favorites].slice(0, LIMITS.MAX_FAVORITES);
    writeFavorites(next);
    setFavorites(next);
    onNotice(isFavorite ? '已取消收藏' : `已收藏「${def.name}」`, 'success');
  };

  const copyLink = async () => {
    const url = shareUrl(getConfig(), {
      theme: theme === 'system' ? 'system' : theme,
      panel,
    });
    try {
      await navigator.clipboard.writeText(url);
      onNotice('分享链接已复制', 'success');
    } catch {
      // 剪贴板在非 https / 无权限时不可用，退回展示让用户手动复制
      window.prompt('复制此链接分享当前壁纸：', url);
    }
  };

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <h1 className="mr-1 flex items-center gap-2 text-md font-semibold text-fg">
        <LogoMark />
        <span>Vector Wallpapers</span>
      </h1>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip content={panel === 'right' ? '把面板移到左侧' : '把面板移到右侧'}>
          <IconButton
            label="切换面板位置"
            aria-pressed={panel === 'left'}
            className={panel === 'left' ? 'bg-brand-tint text-brand' : ''}
            onClick={() => setUI({ panel: panel === 'right' ? 'left' : 'right' })}
          >
            <IconPanel size={16} />
          </IconButton>
        </Tooltip>

        <Tooltip content={isFavorite ? '取消收藏' : '收藏这个母题'}>
          <IconButton
            label={isFavorite ? '取消收藏' : '收藏'}
            aria-pressed={isFavorite}
            className={isFavorite ? 'text-brand' : ''}
            onClick={toggleFavorite}
          >
            <IconStar size={16} filled={isFavorite} />
          </IconButton>
        </Tooltip>

        <Tooltip content="查看 SVG 源码">
          <IconButton label="查看源码" onClick={() => setSourceOpen(true)}>
            <IconCode size={16} />
          </IconButton>
        </Tooltip>

        <Segmented
          label="主题"
          size="sm"
          value={theme}
          onChange={(t) => setUI({ theme: t as UIState['theme'] })}
          options={[
            { value: 'light', label: '', icon: <IconSun size={14} />, title: '浅色' },
            { value: 'dark', label: '', icon: <IconMoon size={14} />, title: '深色' },
            { value: 'system', label: '', icon: <IconAuto size={14} />, title: '跟随系统' },
          ]}
        />

        <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
          <IconShare size={15} />
          分享
        </Button>

        {/* 导出：单个主动作，对话框里再选格式 */}
        <Button variant="primary" size="sm" onClick={() => setExportOpen(true)}>
          <IconDownload size={15} />
          导出
        </Button>
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onNotice={onNotice}
      />
      <SourceDialog open={sourceOpen} onClose={() => setSourceOpen(false)} onNotice={onNotice} />
    </header>
  );
}

/** 品牌标记：由两个偏移的圆角方块暗示「pattern 可叠加」的抽象图形。 */
function LogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="shrink-0">
      <rect x="1.5" y="1.5" width="11" height="11" rx="3" className="fill-brand" opacity="0.9" />
      <rect
        x="7.5"
        y="7.5"
        width="11"
        height="11"
        rx="3"
        className="fill-brand"
        opacity="0.45"
      />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 导出对话框
 * ───────────────────────────────────────────────────────────────── */

/**
 * ⭐ Kumo `dialog-rendering`：**绝不条件渲染**。
 * 本组件始终挂载，由 `open` prop 决定可见性 —— 这样开合动画才有意义，
 * 否则每次都是「突然出现」（hidden 属性让不可见时不进无障碍树）。
 */
function ExportDialog({
  open,
  onClose,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  onNotice: NoticeFn;
}) {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);
  const [scale, setScale] = useState<ExportScale>(2);
  const [busy, setBusy] = useState(false);

  const platform = detectPlatform();
  const guard = guardCanvasSize(cfg.width, cfg.height, scale);
  const finalPixels = (guard.width * guard.height / 1_000_000).toFixed(1);

  const onSVG = () => {
    exportSVG(def, cfg);
    onNotice(`已导出 ${cfg.width}×${cfg.height} 的 SVG`, 'success');
    onClose();
  };

  const onPNG = async () => {
    setBusy(true);
    const result = await exportPNG(def, cfg, scale);
    setBusy(false);
    // 降级 / 不支持都要说出来 —— 静默降级会被当成 bug
    if (result.ok) onNotice(`已导出 ${guard.width}×${guard.height} 的 PNG`, 'success');
    else if (result.notice) onNotice(result.notice, 'warning');
    if (result.ok || !result.notice?.includes('iOS')) onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="导出壁纸"
      description="导出为静态图像，动画只在预览中呈现。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="secondary" onClick={onSVG}>
            导出 SVG
          </Button>
          {platform === 'ios' ? (
            // ⭐ 刻意不用原生 disabled：disabled 的按钮不派发 click，
            //   点了毫无反应，用户会以为按钮坏了。用 aria-disabled 表达
            //   不可用语义，视觉照常灰化，点击给出明确替代路径。
            <Button
              variant="danger"
              aria-disabled={platform === 'ios'}
              className={platform === 'ios' ? 'cursor-not-allowed opacity-45' : ''}
              onClick={() =>
                onNotice(
                  'iOS 设备暂不支持 PNG 导出。SVG 是矢量、体积更小，建议直接用 SVG；' +
                    '若确实需要 PNG，可在桌面浏览器打开本站再导出。',
                  'warning',
                )
              }
            >
              导出 PNG（iOS 不支持）
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void onPNG()}>
              {busy ? '导出中…' : `导出 PNG @${scale}x`}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base text-fg-soft">输出尺寸</span>
          <code className="font-mono text-[0.9em] text-fg">
            {guard.width} × {guard.height}
          </code>
        </div>

        {platform !== 'ios' && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-base text-fg-soft">倍率</span>
            <Segmented
              label="导出倍率"
              size="sm"
              value={String(scale) as '1' | '2' | '3'}
              onChange={(v) => setScale(Number(v) as ExportScale)}
              options={[
                { value: '1', label: '@1x' },
                { value: '2', label: '@2x' },
                { value: '3', label: '@3x' },
              ]}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-base text-fg-soft">像素总量</span>
          <span className="text-sm text-fg-mute">{finalPixels} M px</span>
        </div>

        {/* 守卫提示：降级必须明示（PRD Q8：不可静默失败） */}
        {guard.notice && (
          <p className="rounded-md bg-warning-tint px-3 py-2 text-sm text-warning">{guard.notice}</p>
        )}

        {platform === 'ios' && (
          <p className="rounded-md bg-warning-tint px-3 py-2 text-sm text-warning">
            iOS 设备暂不支持 PNG 导出。SVG 是矢量、体积更小，建议直接用 SVG；
            若确实需要 PNG，可在桌面浏览器打开本站再导出。
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** 源码对话框 —— 供开发者查看与复制产物（PRD 验收项之一）。 */
function SourceDialog({
  open,
  onClose,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  onNotice: NoticeFn;
}) {
  const def = usePatternDef();
  const [copied, setCopied] = useState(false);

  // 只在打开时生成，避免每次父组件重渲染都重新渲染一遍 SVG
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!open) return;
    void import('../engine/render').then(({ renderStandaloneSVG }) => {
      setSvg(renderStandaloneSVG(def, getConfig(), { skipBudget: true }));
    });
  }, [open, def]);

  const copy = async () => {
    const ok = await copySVGSource(def, getConfig());
    if (ok) {
      setCopied(true);
      onNotice('源码已复制到剪贴板', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      onNotice('复制失败，请手动选择文本复制', 'warning');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="SVG 源码"
      description="与预览、导出完全同一份产物，可直接粘贴到任意支持 SVG 的地方。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={() => void copy()}>
            {copied ? '已复制' : '复制源码'}
          </Button>
        </>
      }
    >
      <pre className="vw-scroll max-h-80 overflow-auto rounded-md bg-surface-3 p-3 font-mono text-[0.9em] leading-relaxed text-fg-soft">
        {svg}
      </pre>
      <p className="text-2xs text-fg-mute">
        共 {(new TextEncoder().encode(svg).length / 1024).toFixed(1)} KB · 母题库共 {registry.size} 个
      </p>
    </Dialog>
  );
}
