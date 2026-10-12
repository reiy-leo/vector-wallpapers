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
});
