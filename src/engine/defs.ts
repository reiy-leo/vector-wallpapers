/**
 * DefsRegistry —— 渐变 / 平铺 / 裁剪的注册中心。
 *
 * 两个职责：
 *  1. 把 PaintSpec 编译成 `<defs>` 里的资源，并返回可直接赋给 `fill` 的 `url(#id)`
 *  2. 对内容求 hash 去重 —— 相同渐变只生成一份，是 20KB 红线的关键之一
 *
 * 纯函数层：不触碰任何浏览器 API，hash 用自实现的 FNV-1a（不用 `crypto`，避免 Node/浏览器差异）。
 */
import { normalizeHex, normalizeStops } from './colors';
import { el, n } from './svg';
import type { PaintStop } from '../patterns/types';

export interface DefsRegistry {
  /** 注册线性渐变，返回 `url(#g-xxxx)`。同内容重复注册返回同一 id。 */
  linear(p: { angle: number; stops: PaintStop[]; key: string }): string;
  /** 注册径向渐变（cx/cy/r 为 0~1 归一化坐标），返回 `url(#g-xxxx)`。 */
  radial(p: { cx: number; cy: number; r: number; stops: PaintStop[]; key: string }): string;
  /** 注册可平铺图案，返回 `url(#t-xxxx)`。 */
  tile(t: { w: number; h: number; content: string; key: string; transform?: string }): string;
  /** 注册裁剪路径，返回 `url(#c-xxxx)`。 */
  clip(id: string, shape: string): string;
  /**
   * 注册高斯模糊滤镜，返回 `url(#b-xxxx)`（可直接赋给 `filter`）。
   *
   * 区域必须显式放大：SVG 默认滤镜区域是包围盒的 -10%~120%，
   * 而辉光恰好溢出在包围盒之外，用默认值会把光晕**切掉**，
   * 表现为「边缘一圈硬边」—— 看起来反而更糟。
   */
  blur(stdDeviation: number): string;
  /** 注册 CSS `@keyframes`，返回动画名（供 `class` 引用）。 */
  keyframes(name: string, css: string): string;
  /** 序列化为 `<defs>…</defs>`；未注册任何内容时返回空串。 */
  serialize(): string;
  /** 已注册资源数（供测试与体积报告）。 */
  readonly count: number;
}

