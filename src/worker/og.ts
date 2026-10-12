/**
 * OG 图渲染（供 shortlink-personal 通过 Service Binding 调用，见 wrangler*.jsonc 注释）。
 *
 * ⚠️ 导出名 `OgImage` 与方法签名 `render(seed, width, height)` 是跨 Worker 契约，
 * shortlink-personal 的 wrangler 配置 `services[].entrypoint = "OgImage"` 依赖它——不要改名。
 *
 * 确定性：同一个 seed 永远同一张图（母题、预设、图案种子都从 seed 经 mulberry32 派生）。
 * 只要母题注册表与渲染代码不变即成立；新增母题会改变 seed→母题 的映射。
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import { initWasm, Resvg } from "@resvg/resvg-wasm";
// wrangler 默认把 .wasm import 打包为 CompiledWasm（WebAssembly.Module），不做运行时 fetch。
import resvgModule from "@resvg/resvg-wasm/index_bg.wasm";
import { applyPreset, createDefaultConfig, renderStandaloneSVG } from "../engine/render";
import { mulberry32 } from "../engine/rng";
import { registry } from "../patterns";
import type { Env } from "./env";

/**
 * 光栅化太重（CPU 显著高于其余母题）而被跳过的母题。
 * 依据 README「OG 图渲染 · CPU 实测」：基于 resvg-wasm 在 1200×630 的逐母题实测。
 */
export const OG_SKIP: ReadonlySet<string> = new Set<string>(['blinds-shadow', 'marble-veins', 'linen-weave']);

let wasmReady: Promise<void> | null = null;
const ensureWasm = () => (wasmReady ??= initWasm(resvgModule as WebAssembly.Module));

export interface OgPick {
  pattern: string;
  preset?: string;
  patternSeed: number;
}

/** seed → (母题, 预设, 图案种子)。纯函数，便于测试。 */
export function pickForSeed(seed: number): OgPick {
  const rng = mulberry32(seed >>> 0);
  const pool = registry.list().filter((d) => !OG_SKIP.has(d.id));
  const def = pool[Math.floor(rng() * pool.length) % pool.length];
  const presetIdx = Math.floor(rng() * (def.presets.length + 1)); // 末位 = 默认配色
  const preset = presetIdx < def.presets.length ? def.presets[presetIdx].id : undefined;
  const patternSeed = Math.floor(rng() * 0x1_0000_0000) >>> 0;
  return { pattern: def.id, preset, patternSeed };
}

export function svgForSeed(seed: number, width: number, height: number): { svg: string } & OgPick {
  const pick = pickForSeed(seed);
  const def = registry.get(pick.pattern)!;
  const base = createDefaultConfig(def, { width, height, seed: pick.patternSeed });
  const cfg = pick.preset ? applyPreset(def, pick.preset, base) : base;
  return { svg: renderStandaloneSVG(def, cfg, { animate: false }), ...pick };
}

const clampDim = (v: unknown, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 64 && n <= 4096 ? n : d;
};

export class OgImage extends WorkerEntrypoint<Env> {
  /** 按 seed 确定性地选母题 + 预设配色 + 图案种子，渲染 PNG。同一个 seed 永远同一张图。 */
  async render(seed: number, width = 1200, height = 630): Promise<{ png: ArrayBuffer; pattern: string; preset?: string }> {
    const w = clampDim(width, 1200);
    const h = clampDim(height, 630);
    await ensureWasm();
    const { svg, pattern, preset } = svgForSeed(Number(seed) >>> 0, w, h);
    const r = new Resvg(svg, { fitTo: { mode: "width", value: w }, font: { loadSystemFonts: false } });
    const img = r.render();
    const bytes = img.asPng();
    img.free();
    r.free();
    const png = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return preset ? { png, pattern, preset } : { png, pattern };
  }
}
