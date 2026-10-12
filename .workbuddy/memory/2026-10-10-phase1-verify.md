# 2026-10-10 工作日志（下午更新）

## Phase 1 验收：T1+T2+T3+Lab 已落地，主理人五条校验全部实跑通过 → **IS_PASS: YES（已签字）**

### 主理人独立验收结果（用真vitest，不依赖工程师自建垫片）
新增 `src/__verify__/verify.test.ts`（6 项）+ `npm run verify` 脚本，作为 T4/T5 回归护栏。

**五条校验实测输出（全部主理人亲自跑）**：
| 命令 | 结果 |
|------|------|
| `npm run typecheck` | 0 error |
| `npm test` | **232/232 passed**（12 文件，63s） |
| `npm run build` | ✓ built in 2.62s，gzip 合计 **95.9KB**（预算 300KB） |
| `npm run verify` | 6/6 passed，失败 0/12，最大体积 5451B |
| `npm run test:coverage` | **Statements 98.05% / Branches 92.24% / Functions 96.07% / Lines 98.04%** |

| 验收项 | 实测 |
|--------|------|
| 体积红线 ≤20480B | **失败 0/12，最大 5451B（27%）** |
| 节点上限 ≤60 | 最大 38（new-wave-sunset） |
| 确定性（同config 3次字节一致） | 12/12 |
| seed 撞图数 | **0** |
| 产物含 CSS 变量 / currentColor | **0** |
| 产物含 `<text>` / foreignObject | **0** |
| 尺寸按比例推导 | 12/12 无变形 |
| 根标签 xmlns/viewBox/width/height | 12/12 齐备 |

实测体积（默认/参数拉满/4K，字节）：
flow-lines 5433/5451/4938 · offset-grid 1020/1345/1351 · bauhaus-blocks 686/847/847 · polka-dots 629/655/645 · hex-grid 1065/1336/1336 · diamond-lattice 829/1048/1048 · dusk-ridges 3182/3182/2952 · liquid-mesh 2970/4751/4807 · aurora-wave 2089/3143/3197 · memphis-grid 581/674/676 · neon-pixels 784/1365/1365 · new-wave-sunset 1881/2928/2964
**4K 下体积几乎不变 → 体积与分辨率解耦达标。**

交付规模：32 个源文件 + 12 个测试文件，12 个 pattern 各1 文件 + palettes/sets/registry/index。

### 主理人自己的失误（已修正，值得记录教训）
**我写的 `verify.test.ts` 有假绿 bug**：用了 `e.defaultPaint` / `e.defaultColor`，但 `ElementSpec` 真实字段是 `paint` / `opacity` / `visible` → 所有元件退化成 `{type:'solid', color:undefined}` → `normalizeHex` 兜底成 `#000000`，**体积表其实是在12 个全黑图案上测出来的**（flow-lines 5347B vs 真实 5433B）。
**教训**：验收脚本必须复用引擎的 `createDefaultConfig`（默认状态唯一真源），绝不手搓一份默认值，否则与引擎漂移。
工程师主动发现并修了此bug——**这条是我交给他的护栏，他反过来修了护栏，值得肯定。**

### 工程师修掉的真问题（本轮）
1. **purity.guard.test.ts 超时根因不是"沙箱慢"**，而是真实代码冗余：21 次重复读 26 个文件 = 19.9 秒。改为模块加载时读一次缓存成不可变快照 → 降到 **13ms**。未用"加timeout 兜底"糊弄。
2. **vitest worker 启动超时 `START_TIMEOUT=6e4` 硬编码不可调**，12 个 worker 并发加载整份模块图互相争抢 IO 必然超时。解法 `fileParallelism: false`（vitest 4 已移除 `poolOptions.forks.singleFork`）。实测 74s/11 超时 → 41~97s 全绿。
3. `@vitest/{expect,runner,snapshot,spy,mocker}` 等 5 个包根本没装（worker 静默卡死无 stderr）。已手工补齐。
4. package.json 5 个脚本改为直接调包内入口（`node node_modules/vitest/vitest.mjs run` 等），不依赖空的 `.bin`。

### 环境限制（如实记录，勿再重复踩）
- npm install 稳定失败：`CODEBUDDY_BROKER_DENY: ENOTEMPTY rename 'node_modules/browserslist'`；npm 10 arborist `edgesOut` 崩溃（由 vitest→coverage-v8→jsdom→canvas peer 链触发，jsdom 已移除）
- `node_modules` 是手工修补过的，**建议干净环境重装复现**
- `@vitejs/plugin-react` 已移除 → 丢 React Fast Refresh，dev 降级整页刷新。build/dev 均验证可用，待T4 再议是否装回
- MUI 9/Emotion 已装但 `src/` 下import 次数 = 0，不进产物；深路径导入验证顺延 T4
- 沙箱 HTTP 探测返回 502（代理拦截），无法用curl 验证 dev server

## 待用户决策
**Q8 PNG 倍率冲突**：实测 1920×1080@3x = 18.7M px、3840×2160@3x = 24.9M px，**均超 iOS Safari 的 16.7M canvas 上限**，会自动降为@2x/@1x。用户若要 1080p 真正出 3x，需改分块渲染导出 —— 属产品取舍，待定。

---

## QA 独立验收（严过关）· 路由判定 Engineer

五条校验我与 QA 独立复跑均确认全绿。但 QA 用**变异测试**挖出 2 个源码 Bug——这是本次最重要的收获。

