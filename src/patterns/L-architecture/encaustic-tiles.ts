/**
 * 水泥花砖 —— L 建筑空间 / 平铺。
 *
 * 地中海 / 南洋老屋的水泥拼花砖：每块砖本身是四分（D4）对称图案，
 * 砖角、砖边上的「四分之一 / 二分之一」图形与相邻砖拼合，铺开后在砖缝处长出第二层图案
 * （角圆拼成整圆、边上半菱拼成菱形、角叶拼成十字花）。
 *
 * ⭐ 结构 / 体积：
 *   - 砖面在 0~100 的「砖坐标」里设计，`api.tile()` 用 `patternTransform` 统一缩放 / 旋转，
 *     几何字节数与分辨率、砖块大小无关；图形只设计一份，按 90° 旋转生成四份。
 *   - 每种颜色一条 path（底 / 主纹 / 次纹 / 点缀 / 砖缝），顶层节点恒定。
 *   - 「棋盘换色」把 2×2 块砖装进一个单元，对角两块主次色互换。
 *   - 砖缝只画每块砖的左、上两条边：右 / 下由相邻砖的左 / 上边补齐，缝宽处处一致。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clamp, f, op } from './_helpers';

type Pt = [number, number];
/** 简易路径：M/L/C 的绝对坐标 + 圆。 */
type Seg = ['M', Pt] | ['L', Pt] | ['C', Pt, Pt, Pt] | ['Z'] | ['O', Pt, number];

const rotP = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const x = p[0] - 50;
  const y = p[1] - 50;
  return [50 + x * c - y * s, 50 + x * s + y * c];
};

function segsToD(segs: Seg[], tx: (p: Pt) => Pt): string {
  let d = '';
  const P = (p: Pt): string => {
    const q = tx(p);
    return `${f(q[0])} ${f(q[1])}`;
  };
  for (const s of segs) {
    if (s[0] === 'M') d += `M${P(s[1])}`;
    else if (s[0] === 'L') d += `L${P(s[1])}`;
    else if (s[0] === 'C') d += `C${P(s[1])} ${P(s[2])} ${P(s[3])}`;
    else if (s[0] === 'Z') d += 'Z';
    else {
      const [cx, cy] = tx(s[1]);
      const r = s[2];
      d += `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0`;
    }
  }
  return d;
}

/** 绕砖心按 step 度重复 n 份。 */
function rep(segs: Seg[], n = 4, step = 90, offset = 0): string {
  let d = '';
  for (let k = 0; k < n; k++) d += segsToD(segs, (p) => rotP(p, offset + k * step));
  return d;
}

const leaf = (from: Pt, to: Pt, wk: number): Seg[] => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const nx = -dy * wk;
  const ny = dx * wk;
  const a: Pt = [from[0] + dx * 0.3 + nx, from[1] + dy * 0.3 + ny];
  const b: Pt = [from[0] + dx * 0.75 + nx * 0.8, from[1] + dy * 0.75 + ny * 0.8];
  const a2: Pt = [from[0] + dx * 0.75 - nx * 0.8, from[1] + dy * 0.75 - ny * 0.8];
  const b2: Pt = [from[0] + dx * 0.3 - nx, from[1] + dy * 0.3 - ny];
  return [['M', from], ['C', a, b, to], ['C', a2, b2, from], ['Z']];
};
const polyS = (pts: Pt[]): Seg[] => [['M', pts[0]], ...pts.slice(1).map((p) => ['L', p] as Seg), ['Z']];

interface Layers {
  primary: string;
  secondary: string;
  accent: string;
}

