/**
 * Worker 入口 —— 只接管 /api/* 与 /auth/*（wrangler.jsonc 的 run_worker_first），
 * 其余路径仍由 Workers Static Assets 直接在边缘返回 dist/，不计 Worker 请求与 CPU。
 *
 *   GET  /api/me            当前用户 + authMode
 *   GET  /auth/login        → Google
 *   GET  /auth/callback     ← Google，签发会话 cookie
 *   POST /api/auth/logout
 *   POST /api/ratings · GET /api/ratings/mine · GET /api/ratings/summary   （见 ratings.ts）
 *   GET /api/defaults · PUT /api/defaults · GET /api/admin/scores           （见 defaults.ts）
 *   GET /giscus/kumo-light.css · /giscus/kumo-dark.css                    （giscus Kumo 主题，见 giscus-theme.ts）
 */
import type { MeResponse } from "../shared/auth-api";
import { callback, getUser, login, logout } from "./auth";
import { adminEmails, authMode } from "./env";
import { getAdminScores, getDefaults, putDefaults } from "./defaults";
import { getMyRatings, getSummary, postRating } from "./ratings";
import { giscusThemeTone, serveGiscusTheme } from "./giscus-theme";
import type { Env } from "./env";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });

async function handleMe(req: Request, env: Env): Promise<Response> {
  const user = await getUser(req, env);
  const me: MeResponse = {
    user: user ? { email: user.email, name: user.name ?? null, picture: user.picture ?? null } : null,
    authMode: authMode(env, req),
    admin: user ? adminEmails(env).includes(user.email.trim().toLowerCase()) : false,
  };
  return json(me);
}

/** 写接口的 CSRF 兜底：带 Origin 头时必须与本站同源（会话 cookie 已是 SameSite=Lax）。 */
function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("Origin");
  return !origin || origin === new URL(req.url).origin;
}

/** 静态资源的提供方式：默认走 ASSETS 绑定；token 部署时由 worker-inline/ 注入内联资源。 */
export type ServeStatic = (req: Request, env: Env) => Promise<Response> | Response;

export function createHandler(serveStatic: ServeStatic) {
  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      const { pathname } = new URL(req.url);
      const giscusTone = giscusThemeTone(pathname);
      if (giscusTone) {
        const m = req.method.toUpperCase();
        if (m === "GET" || m === "HEAD" || m === "OPTIONS") return serveGiscusTheme(req, giscusTone);
      }
      switch (`${req.method.toUpperCase()} ${pathname}`) {
        case "GET /api/me":
          return handleMe(req, env);
        case "GET /auth/login":
          return login(req, env);
        case "GET /auth/callback":
          return callback(req, env);
        case "POST /api/auth/logout":
          return logout(req);
        case "POST /api/ratings":
          if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
          return postRating(req, env);
        case "GET /api/ratings/mine":
          return getMyRatings(req, env);
        case "GET /api/ratings/summary":
          return getSummary(req, env);
        case "GET /api/defaults":
          return getDefaults(req, env);
        case "PUT /api/defaults":
          if (!sameOrigin(req)) return json({ error: "forbidden" }, 403);
          return putDefaults(req, env);
        case "GET /api/admin/scores":
          return getAdminScores(req, env);
      }
      if (pathname.startsWith("/api/") || pathname.startsWith("/auth/")) return json({ error: "Not Found" }, 404);
      return serveStatic(req, env);
    },
  };
}

export default createHandler((req, env) => {
  if (!env.ASSETS) return new Response("ASSETS binding missing", { status: 500 });
  return env.ASSETS.fetch(req);
});
