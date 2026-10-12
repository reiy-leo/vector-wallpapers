# Phase 1（T1+T2+T3+Lab）· 最终收口

**日期**：2026-10-10
**状态**：✅ 已收口，可交付用户查看

## 交付物

| 项 | 结果 |
|---|---|
| 脚手架 | Vite 8 + React 19 + MUI 9（深路径导入）+ Tailwind v4 + TypeScript 5.9.3 |
| 渲染引擎 | 11 个纯函数模块（svg/rng/params/colors/defs/elementStyle/budget/guards/render 等） |
| Pattern | **12 个**（4 类各 3 个），54 个元件全部可独立配色 |
| Lab 预览页 | `/lab` —— 12 缩略图 + 大画布 + 元件配色面板 + role 批量改色 + 8 套合集 |
| 源文件 | 32 源文件 + 12 测试文件 |
| 部署 | Workers Static Assets，零 Worker 脚本（不配 `main`） |

## 最终五条校验（主理人 + QA 独立复跑一致）

| 校验 | 结果 |
|---|---|
| `npm run typecheck` | 0 error |
| `npm test` | **264/264 passed** |
| `npm run build` | ✓ engine 5.26KB / patterns 13.14KB gzip；首屏 JS gzip 95.5KB（预算 300KB） |
| `npm run verify` | 6/6，体积失败 0/12，最大 5451B（红线 27%） |
| `npm run test:coverage` | 语句 94.78% / 分支 88.12% / 函数 87.87% / 行 95.35% |

**元件级配色命中率：12 pattern × 54 元件 × 200 seed 全部 100%**（不只是 ≥95%）

## 三个轮次的关键 bug（全部已修）

### 第一轮：死元件（阻塞核心差异化）
1. **`neon-pixels` 的 `px_d` 从不出现**（200 seed 0%）—— `pool=[...].slice(0, levels)` + levels 默认 3。修法：levels 默认 4 + 前 N 格强制各落一组**且绕过密度闸门**（否则密度 0.05 时保证位会被跳过）
2. **`memphis-grid` 元件命中率仅 29-41%** —— tile 单元内只画 2 个元件随机选种。修法：先摆满 5 种（梅花形固定落位）+ `extra` 个随机叠加
3. **测试盲区**：原有测试只查元数据 `configurable`，从未断言「改色 → 产物真的变」。补行为层断言（同 seed 基线 + `#ff00a8` 探针）

### 第二轮：修复引入的新问题
4. **`extra=0` 时 seed 完全失效**（10 seed → 1 种产物）—— 5 个锚点是常量。修法：锚点加 seed 驱动的 ±7% 格距抖动
5. **`memphis-grid` 密度过密** —— QA 量化 cell 内覆盖 75.4%，孟菲斯风应留白。`size` 默认 0.45 → **0.35**（覆盖 45.6%）

### 第三轮：工程师的边界断言过严
6. 新增 seed 边界断言（每个 range 控件取 min/max）报出 4 个假阳性。修法：**显式 `DEGENERATE_EDGES` 白名单** + 每条带理由
   **关键设计判断**：刻意不用自动推断（如「产物为空则跳过」）—— 自动推断会把「意外写死」与「本就无内容」混为一谈，而那正是`extra=0` 能溜过去的原因

## 值得记录的方法论沉淀

### 假绿是本项目最大的陷阱，同一类坑踩了 3 次
1. **工程师第一轮**用自制垫片跑测试报「226 全绿」，真vitest 实跑 224 passed / 2 failed
2. **主理人的 verify.test.ts** 用 `e.defaultPaint` 读取颜色，但 `ElementSpec` 真实字段是 `paint` → 12 个全黑图案上测出的体积表
3. **工程师的命中率脚本**基线用固定 seed、探针用循环 seed，seed 差异被误算成「颜色生效」

**教训**：验收脚本必须复用引擎真源（`createDefaultConfig` / `renderStandaloneSVG`），基线与探针必须同 seed。

