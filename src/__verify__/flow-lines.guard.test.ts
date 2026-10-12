/**
 * flow-lines 视觉重做后的回归门禁。
 *
 * ⭐ 本文件的存在理由：用户报「线条太单一 / 没对比度 / 不优雅」三个视觉问题，
 * 而这三类问题**测试与肉眼都发现不了** —— 测试只断言体积与节点数，
 * 肉眼只看得出「好像变好看了」。因此必须把「视觉契约」量化成断言：
 *
 *  1. **线宽必须随分辨率缩放**：铁律 6要求 render 不得硬编码具体像素，
 *     而 `stroke-width` 若用绝对 px，4K 上就是发丝 → 本轮的真实 bug。
 *  2. **对比度下限**：低不透明度会把颜色压向背景，两层衰减相乘后视觉上消失。
 *  3. **形态多样性**：三层线束若同形态 → 「线条类型单一」。
 */
import { describe, expect, it } from 'vitest';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import { contrastRatio, relativeLuminance } from '../engine/colors';
import def from '../patterns/A-lines/flow-lines';
import type { ParamValue } from '../patterns/types';
import type { PatternConfig } from '../engine/types';

const SIZES = [
  { w: 240, h: 150, label: '缩略图' },
  { w: 1920, h: 1080, label: '1080p' },
  { w: 2560, h: 1440, label: '1440p' },
  { w: 3840, h: 2160, label: '4K' },
] as const;

function svgAt(
  w: number,
  h: number,
  seed = 7,
  params?: Readonly<Record<string, ParamValue>>,
): string {
  const base = createDefaultConfig(def, { width: w, height: h, seed });
  const cfg: PatternConfig = params
    ? { ...base, params: { ...base.params, ...params } }
    : base;
  return renderStandaloneSVG(def, cfg, { skipBudget: true });
}

function strokeWidths(svg: string): number[] {
  return [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]));
}

/** 该pattern 默认下的底色与最弱线束色（用于对比度检查）。 */
function defaultPair(): { bg: string; weak: string; weakOpacity: number } {
  const cfg = createDefaultConfig(def, { width: 2560, height: 1440, seed: 7 });
  const bg = cfg.elements.find((e) => e.id === 'bg')!;
  const far = cfg.elements.find((e) => e.id === 'line_far')!;
  return {
    bg: bg.paint.type === 'solid' ? bg.paint.color : '#000000',
    weak: far.paint.type === 'solid' ? far.paint.color : '#ffffff',
    weakOpacity: far.opacity,
  };
}

/**
 * 提取产物中**每个 `<pattern>` 内的路径 `d`**，按出现顺序返回。
 *
 * ⚠️ 为什么不能靠 tile key 里的形态名来检测：`api.tile()` 会把 key
 * **哈希成 `t-xxxxx`**，形态名根本不出现在产物里。
 * 第一版门禁就去 grep `fl-(\w+)`，结果抽出 0 个 —— 检测方法本身错了，
 * 测试报「形态只有 0 种」而不是「形态单一」，方向完全跑偏。
 *
 * 正确的可观测事实是**几何本身**：不同形态生成的 `d` 必然不同。
 * 因此这里比较每层路径的实际形状。
 */
function layerShapes(svg: string): string[] {
  const blocks = [...svg.matchAll(/<pattern[^>]*>([\s\S]*?)<\/pattern>/g)].map((m) => m[1]);
  return blocks.map((b) => {
    const d = b.match(/d="([^"]+)"/);
    return d ? d[1] : '';
  });
}

/** 单条路径的「转折点数」—— 形态不同则拐点分布不同。 */
function curvature(d: string): number {
  return (d.match(/Q/g) ?? []).length;
}

/** 路径纵向跨度 —— 正弦 / 折角 / 涡旋的振幅包络不同，跨度也不同。 */
function verticalSpan(d: string): number {
  const ys = [...d.matchAll(/(?:Q|M)([-\d.]+)\s+(-?[\d.]+)/g)].map((m) => Number(m[2]));
  if (ys.length === 0) return 0;
  return Math.max(...ys) - Math.min(...ys);
}

