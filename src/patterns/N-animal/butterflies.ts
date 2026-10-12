/**
 * 蝴蝶 —— N 动物形象。
 *
 * 蝴蝶 = 前翅（主色）+ 后翅（次色）+ 翅斑（强调色）+ 身体与触角（细节色），两翼由右翼镜像得到。
 * 两种翅形：圆翅蛱蝶 / 带尾突的凤蝶，可单选或混排；「交替配色」打开时一半蝴蝶前后翅颜色互换。
 *
 * 布局：
 *  - tile    平铺：2×2 错位格（半格下沉），每格一只，朝向随 seed 轻摆；跨单元边界的蝴蝶补副本 → 无缝；
 *  - scatter 散布：整幅随机投放（最小间距拒绝采样），大小、朝向各异，像一群停落的蝴蝶。
 *
 * ⭐ 体积：每种「翅形 × 配色」只在 `<defs>` 定义一次（`<g id>`），实例一律 `<use>`；平铺模式走 `api.tile`。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { frame, hid, i0, num, op, placeT, subRng, wrapOffsets } from './_helpers';

/** 单位蝴蝶（头朝 -y，翼展约 28）。只写右半，左半镜像。 */
const SHAPES = {
  classic: {
    fore: 'M.6-1C1.8-6.5 6.5-11.8 11.6-11.6C14.4-11.5 14.6-8.4 13.4-5.6C11.8-2 6.4.4.6.6Z',
    hind: 'M.6-.2C5.4-.6 10.4 1.2 10.8 5C11.2 8.6 8 11.4 5.2 10.9C2.6 10.4 1.1 6.6.6 1.6Z',
    spots: 'M10.4-7.4m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0M7.6-8.9m-.85 0a.85.85 0 1 0 1.7 0a.85.85 0 1 0-1.7 0M6.3 6.6m-1.3 0a1.3 1.3 0 1 0 2.6 0a1.3 1.3 0 1 0-2.6 0',
  },
  swallowtail: {
    fore: 'M.6-1C2.4-7 8.6-12.6 14-12.8C15.4-12.8 15.4-11.2 14.6-10.1C12.6-6.4 7.2-.8.6.6Z',
    hind: 'M.6-.2C5.2-.4 9.4 1.6 9.8 5C10 7.2 8.6 8.9 7.2 9.6L8 14.3C8.1 15.1 7.2 15.3 6.8 14.6L4.8 10.6C2.6 9.8 1.1 6.4.6 1.6Z',
    spots: 'M11.6-9.4m-1.25 0a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0-2.5 0M9-10.2m-.8 0a.8.8 0 1 0 1.6 0a.8.8 0 1 0-1.6 0M5.6 7.2m-1.15 0a1.15 1.15 0 1 0 2.3 0a1.15 1.15 0 1 0-2.3 0',
  },
} as const;
type ShapeKey = keyof typeof SHAPES;
/** 身体（描边）与触角。 */
const BODY = 'M0-4V7.2';
const ANTENNA = 'M-.4-5.6Q-1.3-9.6-3.4-11M.4-5.6Q1.3-9.6 3.4-11';

/** 外接圆半径（单位坐标）。 */
const R0 = 15.5;