### QA 的变异测试是本项目最有价值的验证手段
三轮共 **20 个变异**，全部有效拦截或正确判定：
- 变异把 `resolveElements` 从按 id 改成按下标匹配 → 立刻抓到（证明「按 id 对齐」铁律真在生效）
- 变异把两个原始 Bug 精确还原 → 边界断言立刻抓到（证明行为层回归网是真网）
- 变异 C 暴露「隐藏元件」断言的命名误导（实际锁的是引擎强制 paintValue=none，而非 pattern 侧 visible 判断）

## T4 待办（按 QA 建议优先级）

### 🟡 P3-1 白名单加固（最高优先，成本约 15 行）
**问题**：`DEGENERATE_EDGES` 是**无条件豁免的字符串集合**。QA 用 3 个变异实证：
- `hex-grid` ratio=0 改为仍填 1 个 → 测试通过（体积 884B→1066B，+20.6% 回归免于检查）
- `offset-grid` blocks=0 改为仍画 1 个 → 测试通过
- `flow-lines` amp=0 早退改为含 phase → 测试通过

**推荐方案 B「带证明的豁免」**：
```ts
const DEGENERATE_EDGES = new Map<string, { reason: string; prove: (def: PatternDef) => void }>([
  ['hex-grid/ratio=0', {
    reason: 'fillCount = round(0 * 3) = 0，填充循环零次',
    prove: (def) => {/* 断言 ratio=0 时产物中填充 path 数 === 0 */},
  }],
]);
```
`prove` 失败会让豁免自我失效并报错，而非静默放过。次选方案 A：裸 `Set` 换 `Map<string,string>` + 断言理由非空。

### 🟡 P3-2 边界断言职责边界写明
该断言只保证「换 seed 必得新产物」，**不约束抖动幅度/密度等观感参数**。QA 实证：抖动开到 ±90%（变异3）、size 调回 0.45（变异7）均通过。建议在 `describe` 注释写明，避免后人误以为能兜住视觉质量。

### 🟡 P3-3 `recolorByRole` 对渐变元件会压成 solid
注释已补齐（语义= 整体替换 paint 而非改写色标），行为未改。当前 bg 本就是单色底色，**现状无 bug**。仅作「将来若 role 槽位纳入渐变元件」时的前置提醒。

### ⚪ P4 Lab 页真实渲染验证（三轮未闭合）
Chromium 194MB 连续 3 轮下载超时，无法截图验证。已用 HTTP 200 + vite 编译产物 + 数据流静态审查替代，**但不等价于真实渲染，不应算作通过**。

### ⚪ P5 零 `.tsx` 测试覆盖
`test.include` 为 `['src/**/*.test.ts']`，`PatternLab.tsx`(679行) / `App.tsx` 无测试。T5 后 UI 复杂会成为盲区。需先装 `jsdom`。

## 环境事实（勿重复踩）

1. **沙箱 HTTP 502 = `HTTP_PROXY` 代理拦截**，非应用故障。用 `curl --noproxy '*'` 绕过。此误判曾导致工程师错误移除 `@vitejs/plugin-react`，现已装回
2. `node_modules/.bin` 为空 → package.json scripts 全部直调包入口（`node node_modules/vitest/vitest.mjs run` 等）。`npm install` 在本机间歇失败于 `CODEBUDDY_BROKER_DENY`，QA 侧无法复现
3. `node_modules` 是手工补过的，**建议干净环境 `rm -rf node_modules && npm install` 复现一次**
4. vitest 需 `fileParallelism: false`（vitest 4 已移除 `poolOptions.forks.singleFork`），否则 worker 启动超时 6e4 硬编码不可调

## 待用户决策

1. **Q8 PNG @3x 实际不可用**：1080p@3x=18.7M px、4K@3x=24.9M px，**均超 iOS Safari 16.7M 上限**，会自动降为 @2x/@1x。要真 3x 需分块渲染（约额外 1 个任务）
2. **是否进入 T4**（状态层 + URL 同步 + 全套 UI 三栏工作台）