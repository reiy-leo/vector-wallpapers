/** 最小类型垫片：项目未引入 @cloudflare/workers-types，这里只声明 og.ts 用到的部分。 */
declare module "cloudflare:workers" {
  export abstract class WorkerEntrypoint<Env = unknown> {
    protected ctx: unknown;
    protected env: Env;
    constructor(ctx: unknown, env: Env);
  }
}
declare module "*.wasm" {
  const mod: WebAssembly.Module;
  export default mod;
}
