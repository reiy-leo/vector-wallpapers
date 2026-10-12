/**
 * KV 命名空间里本项目用到的那一小部分（避免引入 @cloudflare/workers-types）。
 * 语义见 https://developers.cloudflare.com/kv/api/
 */
export interface KVLike {
  get(key: string, type: "json"): Promise<unknown>;
  get(key: string, type?: "text"): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  list(opts: { prefix?: string; cursor?: string; limit?: number }): Promise<{
    keys: { name: string }[];
    list_complete: boolean;
    cursor?: string;
  }>;
}

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
  /** 可访问 /api/ratings/summary 的管理员邮箱，逗号分隔（大小写不敏感）。 */
  ADMIN_EMAILS?: string;

  // bindings
  /** 「色板 × 母题」评分（见 src/worker/ratings.ts）。缺失时评分接口返回 503，其余功能不受影响。 */
  RATINGS?: KVLike;
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

export const adminEmails = (env: Env): string[] =>
  (env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
