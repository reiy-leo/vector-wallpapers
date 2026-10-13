# AGENT.md —— AI 协作者上手入口

> 读完这一份就能开工。更详细的规范在 `.agent/design.md`，待办在 `.agent/todo.md`。

## 项目是什么

**SVG 桌面背景图生成器**（不是素材库）。核心差异化：**母题中的每个元件可独立设置不同颜色**。

- 参考站点：`https://www.svgbackgrounds.com/`（SVG 素材库 + 可定制导出）
- 母题库：**27 个**（4 分类：A极简线条 / B波点网格 / C 渐变流体 / D 像素复古）
- 部署：Cloudflare Worker（`src/worker/`，只接管 `/api/*` `/auth/*`）+ Static Assets（`dist/`）
- 账户：Google OAuth 登录（与 avatar-sloppy 同一套实现，签名 cookie 会话）
- 线上：https://vector-wallpapers.rei8t.dev（自定义域，内联部署）。Secrets：SESSION_SECRET（已设）、GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET（在 CF 控制台添加）；Google 回调 `/auth/callback`
- 留言：giscus（GitHub Discussions，仓库 reiy-leo/cfw-comments，分类 vector-wallpapers，mapping=pathname）。实现在 `src/ui/Comments.tsx`：顶栏「留言」按钮 → 右侧抽屉，首次打开才注入 `https://giscus.app/client.js`；主题跟随网站（light/dark/system → noborder_light/noborder_dark），切换时 postMessage `setConfig`。CSP 在 `public/_headers` 放行 giscus.app（script-src / style-src / frame-src），内联部署由 `scripts/build-inline-assets.mjs` 带进 Worker 响应头
- ~~纯静态、无后端、无第三方请求、无需登录~~ —— 该限制已于 2026-10-12 按用户决定**取消**

## 事实来源的优先级

冲突时按此顺序裁决，**不要凭印象**：

| 层级 | 文件 | 管什么 |
|---|---|---|
| 1 | `.agent/docs/PRD.md` | **产品事实**（做什么、给谁、边界在哪）|
| 2 | `.agent/docs/ARCHITECTURE.md` | **技术实现**（怎么分层、模块边界）|
| 3 | `.agent/docs/PATTERN-SELECTION.md` | 母题取舍依据 |
| 4 | `.agent/docs/STYLE-100-ANALYSIS.md` | 142 风格 × 母题的可添加性判定 |
| 5 | `.agent/design.md` | 本项目**额外**自定的门禁（Kumo 规范未覆盖的部分）|

> PRD 与架构冲突时：PRD 定产品，架构定实现。架构师 v1.0 曾与 PRD 冲突 7 处，v2.0 已全部对齐。

## 文档地图（全部在 `.agent/`）

| 路径 | 内容 |
|---|---|
| `.agent/skills/kumo-design/SKILL.md` | **唯一设计规范**：Cloudflare Kumo（`npx skills add cloudflare/kumo@kumo-design` 安装，`.claude/skills/` 下为软链）。Apple 风格的 `DESIGN.md` 已删除 |
| `.agent/design.md` | Kumo 在本项目的落地清单 + 自定门禁 |
| `.agent/todo.md` | 待办 |
| `.agent/docs/` | PRD / ARCHITECTURE / PATTERN-SELECTION / STYLE-100-ANALYSIS + 6 张 mermaid 图 |
| `.agent/memory/` | 长期记忆 `MEMORY.md` 与各阶段工作日志（原 `.workbuddy/memory/`）|

## 常用命令

```bash
npm install --legacy-peer-deps   # 当前 lockfile 在 npm 10 下 ci 会报 Invalid Version
npm run dev        # http://localhost:5173
npm run test       # vitest（串行）
npm run dev:worker # build + wrangler dev（含 /api、/auth；.dev.vars 写 AUTH_DISABLED=true 可跳过登录）
npm run deploy:inline  # API Token 部署：dist/ 内联进 Worker（Static Assets 上传接口在 token 网关下 401）
npm run deploy     # wrangler login 后可用：Static Assets 版本
```

## 技术栈（锁定，勿擅自更换）

React 19 + Tailwind v4 + Vite 8 + TypeScript
状态管理：**自研 external store**（零依赖，不用 Redux/Zustand）
设计规范：**Cloudflare Kumo** 16 条规则（`.agent/design.md` 有落地清单）

---

## ⛔ 不可违反的工程铁律（16 条）

违反任何一条都视为 bug，不是风格偏好。

### 渲染引擎（engine / patterns）

1. **渲染引擎必须是纯函数** `renderSVG(patternDef, config): string`
   - 这两个目录里 grep 不到 `window` `document` `localStorage` `Date.now` `Math.random`
   - 随机一律走 seeded RNG（mulberry32）
   - 预览 DOM / SVG 下载 / PNG 导出 / 源码复制**共用同一份渲染结果**
2. **颜色必须输出字面量 hex**，禁止 `var(--x)` / `currentColor`
   → 导出的 SVG 脱离页面后 CSS 变量无值可继承，会解析成黑色，配色全丢
3. **禁止 `<foreignObject>`** —— iOS Safari 判定不安全 → canvas 污染 → `toBlob` 抛 `SecurityError`
4. **禁止 `<text>`**（字体依赖破坏导出纯净度）；像素类用 `shape-rendering="crispEdges"`
5. **平铺类必须用 `<pattern>`**，不复制 N 份
6. **禁止硬编码具体像素**（如 1920），用 W/H 比例推导
   ⚠️ 盲区：`stroke-width` 也算。正确做法 `unit = clamp(min(W,H)/1080, 0.5, 4)`，线宽乘 `unit`
