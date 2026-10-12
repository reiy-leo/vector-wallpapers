# 2026-10-12 · T4 工作台 UI（Kumo 设计语言）落地

## 背景
引擎 + 19 个母题在 Phase 1 已收口，但界面仍是 dev 用的 `PatternLab`，
`App.tsx` 只是占位页 —— PRD §4.1 的三栏工作台从未实现。
本轮用 **kumo-design 技能**做全新界面，并保持全部工程铁律。

## 产出（新增 12 个源文件 + 3 个测试文件）
```
src/ui/store.ts        零依赖 external store（useSyncExternalStore）
src/ui/share.ts        URL 编解码（分享链接）
src/ui/coloring.ts     随机配色 / 套色板 / 换种子（seeded RNG）
src/ui/exporters.ts    SVG 下载 + PNG 光栅化 + 尺寸守卫
src/ui/primitives.tsx  原语组件（Button/Segmented/Slider/Dialog/Toast…）
src/ui/icons.tsx       24 个内联 SVG 图标（零依赖）
src/ui/PatternRail.tsx ① 母题库
src/ui/CanvasStage.tsx ② 预览画布
src/ui/ElementPanel.tsx ③ 元件级配色（核心差异化）
src/ui/Panels.tsx      色板 / 合集 / 参数
src/ui/TopBar.tsx      顶栏 + 导出对话框 + 源码对话框
src/ui/Workbench.tsx   三栏组合根
src/styles/theme.css   重写：设计 token + 深浅色 + preflight 替代品
```

## ⭐ 三个「只有实测才能发现」的问题

### 1. URL 编解码的分隔符冲突（**静默失败**）
`ElementPatch` 用 `,` 分隔字段，而 `PaintSpec` 编码**内部也用 `,`** 分隔渐变色标。
结果：三色标渐变在第一个逗号处被截断，解码只剩 1 个色标 ——
**链接照常打开，只是颜色悄悄变了**。肉眼与类型检查都发现不了。
修法：字段分隔符改用 `~`（`!` `,` `:` `@` `;` 均已被占用，`~` 无歧义）。
回归测试见 `share.test.ts` 的「线性渐变往返保真」用例。

### 2. 跳过 preflight 的连带代价：`[hidden]` 完全失效
本项目刻意不引 preflight（否则会破坏 MUI 结构），代价是
浏览器默认的 `[hidden] { display: none }` 在工具类 `display:flex` 面前失效 ——
**源码对话框常驻在页面上**。首屏截图才暴露出来。
修法：theme.css 补 `[hidden] { display: none !important; }`。
这条与 Kumo「弹窗绝不条件渲染」规则直接相关。

### 3. WCAG 对比度：初版 7 处不达标
oklch 的 0.01 差值肉眼完全无法察觉。写脚本实测后调整：
- `text-mute` 浅 0.53→0.52、深 0.66→0.68
- `warning` 浅 0.58→0.52
- 新增 `--vw-line-input`（≥3:1，WCAG 1.4.11），与装饰性 `--vw-line` 区分
装饰性分隔线豁免 3:1（有据可依：1.4.11 只要求「识别控件所必需」的边界达标）。

## 验证方式
- typecheck 0 error
- 新增测试 101 个全绿：`share.test.ts`(29) / `tokens.test.ts`(66) / `hardcoding.guard.test.ts`(6)
- 15 个测试文件逐个跑全绿（整批跑会被沙箱 OOM kill，需 `--max-old-space-size` + 分批）
- **真实 Chrome（CDP 无头）验证**：0 console error；19 张缩略图 + 大图预览均为真 SVG；
  改色确实进入产物（SVG 内含 `#ff00ff`）；分享链接往返**字节级一致**（同为 9212 字符）；
  畸形链接（`p=does-not-exist&w=abc`）优雅降级到默认母题，不白屏
- 变异测试自证守卫有效：往 primitives.tsx 注入 `'aurora-wave'` 字面量 → 守卫立刻报错

## 关键设计决策
1. **「暗房」原则**：外壳去饱和，品牌色只用于选中/焦点/主操作，
   用户看到的第一个彩色物体应该是壁纸本身。
2. **渐进披露**：元件行默认折叠（19 母题有 4~12 元件，全展开右栏会变成一面墙）。
3. **锁定用中性色**而非品牌色 —— 锁定是保护性状态，不是需要被强调的特性。
4. **role 色块渲染真实渐变**：`dusk-ridges` 的 bg 槽是线性渐变的 sky，
   退化成灰块会让人以为「这个角色没有颜色」，与画布实际矛盾。
5. 分类 Tab 用 `flex-wrap` 而非横向滚动 —— 5 个分类在 280px 栏排不下，
   滚动会把「像素复古」裁掉且无任何可见提示。
6. 栅格叠加用 ResizeObserver 对齐**图片盒子**而非容器，否则参考线与壁纸边缘错位。

## 体积
首屏 JS gzip 合计 **120.6 KB**（预算 300 KB，40%）。
react 68.3 + patterns 18.7 + index 21.2 + engine 6.4 + css 5.9。

## 遗留
- 全量测试单批跑会被沙箱 OOM kill（exit 137），需分批 + `--max-old-space-size=3072`。
  **不是代码缺陷** —— 逐个文件跑全绿。
- 本轮末尾 Bash 通道再次被沙箱阻塞（`sandbox-exec: data object length 67619 exceeds maximum`），
  与 2026-10-11 记录的现象一致。Read/Write/Edit 仍可用。
