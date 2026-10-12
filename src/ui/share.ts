/**
 * URL 编解码 —— 分享链接的单一真源（PRD P0-6）。
 *
 * 设计取舍：
 *  1. **只写「与默认值不同的东西」**。完整序列化 19 个 pattern × N 个元件
 *     的全部字段会产生 1KB+ 的 URL，而绝大多数时候用户只改了三五个值。
 *     省略默认值让典型分享链接控制在 200~300 字符内。
 *  2. **颜色用 3 字节 hex，不用 `#rrggbb` 文本**。7 字符 → 4 字符（base64），
 *     19 个元件能省掉 50 字符。
 *  3. **按 element id 对齐，绝不按下标**。pattern 增删元件后，
 *     旧链接的配色不会错位（与引擎 `resolveElements` 的兼容铁律一致）。
 *  4. **解析永不抛错**。任何畸形输入静默退回默认值 —— 一个坏链接
 *     不该让用户看到白屏。
 */
import { DEFAULT_SEED, DEFAULT_SIZE, LIMITS, URL_PARAM } from '../shared/constants';
import { isHexColor } from '../shared/guards';
import { registry } from '../patterns';
import type { ElementConfig, PatternConfig, UIState } from '../engine/types';
import type { ParamValue, PatternDef, PaintSpec, PaintStop } from '../patterns/types';

