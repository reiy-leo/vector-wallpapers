/**
 * 顶栏 —— 只承载「跨面板」的身份与偏好。
 *
 *信息层级（从左到右对应「身份 → 视图偏好 → 账户」）：
 *   品牌 │ 面板·收藏 │ 账户
 *
 *⭐ **产物动作（复制 CSS/导出）与形态参数已迁到画布工具条**：
 * 它们描述的是「当前这张图」，不是「整个应用」。放在顶栏会让用户
 * 以为分享的是整个应用，而实际上分享的是当前母题 + 当前配色。
 * 「与当前画面绑定的操作，紧贴当前画面」是布局的基本原则。
 *
 * ⭐ 组间用**竖分隔线**断开，而不是靠加大间距：间距只是「更空」，
 * 分隔线才是「这里换了语义类别」。图标连续排列时眼睛会把它们读成一串
 * 同类按钮，用户找不到「哪个是全局动作」。
 *
 * ⭐ 界面主题（浅/深/跟随系统）在顶栏，它作用于整个应用；
 * 图片右上角的是**壁纸本身**的浅底/深底切换，二者作用域不同。
 */
import { useEffect, useState } from 'react';
import { setUI, useWorkbenchSelector } from './store';
import { FavoritesDialog } from './FavoritesDialog';
import { CommentsDrawer, IconChat } from './Comments';
import { Button, IconButton, Segmented, Tooltip } from './primitives';
import { DropdownMenu } from '@cloudflare/kumo/components/dropdown';
import { consumeLoginError, loadMe, loginBlocker, logout, startLogin, useAuth } from './auth';
import { IconAuto, IconGoogle, IconMoon, IconPanel, IconSun } from './icons';
import type { UIState } from '../engine/types';

export type NoticeTone = 'info' | 'success' | 'warning' | 'danger';
export type NoticeFn = (message: string, tone?: NoticeTone) => void;

export function TopBar({ onNotice }: { onNotice: NoticeFn }) {
  const panel = useWorkbenchSelector((s) => s.ui.panel);
  const theme = useWorkbenchSelector((s) => s.ui.theme);
  const [commentsOpen, setCommentsOpen] = useState(false);


  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2">
      <h1 className="mr-auto flex items-center gap-2 text-md font-semibold text-fg">
        <LogoMark />
        <span className="hidden items-baseline gap-1.5 sm:inline-flex">
          <span>矢量壁纸</span>
          <span className="text-xs font-normal text-fg-soft">Vector Wallpapers</span>
        </span>
      </h1>

      {/* ── 视图偏好：面板位置 / 收藏 ── */}
      <div className="flex items-center gap-1">
        <Segmented
          label="界面主题"
          size="sm"
          value={theme}
          onChange={(t) => setUI({ theme: t as UIState['theme'] })}
          options={[
            { value: 'light', label: '', icon: <IconSun size={14} />, title: '浅色界面' },
            { value: 'dark', label: '', icon: <IconMoon size={14} />, title: '深色界面' },
            { value: 'system', label: '', icon: <IconAuto size={14} />, title: '跟随系统' },
          ]}
        />
        <Tooltip side="bottom" content={panel === 'right' ? '把面板移到左侧' : '把面板移到右侧'}>
          <IconButton
            label="切换面板位置"
            nativeTitle={false}
            aria-pressed={panel === 'left'}
            className={panel === 'left' ? 'bg-brand-tint text-brand' : ''}
            onClick={() => setUI({ panel: panel === 'right' ? 'left' : 'right' })}
          >
            <IconPanel size={16} />
          </IconButton>
        </Tooltip>
        <Tooltip side="bottom" content="留言">
          <IconButton label="留言" nativeTitle={false} onClick={() => setCommentsOpen(true)}>
            <IconChat size={16} />
          </IconButton>
        </Tooltip>
      </div>

      <BarDivider />

      <AccountControl onNotice={onNotice} />
      <CommentsDrawer open={commentsOpen} onClose={() => setCommentsOpen(false)} />
    </header>
  );
}

/**
 * 账户：未登录 → 「Google 登录」；已登录 → 头像按钮 + kumo DropdownMenu（邮箱 / 退出）。
 * 登录是整页跳转到 Worker 的 /auth/login（OAuth 授权码流程），会话在 HttpOnly cookie 里。
 */
function AccountControl({ onNotice }: { onNotice: NoticeFn }) {
  const auth = useAuth();
  const [favOpen, setFavOpen] = useState(false);
  const savedCount = useWorkbenchSelector((s) => s.saved.length);

  useEffect(() => {
    void loadMe();
    const err = consumeLoginError();
    if (err) onNotice(err, 'danger');
  }, [onNotice]);

  const user = auth.status === 'ready' ? auth.me.user : null;

  if (!user) {
    const onLogin = () => {
      if (auth.status === 'loading') return;
      const blocker = loginBlocker(auth);
      if (blocker) {
        onNotice(blocker, 'warning');
        return;
      }
      startLogin();
    };
    return (
      <Button variant="secondary" size="sm" disabled={auth.status === 'loading'} onClick={onLogin}>
        <IconGoogle size={15} />
        登录
      </Button>
    );
  }

  const label = user.name ?? user.email;
  return (
    <>
    <DropdownMenu>
      <DropdownMenu.Trigger
        render={
          <Button variant="ghost" size="sm" aria-label={`账户：${user.email}`}>
            <Avatar picture={user.picture} label={label} />
            <span className="hidden max-w-32 truncate sm:inline">{label}</span>
          </Button>
        }
      />
      <DropdownMenu.Content>
        <DropdownMenu.Group>
          <DropdownMenu.Label>{user.email}</DropdownMenu.Label>
        </DropdownMenu.Group>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onClick={() => setFavOpen(true)}>
          管理收藏{savedCount > 0 ? `（${savedCount}）` : ''}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onClick={() => {
            void logout().then(() => onNotice('已退出登录', 'info'));
          }}
        >
          退出登录
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
    <FavoritesDialog open={favOpen} onClose={() => setFavOpen(false)} onNotice={onNotice} />
    </>
  );
}

function Avatar({ picture, label }: { picture: string | null; label: string }) {
  if (picture) {
    return (
      <img
        src={picture}
        alt=""
        width={20}
        height={20}
        referrerPolicy="no-referrer"
        className="h-5 w-5 shrink-0 rounded-full"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-2xs font-medium text-brand"
    >
      {label.slice(0, 1).toUpperCase()}
    </span>
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