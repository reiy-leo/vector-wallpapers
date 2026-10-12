/**
 * Worker 入口 —— 只接管 /api/* 与 /auth/*（wrangler.jsonc 的 run_worker_first），
 * 其余路径仍由 Workers Static Assets 直接在边缘返回 dist/，不计 Worker 请求与 CPU。
 *
 *   GET  /api/me            当前用户 + authMode
 *   GET  /auth/login        → Google
 *   GET  /auth/callback     ← Google，签发会话 cookie
 *   POST /api/auth/logout
 */
import type { MeResponse } from "../shared/auth-api";
import { callback, getUser, login, logout } from "./auth";
import { authMode } from "./env";
import type { Env } from "./env";

/** Service Binding 入口：shortlink-personal 调用 OgImage.render() 生成 OG 图（不要改名）。 */
export { OgImage } from "./og";

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
  };
  return json(me);
}

/** 静态资源的提供方式：默认走 ASSETS 绑定；token 部署时由 worker-inline/ 注入内联资源。 */
export type ServeStatic = (req: Request, env: Env) => Promise<Response> | Response;

export function createHandler(serveStatic: ServeStatic) {
  return {
    async fetch(req: Request, env: Env): Promise<Response> {
      const { pathname } = new URL(req.url);
      switch (`${req.method.toUpperCase()} ${pathname}`) {
        case "GET /api/me":
          return handleMe(req, env);
        case "GET /auth/login":
          return login(req, env);
        case "GET /auth/callback":
          return callback(req, env);
        case "POST /api/auth/logout":
          return logout(req);
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