/** 配色编码：element id → 该元件「被改过」的字段。 */
type ElementPatch = Partial<Pick<ElementConfig, 'opacity' | 'visible' | 'locked'>> & {
  /** 压缩后的 paint；缺省表示沿用 PatternDef 默认。 */
  p?: string;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** hex(6字符) → base64 的 4 字符，36 bit 正好用满。 */
function hexToB64(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const v = Number.isFinite(n) ? n : 0;
  return (
    B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + B64[(v >> 6) & 63] + B64[v & 63]
  );
}

function b64ToHex(b64: string): string {
  let v = 0;
  for (const ch of b64.slice(0, 4)) {
    const i = B64.indexOf(ch);
    if (i < 0) return '';
    v = v * 64 + i;
  }
  return '#' + v.toString(16).padStart(6, '0');
}

/** 定点小数编码：保留 3 位，够表达角度 / 圆心 / 半径。 */
function num(n: number): string {
  return String(Math.round(n * 1000));
}

function denum(s: string): number {
  const v = Number(s);
  return Number.isFinite(v) ? v / 1000 : 0;
}

/**
 * PaintSpec → 紧凑字符串。
 *
 * 格式（分隔符 `~` 分段，`,` 分隔同类值）：
 *   solid          `sRRGGBB`（4 字符 base64）
 *   linear         `l角度:c1@o1,c2@o2…`
 *   radial         `r圆心x,圆心y,半径:c1@o1,…`
 *   none           `n`
 *
 * stop 的 alpha 一并编码：`c1@o1,a1`，alpha 省略即 1。
 */
function encodePaint(paint: PaintSpec): string {
  switch (paint.type) {
    case 'none':
      return 'n';
    case 'solid':
      return 's' + (isHexColor(paint.color) ? hexToB64(paint.color) : hexToB64('#000000'));
    case 'linear': {
      const stops = paint.stops.map(encodeStop).join(',');
      return `l${num(paint.angle)}:${stops}`;
    }
    case 'radial': {
      const stops = paint.stops.map(encodeStop).join(',');
      return `r${num(paint.cx)},${num(paint.cy)},${num(paint.r)}:${stops}`;
    }
  }
}

/**
 * 单个色标的编码：`base64色@offset[;alpha]`
 *
 * ⚠️ alpha 用 **`;`** 而不是 `,` 分隔 —— 色标之间已经用 `,` 分隔了，
 * 若 alpha 也用 `,`，`c1@0,0.5,c2@1` 会被解析成三个色标而不是两个。
 * 这类分隔符歧义在写编码格式时必须一开始就定死，否则改回来要动全部历史链接。
 */
function encodeStop(s: PaintStop): string {
  const base = (isHexColor(s.color) ? hexToB64(s.color) : hexToB64('#000000')) + '@' + num(s.offset);
  return s.opacity !== undefined && s.opacity < 1 ? `${base};${num(s.opacity)}` : base;
}

function decodeStops(raw: string): PaintStop[] {
  if (raw === '') return [];
  return raw
    .split(',')
    .map((chunk) => {
      // 分号之后是可选的 stop-alpha（与 encodeStop 的 `;` 对称）
      const [main, alpha] = chunk.split(';');
      const parts = (main ?? '').split('@');
      const color = b64ToHex(parts[0] ?? '');
      if (!isHexColor(color)) return null;
      const out: PaintStop = { offset: denum(parts[1] ?? '0'), color };
      if (alpha !== undefined) out.opacity = denum(alpha);
      return out;
    })
    .filter((s): s is PaintStop => s !== null);
}

function decodePaint(raw: string): PaintSpec | null {
  if (!raw) return null;
  const kind = raw[0];
  const body = raw.slice(1);
  if (kind === 'n') return { type: 'none' };
  if (kind === 's') {
    const color = b64ToHex(body);
    return isHexColor(color) ? { type: 'solid', color } : null;
  }
  if (kind === 'l' || kind === 'r') {
    const sep = body.indexOf(':');
    if (sep < 0) return null;
    const head = body.slice(0, sep).split(',');
    const stops = decodeStops(body.slice(sep + 1));
    if (stops.length === 0) return null;
    if (kind === 'l') {
      return { type: 'linear', angle: denum(head[0] ?? '90'), stops };
    }
    return {
      type: 'radial',
      cx: denum(head[0] ?? '0.5'),
      cy: denum(head[1] ?? '0.5'),
      r: denum(head[2] ?? '0.5'),
      stops,
    };
  }
  return null;
}

/**
 * 序列化元件：只在与默认值不同时才写入。
 *
 * ⚠️ 默认值取自 `PatternDef.elements`（ElementSpec），
 * 而待序列化的是 `ElementConfig` —— 两者形状相近但不完全相同
 * （`locked` 在 spec 上是可选的）。因此这里显式列出需要的字段，
 * 不把 ElementSpec 直接当 ElementConfig 用。
 */
function encodeElement(
  cfg: ElementConfig,
  def: { paint: PaintSpec; opacity: number; visible: boolean; locked?: boolean } | undefined,
): ElementPatch | null {
  const patch: ElementPatch = {};

  const defPaint = encodePaint(def?.paint ?? { type: 'none' });
  const myPaint = encodePaint(cfg.paint);
  if (myPaint !== defPaint) patch.p = myPaint;

  // opacity 容差 0.005 —— 浮点运算的尾数噪声不该产生差异
  if (Math.abs(cfg.opacity - (def?.opacity ?? 1)) > 0.005) patch.opacity = round2(cfg.opacity);
  if (cfg.visible !== (def?.visible ?? true)) patch.visible = cfg.visible;
  if (cfg.locked !== (def?.locked ?? false)) patch.locked = cfg.locked;

  return Object.keys(patch).length > 0 ? patch : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** PatternConfig → query string（不含前导 `?`）。 */
export function encodeConfig(cfg: PatternConfig, ui?: Partial<UIState>): string {
  const def = registry.get(cfg.patternId);
  const params = new URLSearchParams();
  params.set(URL_PARAM.pattern, cfg.patternId);

  if (cfg.width !== DEFAULT_SIZE.w || cfg.height !== DEFAULT_SIZE.h) {
    params.set(URL_PARAM.width, String(cfg.width));
    params.set(URL_PARAM.height, String(cfg.height));
  }
  // seed 省略的判据是 `DEFAULT_SEED`（与 store 首屏一致），
  // 而不是 0 —— 否则首屏那个非零默认种子会被写进每一条分享链接。
  if (cfg.seed !== DEFAULT_SEED) params.set(URL_PARAM.seed, String(cfg.seed));

  // 配色：按 id 对齐，未改动的元件整体省略
  const cols: string[] = [];
  for (const e of cfg.elements) {
    const patch = encodeElement(e, def?.elements.find((d) => d.id === e.id));
    if (patch) cols.push(`${e.id}=${encodePatch(patch)}`);
  }
  if (cols.length > 0) params.set(URL_PARAM.colors, cols.join(ELEM_SEP));

  // 参数：只写偏离默认值的
  const pparts: string[] = [];
  for (const [k, v] of Object.entries(cfg.params)) {
    const c = def?.controls.find((d) => d.key === k);
    if (!c) continue;
    if (v !== c.default) pparts.push(`${k}=${String(v)}`);
  }
  if (pparts.length > 0) params.set(URL_PARAM.params, pparts.join(ELEM_SEP));

  if (ui) {
    const bits: string[] = [];
    if (ui.theme && ui.theme !== 'system') bits.push(`theme:${ui.theme}`);
    if (ui.panel && ui.panel !== 'right') bits.push(`panel:${ui.panel}`);
    if (ui.grid) bits.push('grid:1');
    if (bits.length > 0) params.set(URL_PARAM.ui, bits.join('!'));
  }

  return params.toString();
}

/**
 * 字段分隔符 —— 用 `~` 而不是 `,`。
 *
 * ⚠️ 这是被测试抓出来的一个真实 bug：`PaintSpec` 的编码内部**本身就用逗号**
 * 分隔多个渐变色标（`c1@0,c2@500`），若元件补丁也用 `,` 分隔字段，
 * 一个三色标渐变会在第一个逗号处被截断，解码回来只剩一个色标 ——
 * 而且这个 bug **静默**：链接照常打开，只是颜色悄悄变了。
 *
 * `~` 在整个编码体系（`!` `,` `:` `@` `;`）里未被占用，因此无歧义。
 */
const FIELD_SEP = '~';
/** 元件之间的分隔符。 */
const ELEM_SEP = '!';

function encodePatch(patch: ElementPatch): string {
  const bits: string[] = [];
  if (patch.p !== undefined) bits.push('p' + patch.p);
  if (patch.opacity !== undefined) bits.push('o' + num(patch.opacity));
  if (patch.visible !== undefined) bits.push('v' + (patch.visible ? '1' : '0'));
  if (patch.locked !== undefined) bits.push('l' + (patch.locked ? '1' : '0'));
  return bits.join(FIELD_SEP);
}

/** query string → 配置补丁。未知 pattern / 非法数值一律退回默认。 */
export interface DecodedState {
  cfg: PatternConfig | null;
  ui: Partial<UIState>;
}

export function decodeConfig(search: string): DecodedState {
  const params = new URLSearchParams(search);
  const out: DecodedState = { cfg: null, ui: {} };

  const id = params.get(URL_PARAM.pattern);
  const def = id ? registry.get(id) : undefined;
  if (!def) return out;

  const cfg: PatternConfig = {
    patternId: def.id,
    width: clampDim(params.get(URL_PARAM.width), DEFAULT_SIZE.w),
    height: clampDim(params.get(URL_PARAM.height), DEFAULT_SIZE.h),
    seed: clampInt(params.get(URL_PARAM.seed), 0, 999_999, DEFAULT_SEED),
    elements: def.elements.map((e) => ({
      id: e.id,
      paint: e.paint,
      opacity: e.opacity,
      visible: e.visible,
      locked: e.locked ?? false,
    })),
    params: Object.fromEntries(def.controls.map((c) => [c.key, c.default as ParamValue])),
  };

  // 配色补丁
  const cols = params.get(URL_PARAM.colors);
  if (cols) {
    for (const chunk of cols.split(ELEM_SEP)) {
      const eq = chunk.indexOf('=');
      if (eq <= 0) continue;
      const eid = chunk.slice(0, eq);
      const target = cfg.elements.find((e) => e.id === eid);
      if (!target) continue; // 元件已不存在 → 静默忽略（向后兼容）
      // ⭐ 按 FIELD_SEP('~') 切字段，不能用 ',' —— paint 编码内部含逗号
      for (const bit of chunk.slice(eq + 1).split(FIELD_SEP)) {
        const tag = bit[0];
        const val = bit.slice(1);
        if (tag === 'p') {
          const paint = decodePaint(val);
          if (paint) target.paint = paint;
        } else if (tag === 'o') {
          const v = denum(val);
          if (v >= 0 && v <= 1) target.opacity = v;
        } else if (tag === 'v') {
          target.visible = val === '1';
        } else if (tag === 'l') {
          target.locked = val === '1';
        }
      }
    }
  }

  // 参数补丁
  const ps = params.get(URL_PARAM.params);
  if (ps) {
    for (const chunk of ps.split(ELEM_SEP)) {
      const eq = chunk.indexOf('=');
      if (eq <= 0) continue;
      const key = chunk.slice(0, eq);
      const c = def.controls.find((d) => d.key === key);
      if (!c) continue;
      const raw = chunk.slice(eq + 1);
      if (c.type === 'toggle') cfg.params[key] = raw === 'true';
      else if (c.type === 'select') {
        if (c.options.some((o) => o.value === raw)) cfg.params[key] = raw;
      } else {
        const v = Number(raw);
        if (Number.isFinite(v)) cfg.params[key] = v;
      }
    }
  }

  const ui = params.get(URL_PARAM.ui);
  if (ui) {
    for (const bit of ui.split(ELEM_SEP)) {
      const [k, v] = bit.split(':');
      if (k === 'theme' && (v === 'light' || v === 'dark')) out.ui.theme = v;
      else if (k === 'panel' && (v === 'left' || v === 'right')) out.ui.panel = v;
      else if (k === 'grid') out.ui.grid = v === '1';
    }
  }

  out.cfg = cfg;
  return out;
}

function clampDim(raw: string | null, fallback: number): number {
  if (raw === null) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(LIMITS.MAX_DIMENSION, Math.max(LIMITS.MIN_DIMENSION, Math.round(v)));
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw === null) return fallback;
  const v = Number(raw);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, Math.round(v)));
}

/** 构造可分享的完整 URL。 */
export function shareUrl(cfg: PatternConfig, ui?: Partial<UIState>): string {
  if (typeof window === 'undefined') return '';
  const qs = encodeConfig(cfg, ui);
  const url = new URL(window.location.href);
  url.search = qs;
  url.hash = '';
  return url.toString();
}

/** 当前地址栏的状态（首屏水合用）。 */
export function readCurrentUrl(): DecodedState {
  if (typeof window === 'undefined') return { cfg: null, ui: {} };
  return decodeConfig(window.location.search);
}

export type { PatternDef };
