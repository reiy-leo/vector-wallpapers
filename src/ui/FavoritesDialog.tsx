/**
 * 管理收藏 —— 头像菜单入口（Rei 2026-10-12）。
 *
 * 收藏的是「具体的一张壁纸」（配色 + 参数 + seed），所以这里按原比例渲染
 * **真实 SVG**（不是母题库那种小缩略图），点一张进入聚焦预览：按视口尺寸重渲染、
 * 带动画，可左右翻页、复制 CSS 或删除。
 *
 * ⭐ 外壳常驻 DOM、用 hidden 控制显隐（与 Dialog 同一纪律）；
 *   但卡片内容只在打开时渲染 —— 200 张 SVG 不该在关着的时候白算。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { registry } from '../patterns';
import { renderStandaloneSVG } from '../engine/render';
import { svgToDataUri } from '../shared/download';
import { clamp } from '../shared/guards';
import { LIMITS } from '../shared/constants';
import { removeSaved, savedToConfig, useWorkbenchSelector, type SavedWallpaper } from './store';
import { copyBackgroundCSS } from './exporters';
import { Button, IconButton } from './primitives';
import { IconChevron, IconClose, IconFocus } from './icons';
import type { NoticeFn } from './TopBar';

export function FavoritesDialog({
  open,
  onClose,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  onNotice: NoticeFn;
}) {
  const saved = useWorkbenchSelector((s) => s.saved);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  // 关闭时顺手退出聚焦
  useEffect(() => {
    if (!open) setFocusIdx(null);
  }, [open]);

  // Esc：聚焦中先退出聚焦，否则关闭整个面板
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (focusIdx !== null) setFocusIdx(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, focusIdx, onClose]);

  // 复制这张收藏的 CSS 背景（Rei 2026-10-12：管理收藏里用「复制 CSS」替代「套用」）
  const copyCss = useCallback(
    (item: SavedWallpaper) => {
      const def = registry.get(item.patternId);
      const cfg = savedToConfig(item);
      if (!def || !cfg) {
        onNotice('这张收藏的母题已不存在', 'warning');
        return;
      }
      void copyBackgroundCSS(def, cfg).then((ok) => {
        if (ok) onNotice('CSS 已复制到剪贴板', 'success');
        else onNotice('复制失败：剪贴板不可用（需 https 且允许剪贴板权限）', 'warning');
      });
    },
    [onNotice],
  );

  const remove = useCallback(
    (item: SavedWallpaper) => {
      removeSaved(item.q);
      onNotice('已删除收藏', 'info');
    },
    [onNotice],
  );

  return (
    <div
      hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label="管理收藏"
      className="fixed inset-0 z-[90] flex flex-col bg-canvas"
    >
      {open && (
        <>
          <div className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3.5">
            <div className="grid gap-0.5">
              <h2 className="text-lg font-semibold text-fg">管理收藏</h2>
              <p className="text-sm text-fg-soft">
                {saved.length > 0 ? `${saved.length} 张壁纸 · 点一张聚焦预览` : '还没有收藏'}
              </p>
            </div>
            <IconButton label="关闭（Esc）" onClick={onClose}>
              <IconClose size={18} />
            </IconButton>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {saved.length === 0 ? (
              <p className="mx-auto mt-24 max-w-sm text-center text-base text-fg-soft">
                在画布上点顶栏的星标，就会把当前这张壁纸（配色、参数、seed）收藏到这里。
              </p>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {saved.map((item, i) => (
                  <li key={item.q}>
                    <SavedCard
                      item={item}
                      onFocus={() => setFocusIdx(i)}
                      onCopy={() => copyCss(item)}
                      onRemove={() => remove(item)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {focusIdx !== null && saved[focusIdx] && (
            <SavedFocus
              item={saved[focusIdx]}
              index={focusIdx}
              total={saved.length}
              onPrev={() => setFocusIdx((focusIdx - 1 + saved.length) % saved.length)}
              onNext={() => setFocusIdx((focusIdx + 1) % saved.length)}
              onCopy={() => copyCss(saved[focusIdx])}
              onClose={() => setFocusIdx(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

function SavedCard({
  item,
  onFocus,
  onCopy,
  onRemove,
}: {
  item: SavedWallpaper;
  onFocus: () => void;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const def = registry.get(item.patternId);
  const cfg = useMemo(() => savedToConfig(item), [item]);
  // 按收藏时的尺寸渲染完整 SVG（静态），<img> 等比缩放显示
  const uri = useMemo(
    () => (def && cfg ? svgToDataUri(renderStandaloneSVG(def, cfg, { skipBudget: true })) : ''),
    [def, cfg],
  );

  return (
    <figure className="grid gap-2.5">
      <button
        type="button"
        onClick={onFocus}
        disabled={!uri}
        aria-label={`聚焦预览 ${def?.name ?? item.patternId}`}
        className="group relative block overflow-hidden rounded-md bg-surface-2 ring-1 ring-line"
        style={cfg ? { aspectRatio: `${cfg.width} / ${cfg.height}` } : undefined}
      >
        {uri ? <img src={uri} alt="" className="block h-full w-full" /> : null}
        <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-surface/80 text-fg opacity-0 shadow-pop backdrop-blur group-hover:opacity-100 group-focus-visible:opacity-100">
          <IconFocus size={16} />
        </span>
      </button>
      <figcaption className="flex items-center justify-between gap-3">
        <div className="grid min-w-0">
          <span className="truncate text-base font-medium text-fg">{def?.name ?? '已下线的母题'}</span>
          <span className="truncate text-xs text-fg-mute">
            {cfg ? `${cfg.width}×${cfg.height} · seed ${cfg.seed}` : item.patternId}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onRemove}>
            删除
          </Button>
          <Button variant="secondary" size="sm" onClick={onCopy} disabled={!cfg}>
            复制 CSS
          </Button>
        </div>
      </figcaption>
    </figure>
  );
}

function SavedFocus({
  item,
  index,
  total,
  onPrev,
  onNext,
  onCopy,
  onClose,
}: {
  item: SavedWallpaper;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onCopy: () => void;
  onClose: () => void;
}) {
  const def = registry.get(item.patternId);
  const [view, setView] = useState(() => viewportSize());

  useEffect(() => {
    const onResize = () => setView(viewportSize());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onPrev, onNext]);

  // 与画布的聚焦预览一致：按视口尺寸重渲染、动画开关生效
  const uri = useMemo(() => {
    const cfg = savedToConfig(item);
    if (!def || !cfg) return '';
    return svgToDataUri(
      renderStandaloneSVG(def, { ...cfg, width: view.w, height: view.h }, { skipBudget: true, animate: true }),
    );
  }, [def, item, view]);

  const chrome = 'rounded-full bg-surface/80 text-fg shadow-pop backdrop-blur hover:bg-surface';

  return (
    <div className="fixed inset-0 z-[100] bg-canvas" aria-label={`${def?.name ?? ''} 聚焦预览`}>
      {uri ? <img src={uri} alt={`${def?.name ?? ''} 全屏预览`} className="block h-full w-full" /> : null}

      <div className="absolute right-4 top-4 flex items-center gap-2">
        <Button variant="primary" size="sm" className="rounded-full shadow-pop" onClick={onCopy}>
          复制 CSS
        </Button>
        <IconButton autoFocus label="退出聚焦（Esc）" className={chrome} onClick={onClose}>
          <IconClose size={18} />
        </IconButton>
      </div>

      {total > 1 && (
        <>
          <IconButton label="上一张（←）" className={`absolute left-4 top-1/2 -translate-y-1/2 ${chrome}`} onClick={onPrev}>
            <IconChevron dir="left" size={18} />
          </IconButton>
          <IconButton label="下一张（→）" className={`absolute right-4 top-1/2 -translate-y-1/2 ${chrome}`} onClick={onNext}>
            <IconChevron dir="right" size={18} />
          </IconButton>
          <span className={`absolute bottom-4 left-1/2 -translate-x-1/2 px-3 py-1 text-sm ${chrome}`}>
            {index + 1} / {total}
          </span>
        </>
      )}
    </div>
  );
}

function viewportSize() {
  return {
    w: clamp(Math.round(window.innerWidth), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION),
    h: clamp(Math.round(window.innerHeight), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION),
  };
}
