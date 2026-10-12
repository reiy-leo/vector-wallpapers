/**
 * `src/shared` 的纯函数单测。
 *
 * `detectPlatform` 的 UA 全部以参数注入，因此本文件**无需 jsdom / DOM 环境**，
 * 可以在 node 环境下直接跑。
 */
import { describe, expect, it } from 'vitest';
import { detectPlatform, guardCanvasSize, clamp, clamp01, isHexColor, isNumericString } from './guards';

describe('detectPlatform() ⭐ PRD Q8 iOS 不支持 PNG 导出', () => {
  /** 真实 UA 片段（只保留决定性特征，避免测试过于脆弱） */
  const CASES: Array<{ label: string; ua: string; touch: number; expect: 'ios' | 'desktop' }> = [
    {
      label: 'iPhone Safari',
      ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
 touch: 5,
      expect: 'ios',
    },
    {
      label: 'iPad Safari（MacIntel + 多点触控 →伪装成桌面）',
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      touch: 5,
      expect: 'ios',
    },
    {
      label: '桌面 Safari（同样是 Mac，但单点触控）',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
      touch: 0,
      expect: 'desktop',
    },
    {
   label: '桌面 Chrome',
      ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      touch: 0,
      expect: 'desktop',
    },
    {
      label: '桌面 Firefox',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
      touch: 0,
      expect: 'desktop',
    },
    {
      label: '桌面 Edge',
      ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      touch: 0,
      expect: 'desktop',
    },
    {
  label: 'iPod touch',
      ua: 'Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      touch: 5,
      expect: 'ios',
    },
    {
      label: 'Android Chrome（移动但非 iOS，PNG 可用）',
      ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      touch: 5,
      expect: 'desktop',
    },
  ];

  it('各平台组合判定结果表', () => {
    const rows: string[] = [];
    for (const c of CASES) {
      const got = detectPlatform({ userAgent: c.ua, maxTouchPoints: c.touch });
      expect(got, `${c.label} 应判为 ${c.expect}，实际 ${got}`).toBe(c.expect);
      rows.push(`${c.label.padEnd(38)} → ${got}`);
    }
    // 打印判定表，便于人工核对
    // eslint-disable-next-line no-console
    console.log('[detectPlatform]\n  ' + rows.join('\n  '));
  });

  it('iPad 伪装（MacIntel + touchPoints>1）判为 ios —— 最易漏的坑', () => {
    expect(
      detectPlatform({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
        maxTouchPoints: 5,
      }),
    ).toBe('ios');
  });

  it('同一 UA 下touchPoints 是决定性信号（1 = 桌面，2 = iPad）', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
    expect(detectPlatform({ userAgent: ua, maxTouchPoints: 1 })).toBe('desktop');
    expect(detectPlatform({ userAgent: ua, maxTouchPoints: 2 })).toBe('ios');
  });

  it('未知 UA 保守判为 desktop（不误伤桌面用户）', () => {
    expect(detectPlatform({ userAgent: '', maxTouchPoints: 0 })).toBe('desktop');
    expect(detectPlatform({ userAgent: 'SomethingCompletelyElse/1.0', maxTouchPoints: 0 })).toBe('desktop');
  });

  it('无参数调用不抛错（node/SSR 下退化为 desktop）', () => {
    expect(() => detectPlatform()).not.toThrow();
    expect(detectPlatform()).toBe('desktop');
  });
});

describe('guardCanvasSize()既有行为不变（PRD Q8）', () => {
  it('@1x 常规尺寸直接放行', () => {
    const r = guardCanvasSize(1920, 1080, 1);
    expect(r.ok).toBe(true);
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
  });

  it('@2x 常规尺寸放行', () => {
    const r = guardCanvasSize(1920, 1080, 2);
    expect(r.ok).toBe(true);
    expect(r.scale).toBe(2);
  });

  it('@3x 在 64M 上限内放行（18.7M px，旧 16M 上限会误伤降级）', () => {
    const r = guardCanvasSize(1920, 1080, 3);
    expect(r.ok).toBe(true);
    expect(r.scale).toBe(3);
  });

  it('单边超 7680 时降级并给出 notice', () => {
    // 3840@3x → 宽 11520 > 7680，触发单边限制
    const r = guardCanvasSize(3840, 2160, 3);
    expect(r.ok).toBe(false);
    expect(r.scale).toBe(2);
    expect(r.notice).toBeTruthy();
  });

  it('4K @3x 降到 @2x（单边限制所致，非面积）', () => {
    const r = guardCanvasSize(3840, 2160, 3);
    expect(r.ok).toBe(false);
    expect(r.scale).toBe(2);
  });

  it('超大尺寸不返回 null，且带 notice', () => {
    const r = guardCanvasSize(20000, 20000, 3);
    expect(r).not.toBeNull();
    expect(r.ok).toBe(false);
    expect(r.notice).toBeTruthy();
  });

  it('非法输入不抛错', () => {
    expect(() => guardCanvasSize(0, 0, 3)).not.toThrow();
    expect(() => guardCanvasSize(-100, -100, 3)).not.toThrow();
  });
});

describe('shared 基础工具', () => {
  it('clamp / clamp01 边界正确', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(Number.NaN)).toBe(0);
  });

  it('isHexColor 接受 3/6 位十六进制，拒绝其他', () => {
    expect(isHexColor('#fff')).toBe(true);
    expect(isHexColor('#ffffff')).toBe(true);
    expect(isHexColor('var(--x)')).toBe(false);
    expect(isHexColor(null)).toBe(false);
  });

  it('isNumericString 只接受纯数字', () => {
    expect(isNumericString('1920')).toBe(true);
    expect(isNumericString('19px')).toBe(false);
    expect(isNumericString(Number.NaN)).toBe(false);
  });
});
