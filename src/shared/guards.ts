/**
 * 通用小工具 —— 纯函数，engine 与 UI 均可依赖。
 */

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}

/** 只接受纯数字字符串（用于 URL / 数字输入框）。 */
export function isNumericString(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  return value.trim() !== '' && Number.isFinite(Number(value));
}

/** 断言并收窄类型；失败时抛错（仅用于开发期不变量）。 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`[assert] ${message}`);
}

/** 局部唯一 id —— 仅用于 UI 层的 DOM key，禁止进入渲染产物（否则破坏确定性）。 */
let domIdSeq = 0;
export function domId(prefix: string): string {
  domIdSeq += 1;
  return `${prefix}-${domIdSeq}`;
}

// ────────────────────────────────────────────────────────────────
// PNG 导出尺寸守卫（PRD Q8：最长边 7680px、@3x，本地执行）
// ────────────────────────────────────────────────────────────────

/** 允许的导出倍率档位。 */
export const EXPORT_SCALES = [1, 2, 3] as const;
export type ExportScale = (typeof EXPORT_SCALES)[number];

export interface CanvasGuardResult {
  ok: boolean;
  /** 实际可用的倍率 —— 被降级时小于请求值 */
  scale: ExportScale;
  width: number;
  height: number;
  pixels: number;
  /** 降级说明，非空即代表需要 toast 告知用户（PRD Q8：不可静默失败） */
  notice: string | null;
}

/**
 * PNG 导出尺寸守卫。
 *
 * ⚠️ 上限的由来（2026-11 修订）：原值 16M px 是按 **iOS** canvas 上限设的，
 * 但 iOS 早已不支持 PNG 导出（按钮灰掉，见 detectPlatform），
 * 于是这条守卫实际只服务桌面用户，却还在用 iOS 的标定值 ——
 * 3840×2160 @2x = 33.2M px 在桌面完全做得出来，却会被误伤降级到 @1x。
 *
 * 现取 64M px（约 8192×8192，RGBA 约 256MB）。为什么不取桌面理论上限 268M：
 * 268M × 4 字节 ≈ **1.07 GB**，把「误伤降级」换成「真实 OOM / 崩溃」更糟。
 * 单边上限 MAX_EDGE = 7680 是 Safari 的维度限制，与面积正交，保持不变。
 *
 * 用户的直觉是「我要 3 倍高清」，因此这里**自动降级**而不是直接拒绝，
 * 并返回 notice 让 UI 明确告知 —— 静默降级会被当成 bug，静默失败更糟。
 */
export function guardCanvasSize(
  width: number,
  height: number,
  requestedScale: number,
): CanvasGuardResult {
  const MAX_EDGE = 7680;
  const MAX_PIXELS = 64_000_000;
  const reasons: string[] = [];

  const w0 = Math.max(1, Math.round(width));
  const h0 = Math.max(1, Math.round(height));

  // 档位回退：从请求倍率往下逐级尝试，第一个通过的即为结果
  const candidates = EXPORT_SCALES.filter((s) => s <= Math.max(1, requestedScale)).sort((a, b) => b - a);

  let chosen: ExportScale | null = null;
  let outW = 0;
  let outH = 0;

  for (const s of candidates) {
    const w = w0 * s;
    const h = h0 * s;
    if (Math.max(w, h) <= MAX_EDGE && w * h <= MAX_PIXELS) {
      chosen = s;
      outW = w;
      outH = h;
      break;
    }
    reasons.push(`@${s}x → ${w}×${h}（${(w * h / 1_000_000).toFixed(1)}M px）超出上限`);
  }

  if (chosen === null) {
    // 连 @1x 都超：仍返回一个最小可用的 1x 结果，绝不返回 null 让调用方自行崩溃
    const shrink = Math.min(1, Math.sqrt(MAX_PIXELS / (w0 * h0)), MAX_EDGE / Math.max(w0, h0));
    chosen = 1;
    outW = Math.max(1, Math.floor(w0 * shrink));
    outH = Math.max(1, Math.floor(h0 * shrink));
    return {
      ok: false,
      scale: 1,
      width: outW,
      height: outH,
      pixels: outW * outH,
      notice: `画布 ${w0}×${h0} 过大，已缩放至 ${outW}×${outH} 导出（${reasons.join('；')}）`,
    };
  }

  if (chosen !== requestedScale) {
    return {
      ok: false,
      scale: chosen,
      width: outW,
      height: outH,
      pixels: outW * outH,
      notice: `已从 @${requestedScale}x 降级为 @${chosen}x（${reasons.join('；')}），超出安全像素上限`,
    };
  }

  return { ok: true, scale: chosen, width: outW, height: outH, pixels: outW * outH, notice: null };
}

