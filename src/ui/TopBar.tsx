/**
 * 顶栏 —— 只承载「跨面板」的身份与偏好。
 *
 *信息层级（从左到右对应「身份 → 视图偏好 → 账户」）：
 *   品牌 │ 面板·收藏 │ 账户
 *
 *⭐ **产物动作（分享/导出）与形态参数已迁到画布工具条**：
 * 它们描述的是「当前这张图」，不是「整个应用」。放在顶栏会让用户
 * 以为分享的是整个应用，而实际上分享的是当前母题 + 当前配色。
 * 「与当前画面绑定的操作，紧贴当前画面」是布局的基本原则。
 *
 * ⭐ 组间用**竖分隔线**断开，而不是靠加大间距：间距只是「更空」，
 * 分隔线才是「这里换了语义类别」。图标连续排列时眼睛会把它们读成一串
 * 同类按钮，用户找不到「哪个是全局动作」。
 *
 * ⭐ 主题切换也移到了画布（图片右上角）：主题改变的正是「这张图看起来
 * 是亮是暗」，把它留在顶栏等于让用户「改完设置再回去看效果」。
 */
import { useEffect, useState } from 'react';
import { LIMITS } from '../shared/constants';
import { readFavorites, setUI, usePatternDef, useWorkbenchSelector, writeFavorites } from './store';
import { Button, IconButton, Tooltip } from './primitives';
import { IconGoogle, IconPanel, IconStar } from './icons';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';
export type NoticeFn = (message: string, tone?: NoticeTone) => void;

export function TopBar({ onNotice }: { onNotice: NoticeFn }) {
  const def = usePatternDef();
  const panel = useWorkbenchSelector((s) => s.ui.panel);
  const [favorites, setFavorites] = useState<string[]>([]);

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

  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <h1 className="mr-auto flex items-center gap-2 text-md font-semibold text-fg">
        <LogoMark />
        <span className="hidden sm:inline">Vector Wallpapers</span>
      </h1>

      {/* ── 视图偏好：面板位置 / 收藏 ── */}
      <div className="flex items-center gap-1">
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
      </div>

      <BarDivider />

      {/* ── 账户：Google 登录 / 用户头像 ──
          产品当前是纯静态、无后端（PRD Q9/部署决策），因此这里只放**占位**：
          视觉上把账户位坐实，将来接 OAuth 时不需要再动顶栏布局。 */}
      <Tooltip content="账号同步功能开发中">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onNotice('账号与云端同步尚未上线，当前配置仅存在本机浏览器中。', 'info')}
        >
          <IconGoogle size={15} />
          登录
        </Button>
      </Tooltip>
    </header>
  );
}

/**
 * 顶栏竖分隔线。
 *
 * ⭐ 用 `bg-line` 而非 `border-l`：分隔线不是内容的边界（Kumo
 * `shadow-borders` 反对用 border 表达装饰），它只是类别切换的信号。
 */
function BarDivider() {
  return <div aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />;
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