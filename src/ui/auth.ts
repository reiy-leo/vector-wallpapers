/**
 * 登录状态（Google OAuth，由 Worker 的 /api/me 提供）。
 *
 * 独立于 workbench store：账户与画布配置无关，也不进 URL。
 * /api/me 不可达（纯 `vite dev` 没有 Worker）时视为 `unavailable`，登录按钮给出说明而不是报错。
 */
import { useSyncExternalStore } from 'react';
import { LOGIN_ERROR_TEXT, type MeResponse } from '../shared/auth-api';

export type AuthState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'ready'; me: MeResponse };

let state: AuthState = { status: 'loading' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAuth(): AuthState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

export async function loadMe(): Promise<void> {
  try {
    const res = await fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const type = res.headers.get('Content-Type') ?? '';
    // SPA 回退会把未知路径返回成 index.html —— 不是 JSON 就当作没有 Worker
    if (!res.ok || !type.includes('application/json')) throw new Error(String(res.status));
    state = { status: 'ready', me: (await res.json()) as MeResponse };
  } catch {
    state = { status: 'unavailable' };
  }
  emit();
}

/** 已登录（含 AUTH_DISABLED 的开发用户）。`unavailable`（纯静态预览，无 Worker）一律视为未登录。 */
export function isSignedIn(s: AuthState): boolean {
  return s.status === 'ready' && s.me.user !== null;
}

/**
 * 发起登录前的环境检查：返回给用户看的中文原因，`null` 表示可以跳转 Google。
 * 顶栏「登录」按钮与登录门禁弹窗共用，避免两处提示文案漂移。
 */
export function loginBlocker(s: AuthState): string | null {
  if (s.status === 'loading') return '正在确认登录状态，请稍候…';
  if (s.status === 'unavailable') return '当前环境没有登录服务（用 npm run dev:worker 启动 Worker）。';
  if (s.me.authMode === 'unconfigured') {
    return '站点尚未配置 Google 登录（缺少 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / SESSION_SECRET）。';
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────
 * 登录门禁（Rei 2026-10-12：收藏、导出、访问分享链接都需要 Google 登录）
 *
 * 门禁弹窗全局只挂一个（Workbench 根部），任何调用点只需 `requireLogin(reason)`：
 * 已登录返回 true 继续执行；否则弹出说明 + 「使用 Google 登录」并返回 false。
 * ───────────────────────────────────────────────────────────────── */

export type GateReason = 'favorite' | 'export' | 'share';

/** `reason` 在关闭后保留上一次的值 —— 关闭动画期间文案不会闪成别的。 */
export interface GateState {
  open: boolean;
  reason: GateReason;
}

let gate: GateState = { open: false, reason: 'export' };
const gateListeners = new Set<() => void>();

function subscribeGate(l: () => void) {
  gateListeners.add(l);
  return () => gateListeners.delete(l);
}

export function useLoginGate(): GateState {
  return useSyncExternalStore(subscribeGate, () => gate, () => gate);
}

export function openLoginGate(reason: GateReason): void {
  gate = { open: true, reason };
  gateListeners.forEach((l) => l());
}

export function closeLoginGate(): void {
  if (!gate.open) return;
  gate = { ...gate, open: false };
  gateListeners.forEach((l) => l());
}

/**
 * 需要登录的动作入口。已登录 → true；未登录（或登录状态尚未确认）→ 弹出门禁并返回 false。
 * 状态尚在 loading 时也先弹出：/api/me 一旦确认已登录，门禁弹窗会自行关闭。
 */
export function requireLogin(reason: GateReason): boolean {
  if (isSignedIn(state)) return true;
  openLoginGate(reason);
  return false;
}

/** 跳转 Google；登录完成后回到当前页面（含分享参数）。 */
export function startLogin(): void {
  const returnTo = window.location.pathname + window.location.search;
  window.location.assign(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
}

export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } finally {
    await loadMe();
  }
}

/**
 * 读取并清除回调失败参数 `?login_error=<code>`，返回给用户看的中文提示。
 * 用 replaceState 去掉参数，避免刷新后重复提示、也不污染分享链接。
 */
export function consumeLoginError(): string | null {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('login_error');
  if (!code) return null;
  url.searchParams.delete('login_error');
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
  return LOGIN_ERROR_TEXT[code] ?? '登录失败，请重试。';
}