7. `URL.revokeObjectURL()` 必须放 `finally` 块，防blob 泄漏
8. 导出的 SVG 根标签必须带 `xmlns` + `width`/`height` + `viewBox`，否则按 300×150 渲染
9. **单 pattern SVG 体积 < 20KB**
   ⚠️ 必须测「**控件全部拉满**」而非默认配置 —— 体积是各控件的**乘积效应**
   ⚠️ 节点数语义是「body **顶层**子节点」，必须用 `countTopLevelNodes(body)`，裸正则会多算 `<pattern>` 内部节点
10. **UI 层零硬编码**：`src/ui/` 内不得出现任何 pattern id / element id 字面量
11. **纯色元件占比 ≥50%** —— 渐变可做「层」不可做「面」。纯色改色=换肤，渐变改色=染色

### UI 层（详见 `.agent/design.md`）

12. **禁止在 theme.css 自定义 `.h-lh`** —— Tailwind v4.3 已内置，覆盖它反而把 `1lh` 降级成 `1.5em`
13. **输入控件统一走 `primitives.inputClass()`**：白底 + `ring-line` + 聚焦 `ring-2 brand`
14. **控件高度只有三档**：`CONTROL_H`32 / `CHIP_H`28 / `CONTROL_H_LG`36
15. **按钮实现入口唯一**：业务组件禁止裸写 `<button>`，走 `Button`/`IconButton`/`Chip`
16. **与当前画面绑定的操作，紧贴当前画面**：复制 CSS/导出/换一版/主题切换都在画布栏

---

## ⛔ 数据契约（一经上线不可改）

分享链接依赖这些标识的稳定性：

- **pattern id** 不可改名（已锁定 27 个，见 `src/patterns/types.ts` 的 `PatternId`）
- **元件 id** 不可改名（如 flow-lines 的 `bg/line_far/line_mid/line_near`）
- **控件 key** 不可删（新增可以）
- **preset id** 不可改名

新增参数一律走**新 key**，旧链接解析后缺省为 default —— 行为兼容。
`flow-lines.guard.test.ts` / `cloud-bands.guard.test.ts` 对此有断言。

---

## 跑验证（不要凭"看起来对"就交付）

```bash
npm run typecheck                              # 0 error
NODE_OPTIONS="--max-old-space-size=3072" \
  node node_modules/vitest/vitest.mjs run src/__verify__/verify.test.ts src/patterns src/ui
npm run build
```

⚠️ **全量单批跑会被沙箱 OOM kill（exit 137）**，必须分批 + 加 `--max-old-space-size=3072`。

---

## ⛔ 本项目最大的陷阱：假绿测试

**同一类坑踩了 6 次**，每次都是「测试通过但结果无效」：

| # | 现象 |
|---|---|
| 1 | 自制垫片跑测试报全绿，真 vitest 实跑有failed |
| 2 | 用了不存在的字段名（`e.defaultPaint`），测的是 12 个全黑图案 |
| 3 | 基线用固定 seed、探针用循环 seed → seed 差异被误算成「颜色生效」|
| 4 | `content-text-size` 门禁逐行匹配 → 抓不到常量表里的条目 |
| 5 | 同上，改成「回溯 8 行」→ 又漏掉 30 行外的 `Segmented` |
| 6 | 「三层形态不同」断言在强制同形态下全绿（几何指纹天然不同）|

### 铁律

1. **验收脚本必须复用引擎真源**（`createDefaultConfig` / `renderStandaloneSVG`），绝不手搓默认值
2. **基线与探针必须同 seed**
3. **判定条件必须 ≥ 被测对象的复杂度**
   - 语义常在跨行处：`sm: 'h-8 px-3 text-sm'` 那行既无 `<button` 也无 `BUTTON_SIZE`
   - 逐行匹配 ✗ → 固定窗口回溯 ✗（小了漏、大了误吞整个文件）→ ✅ **作用域栈**
4. **豁免规则按「语义归属」写，不按「代码长相」写** —— 长相会变，归属不会
5. **检测方法本身也可能是错的**：`api.tile()` 会把 key 哈希成 `t-xxxxx`，
   去 grep 原始 key 抽出 0 个。**断言报错时先怀疑断言，再怀疑被测对象**

### ⛔ 新写的门禁必须自证

```bash
# 1. 备份 → 2. 注入它要防的那个缺陷 → 3. 必须失败 → 4. diff 还原 → 5. 全绿才算数
```

只跑正向用例的门禁，等于没写。本项目靠这条暴露了 6 次假绿。

---

## 协作模式

走 software-company 专家团 SOP：主理人编排 → 产品经理出 PRD → 架构师出架构+任务分解 → 工程师写代码 → QA 测试。

**受阻时的纪律**：必须**明说哪条校验没跑成**，
不得用「静态核对通过」包装成验收通过。

## 环境限制速查

| 约束 | 数值 |
|---|---|
| Cloudflare Worker size | 64 MiB（旧文档写 1MB，已过时）|
| 静态资产文件数 | 免费 20,000 / 付费 100,000（需 wrangler ≥ 4.34.0）|
| URL 长度上限 | 16 KB |
| iOS Safari canvas | 16.7 M px（最严格）|
| 桌面 Chrome / Safari | 268 M px |
| Firefox | 472 M px |

**canvas 像素上限需按平台区分** —— 当前 `guardCanvasSize` 统一按 16M 设，
导致桌面用户被误伤（详见 `.agent/todo.md`）。