### 变异测试：7/7 全部被拦截，0 假阳性
QA 备份 src 后逐个注入缺陷跑测试再还原（`diff -rq` 校验零污染）：
| 注入 | 拦截结果 |
|------|---------|
| 某元件填 `fill:'var(--evil)'` | ✅ 拦截 2 条 |
| polka-dots 弃用 `<pattern>` 逐点绘制 | ✅ 拦截 5 条 |
| `resolveElements` 改按下标匹配 | ✅ 拦截（报 `expected '#aaaaaa' to be '#dddddd'`）→ **证明「按 id 对齐」铁律真在生效** |
| 产物注入递增序号破坏确定性 | ✅ 拦截 |
| `opacity` 去掉 clamp | ✅ 精准拦截 |
| pattern 塞 `Math.random()` | ✅ 拦截 |
| pattern 塞 `<text>` | ✅ 拦截 |

### 🔴 缺陷 A（P1，阻塞核心差异化）：neon-pixels 的 px_d 是死元件
`src/patterns/D-pixel/neon-pixels.ts:83` — `pool = [...].slice(0, levels)`，而 `:31` levels 默认 3 → **px_d 永不在pool 里**。
200 seed 实测：px_a 82.5% / px_b 84% / px_c 85.5% / **px_d 0%（从不出现）**。
但 px_d 声明 `configurable: true` 且在 `synthwave`(#a0f) / `arcade`(#3b82f6) 两套 preset 里都配了色 → **UI 给用户一个紫色色块，拖取色器画面零变化**。
已转派，要求改默认值到 4 或用权重代替截断；**明确禁止**用 `configurable: false` 妥协。

### 🟠 缺陷 B（P2）：memphis-grid 元件改色命中率仅 29-41%
`src/patterns/D-pixel/memphis-grid.ts:35,128-132` — `perCell` 默认 2 且每格内 `5选1` 随机 → 平铺后整屏只有 2 种元件在重复。
200 seed 实测：wave 29.5% / zigzag 36.5% / tri 35.5% / block 38% / dot 41%。面板列 6 行，改任一行约 60-70% 概率无反应。

### 🟡 测试缺口（最重要沉淀）
现有测试对「死元件」零覆盖——只断言 `def.elements.some(e=>e.configurable)`（**元数据层**），从未断言「改元件颜色 → 产物真的变」（**行为层**）。所以 A/B 两个 Bug 能全绿通过。
已要求补：`12 pattern × 每 configurable 元件 × ≥20 seed`，断言产物字节变化，命中率 ≥95%。**这是 Q2 核心差异化的回归网。**

### PRD §5 十项决策：QA 判定 10/10 全部落地
Q1 导出静态（实测 animate:true 也字节一致）/ Q2 12 个 / Q3 邻近色三档（黄金角 137.508）/ Q4 恰好 10 套内置色板 / Q5 默认 polka-dots / Q6 96 产物 0 处 `<text>` / Q7 8 套合集 / Q8 PNG 守卫 10 条测试（@1x 也超限时返回缩放结果而非 null，绝不静默失败）/ Q9 无 PWA（grep manifest|serviceWorker 全项目 0 命中）/ Q10 无短链。
唯一缺口：**`role` 批量改色无消费方**（grep `batch|byRole|applyRole` 0 命中，`paletteSlots` 只在 patterns/ 定义、engine/ui/dev 都不读）——属 PRD P0-2，已一并转派。

### Lab 页验证（真实工作）
QA 成功起 dev server（`curl --noproxy '*'` 绕代理后 HTTP 200），PatternLab.tsx 转换无编译错误；生产 preview 也验了 **SPA 回退生效**（`/some/deep/unknown/path` → 200，满足 DoD #11）；`theme-boot.js` 独立外链，CSP 无需 `unsafe-inline` ✅。
- 12 缩略图 100% registry 驱动，全文件仅 1 处 pattern id 字面量 = `DEFAULT_PATTERN_ID='polka-dots'`（PRD Q5 要求，**合规**）
- 元件面板零 element id 硬编码，54 行元件全部数据驱动
- 参数面板 100% 由 `def.controls` 生成（range/toggle/select/angle 四类全覆盖）
**无法验证**：浏览器真实渲染截图——agent-browser 的 Chromium 194MB 连续 3 次下载超时（环境故障）。

### 环境事实修正（重要，别再踩）
1. **沙箱 HTTP 502 是代理拦截，非应用故障**：`HTTP_PROXY=http://127.0.0.1:55040`，用 `curl --noproxy '*'` 绕过即可。QA 实测 dev/preview 均 200。→ 工程师此前据「dev起不来」判定移除 `@vitejs/plugin-react` 的依据不成立，已要求重新评估。
2. **npm install 的 broker rename 拒绝可能是间歇的**：QA 在 /tmp 空目录与项目目录均安装成功（`up to date in 1m`），无法复现。
3. **coverage 98% 是局部数字**：`vite.config.ts` 的 coverage include 只含 `src/engine/**`，patterns/dev/App 未计入。engine 412 行中未覆盖 8 行。
4. **零 `.tsx` 测试覆盖**：`test.include: ['src/**/*.test.ts']` 不含 tsx，PatternLab.tsx(679行)/App.tsx 完全无测试；`jsdom` 在架构 §1.5 列为 devDependency 但 package.json 里没有。

### QA 脚本位置（未污染项目源码，`/tmp/qa-check/`）
`element-color-verify2.mts`（元件配色 40 seed 扫描）、`ironclad-rules.mts`（铁律四合一，含手写状态机式注释剥离器，比项目简易正则更严）、`dead-element-severity.mts`（死元件 200 seed 量化 + Lab 数据流审查）、`mutation2.sh`（变异测试）、`backup/src/`（源码备份，已校验还原）。