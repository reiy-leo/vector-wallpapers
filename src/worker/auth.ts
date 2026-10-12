// Google OAuth 2.0 (authorization-code flow) → HMAC-signed session cookie.
// Same flow as Rei's avatar-sloppy / avatar-critters Workers (copied, not shared).
//
//   GET  /auth/login     state cookie + 302 to Google (scopes: openid email profile)
//   GET  /auth/callback  check state → exchange code → verify id_token claims → session cookie → 302 /
//   POST /api/auth/logout
//
// Errors on the callback redirect to "/?login_error=<code>" so the Chinese UI can explain them.
import { allowedDomains, googleConfigured, isAuthDisabled } from "./env";
import type { Env } from "./env";
import { getCookie, randomToken, setCookie, sign, verify } from "./session";

export const SESSION_COOKIE = "vw_session";
export const STATE_COOKIE = "vw_oauth_state";
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days
const STATE_TTL = 600; // 10 min to finish the Google screen

export interface SessionUser { sub: string; email: string; name?: string; picture?: string; exp: number }
interface OAuthState { nonce: string; oidcNonce: string; returnTo: string; exp: number }

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export type LoginError =
  | "unconfigured" | "denied" | "state" | "token" | "id_token" | "unverified" | "domain";

const now = () => Math.floor(Date.now() / 1000);
const isSecure = (req: Request) => new URL(req.url).protocol === "https:";
const redirectUri = (req: Request, env: Env) => env.OAUTH_REDIRECT_URI || new URL("/auth/callback", req.url).toString();
const json = (data: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers } });

const DEV_USER: SessionUser = { sub: "dev", email: "dev@localhost", name: "本地开发", exp: Number.MAX_SAFE_INTEGER };

export async function getUser(req: Request, env: Env): Promise<SessionUser | null> {
  if (isAuthDisabled(env, req)) return DEV_USER;
  if (!env.SESSION_SECRET) return null;
  return verify<SessionUser>(getCookie(req, SESSION_COOKIE), env.SESSION_SECRET);
}

function safeReturnTo(v: string | null | undefined): string {
  return v && v.startsWith("/") && !v.startsWith("//") && !v.startsWith("/\\") ? v : "/";
}

function unconfiguredPage(): Response {
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录尚未配置 · Vector Wallpapers</title></head>
<body style="font-family:system-ui,-apple-system,'PingFang SC',sans-serif;max-width:520px;margin:15vh auto;padding:0 24px;color:#1d1d1f">
<h1 style="font-size:28px">登录尚未配置</h1>
<p>站点管理员还没有设置 Google 登录（缺少 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET）。请稍后再来。</p>
<p><a href="/" style="color:#2f5fd0">返回首页</a></p></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

const backToApp = (req: Request, error: LoginError, clearState = true) => {
  const headers = new Headers({ Location: `/?login_error=${error}`, "Cache-Control": "no-store" });
  if (clearState) headers.append("Set-Cookie", setCookie(STATE_COOKIE, "", { maxAge: 0, secure: isSecure(req), path: "/auth" }));
  return new Response(null, { status: 302, headers });
};

/** GET /auth/login[?returnTo=/path] */
export async function login(req: Request, env: Env): Promise<Response> {
  if (!googleConfigured(env)) return unconfiguredPage();
  const url = new URL(req.url);
  const nonce = randomToken();
  const oidcNonce = randomToken();
  const state = await sign(
    { nonce, oidcNonce, returnTo: safeReturnTo(url.searchParams.get("returnTo")), exp: now() + STATE_TTL } satisfies OAuthState,
    env.SESSION_SECRET!,
  );
  const google = new URL(GOOGLE_AUTH_URL);
  google.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req, env),
    response_type: "code",
    scope: "openid email profile",
    state: nonce,
    nonce: oidcNonce,
    prompt: "select_account",
  }).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: google.toString(),
      "Cache-Control": "no-store",
      "Set-Cookie": setCookie(STATE_COOKIE, state, { maxAge: STATE_TTL, secure: isSecure(req), path: "/auth" }),
    },
  });
}

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const part = jwt.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** GET /auth/callback?code=…&state=… */
export async function callback(req: Request, env: Env): Promise<Response> {
  if (!googleConfigured(env)) return unconfiguredPage();
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return backToApp(req, "denied"); // e.g. access_denied (user cancelled)

  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const state = await verify<OAuthState>(getCookie(req, STATE_COOKIE), env.SESSION_SECRET!);
  if (!code || !stateParam || !state || state.nonce !== stateParam) return backToApp(req, "state");

  let idToken: string | undefined;
  try {
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri(req, env),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      console.error("google token exchange failed", tokenRes.status, await tokenRes.text().catch(() => ""));
      return backToApp(req, "token");
    }
    idToken = ((await tokenRes.json()) as { id_token?: string }).id_token;
  } catch (e) {
    console.error("google token exchange error", e);
    return backToApp(req, "token");
  }
  if (!idToken) return backToApp(req, "id_token");

  // The id_token came straight from Google's token endpoint over TLS (OIDC Core §3.1.3.7), so its
  // signature need not be re-checked; the claims still must match this client, issuer, time and nonce.
  const c = decodeJwtPayload(idToken);
  if (
    !c ||
    !GOOGLE_ISSUERS.includes(String(c.iss)) ||
    c.aud !== env.GOOGLE_CLIENT_ID ||
    typeof c.exp !== "number" || c.exp < now() ||
    c.nonce !== state.oidcNonce ||
    typeof c.sub !== "string" || typeof c.email !== "string"
  ) return backToApp(req, "id_token");
  if (c.email_verified !== true && c.email_verified !== "true") return backToApp(req, "unverified");

  const email = c.email.trim().toLowerCase();
  const domains = allowedDomains(env);
  const domain = email.split("@")[1] ?? "";
  if (!domains.includes("*") && !domains.includes(domain)) return backToApp(req, "domain");

  const user: SessionUser = {
    sub: c.sub,
    email,
    ...(typeof c.name === "string" ? { name: c.name.slice(0, 100) } : {}),
    ...(typeof c.picture === "string" && c.picture.startsWith("https://") && c.picture.length < 600 ? { picture: c.picture } : {}),
    exp: now() + SESSION_TTL,
  };
  const session = await sign(user, env.SESSION_SECRET!);
  const headers = new Headers({ Location: safeReturnTo(state.returnTo), "Cache-Control": "no-store" });
  headers.append("Set-Cookie", setCookie(SESSION_COOKIE, session, { maxAge: SESSION_TTL, secure: isSecure(req) }));
  headers.append("Set-Cookie", setCookie(STATE_COOKIE, "", { maxAge: 0, secure: isSecure(req), path: "/auth" }));
  return new Response(null, { status: 302, headers });
}

/** POST /api/auth/logout */
export function logout(req: Request): Response {
  return json({ ok: true }, 200, { "Set-Cookie": setCookie(SESSION_COOKIE, "", { maxAge: 0, secure: isSecure(req) }) });
}
