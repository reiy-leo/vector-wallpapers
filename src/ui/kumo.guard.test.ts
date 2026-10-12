/**
 * @vitest-environment node
 *
 * Kumo Design（Cloudflare 设计规范）合规门禁。
 *
 * ⭐ 为什么要把设计规范固化成测试：设计规范是「文档」，文档不会在改动时报警。
 * 半年后有人写了个 `font-bold`，没有任何东西会失败——规范只存在于记忆里。
 * 而 UI 层一旦违反规范（尤其是字号阶梯与 hover 过渡），是**肉眼最容易放过**的一类回归。
 *
 * 实现上刻意**从磁盘真实源码扫描**而不是复制一份规则清单：
 * 复制的那份会与实际代码漂移，改了 UI 却测的是旧规则 —— 这正是本项目
 * 记忆里「假绿测试」的三种形态之一。
 *
 * 扫描前**必须真正剥离注释**（状态机式，见 stripComments）：
 * 本文件的规则名本身就写在源码注释里（「Kumo `heading-case`：绝不 capitalize」），
 * 若按行首正则过滤就会把注释内容误判成违规 —— 第一版检查器就踩了这个坑。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const UI_DIR = join(ROOT, 'src/ui');
const THEME_PATH = join(ROOT, 'src/styles/theme.css');

/**
 * 状态机式注释剥离器。
 *
 * 处理三件事，逐行正则都做不到：
 *  1. 块注释跨行（`/* ... *\/`）
 *  2. JSX 块注释 `{/* ... *\/}`
 *  3. 字符串字面量里的 `//`（如 `url="http://..."`）不应被当成注释起点
 */
function stripComments(code: string): string {
  let out = '';
  let inLine = false;
  let inBlock = false;
  let inStr: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const n = code[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') {
        inBlock = false;
        i++;
      } else if (c === '\n') out += c;
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') {
      inLine = true;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      inBlock = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      inStr = c;
      out += c;
      continue;
    }
    out += c;
  }
  return out;
}

function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = collect(UI_DIR).map((abs) => ({
  path: relative(ROOT, abs),
  code: stripComments(readFileSync(abs, 'utf-8')),
}));