// ────────────────────────────────────────────────────────────────
// 平台能力判定（PRD Q8：iOS 不支持 PNG 导出）
// ────────────────────────────────────────────────────────────────

export type ExportPlatform = 'ios' | 'desktop';

/** 平台判定的输入快照 —— 抽成参数是为了能对各平台组合做纯函数单测。 */
export interface PlatformProbe {
  userAgent: string;
  /**
   * `navigator.maxTouchPoints`。
   * iPadOS 13+ 会伪装成桌面 Mac（UA 含 `Macintosh`、platform 为 `MacIntel`），
   * 唯一可靠的区分信号就是「触点数 > 1」。
 */
  maxTouchPoints: number;
}

/**
 * 判定当前平台是否支持 PNG 导出。
 *
 * 为什么不技术绕过（用户已决策）：wasm 方案（resvg 等）体积几 MB 会击穿
 * 首屏 300KB 预算，且其渲染引擎与浏览器不同，`feGaussianBlur` 会有像素差异，
 * 破坏「导出与预览逐像素一致」这条验收标准。故 iOS 直接不支持，UI 明示。
 *
 * ⭐纯函数：默认参数才去读 `navigator`，且通过可选参数注入时可完全脱离浏览器环境，
 * 因此单测无需 jsdom，`shared/` 也不引入任何浏览器 API 依赖。
 *
 * @param probe 平台信息快照；不传则实时从 `navigator` 读取（SSR/预渲染下会退化为 desktop）
 */
export function detectPlatform(probe?: PlatformProbe): ExportPlatform {
  const p = probe ?? readNavigator();
  const ua = p.userAgent;

  // iPadOS 伪装：MacIntel/ Macintosh + 多点触控 → 实际是 iPad
  const isIPadOS = /Macintosh|MacIntel/.test(ua) && p.maxTouchPoints > 1;
  if (isIPadOS) return 'ios';

  // iPhone / iPod / iOS 版 Safari
  if (/iPhone|iPod|iOS/i.test(ua)) return 'ios';

  return 'desktop';
}

/** 读取 navigator；SSR / 预渲染 / 测试环境下不存在，退化为「桌面」假设。 */
function readNavigator(): PlatformProbe {
  if (typeof navigator === 'undefined') {
    return { userAgent: '', maxTouchPoints: 0 };
  }
  return {
    userAgent: navigator.userAgent ?? '',
    // maxTouchPoints 在 iOS 13+ 与所有现代浏览器上均可用；
 // 老浏览器的 ontouchend 兜底会引入 window 引用，故略去（缺失时按 0 处理，
    // 只会让伪装成 Mac 的老 iPadOS 漏判为 desktop，属可接受的降级）。
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
}

/** iOS 上给用户的替代路径提示文案（导出失败时展示，避免只说「不支持」）。 */
export const IOS_PNG_UNSUPPORTED_HINT =
  'iOS 设备暂不支持 PNG 导出。你仍可导出 SVG —— 矢量、体积更小；' +
  '若需要 PNG，可在桌面浏览器打开本站再导出。';
