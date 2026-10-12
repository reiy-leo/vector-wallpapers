# 项目长期记忆 · vector-wallpapers

## 项目定位
SVG 格式的**桌面背景图生成器**（不是素材库）。核心差异化：**Pattern 中的元件可独立设置不同颜色**。
参考站点：`https://www.svgbackgrounds.com/`（SVG 素材库 + 可定制导出）。

## 用户已确认的决策（不要擅自更改）
1. **首版做 12 个 pattern**（非PRD 原本的 19 个），从 19 个中选取：
   - A 极简线条(3)：`flow-lines` / `offset-grid` / `bauhaus-blocks`
   - B 波点网格(3)：`polka-dots` / `hex-grid` / `diamond-lattice`
   - C 渐变流体(3)：`dusk-ridges` / `liquid-mesh` / `aurora-wave`
   - D 像素复古(3)：`memphis-grid` / `neon-pixels` / `new-wave-sunset`
   - **pattern id 一经上线不可改名**（分享链接依赖稳定性）
2. **PNG 导出取预览当前帧**（非架构默认的 t=0）
3. 部署：**纯静态 SPA，无后端无数据库**，Cloudflare Workers
4. Phase 1 范围 = T1+T2+T3（脚手架+ 引擎 + 12 个图案 + Lab 预览页），先出图再谈后续

## 用户 10 项产品决策（2026-10-10 全部拍板，写入 PRD §5）
| # | 决策 |
|---|------|
| Q1 | **导出静态** —— 动画只在预览呈现，不写入导出产物 |
| Q2 | 12 个 pattern（见上） |
| Q3 | 随机配色 **策略 C 智能邻近色 HSL**（另提供「仅当前色板」「全色域 HSL」切换，默认 analogous） |
| Q4 | **不做**用户自建色板，仅内置预设 |
| Q5 | 默认首屏 = **`polka-dots`** |
| Q6 | **纯背景图，不加文字/Logo 叠加** |
| Q7 | 预置 **6–8 套固定合集** |
| Q8 | PNG 上限 **最长边 7680px、@3x**，**本地浏览器执行** |
| Q9 | **不做** PWA / 离线 |
| Q10 | **不做**短链，用完整长URL |

## 技术栈（架构 v2.0 锁定）
React 19+ MUI 9（**必须深路径导入**，barrel 导入会突破体积预算）+ Tailwind v4 + Vite 8 + TypeScript
状态管理：自研 external store（零依赖），不用 Redux/Zustand
部署：Vite → **Workers Static Assets，零 Worker 脚本**（不配置 `main` 字段）
理由：静态资源请求免费且无限、不计 CPU；预渲染可顺带解决 SEO

## 不可违反的工程铁律
1. **渲染引擎必须是纯函数** `renderSVG(patternDef, config): string`
   - engine / patterns 目录 grep 不到 `window` `document` `localStorage` `Date.now` `Math.random`
   - 随机一律走 seeded RNG（mulberry32）
   - 预览 DOM / SVG 下载 / PNG 导出 / 源码复制**共用同一份渲染结果**
2. **颜色必须输出字面量 hex**，禁止 `var(--x)` 或 `currentColor`
   → 原因：导出的 SVG 脱离页面上下文后 CSS 变量无值可继承，会解析成黑色，配色全丢
   （这条裁决了 PRD 原文「用 CSS 自定义属性注入」的表述，架构中已修正）
3. **禁止 `<foreignObject>`**
   → iOS Safari/WebKit 判定不安全 → canvas 污染 → `toDataURL`/`toBlob` 抛 `SecurityError`
   已验证无效的绕过：crossOrigin=anonymous、html2canvas allowTaint、toBlob替代 toDataURL、WASM 读像素
4. **禁止 `<text>` 元素**（字体依赖破坏导出纯净度）；像素类用 `shape-rendering="crispEdges"`
5. **平铺类必须用 `<pattern>`**，不复制 N 份
6. render 中**禁止硬编码具体像素**（如 1920），用 W/H 比例推导
7. `URL.revokeObjectURL()` 必须放 `finally`块，防blob 泄漏
8. 导出的 SVG 根标签必须带 `xmlns` + `width`/`height` + `viewBox`，否则按 300×150 渲染
9. 单 pattern SVG 体积 < 20KB（开发期 throw 级断言）
10. UI 层零硬编码：grep `src/ui/` 不得出现任何 pattern id / element id（证明 registry 抽象真实成立）
11. **纯色元件占比 ≥50%** 是母题硬指标。渐变可做「层」不可做「面」——
    纯色元件改色=整块变色（换肤），渐变元件改色=只染一端（染色）。
    豁免须写理由（aurora-wave / liquid-mesh），由 `structure.guard.test.ts` 强制
