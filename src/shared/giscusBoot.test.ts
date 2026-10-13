import { describe, it, expect, vi } from 'vitest';
import { consumeGiscusSession, GISCUS_SESSION_KEY } from './giscusBoot';

describe('consumeGiscusSession', () => {
  it('存会话、去参数、保留其他 query', () => {
    const setItem = vi.fn();
    const replace = vi.fn();
    const ok = consumeGiscusSession({ href: 'https://x.dev/?p=abc&giscus=SESS123' }, { setItem }, replace);
    expect(ok).toBe(true);
    expect(setItem).toHaveBeenCalledWith(GISCUS_SESSION_KEY, JSON.stringify('SESS123'));
    expect(replace).toHaveBeenCalledWith('https://x.dev/?p=abc');
  });
  it('没有 giscus 参数时什么也不做', () => {
    const setItem = vi.fn();
    const replace = vi.fn();
    expect(consumeGiscusSession({ href: 'https://x.dev/?p=abc' }, { setItem }, replace)).toBe(false);
    expect(setItem).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
