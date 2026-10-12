/**
 * 孟菲斯碎片 —— M 设计流派。
 *
 * 与 `memphis-grid`（平铺网格、每格一个小形、无描边）刻意拉开：
 *   - **整幅单张构图，不平铺**：大小悬殊的「主角」碎片在全画面泊松式散布（seeded），
 *     另撒一层细碎纸屑（短划 / 圆点），画面有主次与节奏；
 *   - **粗墨描边 + 错位实色投影**：80 年代孟菲斯招牌的「贴纸」质感；
 *   - **网点 / 斜纹色域**：背后 2~3 块大的网点或斜条纹「材质面」，对应孟菲斯的层压板纹理。
 *
 * ⭐ 体积策略：
 *   - 全部几何画在「短边 = 1000」的虚拟坐标系，外层一个 scale → 体积与分辨率无关、可用整数坐标；
 *   - 每个主角碎片的几何只写一次（body 内 `<defs>` 的 `<path id>`），投影层与本体层各 `<use>` 一次；
 *     几何不带颜色，颜色由所在 `<g>` 继承 → 每块碎片只按颜色分组，`<use>` 约 20B；
 *   - 纸屑是一条 path：零长度子路径 + 圆头描边 = 圆点，短线段 = 短划。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampNum, op, ri, shortHash } from './_helpers';

const V = 1000;

interface Piece {
  kind: number;
  x: number;
  y: number;
  s: number;
  a: number;
}

/** 6 种主角碎片 → 所属元件：0/1 波浪线、锯齿（描边型）→ shape_a；2/3 三角、半圆 → shape_b；4/5 圆、环 → shape_c。 */
const KIND_GROUP = [0, 0, 1, 1, 2, 2];

