/**
 * 登录门禁弹窗 —— 收藏 / 导出 / 访问分享链接 都需要 Google 登录（Rei 2026-10-12）。
 *
 * 全局只挂一个（Workbench 根部），由 auth.ts 的 `requireLogin(reason)` / `openLoginGate` 打开。
 *
 * ⭐ Kumo `dialog-rendering`：永不条件渲染，始终挂载、由 `open` 控制显隐。
 * ⭐ 「使用 Google 登录」走现有 /auth/login 整页跳转，returnTo = 当前 path + query，
 *   因此分享链接登录回来后参数仍在，Workbench 确认登录后自动套用分享配置。
 * ⭐ 登录状态一旦确认为已登录（例如 loading 期间被点开），弹窗自行关闭。
 */
import { useEffect, useState } from 'react';
import {
  closeLoginGate,
  isSignedIn,
  loginBlocker,
  startLogin,
  useAuth,
  useLoginGate,
  type GateReason,
} from './auth';
import { Button, Dialog } from './primitives';
import { IconGoogle } from './icons';

const COPY: Record<GateReason, { title: string; description: string }> = {
  favorite: {
    title: '登录后才能收藏',
    description: '收藏母题需要使用 Google 账号登录。',
  },
  export: {
    title: '登录后才能导出',
    description: '导出 SVG / PNG、复制源码与复制 CSS 都需要使用 Google 账号登录。',
  },
  share: {
    title: '登录后查看分享的壁纸',
    description: '你打开的是一条分享链接，需要使用 Google 账号登录后才能查看。登录完成会回到本页并自动载入分享的配置。',
  },
};

export function LoginGateDialog() {
  const gate = useLoginGate();
  const auth = useAuth();
  const [hint, setHint] = useState<string | null>(null);
  const signedIn = isSignedIn(auth);

  // 已登录 → 门禁失去意义，自动关闭
  useEffect(() => {
    if (signedIn) closeLoginGate();
  }, [signedIn]);

  // 每次重新打开都清掉上次的环境提示
  useEffect(() => {
    if (gate.open) setHint(null);
  }, [gate.open]);

  const onLogin = () => {
    const blocker = loginBlocker(auth);
    if (blocker) {
      // 提示写在弹窗内：Toast 层级在遮罩之下，会被挡住
      setHint(blocker);
      return;
    }
    startLogin();
  };

  const copy = COPY[gate.reason];

  return (
    <Dialog
      open={gate.open}
      onClose={closeLoginGate}
      title={copy.title}
      description={copy.description}
      footer={
        <>
          <Button variant="ghost" onClick={closeLoginGate}>
            取消
          </Button>
          <Button variant="primary" disabled={auth.status === 'loading'} onClick={onLogin}>
            <IconGoogle size={15} />
            使用 Google 登录
          </Button>
        </>
      }
    >
      {hint && <p className="rounded-md bg-warning-tint px-3 py-2 text-base text-warning">{hint}</p>}
    </Dialog>
  );
}