12. **禁止在 theme.css 自定义 `.h-lh`** —— Tailwind v4.3 **内置** `.h-lh{height:1lh}`。
    无层级的 author 规则会覆盖内置实现，把 `1lh` 降级成 `1.5em`。
    （我曾误判「该类从未定义 → 规则沉默失效」并去"修复"，差点制造回归；`kumo.guard.test.ts` 已反转断言钉死）
13. **所有输入类控件走 `primitives.inputClass()`**：白底 + `ring-line` + 聚焦 `ring-2 brand`。
    禁止自堆 `bg-surface-2 + ring-line-input`（那是旧的反模式，灰底深描边让输入框比按钮重）。

## Cloudflare Workers 限制（2026-10 核实，与旧文档不同）
- Worker size: **64 MiB**（不是旧文档的 1MB）
- 静态资产文件数：**免费 20,000 / 付费 100,000**（不是旧文档的 20 个），需 wrangler ≥ 4.34.0
- 单个静态资产 25 MiB；CPU：免费 10ms/请求；内存 128MB；**URL 上限 16KB**
- 仍有效的硬限制：100K 请求/天、10ms CPU/请求

## 已知风险
- R1 高：3840×2160 @2x SVG 可能数十MB，toBlob 内存峰值翻倍 → 必须有尺寸守卫 + 降级提示
- R2 中：iOS Safari canvas 上限 16.7M px
- R6 低：TypeScript npm latest 已是 7.0.2（原生重写版），安装时需显式确认 `tsc --version`，异常回退 ~5.9.0

## 规划文档位置
- `docs/PRD.md` —— 许清楚产出，PRD v1.0 修订版（产品事实来源）
- `docs/ARCHITECTURE.md` —— 高见远产出 v2.0，1568 行（技术事实来源）
- `docs/PATTERN-SELECTION.md` —— 母题取舍依据（2026-10-12）：参考站 48 张判读 + 19 母题结构审查
- `docs/01~07-*.mermaid` —— 架构附带的 7 张流程图（分层/预览/PNG导出/首屏/任务依赖/类图/分享数据流）

## ⚠️ 三条「只有实测才能发现」的坑（2026-10-12 全部踩过）
1. **URL 编解码分隔符冲突**：`ElementPatch` 用 `,` 分隔字段，而渐变编码内部也用 `,`
   → 三色标渐变被截断成一个色标，**静默失败**（链接照常打开只是颜色变了）。
   已改用 `~`，回归测试在 `src/ui/share.test.ts`。
2. **跳过 preflight 的连带代价**：`[hidden]` 被工具类 `display:flex` 压制失效
   → 弹窗常驻页面。已在 theme.css 补 `[hidden]{display:none!important}`。
3. **「4 个元件全是渐变」这类缺陷，测试与肉眼都发现不了** ——
   用户看到 4 个色块都能点，功能看似完好，但每次改色只染一半。
   必须量化「纯色元件占比」才能发现。教训：**审查读代码，不靠印象。**

## 测试规模（2026-10-12）
19 母题 / 86 元件 / 平均 4.5 个·张 / 纯色占比 84%。
UI 测试 101 项（share 29 / tokens 66 / hardcoding 6）+ structure 10 + liquid-mesh 11。
⚠️ **全量单批跑会被沙箱 OOM kill（exit 137）**，需分批 + `--max-old-space-size=3072`。
**任何新写的门禁都必须用变异测试自证**（注入缺陷 → 必须失败 → 还原）。

## 协作模式
本项目走 software-company 专家团 SOP：主理人（齐活林）编排 → 产品经理（许清楚）出 PRD → 架构师（高见远）出架构+任务分解 → 工程师（寇豆码）写代码 → QA（严过关）测试。
架构文档与PRD 冲突时：**PRD 定产品事实，架构定技术实现**。架构师 v1.0 曾与 PRD 冲突 7 处，v2.0 已全部对齐 PRD。

