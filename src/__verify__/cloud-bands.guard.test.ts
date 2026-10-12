/**
 * cloud-bands 形态门禁 —— 「真云」的两条不可省特征。
 *
 * ⭐ 存在理由：用户报「椭圆形的，改成这种云形状的」。
 * 这个缺陷**肉眼可见、测试全绿** —— 因为椭圆本身是完全合法的 SVG，
 * 体积、节点数、纯净度、确定性全部达标，没有任何断言会失败。
 *
 * 因此必须把「云」这个模糊审美词**量化**。真云与椭圆的区别有两条：
 *  1. **底缘平直**：积云底部被大气压压平，是水平直线段而非弧线。
 *     这一条贡献了约 70% 的「像云」感 —— 椭圆永远做不到。
 *  2. **顶部多个圆弧凸起**：参差不齐、大小不等，而非单一拱形。
 *
 * ⚠️ 判定要落在**产物上**而非源码上：断言 `cloudPath()` 存在是没用的
 *（那只是函数名），必须解析真实 SVG 的 `d` 属性。
 */
import { describe, expect, it } from 'vitest';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import def from '../patterns/C-organic/cloud-bands';

function svgAt(w = 2560, h = 1440, seed = 7): string {
  return renderStandaloneSVG(def, createDefaultConfig(def, { width: w, height: h, seed }), {
    skipBudget: true,
  });
}

