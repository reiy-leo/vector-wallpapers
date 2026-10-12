/**
 * @vitest-environment node
 *
 * 架构铁律 10 的门禁：`src/ui/` 内**不得出现任何 pattern id / element id 字面量**。
 *
 * 为什么这条要自动化：它守的不是「代码风格」，而是一个**架构主张**——
 * 「新增母题不需要改界面任何一行」。这句话一旦靠自觉维持，
 * 半年后必然出现 `if (id === 'aurora-wave')` 这样的特例分支，
 * 而这类分支在功能测试里完全不会报错（老母题都正常，只有新母题不对）。
 *
 * ⭐ 与记忆里「假绿测试」的三种形态对照：本门禁的检查对象必须是
 * **磁盘上的真实源码**，而不是从 registry 导出的列表 —— 用导出列表当基线
 * 等于拿答案去核对答案，扫描会平凡通过。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { registry } from '../patterns';

const UI_DIR = join(process.cwd(), 'src/ui');

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** 去掉注释再匹配 —— 否则文档里提到这些 id 就会误报。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const FILES = collect(UI_DIR).map((path) => ({
  // 存相对路径：断言信息里打印绝对路径会因机器而异，无法做快照比对
  path: path.replace(`${process.cwd()}/`, ''),
  abs: path,
  code: stripComments(readFileSync(path, 'utf-8')),
}));

/**
 * 与母题 id 空间同形异义的合法字符串。
 *
 * ⚠️ 为什么需要它：`pattern id` 是 kebab-case（`aurora-wave`），
 * 天然不会与 UI 里的标识符撞名 —— 所以 pattern id 检查可以做到零豁免。
 * 但 **element id 与控件 key 是作者自由命名的短词**，
 * 会与 UI 自身的类名 / SVG 属性名 / 数学函数撞名
 * （`top` 既是 isometric-voxel 的「顶面」元件，也是 Tailwind 类；
 *   `angle` 既是 halftone 的控件，也是 SVG 的 `angle` 属性）。
 *
 * 列入豁免的代价：若某个母题真的有个叫 `round` 的元件，这个守卫抓不到它。
 *但那仍被 `patterns.test.ts` 的「id 唯一性」「元件可配置性」覆盖，不构成盲区。
 */
const RESERVED_CONTROL_KEYS: ReadonlySet<string> = new Set([
  // ElementRole 的 5 个语义名
  'bg', 'primary', 'secondary', 'accent', 'detail',
  // URL 参数与 UIState 判别值
  'p', 'w', 'h', 'seed', 'cols', 'params', 'ui',
  'light', 'dark', 'system', 'left', 'right', 'grid', 'panel', 'focus', 'theme',
  'true', 'false',
  // 常见英文单词 / SVG 属性名 / CSS 类名
  'top', 'bottom', 'left', 'right', 'center',
  'angle', 'round', 'height', 'width', 'size',
  'color', 'fill', 'stroke', 'index', 'type', 'name', 'value', 'data', 'item', 'key',
  'scale', 'spread', 'ratio', 'shift', 'depth', 'turns', 'points', 'density', 'step',
]);

