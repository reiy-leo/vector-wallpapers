/**
 * 百叶光影 —— L 建筑空间 / 单幅构图。
 *
 * 午后阳光穿过百叶窗，在墙上投出一块斜向的平行四边形光斑，内部被叶片切成一条条光带；
 * 窗前的盆栽枝叶也一并投在光斑里：近处的叶影清晰、远处的叶影更大更虚。
 *
 * ⭐ 结构：
 *   - 光斑、叶影全部画在「窗坐标」(0~1000 方格) 里，外层一个 `<g transform>` 把它投影到墙上
 *     （平移 → 旋转 → 斜切 → 缩放），于是光带与叶影的透视斜切天然一致；
 *   - 光带：一条 path，每条叶片缝一个矩形子路径；窗棂把每条光带切成左右两段；
 *   - 叶影：每层（近 / 远）一条 path，叶片 = 两段二次曲线；枝干一条描边 path；
 *     叶影用 clipPath 限制在光斑方格内（阴影只在有光的地方才看得见）；
 *   - 柔化：可选高斯模糊（api.blur），远层叶影模糊更重。
 * 动画（仅预览，cfg.animate 且「枝叶摇曳」打开）：叶影绕枝根轻微摆动，远近两层相位错开。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clamp, f1, op } from './_helpers';

const V = 1000;
const MAX_LEAVES = 70;

interface Leaf {
  x: number;
  y: number;
  a: number;
  len: number;
  wd: number;
}

const def: PatternDef = {
  id: 'blinds-shadow',
  name: '百叶光影',
  category: 'L-architecture',
  description: '阳光穿过百叶窗在墙上投下斜向光带，窗前盆栽的叶影一近一远落在光斑里。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'wall', label: '墙面', role: 'bg', paint: { type: 'solid', color: '#e4d4c1' }, opacity: 1, visible: true, configurable: true },
    {
      id: 'glow',
      label: '暖光晕',
      role: 'accent',
      paint: {
        type: 'radial',
        cx: 0.6,
        cy: 0.45,
        r: 0.65,
        stops: [
          { offset: 0, color: '#f7d6a4', opacity: 1 },
          { offset: 1, color: '#f7d6a4', opacity: 0 },
        ],
      },
      opacity: 0.45,
      visible: true,
      configurable: true,
    },
    { id: 'light', label: '光带', role: 'primary', paint: { type: 'solid', color: '#fbf0dc' }, opacity: 0.92, visible: true, configurable: true },
    { id: 'plant_far', label: '叶影 · 远', role: 'detail', paint: { type: 'solid', color: '#d3bfa8' }, opacity: 0.55, visible: true, configurable: true },
    { id: 'plant_near', label: '叶影 · 近', role: 'secondary', paint: { type: 'solid', color: '#c7b098' }, opacity: 0.85, visible: true, configurable: true },
  ],

  controls: [
    { key: 'slats', label: '叶片数', type: 'range', min: 8, max: 28, step: 1, default: 15 },
    { key: 'open', label: '透光比例', type: 'range', min: 0.3, max: 0.8, step: 0.05, default: 0.55 },
    { key: 'angle', label: '光线角度', type: 'range', min: -40, max: 40, step: 1, default: -24 },
    { key: 'softness', label: '柔化', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: 'foliage', label: '枝叶', type: 'range', min: 0.1, max: 1, step: 0.05, default: 0.6, heavy: true },
    { key: 'mullion', label: '窗棂', type: 'toggle', default: true },
    { key: 'sway', label: '枝叶摇曳', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'afternoon',
      label: '午后',
      elements: {
        wall: { paint: { type: 'solid', color: '#e4d4c1' } },
        light: { paint: { type: 'solid', color: '#fbf0dc' }, opacity: 0.92 },
        plant_far: { paint: { type: 'solid', color: '#d3bfa8' }, opacity: 0.55 },
        plant_near: { paint: { type: 'solid', color: '#c7b098' }, opacity: 0.85 },
      },
    },
    {
      id: 'sage-room',
      label: '鼠尾草',
      elements: {
        wall: { paint: { type: 'solid', color: '#c3cab6' } },
        glow: {
          paint: { type: 'radial', cx: 0.6, cy: 0.45, r: 0.65, stops: [{ offset: 0, color: '#efe6c2', opacity: 1 }, { offset: 1, color: '#efe6c2', opacity: 0 }] },
          opacity: 0.4,
        },
        light: { paint: { type: 'solid', color: '#f1efdc' }, opacity: 0.9 },
        plant_far: { paint: { type: 'solid', color: '#b0b8a1' }, opacity: 0.55 },
        plant_near: { paint: { type: 'solid', color: '#9fa88f' }, opacity: 0.85 },
      },
      params: { angle: 18, slats: 12 },
    },
    {
      id: 'golden-hour',
      label: '金色时刻',
      elements: {
        wall: { paint: { type: 'solid', color: '#c4876a' } },
        glow: {
          paint: { type: 'radial', cx: 0.62, cy: 0.5, r: 0.7, stops: [{ offset: 0, color: '#f0a96e', opacity: 1 }, { offset: 1, color: '#f0a96e', opacity: 0 }] },
          opacity: 0.5,
        },
        light: { paint: { type: 'solid', color: '#f5c58f' }, opacity: 0.9 },
        plant_far: { paint: { type: 'solid', color: '#b07257' }, opacity: 0.55 },
        plant_near: { paint: { type: 'solid', color: '#a2654c' }, opacity: 0.85 },
      },
      params: { angle: -32, slats: 18, open: 0.5, softness: 0.5 },
    },
    {
      id: 'moonlit',
      label: '月光',
      elements: {
        wall: { paint: { type: 'solid', color: '#1f2638' } },
        glow: {
          paint: { type: 'radial', cx: 0.6, cy: 0.45, r: 0.65, stops: [{ offset: 0, color: '#7c90c0', opacity: 1 }, { offset: 1, color: '#7c90c0', opacity: 0 }] },
          opacity: 0.22,
        },
        light: { paint: { type: 'solid', color: '#5a6a91' }, opacity: 0.75 },
        plant_far: { paint: { type: 'solid', color: '#232b3f' }, opacity: 0.6 },
        plant_near: { paint: { type: 'solid', color: '#1a2132' }, opacity: 0.9 },
      },
      params: { softness: 0.55, foliage: 0.75 },
    },
  ],

  paletteSlots: {
    bg: ['wall'],
    primary: ['light'],
    secondary: ['plant_near'],
    accent: ['glow'],
    detail: ['plant_far'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const slats = Math.round(clamp(params.slats, 8, 28, 15));
    const open = clamp(params.open, 0.3, 0.8, 0.55);
    const angle = clamp(params.angle, -40, 40, -24);
    const softness = clamp(params.softness, 0, 1, 0.35);
    const foliage = clamp(params.foliage, 0, 1, 0.6);
    const mullion = params.mullion === true;
    const sway = animate && params.sway === true;

    const wall = elements.get('wall')!;
    const glow = elements.get('glow')!;
    const light = elements.get('light')!;
    const far = elements.get('plant_far')!;
    const near = elements.get('plant_near')!;

    const parts: string[] = [rect(0, 0, W, H, { fill: wall.paintValue, 'fill-opacity': op(wall.opacity) })];
    if (glow.visible) parts.push(rect(0, 0, W, H, { fill: glow.paintValue, 'fill-opacity': op(glow.opacity) }));

    // ── 窗 → 墙 投影 ────────────────────────────────────────
    const L = Math.max(W, H);
    const pw = L * 0.74;
    const ph = pw * (H > W ? 1.25 : 0.9);
    const cx = W * (H > W ? 0.6 : 0.66);
    const cy = H * 0.5;
    const k = (v: number): string => (Math.round(v * 1e4) / 1e4).toString();
    const tf = `translate(${f1(cx)} ${f1(cy)})rotate(${f1(angle * 0.55)})skewX(${f1(-angle)})scale(${k(pw / V)} ${k(ph / V)})translate(-500 -500)`;

    // ── 光带 ────────────────────────────────────────────────
    const pitch = V / slats;
    const lh = pitch * open;
    const gap = mullion ? 22 : 0;
    const segs: Array<[number, number]> = mullion ? [[0, 500 - gap], [500 + gap, 500 - gap]] : [[0, V]];
    let ld = '';
    for (let i = 0; i < slats; i++) {
      const y = i * pitch + (pitch - lh) / 2;
      for (const [x0, w] of segs) ld += `M${f1(x0)} ${f1(y)}h${f1(w)}v${f1(lh)}h${f1(-w)}z`;
    }
    const sdLight = softness * 5;
    let inner = '';
    if (light.visible) {
      const o = op(light.opacity);
      inner += `<path d="${ld}" fill="${light.paintValue}"${o === undefined ? '' : ` fill-opacity="${o}"`}${sdLight > 0.2 ? ` filter="${api.blur(sdLight)}"` : ''}/>`;
    }

    // ── 叶影（窗坐标；枝从左下伸入）──────────────────────────
    const makePlant = (scale: number, ox: number, oy: number): { leaves: string; stems: string } => {
      const branches = Math.max(1, Math.round(1 + foliage * 3));
      const leaves: Leaf[] = [];
      let stems = '';
      for (let b = 0; b < 4; b++) {
        // 每枝固定消耗随机数，保证改「枝叶」时已存在的枝形不变
        const sx = -60 + rng() * 300;
        const sa = -1.15 + rng() * 0.6;
        const len = (520 + rng() * 380) * scale;
        const bend = (rng() - 0.5) * 0.9;
        const phase = rng();
        if (b >= branches) continue;
        let x = sx * scale + ox;
        let y = V + 40 + oy;
        let a = sa;
        const steps = 10;
        let d = `M${f1(x)} ${f1(y)}`;
        for (let i = 1; i <= steps; i++) {
          a += bend / steps;
          const nx = x + Math.cos(a) * (len / steps);
          const ny = y + Math.sin(a) * (len / steps);
          d += `L${f1(nx)} ${f1(ny)}`;
          const t = i / steps;
          if (t > 0.18) {
            const per = Math.round(1 + foliage * 1.4);
            for (let q = 0; q < per; q++) {
              const side = (i + q + (phase > 0.5 ? 1 : 0)) % 2 === 0 ? 1 : -1;
              const ll = (62 + 40 * Math.sin(t * 3.1)) * scale * (0.85 + ((i * 7 + q * 3) % 5) * 0.06);
              leaves.push({
                x: x + (nx - x) * (q + 0.5) / per,
                y: y + (ny - y) * (q + 0.5) / per,
                a: a + side * (0.75 + 0.25 * Math.sin(i + b)),
                len: ll,
                wd: ll * 0.36,
              });
            }
          }
          x = nx;
          y = ny;
        }
        // 梢头一片
        leaves.push({ x, y, a, len: 70 * scale, wd: 25 * scale });
        stems += d;
      }
      const kept = leaves.slice(0, MAX_LEAVES);
      let dl = '';
      for (const lf of kept) {
        const c = Math.cos(lf.a);
        const s = Math.sin(lf.a);
        const tx = lf.len * c;
        const ty = lf.len * s;
        const c1x = lf.len * 0.5 * c - lf.wd * s;
        const c1y = lf.len * 0.5 * s + lf.wd * c;
        const c2x = lf.len * 0.5 * c + lf.wd * s - tx;
        const c2y = lf.len * 0.5 * s - lf.wd * c - ty;
        dl += `M${f1(lf.x)} ${f1(lf.y)}q${f1(c1x)} ${f1(c1y)} ${f1(tx)} ${f1(ty)}q${f1(c2x)} ${f1(c2y)} ${f1(-tx)} ${f1(-ty)}`;
      }
      return { leaves: dl.replace(/ -/g, '-'), stems };
    };

    if (foliage > 0) {
      const farP = makePlant(1.35, -40, 60);
      const nearP = makePlant(1, 0, 0);
      const swayName = sway ? api.keyframes('vw-blsway', 'from{transform:rotate(-1.6deg)}to{transform:rotate(1.6deg)}') : '';
      const layer = (p: { leaves: string; stems: string }, e: typeof near, sd: number, sw: number, dur: number): string => {
        if (!e.visible) return '';
        const o = op(e.opacity);
        const body =
          `<path d="${p.leaves}"/>` +
          `<path d="${p.stems}" fill="none" stroke="${e.paintValue}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
        const anim = sway ? ` style="transform-box:fill-box;transform-origin:0 100%;animation:${swayName} ${dur}s ease-in-out infinite alternate"` : '';
        return `<g fill="${e.paintValue}"${o === undefined ? '' : ` opacity="${o}"`}${sd > 0.2 ? ` filter="${api.blur(sd)}"` : ''}${anim}>${body}</g>`;
      };
      const plants = layer(farP, far, 4 + softness * 10, 9, 5.3) + layer(nearP, near, softness * 3, 6, 4.1);
      if (plants !== '') {
        const clip = api.clip(`blinds-${cfg.seed}`, `<rect width="${V}" height="${V}"/>`);
        inner += `<g clip-path="${clip}">${plants}</g>`;
      }
    }

    if (inner !== '') parts.push(`<g transform="${tf}">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