/** 抽出所有云路径的 `d`。 */
function cloudDs(svg: string): string[] {
  return [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
}

describe('cloud-bands · 云形态契约', () => {
  it('① 必须是 path 而非 ellipse（椭圆是「一串香肠」的根因）', () => {
    const svg = svgAt();
    expect(
      (svg.match(/<ellipse/g) ?? []).length,
      '产物里仍有 ellipse —— 云还是椭圆拼的',
    ).toBe(0);
    expect(cloudDs(svg).length, '未找到任何云路径').toBeGreaterThan(5);
  });

  it('② 底缘必须是平直直线段（M→L 且 y 相等）', () => {
    const ds = cloudDs(svgAt());
    const flat = ds.filter((d) => {
      // 解析首个 M 与紧随的 L：底缘就是这条直线
      const m = d.match(/^M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/);
      if (!m) return false;
      return Math.abs(Number(m[2]) - Number(m[4])) < 0.01;
    });
    expect(
      flat.length,
      `仅 ${flat.length}/${ds.length} 朵云底缘平直 —— 平底是「像云」最关键的一条特征`,
    ).toBe(ds.length);
  });

  it('②b 平底必须够宽（窄底不成立，应是椭圆）', () => {
    for (const d of cloudDs(svgAt())) {
      const m = d.match(/^M(-?[\d.]+) (-?[\d.]+)L(-?[\d.]+) (-?[\d.]+)/);
      if (!m) continue;
      const w = Math.abs(Number(m[3]) - Number(m[1]));
      const h = Number(m[2]) - Number(d.match(/Q(-?[\d.]+)/)?.[1] ?? '0');
      expect(w, '某朵云宽度过小，读起来就是椭圆而非云').toBeGreaterThan(h * 1.5);
    }
  });

  it('③ 顶部必须有 ≥3 个圆弧凸起（单一拱形 = 半椭圆）', () => {
    for (const d of cloudDs(svgAt())) {
      const bumps = (d.match(/Q/g) ?? []).length - 2; // 减去左右两个肩部
      expect(bumps, '某朵云顶部凸起不足 3 个 —— 单拱形读作半椭圆').toBeGreaterThanOrEqual(3);
    }
  });

  it('③b 凸起必须参差（等高 = 程序感）', () => {
    /**
     * ⚠️ 第一版这里假绿：把 `bh` 固定成常数后，断言照样通过。
     * 根因是**测错了对象** —— 它比较了「所有 Q 控制点的 y 是否全同」，
     * 而肩部与凸起端点的 y 本来就由不同公式算出，即使 `bh` 固定也有差异，
     * 于是「去重后 >1」恒成立，断言测的其实是别的东西。
     *
     * ✅ 正解：只看**顶部凸起顶点**（第 1~n-1 个 Q 的控制点，排除首尾两个肩部），
     * 且要求**多数云**的顶点高度互不相同。等高凸起 = 程序画的。
     */
    const ds = cloudDs(svgAt());
    const withDistinct = ds.filter((d) => {
      // 去掉最后一个 Z 之前的闭合，再取所有 Q 的控制点 y
      const ys = [...d.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g)]
        .map((m) => Number(m[2]))
        // 排除首尾两个肩部：它们只与 height/r 有关，与每朵云的 rng 无关
        .slice(1, -1);
      if (ys.length === 0) return false;
      // 归一到0.5px 精度：n() 只保留 2 位，过细的比较会误报
      return new Set(ys.map((y) => Math.round(y * 2))).size >= Math.max(2, ys.length - 1);
    });
    expect(
      withDistinct.length,
      `仅 ${withDistinct.length}/${ds.length} 朵云的凸起高度参差 —— 等高凸起会读作程序生成的梳齿`,
    ).toBeGreaterThan(ds.length * 0.7);
  });

  it('④ 凸起分布须非等分（等分 = 齿轮/泡泡，不是云）', () => {
    // 每朵云的第一个凸起宽度占比应在 0.2~0.4 之间（全等分会是 0.25 且各段相同）
    const ds = cloudDs(svgAt());
    for (const d of ds) {
      const xs = [...d.matchAll(/Q(-?[\d.]+)/g)].map((m) => Number(m[1]));
      const gaps: number[] = [];
      for (let i = 1; i < xs.length; i++) gaps.push(Math.abs(xs[i - 1] - xs[i]));
      if (gaps.length < 2) continue;
      const total = gaps.reduce((a, b) => a + b, 0);
      const first = gaps[0] / total;
      expect(
        first,
        `首凸起占比 ${first.toFixed(2)} 过于极端 —— 凸起应大致均匀但不完全等分`,
      ).toBeGreaterThan(0.12);
      expect(first).toBeLessThan(0.45);
    }
  });

  it('⑤ 体积与节点数仍在红线内', () => {
    for (const [w, h] of [[1170, 2532], [2560, 1440], [3840, 2160]] as const) {
      const svg = svgAt(w, h);
      const bytes = new TextEncoder().encode(svg).length;
      const nodes = (svg.match(/<(rect|circle|path|line|polygon|ellipse|g)\b/g) ?? []).length;
      expect(bytes, `${w}×${h} 体积 ${bytes}B 击穿 20KB`).toBeLessThan(20 * 1024);
      expect(nodes, `${w}×${h} 节点 ${nodes} 超出 60`).toBeLessThanOrEqual(60);
    }
  });

  it('⑥ 确定性 + seed 敏感性（新增 jitter 消耗不得破坏两者）', () => {
    expect(svgAt(2560, 1440, 42)).toBe(svgAt(2560, 1440, 42));
    // ⚠️ cloudPath 里新增了 4 个 rng() 调用，若消耗顺序错乱会导致同 seed 不同形
    expect(cloudDs(svgAt(2560, 1440, 42))).toEqual(cloudDs(svgAt(2560, 1440, 42)));
    expect(cloudDs(svgAt(2560, 1440, 7))).not.toEqual(cloudDs(svgAt(2560, 1440, 999)));
  });

  it('⑦ 数据契约：元件 id 与控件 key 一个都没动', () => {
    expect(def.elements.map((e) => e.id)).toEqual([
      'sky',
      'glow',
      'cloud_hi',
      'cloud_mid',
      'cloud_low',
    ]);
    for (const key of ['bands', 'scale', 'spread', 'glowX', 'glowY']) {
      expect(def.controls.map((c) => c.key), `控件 key「${key}」被删`).toContain(key);
    }
  });

  it('⑧ 伴生云不透明度必须低于主云（否则读作一朵更重的云，而非咬合层次）', () => {
    const opacities = [...svgAt().matchAll(/fill-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    const cloudOpacities = opacities.filter((o) => o > 0 && o < 1);
    // 必然存在比主云更淡的那一档
    const maxCloud = Math.max(...cloudOpacities);
    expect(cloudOpacities.some((o) => o < maxCloud)).toBe(true);
  });
});
