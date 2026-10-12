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
