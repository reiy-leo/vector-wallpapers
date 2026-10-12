/**
 * SVG Builder 原语。
 *
 * 体积优化内置于 builder 而非 pattern 里手写字符串：
 *  - `n()` 两位小数去尾零 → 几何图形省 30~40% 字节
 *  - 属性按 key 排序 → 输出稳定、可 diff
 *  - 省略与 SVG 规范默认值相同的属性
 *
 * ⚠️ 刻意不提供 `<text>` 的构造入口：字体依赖会破坏导出纯净度
 * （架构 §9.3 坑 6）。像素风一律用 `<rect>` / `<path>` 拼。
 */

export type AttrValue = string | number;

export type Attrs = Readonly<Record<string, AttrValue | undefined | null>>;

/**
 * 与 SVG 规范默认值相同的属性值 —— 序列化时省略。
 *
 * ⚠️ 注意 `fill` **不在此列**：SVG 的 fill 默认值是黑色而非 none，
 * 省略 `fill="none"` 会让图形变成实心黑块 —— 这是个真实踩过的坑。
 */
const SVG_DEFAULTS: Readonly<Record<string, string>> = {
  'stroke-width': '1',
  'stroke-linecap': 'butt',
  'stroke-linejoin': 'miter',
  'stroke-miterlimit': '4',
  'fill-opacity': '1',
  'stroke-opacity': '1',
  opacity: '1',
  x: '0',
  y: '0',
  display: 'inline',
  visibility: 'visible',
  'clip-rule': 'nonzero',
  version: '1.1',
};

/** 文本节点转义 —— 属性值与文本内容共用，杜绝属性注入。 */
export function esc(value: string): string {
  let out = '';
  for (const ch of value) {
    switch (ch) {
      case '&':
        out += '&amp;';
        break;
      case '<':
        out += '&lt;';
        break;
      case '>':
        out += '&gt;';
        break;
      case '"':
        out += '&quot;';
        break;
      case "'":
        out += '&apos;';
        break;
      default:
        out += ch;
    }
  }
  return out;
}

/** 数值格式化：保留 2 位小数并去尾零（1.005 → "1"，1.567 → "1.57"）。 */
export function n(v: number): string {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 100) / 100;
  if (Object.is(r, -0)) return '0';
  return String(r);
}

/** 序列化属性表：过滤空值 → 与默认值相同则省略 → key 排序 → 转义。 */
export function attrString(attrs: Attrs): string {
  const keys = Object.keys(attrs).sort();
  let out = '';
  for (const key of keys) {
    const raw = attrs[key];
    if (raw === undefined || raw === null) continue;
    const value = typeof raw === 'number' ? n(raw) : raw;
    if (value === '') continue;
    if (SVG_DEFAULTS[key] === value) continue;
    out += ` ${key}="${esc(value)}"`;
  }
  return out;
}

/** 通用元素构造。children 为空串或 undefined 时自闭合。 */
export function el(tag: string, attrs: Attrs = {}, children?: string): string {
  const a = attrString(attrs);
  return children === undefined || children === '' ? `<${tag}${a}/>` : `<${tag}${a}>${children}</${tag}>`;
}

/** `<g>` 快捷方式。 */
export function g(attrs: Attrs, children: string): string {
  return el('g', attrs, children);
}

export function rect(x: number, y: number, w: number, h: number, attrs: Attrs = {}): string {
  return el('rect', { x, y, width: w, height: h, ...attrs });
}

export function circle(cx: number, cy: number, r: number, attrs: Attrs = {}): string {
  return el('circle', { cx, cy, r, ...attrs });
}

export function ellipse(cx: number, cy: number, rx: number, ry: number, attrs: Attrs = {}): string {
  return el('ellipse', { cx, cy, rx, ry, ...attrs });
}

export function path(d: string, attrs: Attrs = {}): string {
  return el('path', { d, ...attrs });
}

export function line(x1: number, y1: number, x2: number, y2: number, attrs: Attrs = {}): string {
  return el('line', { x1, y1, x2, y2, ...attrs });
}

function pointsAttr(points: ReadonlyArray<readonly [number, number]>): string {
  let out = '';
  for (const p of points) {
    out += `${n(p[0])},${n(p[1])} `;
  }
  return out.trim();
}

export function polygon(points: ReadonlyArray<readonly [number, number]>, attrs: Attrs = {}): string {
  return el('polygon', { points: pointsAttr(points), ...attrs });
}

export function polyline(points: ReadonlyArray<readonly [number, number]>, attrs: Attrs = {}): string {
  return el('polyline', { points: pointsAttr(points), ...attrs });
}

export function use(href: string, attrs: Attrs = {}): string {
  return el('use', { href, ...attrs });
}

/**
 * 统计顶层元素数量 —— `<g>` 内的子孙不计入。
 * 用于体积守卫的「body 直接子节点 ≤ 60」断言。
 * 依赖本模块产出的属性值已转义（`>` 不会裸奔），因此朴素的标签扫描是安全的。
 */
export function countTopLevelNodes(markup: string): number {
  const tagRe = /<(\/?)([A-Za-z][\w:-]*)([^>]*?)(\/?)>/g;
  let depth = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(markup)) !== null) {
    const isClose = m[1] === '/';
    const isSelfClose = m[4] === '/';
    if (isClose) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) count++;
    if (!isSelfClose) depth++;
  }
  return count;
}