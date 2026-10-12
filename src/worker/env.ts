/** Worker 运行环境（wrangler.jsonc 的 vars + secrets + 绑定）。 */
export interface Env {
  /** 静态资源绑定（Vite 产物 dist/）。内联部署（wrangler.inline.jsonc）时不存在。 */
  ASSETS?: { fetch(req: Request): Promise<Response> };

  // secrets（wrangler secret put … 或 CF 控制台）
  SESSION_SECRET?: string;
  /** Google Cloud Console → Credentials → OAuth 2.0 Web client。 */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;

  // vars
  /** 可选。默认 <请求源>/auth/callback，必须在 Google 侧登记为授权回调。 */
  OAUTH_REDIRECT_URI?: string;
  /** "true" = 跳过登录（注入假用户）。只对 localhost 请求生效，线上误配也打不开。 */
  AUTH_DISABLED?: string;
  /** 允许登录的邮箱域名，逗号分隔；"*" = 任意已验证的 Google 账号。 */
  ALLOWED_EMAIL_DOMAINS?: string;
}

export type AuthMode = "google" | "unconfigured" | "disabled";

export const isAuthDisabled = (env: Env, req: Request) => {
  if ((env.AUTH_DISABLED ?? "").trim().toLowerCase() !== "true") return false;
  const host = new URL(req.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
};

export const googleConfigured = (env: Env) =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.SESSION_SECRET);

export const authMode = (env: Env, req: Request): AuthMode =>
  isAuthDisabled(env, req) ? "disabled" : googleConfigured(env) ? "google" : "unconfigured";

export const allowedDomains = (env: Env): string[] =>
  (env.ALLOWED_EMAIL_DOMAINS ?? "*").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean);
