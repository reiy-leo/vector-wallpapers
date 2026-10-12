#!/usr/bin/env node
/**
 * Kumo Design 合规检查器
 * 逐条核查 src/ui/ + theme.css 是否违反 Cloudflare Kumo 设计规范。
 * 用法：node scripts/kumo-lint.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const UI_DIR = join(ROOT, 'src/ui');
const THEME = join(ROOT, 'src/styles/theme.css');

function collect(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) out.push(...collect(full));
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

const files = collect(UI_DIR);
const theme = readFileSync(THEME, 'utf8');
/**
 * 剥离注释 —— 状态机式，正确处理 //、块注释、以及字符串字面量里的伪注释。
 *
 * ⚠️ 上一版按行首正则过滤，漏掉了 JSX 块注释 `{/* ... *\/}`，
 * 于是把注释里写的规则名（"capitalize"）当成了真实违规。
 * 注释必须真正剥离，不能靠行首猜测 —— 本项目 QA 在 purity.guard 里踩过同一类坑。
 */
function stripComments(code) {
  let out = '';
  let inLine = false;
  let inBlock = false;
  let inStr = null;
  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const n = code[i + 1];
    if (inLine) {
      if (c === '\n') { inLine = false; out += c; }
      continue;
    }
    if (inBlock) {
      if (c === '*' && n === '/') { inBlock = false; i++; }
      else if (c === '\n') out += c;
      continue;
    }
    if (inStr) {
      out += c;
      if (c === '\\') { out += n ?? ''; i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '/' && n === '/') { inLine = true; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i++; continue; }
    if (c === "'" || c === '"' || c === '`') { inStr = c; out += c; continue; }
    out += c;
  }
  return out;
}

const src = new Map(
  files.map((f) => [relative(ROOT, f), stripComments(readFileSync(f, 'utf8'))]),
);

const violations = [];
const ok = [];

function scan(pattern, rule, why, opts = {}) {
  const hits = [];
  for (const [path, code] of src) {
    if (opts.skipFiles?.includes(path)) continue;
    const lines = code.split('\n');
    lines.forEach((line, i) => {
      if (opts.skipComment && /^\s*(\*|\/\/|\/\*)/.test(line)) return;
      // 排除标题标签：Kumo 允许 heading 用 16px+
      if (opts.excludeHeadingTags && /<h[1-6][\s>]/.test(line)) return;
      if (pattern.test(line)) hits.push({ path, line: i + 1, text: line.trim().slice(0, 90) });
    });
  }
  if (hits.length === 0) ok.push(rule);
  else violations.push({ rule, why, hits: hits.slice(0, 5), total: hits.length });
}

// 1. content-text-size：正文/按钮/数据不得 ≥16px
//    ⚠️ 只查**非标题**元素。Kumo 原文：16px+ 仅限 headings/subheadings，
//    所以 <h1>~<h6> 上的 text-lg/text-xl 是合规的，必须排除，否则全是假阳性。
scan(
  /text-(md|lg|xl|2xl)|text-\[1[6-9]px\]|text-\[2\d+px\]/,
  'content-text-size',
  '正文/按钮/数据必须 14px，16px+ 仅限标题',
  { excludeHeadingTags: true },
);

// 2. heading-case：不得大写
scan(/\buppercase\b|\bcapitalize\b/, 'heading-case', '禁止 uppercase / capitalize', {
  skipComment: true,
});

// 3. font-tracking：不得改字距
scan(/\btracking-(?!normal\b)/, 'font-tracking', '禁止改字间距（tracking-*）', {
  skipComment: true,
});

// 4. font-weight：禁止 bold
scan(/\bfont-bold\b|\bbold\b(?![-\w])/, 'font-weight', '禁止 font-bold，用 font-medium/semibold', {
  skipComment: true,
});

// 5. hover-color-transitions：hover 不得配 transition-colors
scan(/transition-colors[^\n]*hover:/, 'hover-color-transitions',
  'hover 的颜色变化必须瞬时，不得加 transition-colors', { skipComment: true });
