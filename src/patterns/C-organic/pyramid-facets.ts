/**
 * 金字塔锥面 —— C 渐变流体 / 有机形态。
 *
 * 构图：俯视的四棱锥阵列。每个锥体被两条对角线切成上 / 右 / 下 / 左四个三角面，
 * 四个面的明暗由「面朝向 · 光源方向」的点积**排序**决定：最亮 → 次亮 → 次暗 → 最暗
 * 分别取四个面色元件。排序而非连续插值 —— 这样无论光从哪来，画面永远恰好是
 * 四个用户可控的纯色，换色 = 换肤。
 *
 * 与 lowpoly-facet 的区别：后者是 seeded 抖动网格的不规则三角，本母题是
 * **规则网格 + 明确的光照方向控件**，读起来是浮雕 / 铆钉板的秩序感。
 *
 * 「凹凸交错」模式：棋盘格上一半锥体倒置（凹坑），倒置锥体的面朝向取反，
 * 明暗排序随之反转。旋转网格时面朝向随之旋转，光照仍以屏幕为参照。
 * 无随机性 → seedable: false。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const FACE_IDS = ['face_hi', 'face_mh', 'face_md', 'face_lo'] as const;

const def: PatternDef = {
  id: 'pyramid-facets',
  name: '金字塔锥面',
  category: 'B-repeat',
  description: '俯视四棱锥阵列，四个三角面按光照方向分出明暗，规则网格的浮雕立体感。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色 · 缝隙', role: 'bg', paint: { type: 'solid', color: '#6e4a4a' }, opacity: 1, visible: true, configurable: true },
    { id: 'face_hi', label: '亮面', role: 'primary', paint: { type: 'solid', color: '#f4dcb8' }, opacity: 1, visible: true, configurable: true },
    { id: 'face_mh', label: '次亮面', role: 'secondary', paint: { type: 'solid', color: '#e9b48a' }, opacity: 1, visible: true, configurable: true },
    { id: 'face_md', label: '次暗面', role: 'secondary', paint: { type: 'solid', color: '#d6927a' }, opacity: 1, visible: true, configurable: true },
    { id: 'face_lo', label: '暗面', role: 'accent', paint: { type: 'solid', color: '#b26e6c' }, opacity: 1, visible: true, configurable: true },
    { id: 'ridge', label: '棱线', role: 'detail', paint: { type: 'solid', color: '#ffffff' }, opacity: 0.18, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cols', label: '长边锥体数', type: 'range', min: 4, max: 30, step: 1, default: 12, heavy: true },
    { key: 'gap', label: '缝隙', type: 'range', min: 0, max: 0.15, step: 0.005, default: 0.03 },
    { key: 'light', label: '光源方向', type: 'angle', default: 135 },
    {
      key: 'mode',
      label: '起伏',
      type: 'select',
      options: [
        { value: 'raised', label: '全部凸起' },
        { value: 'alternate', label: '凹凸交错' },
      ],
      default: 'raised',
    },
    { key: 'rotate', label: '网格旋转', type: 'angle', default: 0 },
  ],

  presets: [
    {
      id: 'terracotta',
      label: '赤陶',
      elements: {
        bg: { paint: { type: 'solid', color: '#6e4a4a' } },
        face_hi: { paint: { type: 'solid', color: '#f4dcb8' } },
        face_mh: { paint: { type: 'solid', color: '#e9b48a' } },
        face_md: { paint: { type: 'solid', color: '#d6927a' } },
        face_lo: { paint: { type: 'solid', color: '#b26e6c' } },
        ridge: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.18 },
      },
    },
    {
      id: 'dune',
      label: '沙丘',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9dcc8' } },
        face_hi: { paint: { type: 'solid', color: '#fbf4e8' } },
        face_mh: { paint: { type: 'solid', color: '#efe2cc' } },
        face_md: { paint: { type: 'solid', color: '#dcc6a6' } },
        face_lo: { paint: { type: 'solid', color: '#c4a882' } },
        ridge: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.25 },
      },
      params: { gap: 0, cols: 10 },
    },
    {
      id: 'midnight',
      label: '午夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f141c' } },
        face_hi: { paint: { type: 'solid', color: '#4a5d7a' } },
        face_mh: { paint: { type: 'solid', color: '#34445c' } },
        face_md: { paint: { type: 'solid', color: '#263246' } },
        face_lo: { paint: { type: 'solid', color: '#1a2230' } },
        ridge: { paint: { type: 'solid', color: '#c9a76a' }, opacity: 0.3 },
      },
      params: { mode: 'alternate' },
    },
    {
      id: 'orchard',
      label: '果园',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3e9da' } },
        face_hi: { paint: { type: 'solid', color: '#f3d79e' } },
        face_mh: { paint: { type: 'solid', color: '#eab184' } },
        face_md: { paint: { type: 'solid', color: '#d88f72' } },
        face_lo: { paint: { type: 'solid', color: '#a87e68' } },
        ridge: { paint: { type: 'solid', color: '#ffffff' }, opacity: 0.2 },
      },
      params: { gap: 0.02, rotate: 45, cols: 9 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['face_hi'],
    secondary: ['face_mh', 'face_md'],
    accent: ['face_lo'],
    detail: ['ridge'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const { n } = api;
    const cols = Math.max(2, Number(params.cols));
    // 以长边为基准：竖屏下锥体不会被挤得过密。
    const cell = Math.max(W, H) / cols;
    const half = (cell * Number(params.gap)) / 2;
    const alternate = params.mode === 'alternate';
    const rot = Number(params.rotate);
    const lightDeg = Number(params.light);

    const bg = elements.get('bg')!;
    const ridge = elements.get('ridge')!;
    const faces = FACE_IDS.map((id) => elements.get(id)!);

    // 光源方向（数学坐标：0° 来自右、90° 来自上）→ 换到「网格本地坐标」，
    // SVG rotate 正角为顺时针，换回本地坐标需在数学角上加回 rot，保证旋转网格时光照仍以屏幕为参照。
    const la = ((lightDeg + rot) * Math.PI) / 180;
    const lx = Math.cos(la);
    const ly = -Math.sin(la); // SVG y 轴朝下

    // 上 / 右 / 下 / 左 四个面的屏幕朝向（本地坐标）
    const DIRS: Array<[number, number]> = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    /** 返回四个面各自的明暗档位（0 最亮 … 3 最暗）。 */
    const rankFor = (sign: number): number[] => {
      const score = DIRS.map(([dx, dy], i) => ({ i, v: sign * (dx * lx + dy * ly) }));
      // 并列时按固定顺序打破，保证输出稳定。
      score.sort((p, q) => q.v - p.v || p.i - q.i);
      const rank = [0, 0, 0, 0];
      score.forEach((s, r) => {
        rank[s.i] = r;
      });
      return rank;
    };

    // 每个档位一个 path（多个子路径），而不是每个三角一个元素 → 体积最小。
    const buckets: string[] = ['', '', '', ''];
    const ridges: string[] = [];
    const per = alternate ? 2 : 1;

    for (let r = 0; r < per; r++) {
      for (let c = 0; c < per; c++) {
        const sign = alternate && (r + c) % 2 === 1 ? -1 : 1;
        const rank = rankFor(sign);
        const x0 = c * cell + half;
        const y0 = r * cell + half;
        const x1 = (c + 1) * cell - half;
        const y1 = (r + 1) * cell - half;
        const ax = (x0 + x1) / 2;
        const ay = (y0 + y1) / 2;
        const A = `${n(ax)} ${n(ay)}`;
        const TL = `${n(x0)} ${n(y0)}`;
        const TR = `${n(x1)} ${n(y0)}`;
        const BR = `${n(x1)} ${n(y1)}`;
        const BL = `${n(x0)} ${n(y1)}`;
        const tris = [
          `M${TL}L${TR}L${A}Z`,
          `M${TR}L${BR}L${A}Z`,
          `M${BR}L${BL}L${A}Z`,
          `M${BL}L${TL}L${A}Z`,
        ];
        tris.forEach((d, i) => {
          buckets[rank[i]] += d;
        });
        ridges.push(`M${TL}L${BR}M${TR}L${BL}`);
      }
    }

    const marks: string[] = [];
    buckets.forEach((d, k) => {
      const e = faces[k];
      if (!e.visible || d === '') return;
      // 细描边同色：消除相邻三角之间的抗锯齿白缝。
      marks.push(
        path(d, {
          fill: e.paintValue,
          'fill-opacity': e.opacity,
          stroke: e.opacity >= 1 ? e.paintValue : undefined,
          'stroke-width': e.opacity >= 1 ? n(Math.max(0.5, cell * 0.004)) : undefined,
          'stroke-linejoin': 'round',
        }),
      );
    });
    if (ridge.visible) {
      marks.push(
        g(
          {
            fill: 'none',
            stroke: ridge.paintValue,
            'stroke-opacity': ridge.opacity,
            'stroke-width': n(Math.max(0.5, cell * 0.008)),
            'stroke-linecap': 'round',
          },
          path(ridges.join('')),
        ),
      );
    }

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (marks.length) {
      const tileRef = api.tile({
        key: `pf-${n(cell)}-${per}`,
        w: cell * per,
        h: cell * per,
        content: marks.join(''),
        transform: rot % 360 === 0 ? undefined : `rotate(${n(rot)})`,
      });
      parts.push(rect(0, 0, W, H, { fill: tileRef }));
    }
    return { body: parts.join('') };
  },
};

export default def;
