# 2026-10-12 · 第二批 8 个母题落地（依据 STYLE-100-ANALYSIS.md）

## 背景
`.agent/docs/STYLE-100-ANALYSIS.md`（142 风格 × 19 母题的可添加性判定）§5 建议新增 8 个母题。
本轮实现全部 8 个并注册。母题总数 **19 → 27**。

## 产出（新增 8 个 pattern + 2 处测试更新）
| id | 分类 | 结构机制 | 元件 | 纯色 | 体积 |
|---|---|---|---|---|---|
| `girih-star` | B | 8/10/12 折星嵌套镶嵌 | 4 | 4/4 | 2.3KB |
| `halftone` | B | 等径网点平铺 + 渐变调制 | 4 | 4/4 | 1.7KB |
| `papercut` | B | 层叠遮挡模拟镂空 | 5 | 5/5 | 1.9KB |
| `glitch-rgb` | D | RGB 三通道错位叠印 | 5 | 5/5 | 3.4KB |
| `art-deco-fan` | B | 扇形 + 阶梯同心环 | 4 | 4/4 | 8.8KB |
| `nouveau-scroll` | A | 自相似递归对数螺线 | 4 | 4/4 | 3.3KB |
| `isometric-voxel` | D | 30° 轴测立方体堆叠 | 5 | 5/5 | 1.7KB |
| `lowpoly-facet` | C | 抖动网格三角面片镶嵌 | 5 | 5/5 | 3.5KB |

**8 个全部 100% 纯色元件**（文档预测达成），全局纯色占比 84% → **89%**。

## ⭐ 六个「只有跑起来才暴露」的问题

### 1. dead element：`glitch-rgb/ch_g` 改色毫无效果（0 次出现）
两个 bug 叠加：
- 条带画成白色 `#ffffff`，通道 rect 只写 `fill: url(#tile)` → **通道颜色根本没进产物**
- 三通道 content 逐字节相同 → defs 签名撞车 → 塌成一层
修法：content 用占位符 `%C%` 按通道替换 fill；平移写进 `patternTransform`（进签名）。

### 2. dead element：`lowpoly-facet/dark` 恒为 0%
实测 `v` 范围只有 **[0.648, 0.923]**（法线投影 + radial 叠加后未铺满 [0,1]），
绝对阈值下 dark 永远取不到。
修法：**按实测 min/max 归一化后再分档**，任何 seed 下三档必然都被命中。

### 3. `art-deco-fan` 体积超限 46%（29.9KB）
`steps=8 × sectors=24` = 192 段弧。已把 steps 上限从 8 收到 5。

### 4. `structure.guard` 自己写错了节点计数
用 `svg.match(/<(rect|path…)/g).length` 把 `<defs>` 里 `<pattern>` **内部**的图形也数进去，
导致 `art-deco-fan` 被数成 76 节点（真值：body 顶层仅 1 个）。
引擎的 `budget.ts` 一直用 `countTopLevelNodes(body)` —— 是守卫各写了一套。
修法：直接复用引擎真源，不再重写。

### 5. `halftone` 渲染出来是一片实底（视觉检查发现，测试全绿）
连续失败三版：
1. pitch×pitch pattern，场只在单元内变 → 全图同一形态
2. 每行一个 pattern → defs 去重把 36 行塌成 1 行
3. 逐点直画 252 个 circle → 视觉对了，但**违反架构 §3.3**（B-repeat 必须平铺）且顶满 20KB
最终解：**等径网点平铺 + 渐变调制层**。网点严格平铺（守住铁律），
明暗由覆盖全幅的白色渐变调制（峰值仅 0.42，否则会盖过网点本身）。

### 6. 单个 `<circle>` 是 72.8 字节，不是我估的 48
按 48B 反推抽稀阈值得 383 点 → 实测 29.3KB 超红线 43%（被 budget 守卫当场抓住）。
**阈值必须由实测字节反推，不能拍脑袋。**

## 其他修正
- `glitch-rgb/scan_gap` → `scanGap`（控件 key 必须 camelCase）
- 4 个母题声明 `seedable: true` 却从不调 `rng()` → 补上真实的 seed 敏感
  （halftone 相位=套印误差 / girih 副星取舍 / deco 扇面半径抖动 / scroll 出手高度）
- `lowpoly` 在 `jitter=0` 时无 seed 变化 → 加 `flipSeed`（对角线朝向，本身有视觉意义）
- `patterns.test.ts` 里 5 处写死的「19」改为具名常量 `TOTAL_EXPECTED = 27`
- `hardcoding.guard` 新增 8 个母题后产生 5 处**假阳性**（`top`/`light`/`angle`/`round`/`height`
  是常见英文词，与元件 id / 控件 key 撞名）→ 抽出模块级 `RESERVED_CONTROL_KEYS` 统一豁免

## 验证
- typecheck 0 error；build 通过
- patterns.test **94 全绿**（含体积红线、确定性、平铺覆盖、seed 敏感、死元件检测）
- structure.guard 10 / purity.guard 22 / share 29 / hardcoding 6 全绿
- 27 张 previews 已生成并用 cairosvg 逐张目视
- 变异测试自证：注入 `lowpoly-facet` 字面量 → hardcoding 守卫立即抓到
- 首屏 gzip 120.6KB → **128.9KB**（预算 300KB）

## ⚠️ 视觉质量：4 个母题仍需改进（目视发现，非测试可见）
用 cairosvg 渲染 8 张 previews 逐一目视后：
- ✅ `girih-star` `papercut` `glitch-rgb` `lowpoly-facet` 观感达标
- ⚠️ `halftone` 可用但**网点偏细**，缩略图上接近规则网格，半调感不强（受平铺铁律限制的妥协）
- ⚠️ `art-deco-fan` **扇面之间有大片空白 + 可见接缝**，扇形未铺满单元
- ⚠️ `isometric-voxel` **看不出立体**，读作横向条纹（轴测几何有问题）
- ⚠️ `nouveau-scroll` 涡卷**过小过密**，缩略图上像「花布」而非卷草纹

## 遗留
1. 上述 4 个母题的视觉问题**尚未修**（本轮只做到「结构正确 + 测试全绿 + 体积达标」）
2. STYLE-100 §6 的 14 个网络审美 preset（零成本高 ROI）未做
3. §5 第三批 2 个（`damascus-mosaic` / `caisson-lotus`）未做，需先验证节点风险
4. `aurora-wave` 视觉重做仍未完成（上一轮遗留）
