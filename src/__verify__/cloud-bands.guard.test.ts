/**
 * cloud-bands 门禁 —— 宫崎骏式积云（2026-10-14 重做后的形态契约）。
 *
 * ⭐ 存在理由：「像不像吉卜力的云」是审美词，产物却全是合法 SVG ——
 * 椭圆香肠、齿轮、一排锯齿、一张没有明暗的剪影，体积 / 节点 / 确定性全都能过。
 * 所以把「宫崎骏的云」拆成**可在产物上量出来**的特征，逐条断言：
 *
 *   A. 天空：天顶深、地平线浅，且是饱和的蓝（不是灰、不是青绿）。
 *   B. 三层云（远 / 中 / 近）在任何参数下都绘制 —— 改色命中率 100% 的结构前提。
 *   C. 团块堆叠：云由大小不等的圆泡组成（半径离散度够大 = 不是齿轮），
 *      近处云塔高耸（高宽比够大 = 不是香肠），远云扁平。
 *   D. 体积：每个云团至少「阴影体 + 受光体」两层明暗，受光体朝上偏移（顶部受光），
 *      受光色明显亮于阴影色；近处云塔再加一道边缘高光。
 *   E. 平底：每层有 clipPath 切出的水平云底，且确实有泡伸到云底以下被切平。
 *   F. 空气透视：远层云底更低（贴地平线）、泡更小、整体更淡。
 *   G. 禁用 filter / ellipse；体积、节点、确定性、数据契约。
 *
 * ⭐ 自证：每条判定都写成**作用于 SVG 字符串的纯函数**，并在「变异」组里
 * 对真实产物注入对应缺陷（拿掉受光体、统一半径、去掉 clip、压扁云塔、塞进 filter……），
 * 断言判定确实翻红 —— 防止判定写成恒真的假绿。
 *
 * ⚠️ 判定一律落在产物上，不读源码。
 */
import { describe, expect, it } from 'vitest';
import { hexToHsl, hexToRgb, relativeLuminance } from '../engine/colors';
import { applyPreset, createDefaultConfig, renderSVG, renderStandaloneSVG } from '../engine/render';
import type { PatternConfig } from '../engine/types';
import def from '../patterns/C-organic/cloud-bands';

// ───────────────────────────── 产物解析 ─────────────────────────────

interface Circle {
  x: number;
  y: number;
  r: number;
}
interface Group {
  id: string;
  circles: Circle[];
  uses: Array<{ fill: string; x: number; y: number }>;
}
interface Layer {
  clipH: number;
  fill: string;
  opacity: number;
  groups: Group[];
}

function cfgOf(over: { seed?: number; w?: number; h?: number; preset?: string; params?: Record<string, number> } = {}): PatternConfig {
  let cfg = createDefaultConfig(def, { width: over.w ?? 2560, height: over.h ?? 1440, seed: over.seed ?? 7 });
  if (over.preset) cfg = applyPreset(def, over.preset, cfg);
  if (over.params) Object.assign(cfg.params, over.params);
  return cfg;
}
function svgOf(over: Parameters<typeof cfgOf>[0] = {}): string {
  return renderStandaloneSVG(def, cfgOf(over), { skipBudget: true });
}

/** `<linearGradient id>` → 色标颜色表。 */
function gradients(svg: string): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const g of svg.matchAll(/<linearGradient[^>]*id="([^"]+)"[^>]*>(.*?)<\/linearGradient>/g)) {
    m.set(g[1], [...g[2].matchAll(/stop-color="([^"]+)"/g)].map((s) => s[1]));
  }
  return m;
}

function clipHeights(svg: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of svg.matchAll(/<clipPath id="([^"]+)"><rect[^>]*height="([\d.]+)"/g)) m.set(c[1], Number(c[2]));
  return m;
}

