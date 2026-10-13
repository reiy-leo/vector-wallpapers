# 项目长期记忆 · vector-wallpapers

> AI 协作者的工作记忆，不是项目文档。入口见 `AGENTS.md`，设计规范 `.agents/design.md`，
> 待办 `.agents/todo.md`。这里只留**换个会话就找不回来**的东西：用户决策、铁律、踩过的坑、方法论。
> 过程日志（2026-10-10 ~ 10-12 的逐日记录）已于 2026-10-12 整理删除，需要时查 git 历史。
> 标 **⚠️待确认** 的条目与现状不一致，等 Rei 拍板后再改。

## 项目定位
SVG **桌面壁纸生成器**（不是素材库）。核心差异化：**母题中每个元件可独立配色**。
流程：选母题 → 元件改色 → 实时预览 → 导出 SVG/PNG/复制源码；状态走 URL 分享。

## 用户已确认的决策（不要擅自更改）
1. **pattern id 一经上线不可改名**；已有元件 id、控件 key、preset id 同理（分享链接依赖）。
   例外须 Rei 明确批准：2026-10-12 `glitch-rgb`（通道错位）被**删除并替换**为新母题 `dither-gradient`（抖动渐变，D-pixel），旧分享链接里的 `glitch-rgb` 会落到未知 id 兜底。
2. 母题四分类：A 极简线条 / B 重复纹样 / C 渐变流体 / D 像素复古。
   当前清单以 `src/patterns/index.ts` 与 `registry.ts` 为准，**不在这里抄数字**。
3. PRD §5 产品决策：
   - Q1 导出静态（动画只在预览）
   - Q3 随机配色默认「智能邻近色 HSL」，另有「仅当前色板」「全色域」
   - Q4 不做用户自建色板
   - Q5 默认首屏 `polka-dots`
   - Q6 纯背景图，不加文字/Logo
   - Q7 预置 6–8 套合集
   - Q9 不做 PWA/离线；Q10 不做短链
4. PNG 导出取**预览当前帧**。
5. **iOS 不支持 PNG 导出**：按钮灰化 + 提示改用 SVG；不引 resvg-wasm 等包（击穿首屏预算、破坏「导出与预览一致」）。
6. 2026-10-12 取消「纯静态、无后端、无第三方请求、无需登录」限制，接入 Google OAuth（`src/worker/`）。
7. UI：用 Kumo 接管通用控件的**行为与无障碍**，外观用 `--vw-*` token 覆写；**不切 Kumo 橙色**（「暗房」原则：外壳去饱和，色彩留给壁纸）。业务组件（元件配色行、图案卡、滑块行）不换 Kumo。
8. 新母题可参考 svgbackgrounds.com 的**风格**，但其许可禁止竞品使用 → 必须从零实现，不复制 SVG/路径。

## 技术栈与部署
- React 19 + `@cloudflare/kumo` + Tailwind v4 + Vite 8 + TypeScript 5.9 + Vitest 4；MUI 已移除。状态管理：自研 external store。
- 部署：Cloudflare Worker（`src/worker`）+ 内联资源，`npm run deploy:inline`，入口 `worker-inline/entry.ts`。wrangler 配置带 `keep_vars: true`，避免覆盖控制台变量。
- 线上：https://vector-wallpapers.rei8t.workers.dev