## 各平台 canvas 像素上限（2026-10 核实，MDN + canvas-size 实测数据）
| 平台 | 最大面积 | 备注 |
|------|---------|------|
| 桌面 Chrome /桌面 Safari | **268M px**（16,384×16,384） | 单边上限 65,535 |
| Firefox | **472M px** | 最宽松 |
| **iOS Safari** | **16.7M px**（4,096×4,096） | 最严格，Pro Display XDR 的 20.4M px 超出 22% |
| Android Chrome (7+)` | 201M px | 低于桌面 |

## PNG 导出策略（2026-10-12 用户决策）
**iOS 直接不支持 PNG 导出**：按钮灰化+ 点击弹提示，引导用 SVG 导出或去桌面浏览器。
**不用 npm 包绕过**，理由三条：① wasm 数 MB 会击穿首屏 300KB 预算；② resvg/sharp 与浏览器渲染引擎不同，`feGaussianBlur` 可能有差异，**会破坏「导出与预览逐像素一致」这条验收标准**；③ 维护成本不划算。
调研过的包（备查）：`@resvg/resvg-js`（Rust 核心最快，Node 端首选）/ `sharp`（libvips，约慢 25%）/ `@resvg/resvg-wasm`（**唯一能在 iOS 突破 canvas 限制的**，因为直接产出 PNG 字节不经canvas）/ `svg2img`+canvg（走 canvas，仍受限且慢 50%）。

⚠️ **遗留问题**：`guardCanvasSize` 的 `MAX_PIXELS = 16_000_000` 是按 iOS 上限设的，**导致桌面用户被误伤**（4K@2x = 33.2M 会被降级到 @1x，但桌面完全做得出来）。应改为按平台取不同上限：iOS 16.7M / 桌面 268M / Android 201M。

## Mac 壁纸分辨率（2026-10-12 核实，供尺寸预设参考）
**Mac 已是 Retina，壁纸按物理像素铺满，没有额外 @2x 概念。**
| 机型 | 物理像素 | Mpx |
|---|---|---|
| MacBook Air 13" | 2560×1664 | 4.3 |
| MacBook Pro 14" | 3024×1964 | 5.9 |
| MacBook Pro 16" | 3456×2234 | 7.7 |
| iMac 24" | 4480×2520 | 11.3 |
| iMac 27" 5K / Studio Display | 5120×2880 | 14.8 |
| Pro Display XDR | 6016×3384 | **20.4（最大的 Mac 屏）** |

**关键结论**：
1. 我们的 `4K@2x`（33.2M）**已超过所有 Mac 屏**，@3x（74.6M）是最大屏的 3.7 倍 → **@3x 对 Mac 纯浪费**。@3x 只对 Windows 1440p 高分屏有意义。
2. **MacBook 是 16:10**（3024×1964 等），而现有尺寸预设全是 16:9 / 9:19.5 → 16:9 壁纸铺到 16:10 屏会**裁掉上下约 10%**。**比例问题比倍率更影响观感**，建议补16:10 预设。
3. 建议增加「匹配当前屏幕」导出：直接用 `screen.width × devicePixelRatio`，天然正确。

1. **aurora-wave 视觉重做** —— 用户反馈"好丑"。根因是渲染成「实心硬边色带+平底」，像山脊不像极光。**重做四要素**（缺一件就还是色块）：
   ① **下缘锐利亮边**（单独描线且**不参与模糊**，是极光的「刀刃」）
   ② **向上 stop-opacity 归零化雾**（原话：末端再暗的实色也是实色，只有 alpha 归零才真的化进夜空）
   ③ **垂直光射线**（34 条，跟随褶皱轮廓贯穿帘幕，细/粗两组叠加；不可参与模糊否则 2px 线被糊没）
   ④ **褶皱倍数 2.2~4.4** ← **最关键**，cycles≈1 时上缘是直线，必然退化成「一条发光横条」
   配套：三档互质tile 破星点网格（原来单档 120px 晶格一眼看穿）、feGaussianBlur 只糊幕身。

   **不可改数据契约**：元件 id `sky/band_a/band_b/stars`、控件 key `bands/amp/thickness/stars/sway`、preset id `boreal/nebula/ember`、`paletteSlots` 全部锁定（分享链接依赖）。
2. **补齐到 19 个 pattern**（不追参考站那48 个，因其页面 JS 渲染抓不到清单）。**全部原创重新设计**，不做临摹。需新增 7 个（id 必须沿用 PRD）：
   - A极简线条：`arc-composition` 弧光构成 / `contour-rings` 等高线圈
   - B 波点网格：`triangle-tiling` 三角铺排 / `checker-mesh` 棋盘格
   - C 渐变流体：`cloud-bands` 云层带 / `blob-field` 有机斑点场
   - D 像素复古：`pixel-terrain` 像素地形

## ⚠️ 2026-10-11 环境故障：Bash/Grep 通道阻塞
`sandbox-exec: data object length 66863 exceeds maximum (65535)` —— 主理人、工程师、QA 三方均持续遭遇，**连 `echo ok` 与 pkill 都失败**，多次重试不恢复。
**影响**：五条校验无法实跑、Chromium截图无法进行、Grep 全文检索失效。
**变通**：Read / Write / Edit 仍可用 → 用 Read 逐文件静态核对（改动是否落盘、语法是否闭合、导入导出是否匹配）。本轮即用此法确认 `measure` 已在 budget.ts 导出且签名匹配、`skipBudget` 分支语法完整。
**纪律**：受阻时必须**明说哪条校验没跑成**，不得用「静态核对通过」包装成验收通过。工程师本轮主动给了 IS_PASS: NO，这种诚实应继续保持。

## Phase 1 状态：✅ 已收口（2026-10-10）
T1+T2+T3+Lab 完成。**最终校验：typecheck 0 error / test 264 passed / build ✓ / verify 6 passed / coverage 94.78%**。
**元件级配色 200seed 全 100%**（12 pattern × 54 元件）。体积最大 5451B（红线 27%）。
详见 `2026-10-10-phase1-final.md`（含全部 bug 记录、方法论沉淀、T4 待办）。

## ⚠️ 本项目最大的陷阱：假绿测试
同一类坑踩了 4 次，每次都是「测试通过但结果无效」：
1. 工程师用自制垫片跑测试报「226 全绿」，真 vitest 实跑 224 passed / 2 failed
2. 主理人（我）的 verify.test.ts 用 `e.defaultPaint`，但 `ElementSpec` 真实字段是 `paint` → 体积表是在 12 个全黑图案上测的
3. 工程师的命中率脚本基线用固定 seed、探针用循环 seed → seed 差异被误算成「颜色生效」
4. **新写的 `content-text-size` 门禁连踩两次假绿**：v1 逐行匹配抓不到 `BUTTON_SIZE` 里的条目（那行只有 `sm:` 和样式串）；
   v2 改成「向上回溯 8 行」又漏掉 30 行外的 `Segmented`。**连它自己要修的 bug 都抓不到，却两次都全绿。**
**铁律**：验收脚本必须复用引擎真源（`createDefaultConfig` / `renderStandaloneSVG`）；基线与探针必须同 seed；绝不手搓默认值。

### 判定条件必须 ≥ 被测对象的复杂度（2026-10-12 新增教训）
第 4 次假绿的根因值得单列：**语义不在单行里，而在「它属于哪个声明」里。**
- 逐行匹配：抓不到跨行语义（`sm: '...text-sm'` 那行没有 `<button`也没有 `BUTTON_SIZE`）
- 固定窗口回溯 N 行：小了漏、大了把整个文件后半段全吞进来 → 误报
- ✅ **正解：作用域栈** —— 定位所属顶层声明（`function` / `const X = {` / `const X: T = {`），
  向下扫到下一个顶层声明为止，这段区间继承该声明的语义标记。
凡是要写"这段代码是不是 X"这类门禁，先问一句：**X 这个语义是写在单行里的吗？**

## QA 的变异测试方法（必须沿用）
QA 三轮共注入 **20 个变异**，是本项目最有效的验证手段。做法：备份 src → 注入缺陷 → 跑测试 → `diff -rq` 校验还原。
已验证有效：把 `resolveElements` 从按 id 改成按下标匹配（立刻抓到）、把两个原始 Bug 精确还原（边界断言立刻抓到）。
**2026-10-12 补强**：变异测试不只是"验证测试有效"，更是"发现测试无效"的唯一手段。
上面第 4 次假绿就是靠变异测试暴露的 —— 若只跑正向用例，我会把连自身 bug 都抓不到的 v1
当成"门禁已加固"写进报告。**门禁写完必须立刻注入它要防的那个缺陷**，全绿才算数。