/** 按层解析云：每层是一个带 clip-path 的 g。 */
function layers(svg: string): Layer[] {
  const clips = clipHeights(svg);
  const out: Layer[] = [];
  const chunks = svg.split('<g clip-path="url(#').slice(1);
  for (const ch of chunks) {
    const head = ch.slice(0, ch.indexOf('>'));
    const clipId = head.slice(0, head.indexOf(')'));
    const fill = head.match(/fill="url\(#([^)]+)\)"/)?.[1] ?? '';
    const opacity = Number(head.match(/opacity="([\d.]+)"/)?.[1] ?? '1');
    const groups: Group[] = [];
    for (const gm of ch.matchAll(/<g id="([^"]+)">(.*?)<\/g>/g)) {
      const circles = [...gm[2].matchAll(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"\/>/g)].map((c) => ({
        x: Number(c[1]),
        y: Number(c[2]),
        r: Number(c[3]),
      }));
      const uses = [...ch.matchAll(new RegExp(`<use href="#${gm[1]}" fill="([^"]+)" x="(-?[\\d.]+)" y="(-?[\\d.]+)"/>`, 'g'))].map((u) => ({
        fill: u[1],
        x: Number(u[2]),
        y: Number(u[3]),
      }));
      groups.push({ id: gm[1], circles, uses });
    }
    out.push({ clipH: clips.get(clipId) ?? NaN, fill, opacity, groups });
  }
  return out;
}

const allCircles = (L: Layer): Circle[] => L.groups.flatMap((g) => g.circles);

// ───────────────────────────── 判定（纯函数） ─────────────────────────────

/** A. 天空：首个竖向渐变（天空）天顶比地平线暗至少 0.25 亮度，且天顶是饱和蓝。 */
function skyOk(svg: string): string | null {
  const first = svg.match(/<linearGradient[^>]*id="([^"]+)"[^>]*y1="0" y2="1"|<linearGradient[^>]*id="([^"]+)"[^>]*x1="0.5" x2="0.5" y1="0" y2="1"/);
  const id = first?.[1] ?? first?.[2];
  const skyFill = svg.match(/<rect fill="url\(#([^)]+)\)"/)?.[1];
  const stops = gradients(svg).get(skyFill ?? id ?? '');
  if (!stops || stops.length < 2) return '天空不是竖向渐变';
  const top = stops[0];
  const bot = stops[stops.length - 1];
  if (relativeLuminance(bot) - relativeLuminance(top) < 0.25) return `天顶 ${top} 不比地平线 ${bot} 深`;
  const h = hexToHsl(top);
  if (!(h.h >= 200 && h.h <= 235 && h.s >= 0.5)) return `天顶 ${top} 不是饱和的蓝（h=${h.h.toFixed(0)} s=${h.s.toFixed(2)}）`;
  return null;
}

/** B. 恰好三层，每层至少一朵云（≥2 个圆）。 */
function threeLayersOk(svg: string): string | null {
  const ls = layers(svg);
  if (ls.length !== 3) return `云层数 ${ls.length} ≠ 3`;
  for (let i = 0; i < 3; i++) if (allCircles(ls[i]).length < 2) return `第 ${i} 层没有云`;
  return null;
}

/** C. 团块堆叠：近层圆数够多、半径离散（CV ≥ 0.25）、云塔高宽比 ≥ 0.6；远层扁（高宽比 < 近层）。 */
function massOk(svg: string): string | null {
  const ls = layers(svg);
  if (ls.length !== 3) return '层数不对';
  const near = allCircles(ls[2]);
  if (near.length < 20) return `近处云塔只有 ${near.length} 个泡 —— 撑不起「大泡叠小泡」`;
  const rs = near.map((c) => c.r);
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length;
  const cv = Math.sqrt(rs.reduce((a, b) => a + (b - mean) ** 2, 0) / rs.length) / mean;
  if (cv < 0.25) return `泡半径离散度 ${cv.toFixed(2)} 过小 —— 等大的泡读作齿轮 / 泡泡纸`;
  const bbox = (cs: Circle[]) => {
    const x0 = Math.min(...cs.map((c) => c.x - c.r));
    const x1 = Math.max(...cs.map((c) => c.x + c.r));
    const y0 = Math.min(...cs.map((c) => c.y - c.r));
    return { w: x1 - x0, top: y0 };
  };
  // 近层可能有两座塔：取最高那座附近（以最高点为中心 ±0.5 塔宽）估宽度太复杂，直接用层的最小云团尺度：
  // 高 = 云底 − 最高点；宽 = 与最高点同属一朵云的泡（x 落在最高泡 ±(高) 内）的横向跨度
  const topC = near.reduce((a, b) => (a.y - a.r < b.y - b.r ? a : b));
  const H = ls[2].clipH - (topC.y - topC.r);
  const same = near.filter((c) => Math.abs(c.x - topC.x) < H * 1.1);
  const W = bbox(same).w;
  if (H / W < 0.6) return `近处云塔高宽比 ${(H / W).toFixed(2)} —— 扁成香肠了`;
  // 远层每朵云都应是扁的：用每团的高度 / 层宽度粗估，远层最高点离云底 < 近层的 1/3
  const far = allCircles(ls[0]);
  const farH = ls[0].clipH - Math.min(...far.map((c) => c.y - c.r));
  if (farH > H / 3) return `远云高 ${farH.toFixed(0)} 超过近处云塔的 1/3 —— 没有远近`;
  return null;
}