/** 逐行匹配，收集违规点。 */
function find(pattern: RegExp, opts: { allowHeading?: boolean } = {}) {
  const hits: string[] = [];
  for (const f of FILES) {
    f.code.split('\n').forEach((line, i) => {
      if (opts.allowHeading && /<h[1-6][\s>]/.test(line)) return;
      if (pattern.test(line)) hits.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  return hits;
}

describe('Kumo Design 合规（src/ui + theme.css）', () => {
  it('扫描到了 UI 源码（确保下面不是空跑）', () => {
    expect(FILES.length).toBeGreaterThan(5);
    expect(FILES.every((f) => f.code.length > 0)).toBe(true);
  });

  it('comment stripping 生效：注释里的规则名不会被误判为违规', () => {
    // 源码注释里写着「绝不 capitalize」「禁止 font-bold」等字样，
    // 若剥离失效，这条会失败 —— 它是其余规则可信的前提。
    const all = FILES.map((f) => f.code).join('\n');
    expect(all).not.toMatch(/Kumo\s+`heading-case`/);
  });

  it('`content-text-size` 正文/按钮/数据不得 ≥16px（标题除外）', () => {
    const hits = find(/text-(md|lg|xl|2xl)|text-\[1[6-9]px\]|text-\[2\d+px\]/, {
      allowHeading: true,
    });
    expect(hits, `非标题元素不得使用 16px+：\n${hits.join('\n')}`).toEqual([]);
  });

  /**
   * ⭐ `content-text-size` 的**下半边**：可交互控件不得 <14px。
   *
   * ⚠️ 此前这条规则只拦 ≥16px，13px 这一侧完全无人看守 ——
   * 于是 `BUTTON_SIZE.sm` 长期写着 `text-sm`(13px)，
   * 而它**正上方的注释**恰好是「⭐ Kumo content-text-size：按钮文字 14px，不用 13px」。
   * 注释说一套、代码做一套，两年没人发现：因为没有任何东西会因此失败。
   *
   * 判定方式：不猜语义，只认「这行代码在定义一个可交互控件」——
   * `<button` / `<label` / `<legend` / `BUTTON_SIZE` / `Segmented` 的
   * size 映射 / `<input`。纯说明文字（`<p>` / `<span>` 描述句）不拦，
   * 因为 Kumo 允许次要元信息用 13px。
   */
  it('`content-text-size` 可交互控件不得 <14px（13px 仅限说明性元信息）', () => {
    const violations: string[] = [];

    /**
     * 判定「这一行是否属于可交互控件」。
     *
     * ⚠️ 这是本轮**两次假绿**换来的实现。两种朴素做法都失效：
     *  1) 逐行匹配 —— `sm: 'h-8 px-3 text-sm',` 当前行既无 `<button`
     *     也无 `BUTTON_SIZE`，第一版门禁连它自己要修的 bug 都抓不到；
     *  2) 固定窗口向上回溯 N 行 —— `Segmented` 的 size 三元在 30 行外，
     *     窗口取 8 抓不到，取 30 就会把整个文件后面的无关代码全吞进来。
     *
     * 正确做法是**作用域栈**：从最近的「顶层声明行」起（function / const XXX = {
     * / const XXX: T = {），向下扫到下一个顶层声明为止 —— 这段区间的行都算在
     * 该声明的语义范围内。语义不由单行决定，而由「它属于谁」决定。
     */
    const TOP_LEVEL = /^(export\s+)?(function|const|let|class|type|interface)\b/;

    const isInteractive = (lines: readonly string[], target: number): boolean => {
      // ① 先找target 所属的顶层声明起点
      let start = target;
      for (let j = target; j >= 0; j--) {
        if (TOP_LEVEL.test(lines[j] ?? '')) {
          start = j;
          break;
        }
      }
      // ② 从声明头往下扫：只要还没越过它自己的结尾，就继承该声明的语义标记
      let marked = false;
      for (let j = start; j <= target; j++) {
        const line = lines[j] ?? '';
        if (j !== start && TOP_LEVEL.test(line)) break;
        if (/<button|<label|<legend|<input/.test(line)) marked = true;
        // 常量表名（BUTTON_SIZE 等）只有名字，没有标签，需按名字判定
        if (/(BUTTON_SIZE|BUTTON_VARIANT)\b/.test(line)) marked = true;
        // Segmented 的 size 三元：函数体内、前面有 Segmented 签名
        if (/^export function Segmented/.test(line)) marked = true;
        if (/^export function Button\b/.test(line)) marked = true;
        if (/^export function (IconButton|ToggleIconButton)\b/.test(line)) marked = true;
      }
      return marked;
    };

    for (const f of FILES) {
      const lines = f.code.split('\n');
      lines.forEach((line, i) => {
        if (!/\btext-sm\b/.test(line)) return;
        // ⭐ 豁免：纯说明性元信息。Kumo 允许 13px 用于「不承载交互的次要信息」，
        // 因此纯描述段落（<p>）与装饰性分隔符（aria-hidden 的 ×）不在此列。
        if (/^\s*<p[\s>]/.test(line)) return;
        if (/aria-hidden="true"/.test(line)) return;
        if (!isInteractive(lines, i)) return;
        violations.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 80)}`);
      });
    }
    expect(
      violations,
      `可交互控件须用 text-base(14px)：\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * ⭐ 注释与代码的一致性：注释里引用了某条 Kumo 规则的**具体做法**，
   * 那条做法就必须真在代码里。
   *
   * 本项目出现过注释写「按钮文字 14px，不用 13px」、紧邻代码写 `text-sm` 的情况。
   * 这类矛盾无法被任何「规则是否被违反」的断言抓到 —— 因为注释不是代码。
   * 因此这里做一条弱一致检查：注释提到某个 token/类名时，
   * 在同一语句块内不允许出现它的反义写法（对 14px/13px 这类成对档位）。
   */
  it('注释声明的 14px 不得与同块代码的 13px 矛盾', () => {
    const violations: string[] = [];
    // ⚠️ 必须读**原始源码**：FILES 里存的是 stripComments 之后的产物，
    // 而这条规则恰恰是关于注释的 —— 用剥离后的代码查注释，恒为空跑。
    for (const abs of collect(UI_DIR)) {
      const lines = readFileSync(abs, 'utf-8').split('\n');
      lines.forEach((line, i) => {
        if (!/14px|14 px/.test(line)) return;
        if (!/注释|按钮文字|不得|不用|必须是/.test(line)) return;
        const next = (lines[i + 1] ?? '') + (lines[i + 2] ?? '');
        if (/\btext-sm\b/.test(next)) {
          violations.push(`${relative(ROOT, abs)}:${i + 1}  注释说 14px，紧邻代码却是 text-sm`);
        }
      });
    }
    expect(
      violations,
      `注释与代码矛盾（注释是"文档"，不会在改动时报警）：\n${violations.join('\n')}`,
    ).toEqual([]);
  });

  it('`heading-case` 禁止 uppercase / capitalize', () => {
    const hits = find(/\buppercase\b|\bcapitalize\b/);
    expect(hits, `标题必须 sentence case：\n${hits.join('\n')}`).toEqual([]);
  });

  it('`font-tracking` 禁止 tracking-*', () => {
    const hits = find(/\btracking-(?!normal\b)/);
    expect(hits, `禁止改字间距：\n${hits.join('\n')}`).toEqual([]);
  });

  it('`font-weight` 禁止 font-bold', () => {
    const hits = find(/\bfont-bold\b/);
    expect(hits, `禁止 font-bold，请用 font-medium/semibold：\n${hits.join('\n')}`).toEqual([]);
  });

  it('`hover-color-transitions` hover 的颜色变化必须瞬时', () => {
    const a = find(/transition-colors[^\n]*hover:/);
    const b = find(/hover:[^\n]*transition-colors/);
    const hits = [...a, ...b];
    expect(hits, `hover 不得配transition-colors：\n${hits.join('\n')}`).toEqual([]);
  });

  it('`shadow-borders` 阴影与描边不得同用', () => {
    const hits = find(/border[^\n]*shadow-|shadow-[^\n]*border-/);
    expect(hits, `阴影与描边同用，应用 ring 代替 border：\n${hits.join('\n')}`).toEqual([]);
  });

  it('`concentric-border-radius` 相邻圆角必须同心', () => {
    const hits: string[] = [];
    for (const f of FILES) {
      const lines = f.code.split('\n');
      for (let i = 0; i < lines.length - 1; i++) {
        const a = lines[i].match(/rounded-(lg|xl)\b/);
        const b = lines[i + 1].match(/rounded-(lg|xl)\b/);
        if (a && b && a[1] === b[1]) {
          hits.push(`${f.path}:${i + 1}  相邻圆角同为 rounded-${a[1]}，应同心递减`);
        }
      }
    }
    expect(hits, `相邻圆角必须同心（外 = 内 + padding）：\n${hits.join('\n')}`).toEqual([]);
  });

  it('`inline-monospace-size` 与正文混排的等宽文本约 0.9em', () => {
    // 只在「与普通文本混排」时要求缩小；整块都是等宽（如纯 id 列表）不适用。
    const hits = find(/font-mono(?![^\n"']*(0\.9em|0\.8em|\[0\.9|\[0\.8|text-xs|text-2xs))/);
    expect(hits, `混排等宽文本应缩小到 ~0.9em：\n${hits.join('\n')}`).toEqual([]);
  });

  it('`dialog-rendering` Dialog 不得条件渲染', () => {
    // Kumo 原文针对 Dialog（弹窗），不针对折叠面板 —— 折叠条件渲染是合理的。
    const hits = find(/\{open\s*&&\s*\(\s*(?:\/\/[^\n]*\n\s*)*<Dialog/);
    expect(hits, `Dialog 须用 open 属性控制显隐，否则丢失开关动画：\n${hits.join('\n')}`).toEqual(
      [],
    );
  });

  it('`sticky-borders` 吸顶元素需 border 分隔', () => {
    const hits = find(/sticky[^\n]*top-0(?![^\n]*border)/);
    expect(hits, `吸顶元素需 border 与内容分隔：\n${hits.join('\n')}`).toEqual([]);
  });

  it('theme.css 本身不得违反 token 规则', () => {
    const css = stripComments(readFileSync(THEME_PATH, 'utf-8'));
    expect(css, 'theme.css 不得使用 font-weight: 700/bold').not.toMatch(
      /font-weight:\s*(700|bold)/,
    );
    // 正文统一 14px（Kumo content-text-size）
    expect(css, 'body 正文必须 14px').toMatch(/font-size:\s*14px/);
    // 同心圆角规则需要成体系的圆角 token（外/内各几档）
    const radii = css.match(/--radius-\w+:\s*[^;]+/g) ?? [];
    expect(radii.length, `圆角 token 至少 5 档以支撑同心圆角：实际 ${radii.length}`).toBeGreaterThanOrEqual(5);
  });

  /**
   * ⭐ 防「假缺陷」：`h-lh` 曾被我误判为「theme.css 从未定义 → icon-alignment
   * 规则从未生效」，于是加了一条断言 + 一条自定义 `.h-lh{height:1.5em}`。
   * 实际构建产物里本来就有 `.h-lh{height:1lh}` —— **Tailwind v4.3 内置**
   * 这个类，规则一直是生效的。更糟的是自定义定义属无层级 author 规则，
   * 会**覆盖**内置实现，把`1lh` 降级成 `1.5em`。
   *
   * 这条断言的作用因此反转：钉住「theme.css 不得自定义 h-lh」，
   * 防止下一次又有人基于同样的误判去"修复"它。
   */
  it('`inputClass` 单一来源纪律见上：theme.css 不得自定义 .h-lh', () => {
    const css = stripComments(readFileSync(THEME_PATH, 'utf-8'));
    expect(css, 'Tailwind v4.3 已内置 .h-lh{height:1lh}；自定义覆盖反而会降级它').not.toMatch(/\.h-lh\s*\{/);
  });

  /**
   * ⭐ 控件高度三档收敛。
   *
   * 背景：项目一度同时存在 26/28/30/32/36/38px 六种可点物高度，
   * 肉眼表现为「有的控件比旁边的重」。Kumo 16 条规则里没有对应条目——
   * `shadow-borders` 讲描边，但**高度差造成的视觉重量差**同属一类问题，
   * 只能自己定死标准并用断言看守。
   *
   * 白名单只有 3 档（对应 CONTROL_H / CHIP_H / CONTROL_H_LG 三个语义）。
   * 新增例外必须在白名单里写明理由 —— 否则白名单会退化成「都能过」。
   */
  it('控件高度必须收敛到 token 三档，不得散落字面量', () => {
    const ALLOWED = new Set(['h-7', 'h-8', 'h-9']);
    const TOP_LEVEL = /^(export\s+)?(function|const|let|class|type|interface)\b/;

    /**
     * ⭐ 作用域栈判定（第三次因为同一根因踩坑，必须写对）。
     * `sm: 'h-10 px-3 text-base',` 这一行既无 `<button` 也无 `BUTTON_SIZE`，
     * 逐行匹配与固定窗口回溯都会漏 —— 语义在「它属于哪个声明」里。
     */
    const inControlScope = (lines: readonly string[], target: number): boolean => {
      let start = target;
      for (let j = target; j >= 0; j--) {
        if (TOP_LEVEL.test(lines[j] ?? '')) {
          start = j;
          break;
        }
      }
      let marked = false;
      for (let j = start; j <= target; j++) {
        const line = lines[j] ?? '';
        if (j !== start && TOP_LEVEL.test(line)) break;
        if (/<button|<label|<select/.test(line)) marked = true;
        if (/\b(BUTTON_SIZE|ICON_BOX|CONTROL_H|CHIP_H|CONTROL_H_LG)\b/.test(line)) marked = true;
        if (/^export function (Button|IconButton|Chip|Segmented|SliderChip|TextInput|SearchInput|SliderField)\b/.test(line)) {
          marked = true;
        }
      }
      return marked;
    };

    /** 该行所属的顶层声明名（用于按组件语义豁免，而非按写法猜形态）。 */
    const ownerOf = (lines: readonly string[], target: number): string => {
      for (let j = target; j >= 0; j--) {
        const m = (lines[j] ?? '').match(/^(?:export\s+)?function\s+(\w+)/);
        if (m) return m[1];
        if (TOP_LEVEL.test(lines[j] ?? '')) return '';
      }
      return '';
    };

    const violations: string[] = [];
    for (const f of FILES) {
      const lines = f.code.split('\n');
      lines.forEach((line, i) => {
        const m = line.match(/\b(h-\d+(?:\.\d+)?)\b/);
        if (!m || ALLOWED.has(m[1])) return;

        // ⭐ 豁免：色块 / 图像 / 开关轨道的高度不是**可点物**的高度。
        //   · 色板色条（h-6 w-4 + inline background）是颜色示意
        //   · 合集缩略图（object-cover）是图像本身
        //   · Switch 的轨道（h-5 w-9）与拇指（h-4 w-4）是内部构造，
        //     可点物是整个 h-5 w-9 的按钮容器，已有固定尺寸
        //   三者都不是控件尺寸 —— 纳入白名单会让标准失去意义
        //   （连色块高度都能改，那还要规范做什么）。
        const owner = ownerOf(lines, i);
        if (owner === 'Switch') return;
        if (/object-cover|style=\{\{ background:/.test(line)) return;

        if (!inControlScope(lines, i)) return;
        violations.push(
          `${f.path}:${i + 1}  ${m[1]} 不在白名单 [h-7=CHIP_H, h-8=CONTROL_H, h-9=CONTROL_H_LG]`,
        );
      });
    }
    expect(violations, `控件高度须走高度 token：\n${violations.join('\n')}`).toEqual([]);
  });

  /**
   * ⭐ 可交互控件的**实现入口唯一**：按钮走 Button / IconButton / Chip，
   * 业务组件不允许裸写 `<button>`。
   *
   * 背景：ElementPanel 的显隐/锁定两个按钮曾手写 `<button>`，
   * 于是高度、hover 色、圆角、pressed 态全靠自己抄一遍——
   * 抄的那次对了、抄的那次忘了，就是「控件漂移」的全部来源。
   *
   * 例外：① primitives.tsx 本身是定义处；
   * ② 结构性卡片按钮（缩略图卡、色板行、合集缩略图）由自身语义决定
   * 形态，走各自的 aria 约定而非通用原语，白名单需显式列出。
   */
  it('业务组件不得裸写 <button>，按钮一律走原语', () => {
    const STRUCTURAL_OK = /ThumbCard|PalettePanel|CuratedSetsPanel/;
    const violations: string[] = [];
    for (const f of FILES) {
      if (f.path.endsWith('primitives.tsx')) continue; // 定义处
      const lines = f.code.split('\n');
      lines.forEach((line, i) => {
        if (!/<button[\s>]/.test(line)) return;
        //作用域回溯：结构化卡片按钮由其所属函数决定
        let structural = false;
        for (let j = i; j >= Math.max(0, i - 25); j--) {
          const head = lines[j] ?? '';
          if (/^(export\s+)?function\s+(\w+)/.test(head)) {
            structural = STRUCTURAL_OK.test(head);
            break;
          }
        }
        if (!structural) violations.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 70)}`);
      });
    }
    expect(violations, `按钮须走 Button/IconButton/Chip 原语：\n${violations.join('\n')}`).toEqual([]);
  });

  /**
   * 输入框视觉语言必须单一来源。
   *
   * ⭐ 背景：Kumo 的输入框是「白底 + 浅描边 + 聚焦内环」，
   * 而本项目此前散落着「灰底 + 深描边」（bg-surface-2 + ring-line-input），
   * 一屏里同时出现两种控件语言。收敛到 `inputClass()` 后必须禁止回潮。
   */
  it('输入控件统一走 inputClass，不得自行堆 ring-line-input', () => {
    const violations: string[] = [];
    for (const f of FILES) {
      f.code.split('\n').forEach((line, i) => {
        if (!/ring-line-input/.test(line)) return;
        // 只抓「输入类控件」的写法；开关轨道 / 色板色块用 line-input 是合理的
        const isInputControl =
          /<input|<select|vw-number|type="(number|search|text)"/.test(line);
        if (isInputControl) violations.push(`${f.path}:${i + 1}  ${line.trim().slice(0, 80)}`);
      });
    }
    expect(
      violations,
      `输入控件须复用 primitives 的 inputClass：\n${violations.join('\n')}`,
    ).toEqual([]);
  });
});