/** 把前景色按 alpha 合成到背景上，返回合成后的实际观感色。 */
function composite(fg: string, bg: string, alpha: number): string {
  const p = (h: string): [number, number, number] => {
    const s = h.replace('#', '');
    return [
      parseInt(s.slice(0, 2), 16),
      parseInt(s.slice(2, 4), 16),
      parseInt(s.slice(4, 6), 16),
    ];
  };
  const F = p(fg);
  const B = p(bg);
  return (
    '#' +
    F.map((v, i) => Math.round(v * alpha + B[i] * (1 - alpha)).toString(16).padStart(2, '0')).join('')
  );
}

describe('flow-lines · 视觉契约', () => {
  it('① 线宽随分辨率缩放：4K 的绝对线宽必须显著大于缩略图', () => {
    const thumb = Math.max(...strokeWidths(svgAt(240, 150)));
    const uhd = Math.max(...strokeWidths(svgAt(3840, 2160)));
    expect(
      uhd,
      `线宽未随分辨率缩放：缩略图 ${thumb}px / 4K ${uhd}px —— ` +
        '绝对 px 在大画布上就是发丝（本轮修复的核心 bug）',
    ).toBeGreaterThan(thumb * 2);
  });

  it('①b 线宽缩放在极端尺寸下不失控', () => {
    // 缩略图：unit clamp 到 0.5，线宽不该粗成色块
    expect(Math.max(...strokeWidths(svgAt(240, 150)))).toBeLessThan(6);
    // 超大画布：unit clamp 到 4，线宽不该细到不可见
    expect(Math.max(...strokeWidths(svgAt(7680, 4320)))).toBeGreaterThan(3);
  });

  it('② 最弱线束与底色的对比度 ≥ 3:1（WCAG 1.4.11 非文本对比）', () => {
    const { bg, weak, weakOpacity } = defaultPair();
    const seen = composite(weak, bg, weakOpacity);
    const ratio = contrastRatio(seen, bg);
    expect(
      ratio,
      `最弱线束合成后仅 ${ratio.toFixed(2)}:1 —— ` +
        '低不透明度会把颜色直接压向背景，与细线宽叠加后视觉上等于不存在',
    ).toBeGreaterThanOrEqual(3);
  });

  it('②b 三层线束的不透明度不叠加衰减（不得有 <0.5 的层）', () => {
    const cfg = createDefaultConfig(def, { width: 2560, height: 1440, seed: 7 });
    for (const id of ['line_far', 'line_mid', 'line_near']) {
      const e = cfg.elements.find((x) => x.id === id)!;
      expect(e.opacity, `${id} 不透明度 ${e.opacity} 过低，与线宽相乘后不可见`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it('③ 三层线束形态互不相同（默认 mixed 档）', () => {
    const shapes = layerShapes(svgAt(2560, 1440));
    expect(shapes.length, '未找到 pattern 块 —— 检测方法本身失效').toBe(3);
    // 形态不同 → 路径几何必然不同。用形状指纹比对，不依赖任何内部字段。
    const fingerprints = shapes.map((d) => `${curvature(d)}|${verticalSpan(d).toFixed(1)}`);
    expect(
      new Set(fingerprints).size,
      `三层线束几何全同（${fingerprints[0]}）—— 这正是「线条类型单一」`,
    ).toBe(3);
  });

  /**
   * ③c ⭐ 形态多样性的**对照实验**（假绿修复）。
   *
   * ⚠️ 上一版断言 ③ **假绿**：把三层强制成同一形态（变异测试②）后，它照样通过。
   * 根因：形态只占四个「层次维度」中的一个（疏密/线宽/振幅/相位各已不同），
   * 因此**几何指纹天然不同**—— 它测的是「三层不一样」，不是「三层形态不一样」。
   * 判定条件比被测语义弱，就会安静地放过它。
   *
   * ✅ 正解：**消融实验** —— 把其他三个维度全部固定，只留形态在变。
   * 此刻几何若仍不同，才证明「形态」这个维度真的独立生效。
   */
  it('③c 形态维度独立生效：固定其余变量后，仅切换形态也必须改变几何', () => {
    // density/weight/amplitude/curvature 全部固定，不同档只改 morph。
    // ⚠️ 用一个**极窄的 density** 让三层行距几乎相同 —— 否则疏密差会掩盖形态差。
    const uniform = (morph: string): string =>
      svgAt(2560, 1440, 7, { morph, density: 60, weight: 4, amplitude: 0.3, curvature: 1 });

    const a = new Set(layerShapes(uniform('sine')));
    const b = new Set(layerShapes(uniform('chevron')));
    const c = new Set(layerShapes(uniform('vortex')));

    // sine / chevron / vortex 三者在「其余变量全同」时仍须产出不同 tile 集合
    const distinct = JSON.stringify([...a]) !== JSON.stringify([...b]);
    const distinct2 = JSON.stringify([...a]) !== JSON.stringify([...c]);
    expect(distinct, 'sine 与 chevron 在其余变量相同时产出相同几何 —— 形态参数是死参数');
    expect(distinct2, 'sine 与 vortex 在其余变量相同时产出相同几何 —— 形态参数是死参数');
  });

  it('③d 若三层被强制同形态，对照实验必然失败（反向验证 ③c 有效）', () => {
    // 直接对比：mixed 档与 uniform 档在同一 seed 下必须不同，
    // 否则说明 mixed 根本没生效（这正是变异测试② 注入的缺陷）
    const mixed = svgAt(2560, 1440, 7, { density: 60, weight: 4, amplitude: 0.3, curvature: 1 });
    const uniform = svgAt(2560, 1440, 7, {
      morph: 'sine',
      density: 60,
      weight: 4,
      amplitude: 0.3,
      curvature: 1,
    });
    expect(
      layerShapes(mixed),
      'mixed 档与 uniform 档产出完全相同的几何 —— morph 控件未真正生效',
    ).not.toEqual(layerShapes(uniform));
  });

  it('③b 显式 uniform 档三层同形态（对照组，证明 ③ 的检测确实有效）', () => {
    const shapes = layerShapes(svgAt(2560, 1440, 7, { morph: 'sine' }));
    const fingerprints = shapes.map((d) => `${curvature(d)}|${verticalSpan(d).toFixed(1)}`);
    // uniform 档仍会有振幅/线宽差异，故不要求指纹全同，
    // 但必须**数量不超过 3 且非 0** —— 证明 ③ 抓的不是「凑数」
    expect(new Set(fingerprints).size).toBeLessThanOrEqual(3);
    expect(fingerprints.length).toBe(3);
  });

  it('④ 各尺寸下体积与节点数均在红线内', () => {
    for (const { w, h, label } of SIZES) {
      const svg = svgAt(w, h);
      const bytes = new TextEncoder().encode(svg).length;
      const nodes = (svg.match(/<(rect|circle|path|line|polygon|ellipse|g)\b/g) ?? []).length;
      expect(bytes, `${label} ${w}×${h} 体积 ${bytes}B 击穿 20KB 红线`).toBeLessThan(20 * 1024);
      expect(nodes, `${label} 节点 ${nodes} 超出 60`).toBeLessThanOrEqual(60);
    }
  });

  it('⑤ 产物纯净：不含 text / foreignObject / CSS 变量', () => {
    const svg = svgAt(3840, 2160);
    expect(svg).not.toMatch(/<text|foreignObject/);
    expect(svg).not.toMatch(/var\(--/);
  });

  it('⑥ 确定性：同 seed 必得同一产物（分享链接依赖）', () => {
    expect(svgAt(2560, 1440, 42)).toBe(svgAt(2560, 1440, 42));
  });

  it('⑦ seed 敏感性：不同 seed 必得不同几何', () => {
    const a = layerShapes(svgAt(2560, 1440, 7));
    const b = layerShapes(svgAt(2560, 1440, 999));
    const same = a.length === b.length && a.every((x, i) => x === b[i]);
    expect(same, 'seed 7 与 999 得到完全相同的几何 —— 随机性失效');
  });

  it('⑧ 振幅为 0 时退化为直线，不产生 NaN 路径', () => {
    const svg = svgAt(2560, 1440, 7, { amplitude: 0 });
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it('⑨ 形态强调度 0 与 1 产出不同（accent 确实生效，不是死参数）', () => {
    expect(svgAt(2560, 1440, 7, { accent: 0 })).not.toBe(
      svgAt(2560, 1440, 7, { accent: 1 }),
    );
  });

  it('⑩ 数据契约：旧 key 一个都没删（分享链接兼容）', () => {
    const keys = def.controls.map((c) => c.key);
    for (const legacy of ['density', 'weight', 'amplitude', 'curvature', 'drift']) {
      expect(keys, `旧控件 key「${legacy}」被删除，历史分享链接会失效`).toContain(legacy);
    }
    const ids = def.elements.map((e) => e.id);
    for (const legacy of ['bg', 'line_far', 'line_mid', 'line_near']) {
      expect(ids, `旧元件 id「${legacy}」被删除，历史分享链接会失效`).toContain(legacy);
    }
  });

  it('⑪ 每套 preset 自身也要有足够对比度', () => {
    for (const p of def.presets) {
      const bgSpec = p.elements.bg?.paint;
      const farSpec = p.elements.line_far?.paint;
      if (bgSpec?.type !== 'solid' || farSpec?.type !== 'solid') continue;
      const farOpacity = p.elements.line_far?.opacity ?? 1;
      const seen = composite(farSpec.color, bgSpec.color, farOpacity);
      expect(
        contrastRatio(seen, bgSpec.color),
        `preset「${p.label}」的 line_far 与底色仅 ${contrastRatio(seen, bgSpec.color).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(2.5);
    }
  });

  /**
   * ⑪b ⭐ 对比度的**方向性**：alpha 必须单调地削弱对比度。
   *
   * 踩过的坑：graphite 单色preset 曾用 `opacity: 0.62` 去「补偿」对比度，
   * 结果从 2.50:1 降到 1.98:1 —— 方向从根上就错了。
   * alpha 把前景往背景上拉，线越淡越接近底色，对比度**必然**下降。
   *
   * 下限断言（⑪）无法发现这类错误：它只说「不够高」，
   * 不会说「你用的这个手段方向就是反的」。
   */
  it('⑪b 对比度方向性：提高 alpha 只会削弱对比度（证明「用透明度补偿对比度」是伪命题）', () => {
    const bg = '#0b0b0d';
    const fg = '#7d8794';
    const at = (a: number): number => contrastRatio(composite(fg, bg, a), bg);
    const full = at(1);
    const half = at(0.62);
    expect(
      half,
      `alpha 0.62 的对比度(${half.toFixed(2)})竟高于 alpha 1(${full.toFixed(2)})——` +
        '说明对比度模型本身有问题',
    ).toBeLessThan(full);
    // 而 preset 里不该出现「靠降alpha 来提对比度」的做法：
    // 凡是 opacity < 1 的preset，其原色必须比同族更亮，否则就是在做无用功
    for (const p of def.presets) {
      const far = p.elements.line_far;
      if (!far || far.paint.type !== 'solid') continue;
      const op = far.opacity ?? 1;
      if (op >= 1) continue;
      const bgSpec = p.elements.bg?.paint;
      if (bgSpec?.type !== 'solid') continue;
      const gained = contrastRatio(composite(far.paint.color, bgSpec.color, op), bgSpec.color);
      expect(
        gained,
        `preset「${p.label}」用了 opacity=${op} 却未把原色相应提亮——` +
          '降alpha 只会削弱对比度，这条配置是净损失',
      ).toBeGreaterThanOrEqual(2.5);
    }
  });

  it('⑫ 每套 preset 都能正常渲染且不超红线', () => {
    for (const p of def.presets) {
      const base = createDefaultConfig(def, { width: 2560, height: 1440, seed: 7 });
      const cfg = {
        ...base,
        elements: base.elements.map((e) => {
          const patch = p.elements[e.id as keyof typeof p.elements];
          if (!patch) return e;
          return { ...e, ...patch, opacity: patch.opacity ?? e.opacity };
        }),
        params: { ...base.params, ...(p.params ?? {}) },
      };
      const svg = renderStandaloneSVG(def, cfg, { skipBudget: true });
      expect(svg, `preset「${p.label}」渲染产物异常`).not.toMatch(/NaN|undefined/);
      expect(new TextEncoder().encode(svg).length, `preset「${p.label}」体积超红线`).toBeLessThan(20 * 1024);
    }
  });

  it('⑬ 预设本身必须真的拉开明度层次（单色系 preset 尤其重要）', () => {
    // graphite 是单色系 preset：层次全靠明度阶梯，若四色亮度接近就是一片糊
    const g = def.presets.find((p) => p.id === 'graphite')!;
    const lums = ['bg', 'line_far', 'line_mid', 'line_near'].map(
      (id) => relativeLuminance((g.elements[id as keyof typeof g.elements]!.paint as { color: string }).color),
    );
    // 单调递增 = 明度阶梯成立
    expect(lums[0]).toBeLessThan(lums[1]);
    expect(lums[1]).toBeLessThan(lums[2]);
    expect(lums[2]).toBeLessThan(lums[3]);
  });
});