/** D. 两层以上明暗：每团都有受光体（use，向上偏移），受光色明显亮于阴影渐变底色；近层多数团有第二个 use（高光）。 */
function shadingOk(svg: string): string | null {
  const ls = layers(svg);
  const grads = gradients(svg);
  for (let i = 0; i < ls.length; i++) {
    const L = ls[i];
    const shade = grads.get(L.fill);
    if (!shade || shade.length < 2) return `第 ${i} 层没有阴影渐变`;
    const shadeBot = shade[shade.length - 1];
    for (const g of L.groups) {
      if (g.uses.length === 0) return `第 ${i} 层有云团只有阴影、没有受光体 —— 剪影`;
      const lit = g.uses[g.uses.length - 1];
      if (!(lit.y < 0)) return `第 ${i} 层受光体未朝上偏移（y=${lit.y}）—— 顶部不受光`;
      if (!lit.fill.startsWith('#')) continue;
      if (relativeLuminance(lit.fill) - relativeLuminance(shadeBot) < 0.15) {
        return `第 ${i} 层受光色 ${lit.fill} 与阴影 ${shadeBot} 亮度差不足 —— 明暗读不出体积`;
      }
    }
  }
  const near = ls[2];
  const withHi = near.groups.filter((g) => g.uses.length >= 2).length;
  if (withHi < near.groups.length * 0.5) return `近处云塔只有 ${withHi}/${near.groups.length} 团有边缘高光`;
  return null;
}

/** E. 平底：每层有 clip 高度，且至少 2 个泡伸到云底以下（真的被切平）。 */
function flatBaseOk(svg: string): string | null {
  for (const [i, L] of layers(svg).entries()) {
    if (!Number.isFinite(L.clipH)) return `第 ${i} 层没有 clipPath 切云底`;
    const below = allCircles(L).filter((c) => c.y + c.r > L.clipH + 1).length;
    if (below < 2) return `第 ${i} 层只有 ${below} 个泡伸到云底以下 —— 底部是圆的，不是平的`;
  }
  return null;
}

/** F. 空气透视：云底 远 > 中 > 近（远云贴地平线），远层最大泡 < 0.7× 近层最大泡，远层更融进天色。 */
function perspectiveOk(svg: string): string | null {
  const ls = layers(svg);
  if (ls.length !== 3) return '层数不对';
  if (!(ls[0].clipH > ls[1].clipH && ls[1].clipH > ls[2].clipH)) return '云底高度没有按远 → 近抬升';
  const maxR = (L: Layer) => Math.max(...allCircles(L).map((c) => c.r));
  if (!(maxR(ls[0]) < maxR(ls[2]) * 0.7)) return '远云的泡不比近处小';
  // 远层更接近天色（空气透视）：远层阴影顶色到地平线色的距离 < 近层
  const grads = gradients(svg);
  const skyFill = svg.match(/<rect fill="url\(#([^)]+)\)"/)?.[1] ?? '';
  const horizon = grads.get(skyFill)?.slice(-1)[0];
  if (!horizon) return '找不到地平线色';
  const dist = (a: string, b: string) => {
    const x = hexToRgb(a);
    const y = hexToRgb(b);
    return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
  };
  const shadeTop = (L: Layer) => grads.get(L.fill)![0];
  if (!(dist(shadeTop(ls[0]), horizon) < dist(shadeTop(ls[2]), horizon))) return '远层阴影不比近层更融进天色';
  return null;
}

/** G. 禁 filter / ellipse / blur。 */
function noFilterOk(svg: string): string | null {
  if (/<filter|filter=|feGaussianBlur|<ellipse/.test(svg)) return '产物里出现 filter / ellipse';
  return null;
}

