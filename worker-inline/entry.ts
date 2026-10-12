/**
 * 内联部署入口（wrangler.inline.jsonc）。
 *
 * 为什么需要：用 API Token 部署时，Static Assets 的上传接口（/workers/assets/upload）
 * 要求上传会话 JWT，而 Hark 的凭据网关会把 Authorization 换成 API Token → 401。
 * 因此把 dist/ 打进 Worker 脚本本身，由 Worker 直接返回；/api 与 /auth 逻辑完全复用 src/worker。
 *
 * assets.generated.ts 由 scripts/build-inline-assets.mjs 生成（gitignored）。
 */
import { createHandler } from "../src/worker/index";

/** Service Binding 入口：shortlink-personal 调用 OgImage.render()（见 wrangler.inline.jsonc 注释，不要改名）。 */
export { OgImage } from "../src/worker/og";
import { INLINE_ASSETS, GLOBAL_HEADERS } from "./assets.generated";

function decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default createHandler((req) => {
  let { pathname } = new URL(req.url);
  if (pathname.endsWith("/")) pathname += "index.html";
  // SPA 回退：未知路径一律返回 index.html（对应 not_found_handling = single-page-application）
  const key = pathname in INLINE_ASSETS ? pathname : "/index.html";
  const a = INLINE_ASSETS[key];
  if (!a) return new Response("Not Found", { status: 404 });
  const headers = new Headers(GLOBAL_HEADERS);
  headers.set("Content-Type", a.t);
  headers.set(
    "Cache-Control",
    key.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
  );
  return new Response(a.b ? decode(a.d) : a.d, { headers });
});
