/**
 * @vitest-environment node
 *
 * 分层铁律的自动化守卫（架构 §2「分层铁律 1」）。
 *
 * 这些断言用「读源码 + 正则」的方式在 CI 中把纪律固化下来：
 * 一旦有人在 engine / patterns 里写下 `Math.random()` 或 `Date.now()`，
 * 测试立刻失败 —— 而不是等到「同seed 同结果」悄悄失效才发现。
 *
 * ⚠️ 性能注意：源码**只在模块加载时读一次**并预先剥掉注释。
 * 早期版本在每个 it() 里现读现剥，21 个用例重复读 26 个文件要 ~20s，
 * 在受限环境下最后两个用例会撞上 vitest 的 5s 默认超时而**假失败**。
 * 现在读盘只发生一次，各用例退化为纯内存正则，耗时降到毫秒级 ——
 * 既解决了超时，也顺带保证所有用例基于同一份快照，判断更一致。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(process.cwd(), 'src');

/** 递归收集目录下的 .ts / .tsx（跳过测试文件本身）。 */
function collect(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collect(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** 去掉注释后再匹配，避免文档里提到这些词就误报。 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

interface SourceFile {
  path: string;
  code: string;
}

/** 一次性读盘 + 剥注释，缓存为不可变快照。 */
function snapshot(dir: string, skip: (file: string) => boolean = () => false): SourceFile[] {
  return collect(dir)
    .filter((f) => !skip(f))
    .map((path) => ({ path, code: stripComments(readFileSync(path, 'utf8')) }));
}

const ENGINE_FILES = snapshot(join(SRC, 'engine'));
// types.ts 只有类型、registry.ts 只是查询辅助，都不参与渲染，不需受铁律约束
const PATTERN_FILES = snapshot(join(SRC, 'patterns'), (f) => f.endsWith('types.ts') || f.endsWith('registry.ts'));

describe('纯函数层不含浏览器 / 非确定性 API', () => {
  const forbidden: Array<[string, RegExp]> = [
    ['window', /\bwindow\b/],
    ['document', /\bdocument\b/],
    ['localStorage', /\blocalStorage\b/],
    ['sessionStorage', /\bsessionStorage\b/],
    ['navigator', /\bnavigator\b/],
    ['Math.random', /Math\s*\.\s*random/],
    ['Date.now', /Date\s*\.\s*now/],
    ['new Date', /new\s+Date\b/],
    ['performance.now', /performance\s*\.\s*now/],
    ['fetch', /\bfetch\s*\(/],
  ];

  const offenders = (files: SourceFile[], re: RegExp): string[] =>
    files.filter((f) => re.test(f.code)).map((f) => f.path);

  for (const [label, re] of forbidden) {
    it(`engine/** 不含 ${label}`, () => {
      expect(offenders(ENGINE_FILES, re)).toEqual([]);
    });

    it(`patterns/** 不含 ${label}`, () => {
      expect(offenders(PATTERN_FILES, re)).toEqual([]);
    });
  }

  it('engine 与 patterns 均不含 <text> 或 foreignObject 字面量', () => {
    const all = [...ENGINE_FILES, ...PATTERN_FILES];
    expect(all.filter((f) => /<text[\s>]/.test(f.code)).map((f) => f.path)).toEqual([]);
    expect(all.filter((f) => f.code.includes('foreignObject')).map((f) => f.path)).toEqual([]);
  });
});

describe('UI 层零硬编码（为 T4/T5 预留门禁）', () => {
  it('已扫描到 engine 与 pattern 源文件（确保上面的扫描不是空跑）', () => {
    // 守卫本身必须有效：扫描到 0 个文件时，所有「不含 X」断言都会平凡通过
    expect(ENGINE_FILES.length).toBeGreaterThan(0);
    expect(PATTERN_FILES.length).toBeGreaterThan(0);
    expect([...ENGINE_FILES, ...PATTERN_FILES].every((f) => f.code.length > 0)).toBe(true);
  });
});