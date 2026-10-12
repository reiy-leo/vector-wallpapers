/**
 * @vitest-environment node
 *
 * 设计 token 的 WCAG 对比度守卫。
 *
 * ⭐ 为什么要把这件事固化成测试：颜色是「看起来还行」的参数 ——
 * 没有任何肉眼可靠的直觉能保证 `oklch(0.64)` 压在 `oklch(0.268)` 上还够 4.5:1。
 * 实测发现 7 处不合格（见 git 记录），全部是**肉眼无法察觉**的量级差。
 * 一旦没有这个守卫，下次调主题色就会静默回归。
 *
 * 实现上刻意**从 theme.css 真实解析**而不是复制一份数值到测试里：
 * 复制的那份会与实际样式漂移，改了主题却测的是旧值 —— 这正是本项目
 * 记忆里「假绿测试」的三种形态之一。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CSS_PATH = join(process.cwd(), 'src/styles/theme.css');

/* ── oklch → sRGB ────────────────────────────────────────────────── */

/** oklch → 线性 sRGB → gamma 编码 → hex。 */
function oklchToHex(L: number, C: number, Hdeg: number): string {
  const h = (Hdeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  const encode = (x: number): number => {
    const v = x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  };
  const hex = (v: number): string => v.toString(16).padStart(2, '0');
  return `#${hex(encode(r))}${hex(encode(g))}${hex(encode(bl))}`;
}

function relativeLuminance(hex: string): number {
  const lin = (v: number): number => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrast(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* ── 从 theme.css 解析真实取值 ───────────────────────────────────── */

type Tokens = Record<string, string>;

function parseBlock(css: string, selector: string): Tokens {
  // 找到选择器对应的 `{ … }` 块（CSS 里的 token 块不含嵌套花括号）
  const idx = css.indexOf(selector);
  if (idx < 0) throw new Error(`theme.css 中找不到选择器：${selector}`);
  const open = css.indexOf('{', idx);
  const close = css.indexOf('\n}', open);
  if (open < 0 || close < 0) throw new Error(`选择器 ${selector} 的块未闭合`);
  const body = css.slice(open, close);

  const out: Tokens = {};
  for (const m of body.matchAll(/--([\w-]+):\s*oklch\(([^)]+)\)/g)) {
    const name = m[1].replace(/^vw-/, '');
    // 去掉可能的 `/ alpha` 部分 —— 对比度只需不透明色的 RGB
    out[name] = m[2].split('/')[0].trim();
  }
  return out;
}

function hexOf(tokens: Tokens, name: string): string {
  const raw = tokens[name];
  if (!raw) throw new Error(`theme.css 缺少 token：--vw-${name}`);
  const parts = raw.split(/\s+/).map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error(`token --vw-${name} 不是合法 oklch：${raw}`);
  }
  return oklchToHex(parts[0], parts[1], parts[2]);
}

const CSS = readFileSync(CSS_PATH, 'utf8');
const LIGHT = parseBlock(CSS, ':root {');
const DARK = parseBlock(CSS, ':root[data-theme=\'dark\'] {');
// 「跟随系统」的深色副本也必须达标 —— 它不是 :root 块，需要单独取
const DARK_MEDIA = parseBlock(CSS, ":root:not([data-theme='light']) {");

/* ── 用例 ───────────────────────────────────────────────────────── */

type Pair = [label: string, fg: string, bg: string, min: number];

/** 正文 4.5:1（WCAG AA）；非文本 UI 边界 3:1（WCAG 1.4.11）。 */
const TEXT_PAIRS: Pair[] = [
  ['正文/画布底', 'text', 'canvas', 4.5],
  ['正文/面板', 'text', 'surface', 4.5],
  ['正文/次级面', 'text', 'surface-2', 4.5],
  ['正文/输入底', 'text', 'surface-3', 4.5],
  ['次要文字/面板', 'text-soft', 'surface', 4.5],
  ['次要文字/次级面', 'text-soft', 'surface-2', 4.5],
  ['次要文字/输入底', 'text-soft', 'surface-3', 4.5],
  ['弱化文字/面板', 'text-mute', 'surface', 4.5],
  ['弱化文字/次级面', 'text-mute', 'surface-2', 4.5],
  ['弱化文字/输入底', 'text-mute', 'surface-3', 4.5],
  ['品牌色文字/面板', 'brand', 'surface', 4.5],
  ['品牌色文字/画布底', 'brand', 'canvas', 4.5],
  ['品牌色文字/次级面', 'brand', 'surface-2', 4.5],
  ['按钮文字/按钮底', 'on-brand', 'brand', 4.5],
  ['危险色/面板', 'danger', 'surface', 4.5],
  ['危险色/次级面', 'danger', 'surface-2', 4.5],
  ['警告色/面板', 'warning', 'surface', 4.5],
  ['成功色/面板', 'success', 'surface', 4.5],
];

/**
 * 表单控件描边必须 ≥3:1。
 *
 * ⚠️ 注意这里刻意**不**检查 `--vw-line`：它只用于装饰性分隔
 * （分组线、面板边界），WCAG 1.4.11 只要求「识别控件所必需」的边界达标。
 * 若把装饰线也拉到 3:1，深色主题的分隔线会明显到喧宾夺主 ——
 * 之前实测 `line/surface` 只有 1.36:1，但它不承担识别功能，因此豁免。
 */
const UI_PAIRS: Pair[] = [
  ['输入框描边/面板', 'line-input', 'surface', 3],
  ['输入框描边/画布底', 'line-input', 'canvas', 3],
  ['输入框描边/次级面', 'line-input', 'surface-2', 3],
];

const THEMES: Array<[name: string, tokens: Tokens]> = [
  ['浅色', LIGHT],
  ['深色（显式选择）', DARK],
  ['深色（跟随系统）', DARK_MEDIA],
];

describe('设计 token · WCAG AA 对比度（实测值，非目测）', () => {
  for (const [themeName, tokens] of THEMES) {
    describe(themeName, () => {
      for (const [label, fg, bg, min] of TEXT_PAIRS) {
        it(`${label} ≥ ${min}:1`, () => {
          const r = contrast(hexOf(tokens, fg), hexOf(tokens, bg));
          expect(
            r,
            `${themeName} ${label}：${hexOf(tokens, fg)} on ${hexOf(tokens, bg)} = ${r.toFixed(2)}:1，需 ≥ ${min}:1`,
          ).toBeGreaterThanOrEqual(min);
        });
      }

      for (const [label, fg, bg, min] of UI_PAIRS) {
        it(`${label} ≥ ${min}:1`, () => {
          const r = contrast(hexOf(tokens, fg), hexOf(tokens, bg));
          expect(
            r,
            `${themeName} ${label}：${hexOf(tokens, fg)} on ${hexOf(tokens, bg)} = ${r.toFixed(2)}:1，需 ≥ ${min}:1`,
          ).toBeGreaterThanOrEqual(min);
        });
      }
    });
  }

  it('深色与浅色两组取值不同（防止复制粘贴后忘了改）', () => {
    expect(LIGHT['canvas']).not.toBe(DARK['canvas']);
    expect(LIGHT['text']).not.toBe(DARK['text']);
  });

  it('「显式深色」与「跟随系统深色」完全一致（否则两处会漂移）', () => {
    // 这两块是手写重复的，必须逐 token 相等；不等即说明有人只改了一处
    const drift = Object.keys(DARK).filter((k) => DARK_MEDIA[k] !== DARK[k]);
    expect(drift, `以下 token 在两处深色定义中不一致：${drift.join(', ')}`).toEqual([]);
  });

  it('极性正确：浅色主题文字比背景深，深色主题反之', () => {
    const lText = relativeLuminance(hexOf(LIGHT, 'text'));
    const lBg = relativeLuminance(hexOf(LIGHT, 'canvas'));
    expect(lText).toBeLessThan(lBg);

    const dText = relativeLuminance(hexOf(DARK, 'text'));
    const dBg = relativeLuminance(hexOf(DARK, 'canvas'));
    expect(dText).toBeGreaterThan(dBg);
  });
});
