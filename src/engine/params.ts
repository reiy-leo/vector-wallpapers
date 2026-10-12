/**
 * 控件解析 —— 把用户给的 `params` 按 `ControlDef` 校验、clamp、填默认。
 *
 * 铁律：**永不抛错**（架构 §6.3 兼容铁律 4）。任何非法输入静默降级为默认值，
 * 畸形分享链接因此不可能导致白屏。
 */
import type { ControlDef, ParamValue } from '../patterns/types';

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === 'boolean') return raw;
  if (typeof raw === 'number') return raw !== 0;
  if (typeof raw === 'string') {
    const v = raw.trim().toLowerCase();
    if (v === '1' || v === 'true' || v === 'yes') return true;
    if (v === '0' || v === 'false' || v === 'no') return false;
  }
  return fallback;
}

/** 把数值吸附到 step 的整数倍并夹在 [min, max]。 */
export function snapToStep(value: number, min: number, max: number, step: number): number {
  const clamped = value < min ? min : value > max ? max : value;
  if (!Number.isFinite(step) || step <= 0) return clamped;
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  // 浮点保护：0.1+0.2 类误差在输出前消掉
  const rounded = Math.round(snapped * 1e6) / 1e6;
  return rounded < min ? min : rounded > max ? max : rounded;
}

/** 只输出 ControlDef 声明过的 key —— 未知参数被丢弃，避免 URL 污染。 */
export function resolveControls(
  controls: readonly ControlDef[],
  raw: Readonly<Record<string, ParamValue>> | undefined,
): Record<string, ParamValue> {
  const source = raw ?? {};
  const out: Record<string, ParamValue> = {};
  for (const c of controls) {
    const provided = source[c.key];
    switch (c.type) {
      case 'range': {
        const v = toFiniteNumber(provided);
        out[c.key] = v === null ? c.default : snapToStep(v, c.min, c.max, c.step);
        break;
      }
      case 'angle': {
        const v = toFiniteNumber(provided);
        const base = v === null ? c.default : v;
        out[c.key] = ((base % 360) + 360) % 360;
        break;
      }
      case 'toggle': {
        out[c.key] = toBoolean(provided, c.default);
        break;
      }
      case 'select': {
        const allowed = c.options.some((o) => o.value === provided);
        out[c.key] = allowed ? (provided as string) : c.default;
        break;
      }
    }
  }
  return out;
}

/** 全部控件取默认值 —— 「恢复默认」与初始配置的统一入口。 */
export function defaultParams(controls: readonly ControlDef[]): Record<string, ParamValue> {
  return resolveControls(controls, undefined);
}