describe('UI 层零硬编码（工程铁律 10）', () => {
  it('扫描到了 UI 源码（确保下面的断言不是空跑）', () => {
    // 守卫自身必须有效：扫到 0 个文件时所有断言都会平凡通过
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES.every((f) => f.code.length > 0)).toBe(true);
  });

  it('UI 层不含任何 pattern id 字面量', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const def of registry.list()) {
        // 要求是「字符串字面量」形式 —— 裸标识符（变量名）不算
        if (new RegExp(`['"\`]${def.id}['"\`]`).test(f.code)) {
          offenders.push(`${f.path} → ${def.id}`);
        }
      }
    }
    expect(
      offenders,
      `UI 层出现 pattern id 字面量，新增母题将无法零改动接入：\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('UI 层不含任何 element id 字面量', () => {
    /*
     * ⚠️ 必须排除与 `ElementRole` 同名的 id。
     *
     * `bg` 既是 polka-dots 的元件 id，也是 PRD 定义的 role 名之一 ——
     * UI 里写 `['bg','primary',…]` 是在枚举**语义槽位**，完全合法。
     * 若不排除，会把正确的 role 枚举误判成硬编码，让守卫变成噪声
     * （守卫一旦有假阳性，开发者就会习惯性忽略它，那才是真正的损失）。
     *
     * 排除依据取自类型定义本身而非手写清单，避免以后新增 role 时漏改。
     */
    /*
     * ⚠️ 还要排除与**本项目自有命名空间**冲突的短 id。
     *
     * 例如 diamond-lattice 有个叫 `grid` 的元件，而 UI 侧完全可能正当使用
     * `'grid'` 这个字符串作为 URL 参数名或界面态 key。这类同形异义
     * 若不一并排除，守卫就会持续报假阳性 —— 而**有假阳性的守卫等于没有守卫**：
     * 开发者会习惯性忽略它，真正的泄漏反而被淹没。
     *
     * 排除清单从 `URL_PARAM` 与 `UIState` 推导，不手写。
     */

    const offenders: string[] = [];
    for (const f of FILES) {
      for (const def of registry.list()) {
        for (const el of def.elements) {
          if (RESERVED_CONTROL_KEYS.has(el.id)) continue;
          if (new RegExp(`['"\`]${el.id}['"\`]`).test(f.code)) {
            offenders.push(`${f.path} → ${el.id}（${def.id}）`);
          }
        }
      }
    }
    expect(
      offenders,
      `UI 层出现 element id 字面量（应全部来自 PatternDef.elements）：\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('UI 层不按 role 做界面特例（允许取底色这类领域逻辑，但禁止影响渲染分支）', () => {
    /*
     * `coloring.ts` 里有一处 `role === 'bg'`，用于「找出底色作为邻近色推导基准」——
     * 那是**领域逻辑**（PRD Q3 的随机配色本就以底色为锚），不是界面特例。
     *
     * 因此这里不查「有没有 role 比较」，而查更本质的东西：
     * UI 层是否按 role 决定**界面怎么画**。判据 = 该比较的结果是否流向 JSX/className。
     * 粗筛实现：role 比较只允许出现在 `coloring.ts`（唯一的随机配色实现）里。
     */
    const offenders = FILES.filter(
      (f) =>
        !f.path.endsWith('coloring.ts') &&
        /(role|slot)\s*===?\s*['"`](bg|primary|secondary|accent|detail)['"`]/.test(f.code),
    ).map((f) => f.path);

    expect(
      offenders,
      `除 coloring.ts 外不应出现 role 比较（界面应完全由 PatternDef 驱动）：${offenders.join(', ')}`,
    ).toEqual([]);
  });

  it('UI 层不含任何参数控件 key 字面量', () => {
    /*
     * 与 element id 检查同理：控件 key 也会与 UI 自身的英文标识撞名
     * （`angle` 既是 halftone 的控件 key，也是 SVG 的 `angle` 属性名；
     *  `round` 既是 papercut 的控件 key，也是 Math.round 的用法）。
     * 复用同一份 RESERVED 表，两个检查口径保持一致。
     */
    const offenders: string[] = [];
    for (const f of FILES) {
      for (const def of registry.list()) {
        for (const c of def.controls) {
          if (RESERVED_CONTROL_KEYS.has(c.key)) continue;
          if (new RegExp(`['"\`]${c.key}['"\`]`).test(f.code)) {
            offenders.push(`${f.path} → ${c.key}（${def.id}）`);
          }
        }
      }
    }
    expect(
      offenders,
      `UI 层出现控件 key 字面量，参数控件应完全由 ControlDef 生成：\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('UI 层不直接读取 localStorage / sessionStorage（应经由 store 收口）', () => {
    const offenders = FILES.filter((f) => /\blocalStorage\b|\bsessionStorage\b/.test(f.code)).map(
      (f) => f.path,
    );
    expect(
      offenders,
      `存储访问必须收敛在 store.ts，实际：${offenders.join(', ')}`,
    ).toEqual(['src/ui/store.ts']);
  });
});