## 不可违反的工程铁律
1. **渲染引擎是纯函数** `renderSVG(def, config): string`。engine/patterns 不得出现 `window` `document` `localStorage` `Date.now` `Math.random`；随机走 seeded RNG（mulberry32）。预览 / SVG 下载 / PNG / 源码复制**共用同一份渲染结果**。
2. **颜色输出字面量 hex**，禁止 `var(--x)` / `currentColor`（脱离页面后变黑）。
3. **禁止 `<foreignObject>`**（iOS 污染 canvas → SecurityError，已验证无绕过法）。
4. **禁止 `<text>`**；像素类用 `shape-rendering="crispEdges"`。
5. **平铺类必须用 `<pattern>`**（`api.tile()`），不复制 N 份。
6. **render 禁止硬编码像素**，按 W/H 推导。线宽、尺寸乘 `unit = clamp(min(W,H)/1080, 0.5, 4)`，取**短边**。
7. `URL.revokeObjectURL()` 放 `finally`。
8. 导出 SVG 根标签必带 `xmlns` + `width`/`height` + `viewBox`。
9. 单张 SVG < 20KB（默认目标 < 8KB）。**必须测「控件全部拉满」**，体积是乘积效应。节点数指 body **顶层**子节点，用引擎的 `countTopLevelNodes(body)`，别用裸正则。
10. UI 层零硬编码：`src/ui/` 不得出现任何 pattern id / element id。
11. **纯色元件占比 ≥50%**：渐变可做「层」不可做「面」。豁免须写理由（aurora-wave / liquid-mesh），`structure.guard.test.ts` 强制。
12. 不在 theme.css 自定义 `.h-lh`（Tailwind v4.3 内置 `1lh`，自定义会覆盖降级）。
13. 输入类控件统一走 `primitives.inputClass()`（白底 + `ring-line`，聚焦 `ring-2 brand`）。
14. 控件高度只有三档：`CONTROL_H`=32 / `CHIP_H`=28 / `CONTROL_H_LG`=36，`kumo.guard.test.ts` 白名单看守。
15. 按钮入口唯一：业务组件不裸写 `<button>`，走 `Button`/`IconButton`/`Chip`（白名单：ThumbCard / PalettePanel / CuratedSetsPanel）。
16. **与当前画面绑定的操作紧贴画面**：分享/导出/换一版/主题切换在画布栏，不在顶栏。主题浮层与栅格锚定**图片盒子**（`useImageBox`），不锚容器。

## 壁纸审美基线（2026-10-12 母题审核时定）
安静、耐看、低饱和；避免互补色硬撞、黑白细密摩尔纹、硬边锯齿；平铺单元宜大宜疏；单幅构图不做成密集小贴纸。
用 opacity「补偿」对比度是伪命题（两个衰减相乘）。

## 踩过的坑（只有实测才能发现）
1. **URL 分隔符冲突**：`ElementPatch` 字段原用 `,`，与渐变色标冲突 → 静默截断。已改 `~`，回归在 `share.test.ts`。
2. **不引 preflight 的代价**：`[hidden]` 被 `display:flex` 压制，弹窗常驻。theme.css 已补 `[hidden]{display:none!important}`。
3. **渐变元件陷阱**：元件全是渐变时，改色只染一半，肉眼和测试都看不出 → 必须量化纯色占比。
4. **dead element**：元件声明可配色但从不出现在产物（neon-pixels px_d、旧 glitch-rgb 通道〔已删〕、lowpoly dark）。测试必须是**行为层**：同 seed 改色 → 产物字节必须变。
5. **defs 去重会塌层**：内容逐字节相同的多个 `<pattern>` 会被签名去重合并，差异要写进签名（如 `patternTransform`）。
6. **体积估算要实测**：单个 `<circle>` 约 73 字节而非 48，阈值由实测反推。
7. 新母题 id 必须同时加进 `types.ts` 的 `PatternId`、`registry.ts`（两处清单）、`index.ts`，并更新 `patterns.test.ts` 的 `TOTAL_EXPECTED` 与 `CATEGORY_EXPECTED`。

## 方法论
- **假绿是本项目最大陷阱**（已踩 6 次）：自制垫片报全绿、验收脚本手搓默认值、基线与探针不同 seed、门禁判定条件比被测语义弱。
  铁律：验收脚本复用引擎真源（`createDefaultConfig` / `renderStandaloneSVG`），基线与探针同 seed。
