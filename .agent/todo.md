# 待办 —— 2026-10-12

按「能否独立回滚」排序，不按紧急度。

---

## P0 · 影响导出正确性

### ☐ canvas 像素上限应按平台区分

**问题**：`guardCanvasSize` 的 `MAX_PIXELS = 16_000_000` 是按 iOS 上限设的，
**导致桌面用户被误伤** —— 4K@2x = 33.2M 会被降级到 @1x，但桌面完全做得出来。

应改为：iOS 16.7M / 桌面 268M / Android 201M / Firefox 472M。

**影响**：桌面用户拿不到 2x 导出，且提示文案说「已降级」但没说为什么。
**改动点**：`src/shared/guards.ts` 的 `guardCanvasSize`。

### ☐ 补 16:10 尺寸预设

**问题**：MacBook 是 **16:10**（3024×1964 等），而现有预设全是 16:9 / 9:19.5
→ 16:9 壁纸铺到 16:10 屏会**裁掉上下约 10%**。

**比例问题比倍率更影响观感**。Mac 机型参考：

| 机型 | 物理像素 | Mpx |
|---|---|---|
| MacBook Air 13" | 2560×1664 | 4.3 |
| MacBook Pro 14" | 3024×1964 | 5.9 |
| MacBook Pro 16" | 3456×2234 | 7.7 |
| iMac 24" | 4480×2520 | 11.3 |
| iMac 27" 5K / Studio Display | 5120×2880 | 14.8 |
| Pro Display XDR | 6016×3384 | **20.4（最大）** |

**注意**：Mac 已是 Retina，壁纸按物理像素铺满，没有额外 @2x 概念。
我们的 `4K@2x`（33.2M）**已超过所有 Mac 屏**，
@3x（74.6M）是最大屏的 3.7 倍 → **@3x 对 Mac 纯浪费**，只对 Windows 高分屏有意义。

### ☐ 「匹配当前屏幕」导出

直接用 `screen.width × devicePixelRatio`，天然正确。

---

## P1 · 母题质量

### ☐ aurora-wave 视觉重做

用户反馈"好丑"。根因是渲染成「实心硬边色带 + 平底」，像山脊不像极光。

**重做四要素**（缺一件就还是色块）：

1. **下缘锐利亮边**（单独描线且**不参与模糊**，是极光的「刀刃」）
2. **向上 stop-opacity 归零化雾** —— 末端再暗的实色也是实色，只有 alpha 归零才真化进夜空
3. **垂直光射线**（34 条，跟随褶皱轮廓贯穿帘幕，细/粗两组叠加；**不可参与模糊**，否则 2px 线被糊没）
4. **褶皱倍数 2.2~4.4** ← **最关键**，cycles≈1 时上缘是直线，必然退化成「一条发光横条」

配套：三档互质 tile 破星点网格（原单档 120px 晶格一眼看穿）；`feGaussianBlur` 只糊幕身。

**⛔ 不可改数据契约**：元件 id `sky/band_a/band_b/stars`、
控件 key `bands/amp/thickness/stars/sway`、preset id `boreal/nebula/ember`、
`paletteSlots` 全部锁定（分享链接依赖）。

### ☐ 8 个新母题的视觉复核

`girih-star` / `halftone` / `papercut` / `art-deco-fan` /
`nouveau-scroll` / `isometric-voxel` / `lowpoly-facet`
（`glitch-rgb` 已于 2026-10-12 经 Rei 批准整体替换为 `dither-gradient`「抖动渐变」）

**现状**：结构正确 + 测试全绿 + 体积达标，但**视觉问题尚未修**。

### ☐ STYLE-100 §6 的 14 个网络审美 preset

零成本高 ROI，未做。

约束：每母题 preset 上限建议 4 个（现有均为 3 个），
无限扩张会让「随机配色」失去意义。

### ☐ STYLE-100 §5 第三批 2 个

`damascus-mosaic` / `caisson-lotus`，需先验证节点风险。

---

## P2 · 工程卫生

### ☐ 干净环境复现

`node_modules` 曾被手工修补过（Kumo 安装走 `npm pack` + `tar -xzf`，
因 npmmirror 的 semver 返回空版本字符串）。

**建议在干净环境跑一次**：
```bash
rm -rf node_modules && npm install && npm run typecheck && npm run build
```

### ☐ 仓库可见性

`github.com/reiy-leo/vector-wallpapers` 目前是 **PUBLIC**。
含 `.agent/docs/PRD.md`（商业模式章节）与 `.agent/memory/`（内部开发笔记，原 `.workbuddy/memory/`）。
建议改 Private，或把 `.agent/memory/` 移出仓库。

---

## P3 · 可选增强

- ☐ iOS Safari 的 PNG 导出（当前直接不支持，按钮灰化 + 提示引导用 SVG）
  - 调研结论：`@resvg/resvg-wasm` 是唯一能在 iOS 突破 canvas 限制的方案（直接产出 PNG 字节不经 canvas）
  - 但会**破坏「导出与预览逐像素一致」**这条验收标准（resvg 与浏览器渲染引擎不同，`feGaussianBlur` 可能有差异）
  - 需用户拍板是否接受这个交换
- ☐ 随机 seed 断言的观感约束
  - 当前只保证「换 seed 必得新产物」，**不约束抖动幅度/密度等观感参数**
  - QA 实证：抖动开到 ±90%、size 调回 0.45 均通过
  - 建议在 `describe` 注释写明，避免后人误以为能兜住视觉质量

---

## 已完成（留档，勿重复）

- ✅ Phase 1 收口（12 pattern + 三栏工作台）— 2026-10-10
- ✅ 补齐到 19 个母题 — 2026-10-12
- ✅ Kumo Design 16 条合规 + 5 条人工判断核查 — 2026-10-12
- ✅ 控件体系统一 + 形态参数上移 + 产物动作归位 — 2026-10-12
- ✅ flow-lines 视觉重做（线宽缩放/对比度/形态多样）— 2026-10-12
- ✅ cloud-bands 椭圆→真云 — 2026-10-12
- ✅ 收口 8 个并发写入的新 pattern（PatternId 缺口/seed 撞图/体积超线）— 2026-10-12