const CHECKS = { skyOk, threeLayersOk, massOk, shadingOk, flatBaseOk, perspectiveOk, noFilterOk };

// ───────────────────────────── 真实产物 ─────────────────────────────

describe('cloud-bands · 宫崎骏积云形态契约', () => {
  const SEEDS = [1, 7, 42, 99, 1234, 65535];

  it('A–G 全部判定在默认参数、6 个 seed 下成立', () => {
    for (const seed of SEEDS) {
      const svg = svgOf({ seed });
      for (const [name, fn] of Object.entries(CHECKS)) expect(fn(svg), `seed=${seed} ${name}`).toBeNull();
    }
  });

  it('三个 preset 下：三层 + 明暗 + 平底 + 透视 + 无 filter 成立', () => {
    for (const preset of ['daybreak', 'storm', 'mint']) {
      for (const seed of [3, 7]) {
        const svg = svgOf({ seed, preset });
        for (const fn of [threeLayersOk, massOk, shadingOk, flatBaseOk, perspectiveOk, noFilterOk]) {
          expect(fn(svg), `${preset} seed=${seed} ${fn.name}`).toBeNull();
        }
      }
    }
  });

  it('B. 任意参数极值组合 × 横竖屏：三层云都绘制、都有明暗与平底', () => {
    const ranges = def.controls.filter((c) => c.type === 'range');
    const combos: Array<Record<string, number>> = [{}];
    for (const c of ranges) {
      if (c.type !== 'range') continue;
      combos.push({ [c.key]: c.min }, { [c.key]: c.max });
    }
    combos.push({ bands: 1, scale: 0.6, spread: 0.3 }, { bands: 5, scale: 1.5, spread: 1 }, { bands: 1, scale: 1.5, spread: 1 });
    for (const params of combos)
      for (const [w, h] of [[2560, 1440], [1170, 2532], [5120, 1440]] as const)
        for (const seed of [2, 11]) {
          const svg = svgOf({ seed, w, h, params });
          const tag = `${w}×${h} ${JSON.stringify(params)} s${seed}`;
          expect(threeLayersOk(svg), tag).toBeNull();
          expect(shadingOk(svg), tag).toBeNull();
          expect(flatBaseOk(svg), tag).toBeNull();
          expect(noFilterOk(svg), tag).toBeNull();
        }
  });

  it('云塔不越出画布上缘（任何参数下都有天空留白）', () => {
    for (const params of [{ spread: 1, scale: 1.5 }, { spread: 1, bands: 5 }, {}])
      for (const [w, h] of [[2560, 1440], [1170, 2532]] as const)
        for (const seed of [1, 5, 9]) {
          const svg = svgOf({ seed, w, h, params });
          for (const L of layers(svg)) {
            const top = Math.min(...allCircles(L).map((c) => c.y - c.r));
            expect(top, `${w}×${h} ${JSON.stringify(params)} s${seed} 云顶冲出画布`).toBeGreaterThan(0);
          }
        }
  });

  it('体积 < 18KB、顶层节点 ≤ 60（含 4K、超宽、竖屏与全部极值）', () => {
    for (const [w, h] of [[1170, 2532], [2560, 1440], [3840, 2160], [5120, 1440]] as const)
      for (const params of [{}, { bands: 5, scale: 1, spread: 1 }, { bands: 5, scale: 1.5, spread: 1 }, { bands: 5, scale: 0.6, spread: 1 }])
        for (const preset of [undefined, 'storm'])
          for (let seed = 0; seed < 12; seed++) {
            const out = renderSVG(def, cfgOf({ seed, w, h, params, preset }), { skipBudget: true });
            const tag = `${w}×${h} ${JSON.stringify(params)} ${preset ?? ''} s${seed}`;
            expect(out.bytes, `${tag} 体积 ${out.bytes}B`).toBeLessThan(18 * 1024);
            expect(out.nodes, tag).toBeLessThanOrEqual(60);
          }
  });

  it('确定性 + seed 敏感', () => {
    expect(svgOf({ seed: 42 })).toBe(svgOf({ seed: 42 }));
    expect(svgOf({ seed: 7 })).not.toBe(svgOf({ seed: 999 }));
  });

  it('数据契约：pattern / 元件 / 控件 / preset id 与 tones 不变', () => {
    expect(def.id).toBe('cloud-bands');
    expect(def.tones).toEqual(['light']);
    expect(def.elements.map((e) => e.id)).toEqual(['sky', 'glow', 'cloud_hi', 'cloud_mid', 'cloud_low']);
    expect(def.controls.map((c) => c.key)).toEqual(['bands', 'scale', 'spread', 'glowX', 'glowY']);
    expect(def.presets.map((p) => p.id)).toEqual(['daybreak', 'storm', 'mint']);
    expect(Object.values(def.paletteSlots).flat().sort()).toEqual(def.elements.map((e) => e.id).sort());
  });
});

