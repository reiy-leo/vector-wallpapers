# vector-wallpapers

纯 SVG 壁纸生成器：选母题 → 逐元件改色 → 实时预览 → 导出 SVG/PNG。线上：https://vector-wallpapers.rei8t.dev
开发说明见 `AGENT.md`。

## OG 图渲染（Service Binding · `OgImage`）

`src/worker/og.ts` 导出 `OgImage extends WorkerEntrypoint`，由 **shortlink-personal** 通过 Service Binding 调用
（`"services": [{ "binding": "WALLPAPERS", "service": "vector-wallpapers", "entrypoint": "OgImage" }]`）。**不要改名。**
无公开路由、无需登录。

```ts
render(seed: number, width = 1200, height = 630): Promise<{ png: ArrayBuffer; pattern: string; preset?: string }>
```

- seed（uint32）→ mulberry32 依次派生：母题（注册表去掉跳过名单）、预设（含「默认配色」一档）、图案 seed。同一个 seed 永远同一张图（前提是母题注册表不变；新增母题会改变映射）。
- `renderStandaloneSVG(animate:false)` → `@resvg/resvg-wasm`（wasm 以 CompiledWasm 模块 import，无运行时 fetch）→ PNG。

### CPU 实测（2026-10-12）

方法：同一份 resvg-wasm 2.6.2 在 Node 22（V8，与 Workers 同引擎）单线程渲染 1200×630，
每个母题 ×（默认 + 全部预设）× 2 个 seed，计 SVG 生成 + 光栅化 + PNG 编码总耗时。

- 92 个参与母题：中位数 **77 ms**，P90 **243 ms**，最慢 **777 ms**（moire-lines）。
- SVG 生成本身几乎都 < 35 ms（topo-lines 最高约 300 ms），大头是光栅化；`api.blur` 滤镜最贵。
- **跳过名单（`OG_SKIP`，单张最坏 ≥ 900 ms）**：blinds-shadow, marble-veins, linen-weave。
- 需要 Workers 付费计划（免费计划 10 ms CPU 上限不够光栅化）；付费计划默认 30 s 上限，余量充足。

| 母题 | 平均 ms | 最坏 ms | |
|---|---|---|---|
| blinds-shadow | 2619 | 3988 | 跳过
| marble-veins | 2196 | 2611 | 跳过
| linen-weave | 820 | 998 | 跳过
| moire-lines | 716 | 777 |
| conic-mesh | 623 | 664 |
| wood-grain | 481 | 655 |
| aurora-wave | 504 | 615 |
| staircase | 363 | 519 |
| punch-card | 414 | 506 |
| encaustic-tiles | 170 | 458 |
| paw-prints | 191 | 450 |
| topo-lines | 208 | 372 |