- **门禁写完必须变异测试自证**：注入它要防的缺陷 → 必须失败 → 还原。
- 判断「这段代码是不是 X」的门禁，按**语义归属**（所属顶层声明，作用域栈 / `ownerOf()`）写，不按代码长相写。
- 审查读代码、跑脚本取数，不靠印象。**记忆里的数字会过时，引用前先实测。**
- 视觉问题测试测不出来：每次改母题都要渲染 PNG 目视。
- 提交按「可独立回滚」切块；收口前 `git log --stat` 核对，避免提交信息与内容不符（`3a50e3d` 前车之鉴）。

## 环境事实
- 全量 vitest 单批会 OOM（exit 137）：分批 + `NODE_OPTIONS=--max-old-space-size=3072`；`vite.config` 需 `fileParallelism: false`。
- 脚本直调包入口（`node node_modules/vitest/vitest.mjs run`），不依赖 `.bin`。
- 沙箱 HTTP 502 多为代理拦截，`curl --noproxy '*'`。
- 预览：`src/__verify__/_preview.local.test.ts`（gitignore）+ `rsvg-convert` 转 PNG。旧 `gen-previews.test.ts` 写死了 Mac 路径。

## 参考数据
**Cloudflare Workers（2026-10 核实）**：Worker 64 MiB；静态资产免费 20,000 / 付费 100,000 个文件；单文件 25 MiB；免费 10ms CPU/请求、10 万请求/天；URL 上限 16KB。

**canvas 像素上限**：桌面 Chrome/Safari 268M（单边 65,535）· Firefox 472M · **iOS Safari 16.7M** · Android Chrome 201M。

**Mac 屏幕物理像素**：Air 13" 2560×1664 · Pro 14" 3024×1964 · Pro 16" 3456×2234 · iMac 24" 4480×2520 · 5K 5120×2880 · XDR 6016×3384。MacBook 是 16:10；4K@2x 已超所有 Mac 屏。

## ⚠️待确认（与现状不一致，等 Rei 拍板）
1. **Q2「12 个 pattern」/ PATTERN-SELECTION.md「不新增母题、不追参考站」** —— 现在已 27 个，正在加到 40 个（含参考站风格的 13 个）。是否把 PRD Q2 与 PATTERN-SELECTION 结论改成「母题数量不设上限，按结构判据收录」？
2. **Q8「PNG 上限最长边 7680px、@3x」** —— 与「iOS 不支持 PNG 导出」「@3x 对 Mac 纯浪费」以及 `MAX_PIXELS=16M` 误伤桌面冲突。保留 @3x，还是改成 @2x 上限 + 按平台取像素上限？
3. **部署「Workers Static Assets、零 Worker 脚本」**（PRD/ARCHITECTURE/旧记忆）—— 现为 Worker + 内联资源 + OAuth。文档是否同步改？
4. **铁律 6「取短边」** —— 新加的 tortoise-grid / arrow-repeat / pyramid-facets 和 chevron 的**平铺单元尺寸**按长边算（避免竖屏过密），线宽仍按短边。是否把「单元尺寸可按长边」写成铁律 6 的例外？
5. **协作模式「software-company 专家团 SOP（齐活林/许清楚/高见远/寇豆码/严过关）」** —— 这是 WorkBuddy 侧的角色设定，还在用吗？不用就删。
6. **WorkBuddy 本机环境坑**（`sandbox-exec` 64KB 阻塞、`CODEBUDDY_BROKER_DENY`、npmmirror semver 空版本 → 用 `npm pack` 解包装 Kumo）—— Hark 侧用 `npm install --legacy-peer-deps --package-lock=false` 即可。这些 WorkBuddy 专属的坑要保留吗？
7. **仓库 PUBLIC** —— 之前建议改 Private 或把 `.agents/memory` 移出版本库（含内部踩坑记录、PRD 商业模式章节）。还要处理吗？
8. **两个旧的审美待决**：`arc-composition` 偏朴素、`blob-field` 平铺周期可感知 —— 本轮母题优化已在改，等审核结果后关闭？