// ───────────────────────────── 变异自证 ─────────────────────────────

/**
 * 每条判定对「注入了对应缺陷的真实产物」必须翻红。
 * 若某条判定在变异下仍为 null，说明它是恒真的假绿，门禁形同虚设。
 */
describe('cloud-bands 门禁自证：注入缺陷 → 判定必须失败', () => {
  const base = svgOf({ seed: 7 });
  const mutate = (re: RegExp, to: string | ((...a: string[]) => string)) => base.replace(re, to as never);

  const MUTANTS: Array<[string, (s: string) => string | null, string]> = [
    ['天空变灰', skyOk, mutate(/stop-color="#1b55b8"/, 'stop-color="#555b66"')],
    ['天空上下颠倒（天顶浅）', skyOk, mutate(/stop-color="#cfe9f7"/, 'stop-color="#0a1a40"')],
    ['删掉一层云', threeLayersOk, (() => {
      const i = base.indexOf('<g clip-path="url(#');
      const j = base.indexOf('<g clip-path="url(#', i + 10);
      return base.slice(0, i) + base.slice(j);
    })()],
    ['泡半径统一（齿轮 / 泡泡纸）', massOk, base.replace(/ r="\d+"\/>/g, ' r="40"/>')],
    ['云塔压扁（香肠）', massOk, base.replace(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"\/>/g, (_m, x, y, r) => `<circle cx="${x}" cy="${Math.max(Number(y), 700)}" r="${r}"/>`)],
    ['拿掉受光体（剪影）', shadingOk, base.replace(/<use [^>]*\/>/g, '')],
    ['受光体朝下偏移（底部受光）', shadingOk, base.replace(/(<use [^>]*) y="-(\d+)"/g, '$1 y="$2"')],
    ['受光色与阴影同色（没有明暗）', shadingOk, (() => {
      const grads = gradients(base);
      let s = base;
      for (const L of layers(base)) {
        const bot = grads.get(L.fill)!.slice(-1)[0];
        s = s.replace(/(<use [^>]*fill=")#[0-9a-f]{6}"/g, `$1${bot}"`);
      }
      return s;
    })()],
    ['拿掉边缘高光', shadingOk, (() => {
      // 每团只留最后一个 use（受光体）
      return base.replace(/(<use href="#(\w+)"[^>]*\/>)(<use href="#\2"[^>]*\/>)/g, '$3');
    })()],
    ['去掉 clipPath（圆底）', flatBaseOk, base.replace(/<clipPath id="[^"]+"><rect[^>]*\/><\/clipPath>/g, '')],
    ['所有泡抬离云底（底部圆收、不平）', flatBaseOk, base.replace(/<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)"\/>/g, (_m, x, y, r) => `<circle cx="${x}" cy="${Number(y) - Number(r) - 5}" r="${r}"/>`)],
    ['远近云底颠倒', perspectiveOk, (() => {
      const hs = [...base.matchAll(/<clipPath id="[^"]+"><rect width="\d+" height="(\d+)"/g)].map((m) => m[1]);
      let i = 0;
      const rev = [...hs].reverse();
      return base.replace(/(<clipPath id="[^"]+"><rect width="\d+" height=")(\d+)"/g, (_m, a) => `${a}${rev[i++]}"`);
    })()],
    ['塞进 filter', noFilterOk, base.replace('<g transform=', '<g filter="url(#b-x)" transform=')],
  ];

  for (const [name, fn, mutant] of MUTANTS) {
    it(`${name} → ${fn.name} 翻红`, () => {
      expect(mutant, '变异未生效（正则没命中）').not.toBe(base);
      expect(fn(base), '原产物应通过').toBeNull();
      expect(fn(mutant), `判定 ${fn.name} 对「${name}」仍为通过 —— 假绿`).not.toBeNull();
    });
  }
});