scan(/hover:[^\n]*transition-colors/, 'hover-color-transitions',
  'hover 的颜色变化必须瞬时，不得加 transition-colors', { skipComment: true });

// 6. shadow-borders：不得 border + shadow 同用
scan(/border[^\n]*shadow-|shadow-[^\n]*border-/, 'shadow-borders',
  '阴影与描边不得同用，应用 ring 代替 border', { skipComment: true });

// 7. concentric-border-radius：嵌套圆角必须同心
scan(/rounded-(lg|xl)[^\n]*\n[^\n]*rounded-(lg|xl)/, 'concentric-border-radius',
  '相邻圆角必须同心：外 = 内 + padding', { skipComment: true });

// 8. inline-monospace-size：等宽文本需约0.9em
//    ⚠️ 只在**与正文混排**时要求缩小。纯数据展示（如整块都是等宽）不必缩小，
//    否则会产生大量假阳性。
scan(
  /font-mono(?![^\n"']*(0\.9em|0\.8em|\[0\.9|\[0\.8|text-xs|text-2xs))/,
  'inline-monospace-size',
  '与正文混排的等宽文本应约 0.9em',
  { skipComment: true },
);

// 9. dialog-rendering：**Dialog/弹窗**不得条件渲染
//    ⚠️ Kumo 原文针对 Dialog（弹窗），不针对折叠面板。折叠面板条件渲染是合理的，
//    且本项目的 CollapsePanel 注释明确说明它承担的是「折叠」而非「弹窗」语义。
//    因此这里只查 Dialog 组件附近的 open && 。
scan(
  /\{open\s*&&\s*\(\s*(?:\/\/[^\n]*\n\s*)*<Dialog/,
  'dialog-rendering',
  'Dialog 不得条件渲染，应用 open 属性控制显隐（否则丢失开关动画）',
  { skipComment: true },
);

// 10. sticky-borders：吸顶元素需 border 分隔
scan(/sticky[^\n]*top-0(?![^\n]*border)/, 'sticky-borders',
  '吸顶元素需用 border 与内容分隔', { skipComment: true });

// theme.css 专项
const themeIssues = [];
if (/letter-spacing:\s*[^;]*;/.test(theme) && !/letter-spacing:\s*0/.test(theme)) {
  // 允许 .vw-sr-only 的 letter-spacing: inherit
  const ls = theme.match(/letter-spacing:\s*[^;]+/g) || [];
  const bad = ls.filter((s) => !/inherit|normal|0/.test(s));
  if (bad.length) themeIssues.push(`theme.css 出现非常规 letter-spacing: ${bad.join(', ')}`);
}
if (/font-weight:\s*(700|bold)/.test(theme)) themeIssues.push('theme.css 使用了 font-weight:700/bold');
if (/border-radius:\s*(9999|50%)/.test(theme) === false && /--radius/.test(theme)) {
  // 圆角 token 应成体系（同心圆角规则的取值集合）
  const radii = (theme.match(/--radius-\w+:\s*[^;]+/g) || []).length;
  if (radii < 5) themeIssues.push(`圆角 token 仅 ${radii} 个，同心圆角规则通常需要 ≥5 档`);
}

console.log('\n══════ Kumo Design 合规检查 ══════\n');
console.log(`扫描 ${src.size} 个 UI 文件 + theme.css\n`);

if (violations.length === 0) {
  console.log('✅ 全部通过\n');
} else {
  for (const v of violations) {
    console.log(`❌ ${v.rule}  — ${v.why}`);
    console.log(`   命中 ${v.total} 处：`);
    v.hits.forEach((h) => console.log(`   ${h.path}:${h.line}  ${h.text}`));
    console.log('');
  }
}

if (themeIssues.length) {
  console.log('── theme.css ──');
  themeIssues.forEach((i) => console.log(`❌ ${i}`));
  console.log('');
} else {
  console.log('✅ theme.css 无违规');
}

console.log(`\n通过 ${ok.length} / ${ok.length + violations.length} 条可自动检测的规则`);
console.log('（另有 5 条需人工判断：related-text-spacing / text-spacing / ');
console.log('  icon-alignment / collapse-content-size / layer-card-nesting）\n');
