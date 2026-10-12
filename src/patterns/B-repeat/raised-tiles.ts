/**
 * 凸起瓷砖 —— B 波点 / 网格重复。
 *
 * 每块凸砖 = 一块底方（面色）+ 4 个梯形斜面（上/右/下/左）+ 内缩的顶面。
 * 斜面的明暗由光照方向决定：斜面法线 · 光向 > 0 用「高光」元件，< 0 用「阴影」元件，
 * 不透明度随 |点积| 变化 —— 光从左上来时，上/左两面同等受光，下/右两面同等背光；
 * 光正对某一面时，侧面两条斜面点积为 0，自然退回面色。
 *
 * 交替：棋盘格里另一半的砖可以是「平面砖」（只铺 flat 色）或「凹陷砖」（flat 作面色，明暗反转）。
 * 高光 / 阴影是可配置元件（结构门禁要求全部可配），默认取与面色同色系的浅/深色，用户可自行改色。
 */
import { g, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult, ResolvedElement } from '../types';

const def: PatternDef = {
  id: 'raised-tiles',
  name: '凸起瓷砖',
  category: 'B-repeat',
  description: '带斜面高光与阴影的凸起方砖，与平面 / 凹陷砖棋盘交替，光照方向可调。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '砖缝', role: 'bg', paint: { type: 'solid', color: '#cfc6b8' }, opacity: 1, visible: true, configurable: true },
    { id: 'face', label: '凸砖面', role: 'primary', paint: { type: 'solid', color: '#e8e1d5' }, opacity: 1, visible: true, configurable: true },
    { id: 'flat', label: '平砖面', role: 'secondary', paint: { type: 'solid', color: '#e1d9cb' }, opacity: 1, visible: true, configurable: true },
    { id: 'hi', label: '高光', role: 'accent', paint: { type: 'solid', color: '#fbf8f2' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'lo', label: '阴影', role: 'detail', paint: { type: 'solid', color: '#a89a85' }, opacity: 0.75, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '砖数', type: 'range', min: 4, max: 24, step: 1, default: 10, heavy: true },
    { key: 'bevel', label: '斜面宽度', type: 'range', min: 0.04, max: 0.32, step: 0.01, default: 0.13 },
    { key: 'gap', label: '砖缝', type: 'range', min: 0, max: 0.2, step: 0.01, default: 0.05 },
    { key: 'light', label: '光照方向', type: 'angle', default: 315 },
    {
      key: 'alt', label: '交替方式', type: 'select', default: 'flat', options: [
        { value: 'flat', label: '凸起 / 平面' },
        { value: 'inset', label: '凸起 / 凹陷' },
        { value: 'none', label: '全部凸起' },
      ],
    },
  ],

  presets: [
    {
      id: 'travertine',
      label: '石灰华',
      elements: {
        bg: { paint: { type: 'solid', color: '#cfc6b8' } },
        face: { paint: { type: 'solid', color: '#e8e1d5' } },
        flat: { paint: { type: 'solid', color: '#e1d9cb' } },
        hi: { paint: { type: 'solid', color: '#fbf8f2' } },
        lo: { paint: { type: 'solid', color: '#a89a85' } },
      },
    },
    {
      id: 'graphite',
      label: '石墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#16191e' } },
        face: { paint: { type: 'solid', color: '#2e343c' } },
        flat: { paint: { type: 'solid', color: '#252a31' } },
        hi: { paint: { type: 'solid', color: '#6b7684' }, opacity: 0.7 },
        lo: { paint: { type: 'solid', color: '#0b0d10' }, opacity: 0.8 },
      },
    },
    {
      id: 'celadon',
      label: '青瓷',
      elements: {
        bg: { paint: { type: 'solid', color: '#9fb3a7' } },
        face: { paint: { type: 'solid', color: '#c4d6c9' } },
        flat: { paint: { type: 'solid', color: '#b5c9bc' } },
        hi: { paint: { type: 'solid', color: '#eef5ef' }, opacity: 0.85 },
        lo: { paint: { type: 'solid', color: '#6e8a7a' }, opacity: 0.7 },
      },
      params: { alt: 'inset' },
    },
    {
      id: 'terracotta',
      label: '赤陶',
      elements: {
        bg: { paint: { type: 'solid', color: '#5a3426' } },
        face: { paint: { type: 'solid', color: '#b06a4f' } },
        flat: { paint: { type: 'solid', color: '#9c5c44' } },
        hi: { paint: { type: 'solid', color: '#e2a587' }, opacity: 0.8 },
        lo: { paint: { type: 'solid', color: '#4a2a1e' }, opacity: 0.7 },
      },
      params: { alt: 'none', bevel: 0.12, count: 8, gap: 0.04 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['face'], secondary: ['flat'], accent: ['hi'], detail: ['lo'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const count = Math.round(Math.max(4, Math.min(24, Number(params.count))));
    const bevelR = Math.max(0.04, Math.min(0.32, Number(params.bevel)));
    const gapR = Math.max(0, Math.min(0.2, Number(params.gap)));
    const lightDeg = Number(params.light);
    const alt = String(params.alt);

    const bg = elements.get('bg')!;
    const face = elements.get('face')!;
    const flat = elements.get('flat')!;
    const hi = elements.get('hi')!;
    const lo = elements.get('lo')!;
    const n = api.n;

    const C = W / count;
    const gap = C * gapR;
    const b = C - gap; // 砖边长
    const bv = b * bevelR; // 斜面宽

    // 光向（指向光源）：0° = 正上方，顺时针。屏幕坐标 y 向下。
    const la = (lightDeg * Math.PI) / 180;
    const L: [number, number] = [Math.sin(la), -Math.cos(la)];
    // 四个斜面的外法线：上、右、下、左
    const normals: Array<[number, number]> = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    const dots = normals.map(([x, y]) => x * L[0] + y * L[1]);

    /** 一块砖（左上角在 0,0），invert = 凹陷（明暗反转）。 */
    const brick = (base: ResolvedElement, invert: boolean): string => {
      const out: string[] = [];
      if (base.visible) out.push(rect(0, 0, b, b, { fill: base.paintValue, 'fill-opacity': base.opacity }));
      // 外角 → 内角，四个梯形依次为上、右、下、左
      const o: Array<[number, number]> = [[0, 0], [b, 0], [b, b], [0, b]];
      const i: Array<[number, number]> = [[bv, bv], [b - bv, bv], [b - bv, b - bv], [bv, b - bv]];
      for (let k = 0; k < 4; k++) {
        const d = invert ? -dots[k] : dots[k];
        if (Math.abs(d) < 0.02) continue;
        const e = d > 0 ? hi : lo;
        if (!e.visible) continue;
        const k2 = (k + 1) % 4;
        out.push(
          polygon([o[k], o[k2], i[k2], i[k]], {
            fill: e.paintValue,
            'fill-opacity': n(e.opacity * Math.min(1, Math.abs(d) * 1.25)),
          }),
        );
      }
      return out.join('');
    };

    const raised = brick(face, false);
    let other = raised;
    if (alt === 'flat') other = flat.visible ? rect(0, 0, b, b, { fill: flat.paintValue, 'fill-opacity': flat.opacity }) : '';
    else if (alt === 'inset') other = brick(flat, true);

    const o = gap / 2;
    const cellsMarks: string[] = [];
    const place = (x: number, y: number, inner: string): void => {
      if (inner === '') return;
      cellsMarks.push(g({ transform: `translate(${n(x + o)} ${n(y + o)})` }, inner));
    };
    if (alt === 'none') {
      place(0, 0, raised);
    } else {
      place(0, 0, raised);
      place(C, C, raised);
      place(C, 0, other);
      place(0, C, other);
    }

    const tw = alt === 'none' ? C : 2 * C;
    const tileRef = api.tile({
      key: `rt-${n(C)}-${n(b)}-${n(bv)}-${n(lightDeg)}-${alt}`,
      w: tw,
      h: tw,
      content: cellsMarks.join(''),
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;