/** FNV-1a 32 位 → base36，稳定且跨平台一致。 */
function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** 角度（度）→ objectBoundingBox 下的单位方向向量。0° = 从左到右。 */
function angleVector(angleDeg: number): { x1: number; y1: number; x2: number; y2: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface Entry {
  id: string;
  markup: string;
}

export function createDefsRegistry(): DefsRegistry {
  const entries: Entry[] = [];
  /** 内容签名 → 已分配的 id，实现去重。 */
  const bySignature = new Map<string, string>();
  const keyframes = new Map<string, string>();
  const clipIds = new Set<string>();

  /** 注册资源并返回**裸 id**（不含 `url(#…)` 包装）。 */
  function internId(signature: string, prefix: string, build: (id: string) => string): string {
    const existing = bySignature.get(signature);
    if (existing !== undefined) return existing;
    const id = `${prefix}-${hash(signature)}`;
    bySignature.set(signature, id);
    entries.push({ id, markup: build(id) });
    return id;
  }

  /** 内部统一出口：id → `url(#id)`。 */
  function ref(id: string): string {
    return `url(#${id})`;
  }

  function stopsMarkup(stops: PaintStop[]): string {
    return normalizeStops(stops)
      .map((s) =>
        el('stop', {
          offset: n(clamp01(s.offset)),
          'stop-color': normalizeHex(s.color),
          // 可选：只有显式给了 opacity 才输出，避免改变既有产物的字节
          'stop-opacity': s.opacity === undefined ? undefined : n(clamp01(s.opacity)),
        }),
      )
      .join('');
  }

  /** 渐变内容签名（含 stop-opacity，避免不同透明度共用同一个 id）。 */
  function stopsSignature(stops: PaintStop[]): string {
    return normalizeStops(stops)
      .map((s) => `${n(s.offset)}${s.color}${s.opacity === undefined ? '' : `@${n(s.opacity)}`}`)
      .join(';');
  }

  return {
    linear({ angle, stops, key }): string {
      const norm = normalizeStops(stops);
      const v = angleVector(angle);
      const signature = `lin|${key}|${n(angle)}|${stopsSignature(norm)}`;
      const id = internId(signature, 'g', (gid) =>
        el(
          'linearGradient',
          { id: gid, x1: n(v.x1), y1: n(v.y1), x2: n(v.x2), y2: n(v.y2) },
          stopsMarkup(norm),
        ),
      );
      return ref(id);
    },

    radial({ cx, cy, r, stops, key }): string {
      const norm = normalizeStops(stops);
      const signature = `rad|${key}|${n(cx)}|${n(cy)}|${n(r)}|${stopsSignature(norm)}`;
      const id = internId(signature, 'g', (gid) =>
        el(
          'radialGradient',
          // 下限取 0.01 而非 0.001：n() 只保留两位小数，0.001 会被舍入回 0，
          // 而 r="0" 的径向渐变什么都不画 —— 保护值必须落在可表示范围内。
          { id: gid, cx: n(clamp01(cx)), cy: n(clamp01(cy)), r: n(Math.max(0.01, r)) },
          stopsMarkup(norm),
        ),
      );
      return ref(id);
    },

    tile({ w, h, content, key, transform }): string {
      const signature = `tile|${key}|${n(w)}|${n(h)}|${transform ?? ''}|${content}`;
      const id = internId(signature, 't', (tid) =>
        el(
          'pattern',
          {
            id: tid,
            // 同上：下限必须能被 n() 两位小数如实表示，否则 width="0" 的
            // pattern 不会被绘制，表现为「密度调高却整块消失」。
            width: n(Math.max(0.01, w)),
            height: n(Math.max(0.01, h)),
            patternUnits: 'userSpaceOnUse',
            patternContentUnits: 'userSpaceOnUse',
            patternTransform: transform,
          },
          content,
        ),
      );
      return ref(id);
    },

    clip(id: string, shape: string): string {
      const cid = `c-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
      const signature = `clip|${cid}|${shape}`;
      if (!clipIds.has(signature)) {
        clipIds.add(signature);
        entries.push({ id: cid, markup: el('clipPath', { id: cid }, shape) });
      }
      return ref(cid);
    },

    blur(stdDeviation: number): string {
      const sd = Math.max(0, stdDeviation);
      const signature = `blur|${n(sd)}`;
      const bid = internId(signature, 'b', (fid) =>
        el(
          'filter',
      // 区域放大到 -25%~170%（3σ ≈ 52px 的高斯需要 ≥52px 裕量，此处 25% ≈ 60px 够用）。
    //
    // 为什么不干脆用默认的 -10%~120%：辉光恰好溢出包围盒，默认区域会把它**切掉**，
    // 表现为「边缘一圈硬边」，反而更糟。
          // 为什么不放大到 -50%/200%：那是包围盒面积的 9 倍，而 feGaussianBlur
          // 是逐像素运算 —— Safari 历来用 CPU 路径，iOS 上有卡顿/内存告警风险。
          // 2.25² ≈ 5 倍是观感与性能的平衡点。
    // 若真机 Safari 仍显吃力，可再收窄到 -20%/160%（辉光边缘会略被裁）。
      { id: fid, x: '-25%', y: '-25%', width: '170%', height: '170%' },
          el('feGaussianBlur', { stdDeviation: n(sd) }),
        ),
      );
 return ref(bid);
    },

    keyframes(name: string, css: string): string {
      if (!keyframes.has(name)) keyframes.set(name, css);
      return name;
    },

    serialize(): string {
      const body = entries.map((e) => e.markup).join('');
      const css = Array.from(keyframes.entries())
        .map(([name, decl]) => `@keyframes ${name}{${decl}}`)
        .join('');
      const style = css === '' ? '' : el('style', { type: 'text/css' }, css);
      const inner = body + style;
      return inner === '' ? '' : el('defs', {}, inner);
    },

    get count(): number {
      return entries.length + keyframes.size;
    },
  };
}

/**
 * 动画剥离 —— 导出必须字节级可复现（架构 §9.4）。
 * SMIL 元素与 `@keyframes` 都会被移除，与 pattern 是否配合无关，
 * 保证「同配置在任何时间导出结果一致」。
 */
export function stripAnimation(markup: string): string {
  return markup
    .replace(/<animate(?:Transform|Motion)?\b[^>]*\/>/g, '')
    .replace(/<animate(?:Transform|Motion)?\b[\s\S]*?<\/animate(?:Transform|Motion)?>/g, '')
    .replace(/<set\b[^>]*\/>/g, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/g, '');
}