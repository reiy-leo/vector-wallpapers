/**
 * 紫藤 —— G 植物花卉 / 自顶部垂挂的花帘。
 *
 * 构图：画面顶部横贯两三根相互缠绕的藤枝（带小卷须），藤上垂下一串串紫藤花。
 * 每串是自上而下逐渐收窄的锥形花簇：小花（椭圆花瓣）沿螺旋排布，越往下越小、越稀，梢端是花苞；
 * 颜色从「花 · 顶」渐变到「花 · 梢」（上浓下淡），渐变强度可调。花串长短错落，
 * 前排花串之间夹着更短更淡的远排剪影，藤上垂着羽状复叶 → 有前后进深。
 *
 * ⭐ 体积：
 *   - 花串只在模块里生成 3 种「单位花串」几何（长 100，按 5 个颜色段拆成 5 条 path，无填色 → id 固定）；
 *     每次渲染再在 `<defs>` 里组一个带颜色的组合（id 带配色哈希，避免多张缩略图 id 串色），
 *     每串花 = 一个 `<use>`（缩放 / 旋转 / 镜像）。
 *   - 远排剪影直接复用无填色的颜色段 → 由外层 fill 继承「远花」色。
 *   - 全部几何在「短边 = 1000」的虚拟坐标里，外层 scale(q) 放大 → 体积与分辨率无关。
 * 动画（仅预览，cfg.animate 且「花串摆动」打开）：每串绕挂点做 ±1.6° 的钟摆式摆动，3 种周期错开。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampN, fo, fx, LEAF_SHAPES, leafPath, shortHash, tight } from './_helpers';

const V = 1000;
/** 颜色段数（上浓下淡）。 */
const BANDS = 5;
const VARIANTS = 2;

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 单位花串：挂点 (0,0)，向 +y 垂下，长 100。返回 BANDS 条 path（自上而下）。
 * 小花 = 一枚圆头水滴（基部朝花轴、圆头朝外下方），尺寸随高度递减。
 */
function raceme(seed: number): string[] {
  const r = mulberry(seed);
  const N = 54;
  const bands: Array<Array<{ z: number; x: number; y: number; d: string }>> = Array.from({ length: BANDS }, () => []);
  for (let i = 0; i < N; i++) {
    const t = Math.pow(i / (N - 1), 0.92);
    const y = 3 + 90 * t + (r() - 0.5) * 2;
    // 包络：顶部略收、上 1/4 最宽、向下收成尖
    const env = (10.5 * Math.pow(1 - t, 0.8) + 1.4) * Math.min(1, (t + 0.06) / 0.16);
    const phi = i * 2.39996 + r() * 0.5;
    const sx = Math.sin(phi);
    const x = sx * env * (0.75 + r() * 0.25);
    const sz = (4.6 - 2.7 * t) * (0.85 + r() * 0.3);
    const bud = t > 0.86;
    const a = Math.PI / 2 - sx * (bud ? 0.25 : 0.95) + (r() - 0.5) * 0.3;
    const len = sz * (bud ? 1.5 : 2.2);
    const w = sz * (bud ? 0.66 : 0.92);
    const c = Math.cos(a);
    const s = Math.sin(a);
    // 局部坐标 (u 沿 a，v 垂直) → 画布
    const bx = x - c * len * 0.35;
    const by = y - s * len * 0.35;
    const P = (u: number, v: number): string => `${fx(u * c - v * s)} ${fx(u * s + v * c)}`;
    // 回到基部的第二段用 s（首控制点 = 前段末控制点关于尖端的镜像，正好对称）
    const ex = Math.round(len * c * 10) / 10;
    const ey = Math.round(len * s * 10) / 10;
    const d = `c${P(len * 0.12, w)} ${P(len, w * 1.1)} ${fx(ex)} ${fx(ey)}s${P(-len * 0.88, -w)} ${fx(-ex)} ${fx(-ey)}`;
    const k = Math.min(BANDS - 1, Math.floor(t * BANDS));
    bands[k].push({ z: Math.cos(phi), x: Math.round(bx * 10) / 10, y: Math.round(by * 10) / 10, d });
  }
  // 段内：背面（z<0）先画；子路径起点用相对 m 串接
  return bands.map((list) => {
    let out = '';
    let px = 0;
    let py = 0;
    list.sort((p, q2) => p.z - q2.z).forEach((f, i) => {
      out += i === 0 ? `M${fx(f.x)} ${fx(f.y)}` : `m${fx(f.x - px)} ${fx(f.y - py)}`;
      out += f.d;
      px = f.x;
      py = f.y;
    });
    return tight(out);
  });
}