function design(kind: string): Layers {
  if (kind === 'lattice') {
    const outer: Pt[] = [[50, 7], [93, 50], [50, 93], [7, 50]];
    const inner: Pt[] = [[50, 17], [83, 50], [50, 83], [17, 50]];
    return {
      // 菱形宽带 + 中心方块（挖菱形）
      primary: segsToD(polyS(outer), (p) => p) + segsToD(polyS(inner), (p) => p),
      secondary:
        segsToD(polyS([[34, 34], [66, 34], [66, 66], [34, 66]]), (p) => p) +
        segsToD(polyS([[50, 39], [61, 50], [50, 61], [39, 50]]), (p) => p) +
        rep(polyS([[0, 0], [17, 0], [0, 17]])) +
        rep(polyS([[41, 0], [50, 4], [59, 0]])),
      accent: segsToD([['O', [50, 50], 4.5]], (p) => p) + rep([['O', [50, 26], 3]]) + rep([['O', [9, 9], 2.6]]),
    };
  }
  if (kind === 'quatrefoil') {
    const star: Pt[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * 45 - 90) * (Math.PI / 180);
      const rr = k % 2 === 0 ? 13 : 4.5;
      star.push([50 + Math.cos(a) * rr, 50 + Math.sin(a) * rr]);
    }
    return {
      primary: rep([['O', [50, 33.5], 16.5]]),
      secondary:
        rep(leaf([0, 0], [23, 23], 0.28)) +
        rep([['O', [50, 0], 8]]) +
        segsToD([['O', [50, 50], 26]], (p) => p) +
        segsToD([['O', [50, 50], 24]], (p) => p),
      accent: segsToD(polyS(star), (p) => p) + rep([['O', [50, 4], 2.4]]) + rep([['O', [14, 14], 2.2]]),
    };
  }
  // rosette：八瓣花 + 圆环 + 角圆 + 边菱
  const bigPetal = leaf([50, 45], [50, 17], 0.24);
  const smallPetal = leaf([50, 45], [50, 27], 0.26);
  return {
    primary: rep(bigPetal) + rep([['O', [0, 0], 14]]),
    secondary:
      rep(smallPetal, 4, 90, 45) +
      segsToD([['O', [50, 50], 37.5]], (p) => p) +
      segsToD([['O', [50, 50], 35]], (p) => p) +
      rep(polyS([[42, 0], [50, 8], [58, 0]])),
    accent: segsToD([['O', [50, 50], 5]], (p) => p) + rep([['O', [0, 0], 6]]) + rep([['O', [76.5, 23.5], 2.4]]),
  };
}