const def: PatternDef = {
  id: 'memphis-confetti',
  name: '孟菲斯碎片',
  category: 'M-movement',
  description: '粗墨描边、错位投影的波浪线、三角、圆环与锯齿在整幅画面上散落，背后衬着网点与斜纹色域。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f3ece0' }, opacity: 1, visible: true, configurable: true },
    { id: 'field', label: '网点 / 斜纹', role: 'detail', paint: { type: 'solid', color: '#dcc3a8' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_a', label: '波浪 / 锯齿', role: 'primary', paint: { type: 'solid', color: '#3f8f9c' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_b', label: '三角 / 半圆', role: 'secondary', paint: { type: 'solid', color: '#e08a8f' }, opacity: 1, visible: true, configurable: true },
    { id: 'shape_c', label: '圆 / 环', role: 'accent', paint: { type: 'solid', color: '#e9be55' }, opacity: 1, visible: true, configurable: true },
    { id: 'confetti', label: '纸屑', role: 'accent', paint: { type: 'solid', color: '#6a5f9e' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'ink', label: '描边 / 投影', role: 'detail', paint: { type: 'solid', color: '#242226' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '碎片数量', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.6, heavy: true },
    { key: 'scale', label: '碎片尺寸', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'confetti', label: '纸屑密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'shadow', label: '投影偏移', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'outline', label: '墨线描边', type: 'toggle', default: true },
    { key: 'fields', label: '网点色域', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'milano',
      label: '米兰 1981',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3ece0' } },
        field: { paint: { type: 'solid', color: '#dcc3a8' } },
        shape_a: { paint: { type: 'solid', color: '#3f8f9c' } },
        shape_b: { paint: { type: 'solid', color: '#e08a8f' } },
        shape_c: { paint: { type: 'solid', color: '#e9be55' } },
        confetti: { paint: { type: 'solid', color: '#6a5f9e' }, opacity: 0.9 },
        ink: { paint: { type: 'solid', color: '#242226' } },
      },
    },
    {
      id: 'sorbet',
      label: '雪葩',
      elements: {
        bg: { paint: { type: 'solid', color: '#f7efee' } },
        field: { paint: { type: 'solid', color: '#e8cfd2' } },
        shape_a: { paint: { type: 'solid', color: '#8aa4d6' } },
        shape_b: { paint: { type: 'solid', color: '#f0a99f' } },
        shape_c: { paint: { type: 'solid', color: '#a9d3c0' } },
        confetti: { paint: { type: 'solid', color: '#c08bb8' }, opacity: 0.85 },
        ink: { paint: { type: 'solid', color: '#4a4560' } },
      },
      params: { outline: false, shadow: 0.35 },
    },
    {
      id: 'terrazzo-night',
      label: '夜场',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f2128' } },
        field: { paint: { type: 'solid', color: '#3a3d4a' } },
        shape_a: { paint: { type: 'solid', color: '#62b5c0' } },
        shape_b: { paint: { type: 'solid', color: '#e4848f' } },
        shape_c: { paint: { type: 'solid', color: '#e6c25e' } },
        confetti: { paint: { type: 'solid', color: '#b9a6e8' }, opacity: 0.85 },
        ink: { paint: { type: 'solid', color: '#0e0f13' } },
      },
      params: { outline: false, shadow: 0.6 },
    },
    {
      id: 'earth',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#ece2d0' } },
        field: { paint: { type: 'solid', color: '#d3bf9f' } },
        shape_a: { paint: { type: 'solid', color: '#5f7a5a' } },
        shape_b: { paint: { type: 'solid', color: '#c0674a' } },
        shape_c: { paint: { type: 'solid', color: '#d6a24a' } },
        confetti: { paint: { type: 'solid', color: '#3f4f6b' }, opacity: 0.8 },
        ink: { paint: { type: 'solid', color: '#3a2c25' } },
      },
      params: { density: 0.5, scale: 1.2 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['shape_a'],
    secondary: ['shape_b'],
    accent: ['shape_c', 'confetti'],
    detail: ['field', 'ink'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, seed } = cfg;
    const density = clampNum(params.density, 0.1, 1);
    const scale = clampNum(params.scale, 0.3, 2);
    const confettiAmt = clampNum(params.confetti, 0, 1);
    const shadowAmt = clampNum(params.shadow, 0, 1);
    const outline = params.outline === true;
    const fields = params.fields === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const areaK = (Wv * Hv) / (V * V);

    const E = (id: string) => elements.get(id)!;
    const bg = E('bg');
    const field = E('field');
    const ink = E('ink');
    const fillOf = [E('shape_a'), E('shape_b'), E('shape_c')];
    const conf = E('confetti');

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';

    // ── 1. 网点 / 斜纹色域（2~3 块大面，压在最底层）───────────────
    // 随机数消耗与开关无关：先抽，后决定画不画 → 切换开关不改变碎片布局
    const fieldSpecs: Array<{ kind: number; x: number; y: number; r: number; a: number; tex: number }> = [];
    const nField = 2 + (areaK > 1.6 ? 1 : 0);
    for (let i = 0; i < nField; i++) {
      fieldSpecs.push({
        kind: Math.floor(rng() * 3),
        x: Wv * ((i + 0.25 + rng() * 0.5) / nField),
        y: Hv * (0.2 + rng() * 0.6),
        r: V * (0.19 + rng() * 0.09),
        a: Math.round(rng() * 4) * 15 - 30,
        tex: i % 2,
      });
    }
    if (fields && field.visible) {
      const dotP = 22;
      const dots = api.tile({
        key: 'mcf-dots',
        w: dotP,
        h: dotP,
        content: `<circle cx="${dotP / 2}" cy="${dotP / 2}" r="5.2" fill="${field.paintValue}"/>`,
      });
      const stripes = api.tile({
        key: 'mcf-stripes',
        w: 20,
        h: 20,
        content: `<rect width="8" height="20" fill="${field.paintValue}"/>`,
        transform: 'rotate(45)',
      });
      let fm = '';
      for (const f of fieldSpecs) {
        const r = f.r;
        let d: string;
        if (f.kind === 0) d = `M${ri(-r)} 0a${ri(r)} ${ri(r)} 0 1 0 ${ri(2 * r)} 0a${ri(r)} ${ri(r)} 0 1 0 ${ri(-2 * r)} 0z`;
        else if (f.kind === 1) d = `M${ri(-r)} ${ri(-r * 0.7)}h${ri(2 * r)}v${ri(1.4 * r)}h${ri(-2 * r)}z`;
        else d = `M${ri(-r * 1.3)} ${ri(r * 0.45)}l${ri(r * 0.5)} ${ri(-r * 0.9)}h${ri(r * 2.1)}l${ri(-r * 0.5)} ${ri(r * 0.9)}z`;
        fm += `<path d="${d}" fill="${f.tex === 0 ? dots : stripes}" transform="translate(${ri(f.x)} ${ri(f.y)})rotate(${f.a})"/>`;
      }
      inner += `<g fill-opacity="${op(field.opacity)}">${fm}</g>`;
    }

    // ── 2. 主角碎片：泊松式拒绝采样 ───────────────────────────────
    const target = Math.max(3, Math.round(density * 11 * areaK));
    const base = V * 0.062 * scale;
    const pieces: Piece[] = [];
    for (let tries = 0; tries < target * 30 && pieces.length < target; tries++) {
      const big = rng() < 0.18 ? 1.6 : 1;
      const s = base * (0.6 + rng() * 0.6) * big;
      const x = s * 1.6 + rng() * (Wv - s * 3.2);
      const y = s * 1.6 + rng() * (Hv - s * 3.2);
      const ok = pieces.every((p) => Math.hypot(p.x - x, p.y - y) > (p.s + s) * 1.85);
      const kind = Math.floor(rng() * 6);
      const a = Math.round(rng() * 24) * 15;
      if (!ok) continue;
      pieces.push({ kind, x, y, s, a });
    }
    // 前三块依次落到 A/B/C 三组 → 三个元件必然出现，改色 100% 命中
    for (let i = 0; i < Math.min(3, pieces.length); i++) {
      if (KIND_GROUP[pieces[i].kind] !== i) pieces[i].kind = i * 2 + (pieces[i].kind % 2);
    }

    const geom = (p: Piece): string => {
      const s = p.s;
      switch (p.kind) {
        case 0: {
          // 波浪线：4 个半波
          const L = s * 3.2;
          const st = L / 4;
          let d = `M${ri(-L / 2)} 0`;
          for (let i = 0; i < 4; i++) d += `q${ri(st / 2)} ${ri((i % 2 ? 1 : -1) * s * 0.75)} ${ri(st)} 0`;
          return `<path d="${d}" fill="none" stroke-width="${ri(s * 0.24)}" stroke-linecap="round"/>`;
        }
        case 1: {
          // 锯齿
          const L = s * 3.2;
          const st = L / 4;
          let d = `M${ri(-L / 2)} ${ri(s * 0.32)}`;
          for (let i = 0; i < 4; i++) d += `l${ri(st / 2)} ${ri(-s * 0.64)}l${ri(st / 2)} ${ri(s * 0.64)}`;
          return `<path d="${d}" fill="none" stroke-width="${ri(s * 0.2)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        }
        case 2: // 三角
          return `<path d="M0 ${ri(-s * 1.05)}L${ri(s * 0.95)} ${ri(s * 0.6)}H${ri(-s * 0.95)}z"/>`;
        case 3: // 半圆
          return `<path d="M${ri(-s)} ${ri(s * 0.35)}a${ri(s)} ${ri(s)} 0 0 1 ${ri(2 * s)} 0z"/>`;
        case 4: // 实心圆
          return `<circle r="${ri(s * 0.8)}"/>`;
        default: {
          // 圆环（evenodd 填充 → 描边同时勾内外两圈）
          const R = s * 0.9;
          const r = s * 0.48;
          return `<path fill-rule="evenodd" d="M${ri(-R)} 0a${ri(R)} ${ri(R)} 0 1 0 ${ri(2 * R)} 0a${ri(R)} ${ri(R)} 0 1 0 ${ri(-2 * R)} 0zM${ri(-r)} 0a${ri(r)} ${ri(r)} 0 1 0 ${ri(2 * r)} 0a${ri(r)} ${ri(r)} 0 1 0 ${ri(-2 * r)} 0z"/>`;
        }
      }
    };

    const pid = `mcf${shortHash(`${seed}|${W}x${H}|${density}|${scale}`)}`;
    let defs = '';
    const groups: string[][] = [[], [], []];
    const allUses: string[] = [];
    pieces.forEach((p, i) => {
      const geo = geom(p);
      // 把 transform 塞进几何本身：<path …/> → <path transform=… id=…/>
      const tagged = geo.replace(/^<(\w+)/, `<$1 id="${pid}${i}" transform="translate(${ri(p.x)} ${ri(p.y)})rotate(${p.a})"`);
      defs += tagged;
      const u = `<use href="#${pid}${i}"/>`;
      groups[KIND_GROUP[p.kind]].push(u);
      if (fillOf[KIND_GROUP[p.kind]].visible) allUses.push(u);
    });
    if (defs !== '') inner += `<defs>${defs}</defs>`;

    const ow = Math.max(2, base * 0.085);
    // ── 3. 错位投影 ──────────────────────────────────────────────
    const off = base * 0.28 * shadowAmt;
    if (ink.visible && off > 0.5 && allUses.length > 0) {
      inner += `<g fill="${ink.paintValue}" stroke="${ink.paintValue}" stroke-width="${outline ? ri(ow) : 0}" opacity="${op(ink.opacity)}" transform="translate(${ri(off)} ${ri(off)})">${allUses.join('')}</g>`;
    }

    // ── 4. 本体：描边型（A）/ 填充型（B、C）─────────────────────
    const a = fillOf[0];
    if (a.visible && groups[0].length > 0) {
      inner += `<g stroke="${a.paintValue}" stroke-opacity="${op(a.opacity)}">${groups[0].join('')}</g>`;
    }
    const strokeAttr = outline && ink.visible ? ` stroke="${ink.paintValue}" stroke-width="${ri(ow)}" stroke-linejoin="round" stroke-opacity="${op(ink.opacity)}"` : '';
    for (const gi of [1, 2]) {
      const e = fillOf[gi];
      if (!e.visible || groups[gi].length === 0) continue;
      inner += `<g fill="${e.paintValue}" fill-opacity="${op(e.opacity)}"${strokeAttr}>${groups[gi].join('')}</g>`;
    }

    // ── 5. 纸屑：圆点 + 短划 ─────────────────────────────────────
    const nConf = Math.round(confettiAmt * 70 * areaK);
    let cd = '';
    let px = 0;
    let py = 0;
    for (let i = 0; i < nConf; i++) {
      const x = Math.round(rng() * Wv);
      const y = Math.round(rng() * Hv);
      const t = rng();
      const ang = rng() * Math.PI;
      const len = V * (0.012 + rng() * 0.014) * scale;
      if (pieces.some((p) => Math.hypot(p.x - x, p.y - y) < p.s * 1.7)) continue;
      cd += `m${x - px} ${y - py}`;
      if (t < 0.45) cd += 'h0';
      else cd += `l${ri(Math.cos(ang) * len)} ${ri(Math.sin(ang) * len)}`;
      // 下一段相对坐标起点 = 本段终点
      px = x + (t < 0.45 ? 0 : Math.round(Math.cos(ang) * len));
      py = y + (t < 0.45 ? 0 : Math.round(Math.sin(ang) * len));
    }
    if (conf.visible && cd !== '') {
      inner += path(`M0 0${cd}`, {
        fill: 'none',
        stroke: conf.paintValue,
        'stroke-opacity': conf.opacity,
        'stroke-width': ri(V * 0.009 * scale),
        'stroke-linecap': 'round',
      });
    }

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