const RACEMES: string[][] = Array.from({ length: VARIANTS }, (_, v) => raceme(0x5eed + v * 977));

/** 单位羽状复叶：挂点 (0,0)，叶轴向 +y，长 100；5 对小叶 + 顶生小叶。 */
const LEAF: string = (() => {
  let d = 'M-1 0Q2.2 50 0.5 98L-0.5 98Q0.8 50 1 0z';
  const sh = { ...LEAF_SHAPES.laurel, w: 0.25 };
  for (let k = 0; k < 5; k++) {
    const t = 0.2 + k * 0.15;
    const y = 100 * t;
    const x = 1.6 * Math.sin(t * Math.PI) * 0.6;
    const len = 30 - k * 2.4;
    for (const side of [-1, 1]) {
      const a = Math.PI / 2 - side * (1.05 - k * 0.07);
      d += leafPath(x, y, a, len, sh);
    }
  }
  d += leafPath(0.4, 96, Math.PI / 2, 24, sh);
  return tight(d);
})();

function hex2rgb(h: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(h);
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mixHex(a: string, b: string, t: number): string {
  const A = hex2rgb(a);
  const B = hex2rgb(b);
  if (!A || !B) return t < 0.5 ? a : b;
  return `#${A.map((c, i) => Math.round(c + (B[i] - c) * t).toString(16).padStart(2, '0')).join('')}`;
}

const def: PatternDef = {
  id: 'wisteria',
  name: '紫藤',
  category: 'G-botanical',
  description: '缠绕的藤枝横贯画顶，一串串锥形紫藤花长短错落地垂下，花色上浓下淡，远排花影与羽状复叶衬出进深。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f1ede7' }, opacity: 1, visible: true, configurable: true },
    { id: 'haze', label: '远花', role: 'detail', paint: { type: 'solid', color: '#d6cce0' }, opacity: 1, visible: true, configurable: true },
    { id: 'leaf', label: '叶', role: 'detail', paint: { type: 'solid', color: '#8e9f78' }, opacity: 1, visible: true, configurable: true },
    { id: 'flower_top', label: '花 · 顶', role: 'primary', paint: { type: 'solid', color: '#6c5a9b' }, opacity: 1, visible: true, configurable: true },
    { id: 'flower_tip', label: '花 · 梢', role: 'secondary', paint: { type: 'solid', color: '#d8cdea' }, opacity: 1, visible: true, configurable: true },
    { id: 'vine', label: '藤枝', role: 'accent', paint: { type: 'solid', color: '#5a4a44' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '花串数量', type: 'range', min: 4, max: 14, step: 1, default: 8, heavy: true },
    { key: 'length', label: '花串长度', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.7 },
    { key: 'fade', label: '色彩渐变强度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.8 },
    { key: 'leafy', label: '叶量', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'sway', label: '花串摆动', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'dawn',
      label: '晨紫',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1ede7' } },
        haze: { paint: { type: 'solid', color: '#d6cce0' } },
        leaf: { paint: { type: 'solid', color: '#8e9f78' } },
        flower_top: { paint: { type: 'solid', color: '#6c5a9b' } },
        flower_tip: { paint: { type: 'solid', color: '#d8cdea' } },
        vine: { paint: { type: 'solid', color: '#5a4a44' } },
      },
    },
    {
      id: 'dusk',
      label: '暮藤',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f1c2a' } },
        haze: { paint: { type: 'solid', color: '#352f4a' } },
        leaf: { paint: { type: 'solid', color: '#34483a' } },
        flower_top: { paint: { type: 'solid', color: '#8b78c4' } },
        flower_tip: { paint: { type: 'solid', color: '#e2d8f1' } },
        vine: { paint: { type: 'solid', color: '#0f0d15' } },
      },
      params: { length: 0.75, fade: 0.9 },
    },
    {
      id: 'white',
      label: '白藤',
      elements: {
        bg: { paint: { type: 'solid', color: '#6d7b68' } },
        haze: { paint: { type: 'solid', color: '#7f8c79' } },
        leaf: { paint: { type: 'solid', color: '#4c5e46' } },
        flower_top: { paint: { type: 'solid', color: '#f6f3ec' } },
        flower_tip: { paint: { type: 'solid', color: '#c9d4ba' } },
        vine: { paint: { type: 'solid', color: '#36352f' } },
      },
      params: { count: 10, length: 0.55 },
    },
    {
      id: 'pink',
      label: '粉藤',
      elements: {
        bg: { paint: { type: 'solid', color: '#f4ece8' } },
        haze: { paint: { type: 'solid', color: '#ecd9dd' } },
        leaf: { paint: { type: 'solid', color: '#9aa786' } },
        flower_top: { paint: { type: 'solid', color: '#b9698d' } },
        flower_tip: { paint: { type: 'solid', color: '#f3d6e0' } },
        vine: { paint: { type: 'solid', color: '#5b4642' } },
      },
      params: { count: 7, length: 0.7, leafy: 0.35 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['flower_top'], secondary: ['flower_tip'], accent: ['vine'], detail: ['haze', 'leaf'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const countK = clampN(params.count, 4, 14, 8);
    const lenK = clampN(params.length, 0.3, 1, 0.62);
    const fade = clampN(params.fade, 0, 1, 0.8);
    const leafy = clampN(params.leafy, 0, 1, 0.5);
    const swaying = animate && params.sway === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const r0 = Math.round;

    const bg = elements.get('bg')!;
    const haze = elements.get('haze')!;
    const leafEl = elements.get('leaf')!;
    const top = elements.get('flower_top')!;
    const tip = elements.get('flower_tip')!;
    const vine = elements.get('vine')!;

    // ── 藤枝：2~3 根正弦叠加的曲线，相互缠绕 ─────────────────────
    const nV = Wv > V * 1.4 ? 3 : 2;
    const vines: Array<{ base: number; a1: number; f1: number; p1: number; a2: number; f2: number; p2: number; w: number }> = [];
    for (let k = 0; k < nV; k++) {
      vines.push({
        base: V * (0.045 + k * 0.025 + rng() * 0.02),
        a1: V * (0.022 + rng() * 0.018),
        f1: (Math.PI * 2) / (V * (0.55 + rng() * 0.35)),
        p1: rng() * Math.PI * 2,
        a2: V * (0.008 + rng() * 0.01),
        f2: (Math.PI * 2) / (V * (0.17 + rng() * 0.1)),
        p2: rng() * Math.PI * 2,
        w: V * (k === 0 ? 0.012 : k === 1 ? 0.008 : 0.006),
      });
    }
    const vy = (k: number, x: number): number => {
      const v = vines[k];
      return v.base + v.a1 * Math.sin(x * v.f1 + v.p1) + v.a2 * Math.sin(x * v.f2 + v.p2);
    };

    // ── 花串（前排）：沿宽度均匀分布 + 抖动，长短交替错落 ─────────────
    const nF = Math.max(3, r0((countK * Wv) / V));
    const maxLen = Math.min(Hv * 0.95, V * 1.6) * lenK;
    interface Rc {
      x: number;
      y: number;
      len: number;
      sx: number;
      rot: number;
      v: number;
      flip: boolean;
    }
    const front: Rc[] = [];
    for (let i = 0; i < nF; i++) {
      const x = ((i + 0.5 + (rng() - 0.5) * 0.7) / nF) * Wv;
      const k = Math.floor(rng() * nV) % nV;
      const longish = i % 2 === 0 ? 0.62 : 0.38;
      const len = maxLen * (longish + rng() * 0.4);
      front.push({
        x,
        y: vy(k, x) + V * 0.004,
        len,
        // 长花串（竖屏）横向收一点，免得过胖
        sx: (0.92 + rng() * 0.22) * Math.max(0.7, Math.min(1, (V * 0.8) / len)),
        rot: (rng() - 0.5) * 7,
        v: Math.floor(rng() * VARIANTS) % VARIANTS,
        flip: rng() < 0.5,
      });
    }
    // 远排：插在前排之间，更短、略高
    const back: Rc[] = [];
    const nB = r0(nF * 0.85);
    for (let i = 0; i < nB; i++) {
      const x = ((i + 0.05 + rng() * 0.9) / nB) * Wv;
      const len = maxLen * (0.3 + rng() * 0.45);
      back.push({ x, y: vy(nV - 1, x) - V * 0.01, len, sx: (0.9 + rng() * 0.2) * Math.max(0.7, Math.min(1, (V * 0.8) / len)), rot: (rng() - 0.5) * 6, v: Math.floor(rng() * VARIANTS) % VARIANTS, flip: rng() < 0.5 });
    }

    // ── 羽状复叶：挂在藤上，向两侧斜垂 ────────────────────────────
    const nL = r0(leafy * nF * 1.6);
    const leaves: Array<{ x: number; y: number; rot: number; s: number; flip: boolean }> = [];
    for (let i = 0; i < nL; i++) {
      const x = rng() * Wv;
      const k = Math.floor(rng() * nV) % nV;
      const side = rng() < 0.5 ? -1 : 1;
      leaves.push({ x, y: vy(k, x), rot: side * (25 + rng() * 45), s: (V * (0.13 + rng() * 0.08)) / 100, flip: side < 0 });
    }

    // ── 组装 ───────────────────────────────────────────────────
    const usedV = new Set([...front, ...back].map((r) => r.v));
    const flowersOn = top.visible || tip.visible;
    const colors: Array<{ c: string; o: number }> = [];
    for (let b = 0; b < BANDS; b++) {
      const t = (b / (BANDS - 1)) * fade;
      const tv = !top.visible ? 1 : !tip.visible ? 0 : t;
      colors.push({ c: mixHex(top.paintValue, tip.paintValue, tv), o: top.opacity + (tip.opacity - top.opacity) * tv });
    }
    const hash = shortHash(colors.map((c) => c.c + c.o).join('|'));

    let defs = '';
    for (const v of usedV) {
      RACEMES[v].forEach((d, b) => {
        if (d !== '') defs += `<path id="vwws-r${v}b${b}" d="${d}"/>`;
      });
      if (flowersOn) {
        defs += `<g id="vwws-c${v}${hash}">${RACEMES[v]
          .map((d, b) => (d === '' ? '' : `<use href="#vwws-r${v}b${b}" fill="${colors[b].c}"${colors[b].o < 1 ? ` fill-opacity="${fo(colors[b].o)}"` : ''}/>`))
          .join('')}</g>`;
      }
      if (haze.visible) defs += `<g id="vwws-s${v}">${RACEMES[v].map((d, b) => (d === '' ? '' : `<use href="#vwws-r${v}b${b}"/>`)).join('')}</g>`;
    }
    if (leafEl.visible && leaves.length > 0) defs += `<path id="vwws-l" d="${LEAF}"/>`;

    const tfR = (r: Rc): string => {
      const s = r.len / 100;
      const sx = s * r.sx * (r.flip ? -1 : 1);
      return `rotate(${r0(r.rot)})scale(${api.n(sx)} ${api.n(s)})`;
    };

    let inner = defs !== '' ? `<defs>${defs}</defs>` : '';
    if (haze.visible && back.length > 0) {
      inner += `<g fill="${haze.paintValue}" fill-opacity="${fo(haze.opacity)}">${back
        .map((r) => `<use href="#vwws-s${r.v}" transform="translate(${r0(r.x)} ${r0(r.y)})${tfR(r)}"/>`)
        .join('')}</g>`;
    }
    if (leafEl.visible && leaves.length > 0) {
      inner += `<g fill="${leafEl.paintValue}" fill-opacity="${fo(leafEl.opacity)}">${leaves
        .map((l) => `<use href="#vwws-l" transform="translate(${r0(l.x)} ${r0(l.y)})rotate(${r0(l.rot)})scale(${l.flip ? `${api.n(-l.s)} ` : ''}${api.n(l.s)})"/>`)
        .join('')}</g>`;
    }
    if (flowersOn && front.length > 0) {
      let fm = '';
      if (swaying) {
        const names = [0, 1, 2].map((k) => api.keyframes(`vw-wssway${k}`, `from{transform:rotate(-${1.2 + k * 0.3}deg)}to{transform:rotate(${1.2 + k * 0.3}deg)}`));
        front.forEach((r, i) => {
          const k = i % 3;
          const dur = [5.2, 6.4, 7.6][k];
          const delay = Math.round(((i * 1.37) % dur) * 10) / 10;
          fm +=
            `<g transform="translate(${r0(r.x)} ${r0(r.y)})"><g style="transform-origin:0 0;animation:${names[k]} ${dur}s ease-in-out${delay > 0 ? ` -${delay}s` : ''} infinite alternate">` +
            `<use href="#vwws-c${r.v}${hash}" transform="${tfR(r)}"/></g></g>`;
        });
      } else {
        fm = front.map((r) => `<use href="#vwws-c${r.v}${hash}" transform="translate(${r0(r.x)} ${r0(r.y)})${tfR(r)}"/>`).join('');
      }
      inner += `<g>${fm}</g>`;
    }

    if (vine.visible) {
      // 藤：每根一条折线（步长 ~28），线宽各异；末端伸出画外
      const step = V * 0.028;
      let vm = '';
      vines.forEach((v, k) => {
        let d = '';
        for (let x = -step; x <= Wv + step; x += step) d += `${d === '' ? 'M' : 'L'}${r0(x)} ${r0(vy(k, x))}`;
        vm += `<path d="${tight(d)}" stroke-width="${fx(v.w)}"/>`;
      });
      // 卷须：几处小螺旋（三段递减圆弧）
      let td = '';
      const nT = r0(Wv / (V * 0.35));
      for (let i = 0; i < nT; i++) {
        const x = ((i + 0.3 + rng() * 0.4) / nT) * Wv;
        const k = Math.floor(rng() * nV) % nV;
        const y = vy(k, x);
        const R = V * (0.012 + rng() * 0.008);
        const dir = rng() < 0.5 ? 1 : 0;
        const sgn = dir ? 1 : -1;
        td += `M${r0(x)} ${r0(y)}q${fx(sgn * R)} ${fx(R * 0.4)} ${fx(sgn * R * 1.4)} ${fx(R * 1.8)}a${fx(R)} ${fx(R)} 0 1 ${dir} ${fx(-sgn * R * 1.3)} ${fx(R * 0.3)}a${fx(R * 0.6)} ${fx(R * 0.6)} 0 1 ${dir} ${fx(sgn * R * 0.7)} ${fx(-R * 0.4)}`;
      }
      if (td !== '') vm += `<path d="${tight(td)}" stroke-width="${fx(V * 0.0028)}"/>`;
      inner += `<g fill="none" stroke="${vine.paintValue}" stroke-opacity="${fo(vine.opacity)}" stroke-linecap="round" stroke-linejoin="round">${vm}</g>`;
    }

    return {
      body: rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) + `<g transform="scale(${q})">${inner}</g>`,
    };
  },
};

export default def;