const def: PatternDef = {
  id: 'encaustic-tiles',
  name: '水泥花砖',
  category: 'L-architecture',
  description: '四分对称的水泥拼花砖平铺，砖角与砖边的半图形在相邻砖之间拼出第二层图案。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '砖底', role: 'bg', paint: { type: 'solid', color: '#efe6d6' }, opacity: 1, visible: true, configurable: true },
    { id: 'primary', label: '主纹', role: 'primary', paint: { type: 'solid', color: '#335c5e' }, opacity: 1, visible: true, configurable: true },
    { id: 'secondary', label: '次纹', role: 'secondary', paint: { type: 'solid', color: '#c49a68' }, opacity: 1, visible: true, configurable: true },
    { id: 'accent', label: '点缀', role: 'accent', paint: { type: 'solid', color: '#a9584a' }, opacity: 1, visible: true, configurable: true },
    { id: 'grout', label: '砖缝', role: 'detail', paint: { type: 'solid', color: '#d6cbb9' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '砖块数', type: 'range', min: 3, max: 12, step: 1, default: 6, heavy: true },
    {
      key: 'design',
      label: '花样',
      type: 'select',
      default: 'rosette',
      options: [
        { value: 'rosette', label: '八瓣花' },
        { value: 'lattice', label: '菱格' },
        { value: 'quatrefoil', label: '四叶' },
      ],
    },
    { key: 'checker', label: '棋盘换色', type: 'toggle', default: false },
    { key: 'border', label: '砖边框线', type: 'toggle', default: false },
    { key: 'grout', label: '砖缝宽', type: 'range', min: 0, max: 3, step: 0.25, default: 1 },
    { key: 'diagonal', label: '斜铺 45°', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'havana',
      label: '哈瓦那',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe6d6' } },
        primary: { paint: { type: 'solid', color: '#335c5e' } },
        secondary: { paint: { type: 'solid', color: '#c49a68' } },
        accent: { paint: { type: 'solid', color: '#a9584a' } },
        grout: { paint: { type: 'solid', color: '#d6cbb9' } },
      },
    },
    {
      id: 'lisbon',
      label: '里斯本蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1eee6' } },
        primary: { paint: { type: 'solid', color: '#3d5c7e' } },
        secondary: { paint: { type: 'solid', color: '#a3b7ca' } },
        accent: { paint: { type: 'solid', color: '#c8a35f' } },
        grout: { paint: { type: 'solid', color: '#dcd7cc' } },
      },
      params: { design: 'quatrefoil', border: true },
    },
    {
      id: 'terracotta',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#ead9c5' } },
        primary: { paint: { type: 'solid', color: '#9c5440' } },
        secondary: { paint: { type: 'solid', color: '#d1a27c' } },
        accent: { paint: { type: 'solid', color: '#46513f' } },
        grout: { paint: { type: 'solid', color: '#cdb8a1' } },
      },
      params: { design: 'lattice', checker: true },
    },
    {
      id: 'noir',
      label: '墨砖',
      elements: {
        bg: { paint: { type: 'solid', color: '#23272c' } },
        primary: { paint: { type: 'solid', color: '#c8b897' } },
        secondary: { paint: { type: 'solid', color: '#56616a' } },
        accent: { paint: { type: 'solid', color: '#a87a5c' } },
        grout: { paint: { type: 'solid', color: '#16191c' } },
      },
      params: { diagonal: true, count: 7 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['primary'],
    secondary: ['secondary'],
    accent: ['accent'],
    detail: ['grout'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(clamp(params.count, 3, 12, 6));
    const kind = params.design === 'lattice' || params.design === 'quatrefoil' ? params.design : 'rosette';
    const checker = params.checker === true;
    const border = params.border === true;
    const groutW = clamp(params.grout, 0, 3, 1);
    const diagonal = params.diagonal === true;

    const bg = elements.get('bg')!;
    const pri = elements.get('primary')!;
    const sec = elements.get('secondary')!;
    const acc = elements.get('accent')!;
    const grout = elements.get('grout')!;

    const L = design(kind);
    const frameD = border
      ? segsToD(polyS([[3, 3], [97, 3], [97, 97], [3, 97]]), (p) => p) + segsToD(polyS([[4.6, 4.6], [95.4, 4.6], [95.4, 95.4], [4.6, 95.4]]), (p) => p)
      : '';

    const fillAttr = (e: { paintValue: string; opacity: number }): string => {
      const o = op(e.opacity);
      return ` fill="${e.paintValue}"${o === undefined ? '' : ` fill-opacity="${o}"`}`;
    };
    /** 一块砖：swap 时主次色互换。 */
    const brick = (swap: boolean, dx: number, dy: number): string => {
      const pE = swap ? sec : pri;
      const sE = swap ? pri : sec;
      const g = (d: string, e: typeof pri, rule?: boolean): string =>
        d === '' || !e.visible ? '' : `<path d="${d}"${fillAttr(e)}${rule ? ' fill-rule="evenodd"' : ''}/>`;
      const inner = g(frameD, sE, true) + g(L.secondary, sE, true) + g(L.primary, pE, kind === 'lattice') + g(L.accent, acc);
      return dx === 0 && dy === 0 ? inner : `<g transform="translate(${dx} ${dy})">${inner}</g>`;
    };

    const span = checker ? 200 : 100;
    let content = '';
    if (bg.visible) content += `<rect width="${span}" height="${span}"${fillAttr(bg)}/>`;
    content += brick(false, 0, 0);
    if (checker) content += brick(true, 100, 0) + brick(true, 0, 100) + brick(false, 100, 100);
    if (grout.visible && groutW > 0) {
      let d = '';
      for (let k = 0; k < span; k += 100) d += `M${k} 0V${span}M0 ${k}H${span}`;
      const o = op(grout.opacity);
      content += `<path d="${d}" fill="none" stroke="${grout.paintValue}" stroke-width="${f(groutW * 2)}"${o === undefined ? '' : ` stroke-opacity="${o}"`}/>`;
    }

    const T = Math.max(W, H) / count;
    const sc = (Math.round((T / 100) * 1e4) / 1e4).toString();
    const transform = `translate(${f(W / 2)} ${f(H / 2)})${diagonal ? 'rotate(45)' : ''}scale(${sc})`;
    const ref = api.tile({ key: `enc-${kind}-${checker ? 1 : 0}-${border ? 1 : 0}-${f(groutW)}`, w: span, h: span, content, transform });

    const parts: string[] = [];
    // 兜底底色（砖底隐藏时不透出黑）
    if (!bg.visible) parts.push(rect(0, 0, W, H, { fill: grout.paintValue }));
    parts.push(rect(0, 0, W, H, { fill: ref }));
    return { body: parts.join('') };
  },
};

export default def;
