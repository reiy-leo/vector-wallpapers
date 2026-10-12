/**
 * 干涉圆环 —— I 光学错觉。
 *
 * 两组（可选三组）等距同心圆，圆心略微错开后叠在一起：两组环的「相位差」沿空间缓慢变化，
 * 于是在线条之间浮现出一圈圈双曲线 / 椭圆状的明暗干涉条纹（莫尔纹），像水面两个波源的干涉图。
 *
 * ⭐ 体积策略：
 *   - 全部几何画在「短边 = 1000」的虚拟坐标里，外层 `scale(q)` 放大 → 体积与分辨率解耦；
 *   - 每组环一个 `<g transform="translate(cx cy)">`，共享描边属性，每个圆只写 `r`（≈18B）；
 *   - 只画与画面相交的环（r ∈ [圆心到画面的最近距离, 最远角距离]），环数另设硬上限 RING_CAP。
 * 动画（仅预览，cfg.animate 且「波源漂移」打开）：第二组环来回平移约 3 个环距，条纹随之扫动。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig, ResolvedElement } from '../types';
import { glowFill, numParam } from './_helpers';

const V = 1000;
/** 单组环数硬上限（每个 ≈ 18B）。 */
const RING_CAP = 230;
/** 透明度渐隐分段数（每段一个 `<g>`）。 */
const FADE_BANDS = 6;