const def: PatternDef = {
  id: 'butterflies',
  name: '蝴蝶',
  category: 'N-animal',
  description: '双色翅膀的蝴蝶，圆翅与凤蝶两种翅形；可整齐错位平铺，也可随意散落一片。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f3eee6' }, opacity: 1, visible: true, configurable: true },
    { id: 'forewing', label: '前翅', role: 'primary', paint: { type: 'solid', color: '#e2a77e' }, opacity: 1, visible: true, configurable: true },
    { id: 'hindwing', label: '后翅', role: 'secondary', paint: { type: 'solid', color: '#9fb4a4' }, opacity: 1, visible: true, configurable: true },
    { id: 'spots', label: '翅斑', role: 'accent', paint: { type: 'solid', color: '#f7f1e6' }, opacity: 0.95, visible: true, configurable: true },
    { id: 'body', label: '身体', role: 'detail', paint: { type: 'solid', color: '#4a4040' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'layout',
      label: '布局',
      type: 'select',
      options: [
        { value: 'tile', label: '平铺' },
        { value: 'scatter', label: '散布' },
      ],
      default: 'tile',
    },
    {
      key: 'shape',
      label: '翅形',
      type: 'select',
      options: [
        { value: 'mixed', label: '混排' },
        { value: 'classic', label: '圆翅' },
        { value: 'swallowtail', label: '凤蝶' },
      ],
      default: 'mixed',
    },
    { key: 'size', label: '蝴蝶大小', type: 'range', min: 0.6, max: 1.8, step: 0.05, default: 1 },
    { key: 'spacing', label: '间距', type: 'range', min: 1.2, max: 2.8, step: 0.05, default: 2.05 },
    { key: 'tilt', label: '朝向随机', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: 'swap', label: '交替配色', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'garden',
      label: '花园',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3eee6' } },
        forewing: { paint: { type: 'solid', color: '#e2a77e' } },
        hindwing: { paint: { type: 'solid', color: '#9fb4a4' } },
        spots: { paint: { type: 'solid', color: '#f7f1e6' }, opacity: 0.95 },
        body: { paint: { type: 'solid', color: '#4a4040' } },
      },
    },
    {
      id: 'midnight',
      label: '夜蝶',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d2230' } },
        forewing: { paint: { type: 'solid', color: '#7d93c4' } },
        hindwing: { paint: { type: 'solid', color: '#c49ab8' } },
        spots: { paint: { type: 'solid', color: '#e8dcc0' }, opacity: 0.9 },
        body: { paint: { type: 'solid', color: '#0f121a' } },
      },
      params: { layout: 'scatter', tilt: 1 },
    },
    {
      id: 'monarch',
      label: '帝王蝶',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe6d6' } },
        forewing: { paint: { type: 'solid', color: '#d9824a' } },
        hindwing: { paint: { type: 'solid', color: '#c56a3c' } },
        spots: { paint: { type: 'solid', color: '#fbf5ea' }, opacity: 1 },
        body: { paint: { type: 'solid', color: '#2c2422' } },
      },
      params: { shape: 'classic', swap: false, spacing: 2.35 },
    },
    {
      id: 'mint-scatter',
      label: '薄荷散落',
      elements: {
        bg: { paint: { type: 'solid', color: '#e3ece6' } },
        forewing: { paint: { type: 'solid', color: '#6f9c94' } },
        hindwing: { paint: { type: 'solid', color: '#e2c48f' } },
        spots: { paint: { type: 'solid', color: '#f6f3ea' }, opacity: 0.9 },
        body: { paint: { type: 'solid', color: '#3a4542' } },
      },
      params: { layout: 'scatter', shape: 'swallowtail', size: 1.25, tilt: 0.6 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['forewing'],
    secondary: ['hindwing'],
    accent: ['spots'],
    detail: ['body'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, seed } = cfg;
    const { q, Wv, Hv } = frame(W, H);
    const scatter = params.layout === 'scatter';
    const shapeMode = params.shape === 'classic' || params.shape === 'swallowtail' ? params.shape : 'mixed';
    const size = num(params, 'size', 0.3, 3);
    const spacing = num(params, 'spacing', 1, 4);
    const tilt = num(params, 'tilt', 0, 1);
    const swap = params.swap === true;

    const bg = elements.get('bg')!;
    const fw = elements.get('forewing')!;
    const hw = elements.get('hindwing')!;
    const sp = elements.get('spots')!;
    const body = elements.get('body')!;

    // ── 定义：翅形 × 配色（正 / 互换）────────────────────────
    const shapes: ShapeKey[] = shapeMode === 'mixed' ? ['classic', 'swallowtail'] : [shapeMode];
    const fillOf = (e: typeof fw): string => `fill="${e.paintValue}" fill-opacity="${op(e.opacity)}"`;
    const bodyMk =
      `<path d="${BODY}" stroke="${body.paintValue}" stroke-opacity="${op(body.opacity)}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<path d="${ANTENNA}" fill="none" stroke="${body.paintValue}" stroke-opacity="${op(body.opacity)}" stroke-width=".7" stroke-linecap="round"/>` +
      `<circle cy="-4.9" r="1.25" ${fillOf(body)}/>`;
    let defs = '';
    const ids: string[][] = []; // ids[shape][variant]
    shapes.forEach((k) => {
      const S = SHAPES[k];
      const row: string[] = [];
      for (const inv of swap ? [false, true] : [false]) {
        const a = inv ? hw : fw;
        const b = inv ? fw : hw;
        const half = `<path d="${S.fore}" ${fillOf(a)}/><path d="${S.hind}" ${fillOf(b)}/><path d="${S.spots}" ${fillOf(sp)}/>`;
        const id = hid('bt', `${k}${half}${bodyMk}`);
        defs += `<g id="${id}"><g id="${id}r">${half}</g><use href="#${id}r" transform="scale(-1 1)"/>${bodyMk}</g>`;
        row.push(id);
      }
      ids.push(row);
    });

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = `<defs>${defs}</defs>`;
    const sc = 4 * size; // 单位 → 虚拟坐标（翼展约 112）
    const r = R0 * sc;
    const pick = (i: number, rr: () => number): string => {
      const row = ids[shapes.length > 1 ? (rr() < 0.5 ? 0 : 1) : 0];
      return row[swap ? i % 2 : 0];
    };

    if (!scatter) {
      const rr = subRng(seed, 'bt-tile');
      const cell = r * 2 * spacing * 0.72;
      const tw = cell * 2;
      const th = cell * 2;
      let mk = '';
      const pos: Array<[number, number]> = [
        [0.5, 0.5],
        [0.5, 1.5],
        [1.5, 1],
        [1.5, 2],
      ];
      pos.forEach(([u, v], i) => {
        const x = u * cell + (rr() - 0.5) * cell * 0.12 * tilt;
        const y = v * cell + (rr() - 0.5) * cell * 0.12 * tilt;
        const a = (rr() - 0.5) * 70 * tilt + (rr() - 0.5) * 6;
        const id = pick(i + (i > 1 ? 1 : 0), rr);
        for (const [ox, oy] of wrapOffsets(x, y, r, tw, th)) mk += `<use href="#${id}" transform="${placeT(ox, oy, a, sc)}"/>`;
      });
      const tref = api.tile({ key: `bt-${seed}-${ids.flat().join('')}`, w: tw, h: th, content: mk });
      inner += `<rect width="${i0(Wv)}" height="${i0(Hv)}" fill="${tref}"/>`;
    } else {
      // 拒绝采样：最小间距 ∝ 半径之和；数量 ∝ 面积 / 间距²，封顶 MAX
      const rr = subRng(seed, 'bt-sc');
      const MAX = 120;
      const target = Math.min(MAX, Math.round((Wv * Hv) / Math.pow(r * 2 * spacing * 0.82, 2)));
      const placed: Array<{ x: number; y: number; s: number; a: number; id: string }> = [];
      let tries = 0;
      while (placed.length < target && tries++ < target * 40) {
        const s = 0.68 + rr() * 0.6;
        const x = rr() * Wv;
        const y = rr() * Hv;
        const a = (rr() - 0.5) * 360 * tilt;
        const id = pick(placed.length, rr);
        const ok = placed.every((p) => Math.hypot(p.x - x, p.y - y) > (p.s + s) * r * spacing * 0.62);
        if (ok) placed.push({ x, y, s, a, id });
      }
      if (placed.length === 0) placed.push({ x: Wv / 2, y: Hv / 2, s: 1, a: 0, id: ids[0][0] });
      inner += placed.map((p) => `<use href="#${p.id}" transform="${placeT(p.x, p.y, p.a, p.s * sc)}"/>`).join('');
    }

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