const def: PatternDef = {
  id: 'interference-rings',
  name: '干涉圆环',
  category: 'I-optical',
  description: '两组同心圆错开圆心叠加，环与环之间浮现出波源干涉般的莫尔条纹。',
  seedable: false,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#17202c' }, opacity: 1, visible: true, configurable: true },
    { id: 'glow', label: '中心辉光', role: 'detail', paint: { type: 'solid', color: '#2e4a5c' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'rings_a', label: '圆环 · 甲', role: 'primary', paint: { type: 'solid', color: '#7fb3bf' }, opacity: 0.75, visible: true, configurable: true },
    { id: 'rings_b', label: '圆环 · 乙', role: 'secondary', paint: { type: 'solid', color: '#d9a58f' }, opacity: 0.6, visible: true, configurable: true },
    { id: 'rings_c', label: '圆环 · 丙', role: 'accent', paint: { type: 'solid', color: '#c9c27a' }, opacity: 0.5, visible: true, configurable: true },
  ],

  controls: [
    { key: 'spacing', label: '环距', type: 'range', min: 12, max: 48, step: 1, default: 22, heavy: true },
    { key: 'weight', label: '线宽占比', type: 'range', min: 0.15, max: 0.6, step: 0.05, default: 0.4 },
    { key: 'separation', label: '圆心间距', type: 'range', min: 0, max: 0.8, step: 0.02, default: 0.16 },
    {
      key: 'layout',
      label: '波源布局',
      type: 'select',
      default: 'pair',
      options: [
        { value: 'pair', label: '并列' },
        { value: 'diagonal', label: '斜向' },
        { value: 'corners', label: '画外对角' },
      ],
    },
    { key: 'fade', label: '外圈淡出', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: 'third', label: '第三组', type: 'toggle', default: true },
    { key: 'drift', label: '波源漂移', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'night-tide',
      label: '夜潮',
      elements: {
        bg: { paint: { type: 'solid', color: '#17202c' } },
        glow: { paint: { type: 'solid', color: '#2e4a5c' }, opacity: 0.7 },
        rings_a: { paint: { type: 'solid', color: '#7fb3bf' }, opacity: 0.75 },
        rings_b: { paint: { type: 'solid', color: '#d9a58f' }, opacity: 0.6 },
        rings_c: { paint: { type: 'solid', color: '#c9c27a' }, opacity: 0.5 },
      },
    },
    {
      id: 'rice-paper',
      label: '宣纸',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1ebe0' } },
        glow: { paint: { type: 'solid', color: '#fbf7ef' }, opacity: 0.9 },
        rings_a: { paint: { type: 'solid', color: '#4b5a6b' }, opacity: 0.55 },
        rings_b: { paint: { type: 'solid', color: '#b8674c' }, opacity: 0.5 },
        rings_c: { paint: { type: 'solid', color: '#7f9a83' }, opacity: 0.45 },
      },
      params: { spacing: 20, weight: 0.32 },
    },
    {
      id: 'violet-ripple',
      label: '紫涟',
      elements: {
        bg: { paint: { type: 'solid', color: '#221c2e' } },
        glow: { paint: { type: 'solid', color: '#4a3a63' }, opacity: 0.65 },
        rings_a: { paint: { type: 'solid', color: '#a99bd1' }, opacity: 0.6 },
        rings_b: { paint: { type: 'solid', color: '#e2b4c6' }, opacity: 0.5 },
        rings_c: { paint: { type: 'solid', color: '#8cc0c4' }, opacity: 0.45 },
      },
      params: { layout: 'diagonal', third: true, separation: 0.36, spacing: 26 },
    },
    {
      id: 'sage-arcs',
      label: '鼠尾草',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe3d6' } },
        glow: { paint: { type: 'solid', color: '#f3f2e8' }, opacity: 0.8 },
        rings_a: { paint: { type: 'solid', color: '#5f7466' }, opacity: 0.5 },
        rings_b: { paint: { type: 'solid', color: '#8a7a5a' }, opacity: 0.45 },
        rings_c: { paint: { type: 'solid', color: '#a7896f' }, opacity: 0.4 },
      },
      params: { layout: 'corners', spacing: 28, weight: 0.45, separation: 0.5, fade: 0.3 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['rings_a'], secondary: ['rings_b'], accent: ['rings_c'], detail: ['glow'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, animate } = cfg;
    const spacing = Math.round(numParam(params, 'spacing', 12, 48));
    const fade = numParam(params, 'fade', 0, 1);
    const weight = numParam(params, 'weight', 0.15, 0.6);
    const sep = numParam(params, 'separation', 0, 0.8) * V;
    const layout = String(params.layout);
    const third = params.third === true;
    const drift = animate && params.drift === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const landscape = Wv >= Hv;
    const mx = Wv / 2;
    const my = Hv / 2;

    // ── 波源位置（虚拟坐标）──────────────────────────
    let centers: Array<[number, number]>;
    if (layout === 'diagonal') {
      const dx = sep * 0.6;
      const dy = sep * 0.45;
      const ox = landscape ? -Wv * 0.08 : 0;
      const oy = landscape ? 0 : -Hv * 0.08;
      centers = [
        [mx + ox - dx, my + oy - dy],
        [mx + ox + dx, my + oy + dy],
        [mx + ox + dx * 0.9 + sep * 0.35, my + oy - dy * 1.4],
      ];
    } else if (layout === 'corners') {
      // 两个波源在画外对角，环在画面里只露出大弧
      const k = 0.08 + (sep / V) * 0.12;
      centers = [
        [-Wv * k, -Hv * k],
        [Wv * (1 + k), Hv * (1 + k)],
        [Wv * (1 + k), -Hv * k],
      ];
    } else {
      // 并列：沿长边方向错开
      const ax = landscape ? sep / 2 : 0;
      const ay = landscape ? 0 : sep / 2;
      centers = [
        [mx - ax, my - ay],
        [mx + ax, my + ay],
        [mx + (landscape ? 0 : sep * 0.8), my + (landscape ? -sep * 0.8 : 0)],
      ];
    }

    const sw = spacing * weight;
    /**
     * 一组环：按半径分 FADE_BANDS 段，每段一个 `<g>` 共享 stroke-opacity，
     * 透明度随半径（相对屏幕半对角线）平滑下降 → 波纹从波源向外渐隐。
     */
    const diag = Math.hypot(Wv, Hv) / 2;
    const ringsFor = (cx: number, cy: number, op: number): string => {
      const nearX = Math.max(0, -cx, cx - Wv);
      const nearY = Math.max(0, -cy, cy - Hv);
      const near = Math.hypot(nearX, nearY);
      const far = Math.max(Math.hypot(cx, cy), Math.hypot(Wv - cx, cy), Math.hypot(cx, Hv - cy), Math.hypot(Wv - cx, Hv - cy));
      const k0 = Math.max(1, Math.floor((near - sw - spacing * 4) / spacing));
      const k1 = Math.min(k0 + RING_CAP, Math.ceil((far + sw + spacing * 4) / spacing));
      const bands: string[] = new Array(FADE_BANDS).fill('');
      const r1 = layout === 'corners' ? far : diag * 1.25;
      const r0 = layout === 'corners' ? near : 0;
      for (let k = k0; k <= k1; k++) {
        const t = Math.max(0, Math.min(1, (k * spacing - r0) / Math.max(1, r1 - r0)));
        const b = Math.min(FADE_BANDS - 1, Math.floor(t * FADE_BANDS));
        bands[b] += `<circle r="${k * spacing}"/>`;
      }
      return bands
        .map((c, b) => {
          if (c === '') return '';
          const t = (b + 0.5) / FADE_BANDS;
          const o = op * (1 - fade * 0.95 * t);
          return `<g stroke-opacity="${api.n(o)}">${c}</g>`;
        })
        .join('');
    };

    const bg = elements.get('bg')!;
    const glow = elements.get('glow')!;
    const sets: Array<[ResolvedElement, [number, number]]> = [
      [elements.get('rings_a')!, centers[0]],
      [elements.get('rings_b')!, centers[1]],
    ];
    if (third) sets.push([elements.get('rings_c')!, centers[2]]);

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // ── 中心辉光：落在各波源的重心（画外波源时取画面中心）──
    if (glow.visible) {
      const gx = layout === 'corners' ? 0.5 : Math.max(0.1, Math.min(0.9, (centers[0][0] + centers[1][0]) / 2 / Wv));
      const gy = layout === 'corners' ? 0.5 : Math.max(0.1, Math.min(0.9, (centers[0][1] + centers[1][1]) / 2 / Hv));
      const gf = glowFill(api, glow, { cx: gx, cy: gy, r: 0.62 }, 'ir-glow');
      parts.push(rect(0, 0, W, H, { fill: gf.fill, 'fill-opacity': gf.opacity }));
    }

    const n = api.n;
    let inner = '';
    sets.forEach(([el, [cx, cy]], i) => {
      if (!el.visible) return;
      const g = `<g transform="translate(${n(cx)} ${n(cy)})" fill="none" stroke="${el.paintValue}" stroke-width="${n(sw)}">${ringsFor(cx, cy, el.opacity)}</g>`;
      if (drift && i === 1) {
        const amp = spacing * 3;
        const name = api.keyframes(`vw-irdrift-${amp}`, `from{transform:translate(-${amp}px,0)}to{transform:translate(${amp}px,${Math.round(amp * 0.6)}px)}`);
        inner += `<g style="animation:${name} 9s ease-in-out infinite alternate">${g}</g>`;
      } else if (drift && i === 2) {
        const amp = spacing * 2;
        const name = api.keyframes(`vw-irdrift2-${amp}`, `from{transform:translate(0,-${amp}px)}to{transform:translate(0,${amp}px)}`);
        inner += `<g style="animation:${name} 13s ease-in-out infinite alternate">${g}</g>`;
      } else {
        inner += g;
      }
    });
    if (inner !== '') parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
