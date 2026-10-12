/**
 * 折星镶嵌 —— B 波点 / 网格重复。
 *
 * 构图要点：正 N 边形内嵌 2N 角星，星与星之间留出「负空间」，
 * 整体以正方形单元严格平铺。与 `hex-grid` / `diamond-lattice` 的本质区别是
 * **多基元嵌套**（八角星 + 小八角星 + 菱形 + 描边四层），
 * 而非单一基元的重复 —— 这是 `STYLE-100-ANALYSIS.md` §4.2 列出的结构缺口。
 *
 * ⭐ 必须 tile：星数随「单元尺寸」参数变化，逐个绘制会突破节点上限。
 * 单元内容恒定 → DOM 结构与密度无关。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'girih-star',
  name: '折星镶嵌',
  category: 'B-repeat',
  description: '伊斯兰几何风格的八角星嵌套镶嵌，多层基元构成严密的秩序感。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0f2419' }, opacity: 1, visible: true, configurable: true },
    { id: 'star', label: '主星', role: 'primary', paint: { type: 'solid', color: '#245e4a' }, opacity: 1, visible: true, configurable: true },
    { id: 'star_in', label: '内星', role: 'secondary', paint: { type: 'solid', color: '#c9a65a' }, opacity: 1, visible: true, configurable: true },
    { id: 'line', label: '描边', role: 'detail', paint: { type: 'solid', color: '#e9dcc0' }, opacity: 0.3, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '单元尺寸', type: 'range', min: 80, max: 360, step: 5, default: 190, heavy: true },
    { key: 'points', label: '星角数', type: 'select', default: '8', options: [
      { value: '6', label: '六角星' },
      { value: '8', label: '八角星' },
      { value: '10', label: '十角星' },
      { value: '12', label: '十二角星' },
    ] },
    { key: 'ratio', label: '内星大小', type: 'range', min: 0.1, max: 0.6, step: 0.01, default: 0.32 },
    { key: 'stroke', label: '描边开关', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'emerald',
      label: '祖母绿',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f2419' } },
        star: { paint: { type: 'solid', color: '#245e4a' } },
        star_in: { paint: { type: 'solid', color: '#c9a65a' } },
        line: { paint: { type: 'solid', color: '#e9dcc0' } },
      },
    },
    {
      id: 'porcelain',
      label: '青花',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1f4f8' } },
        star: { paint: { type: 'solid', color: '#3a5a92' } },
        star_in: { paint: { type: 'solid', color: '#b7cbe6' } },
        line: { paint: { type: 'solid', color: '#dbe5f2' } },
      },
    },
    {
      id: 'sand',
      label: '砂岩',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b2119' } },
        star: { paint: { type: 'solid', color: '#9a7344' } },
        star_in: { paint: { type: 'solid', color: '#efe0c2' } },
        line: { paint: { type: 'solid', color: '#3a2c20' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['star'], secondary: ['star_in'], detail: ['line'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    // 「单元尺寸」以 1080 短边为基准的设计像素 → 按短边等比缩放，
    // 竖屏 / 4K / 带鱼屏下每屏星数保持一致（铁律 6：不硬编码像素）。
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const cell = Math.max(40, Number(params.cell)) * unit;
    const ratio = Math.max(0.1, Math.min(0.6, Number(params.ratio)));
    const showStroke = params.stroke === true;
    // 角数必须为偶数（2N 角星才能与外框正 N 边形对齐），并夹到合理区间
    const points = Math.max(6, Math.min(12, Math.round(Number(params.points)) || 8));

    const bg = elements.get('bg')!;
    const star = elements.get('star')!;
    const starIn = elements.get('star_in')!;
    const line = elements.get('line')!;

    // 星的外接半径：留出呼吸空间，不顶满单元（0.44 → 0.36，星与星之间有明显留白）
    const R = cell * 0.36;

    /**
     * 正 N 角星 → SVG `d`。交替取外/内半径得到 2N 个顶点。
     * 内半径比例过大会让星形塌成实心多边形，过小则退化成细刺。
     */
    const starPath = (cxp: number, cyp: number, r: number, inner: number, rot: number): string => {
      let d = '';
      for (let i = 0; i < points * 2; i++) {
        const rr = i % 2 === 0 ? r : r * inner;
        const ang = (Math.PI / 180) * ((360 / (points * 2)) * i + rot);
        const px = cxp + rr * Math.cos(ang);
        const py = cyp + rr * Math.sin(ang);
        d += `${i === 0 ? 'M' : 'L'}${api.n(px)} ${api.n(py)}`;
      }
      return `${d}Z`;
    };

    // 主星顶点间旋转半个角距，让尖角朝向水平方向 —— 伊斯兰镶嵌的经典取法
    const rot = 180 / points / 2;
    /** 副星保留比例 —— 0 = 全留白，1 = 交点全满。 */
    const cornerKeep = 0.5;

    /**
     * ⭐ 超级单元 = 2×2 个星格。
     * 旧实现在单个格子的四角各自掷骰子，平铺后同一交点的四个 1/4 来自不同骰子
     * → 交点处出现「残缺副星」。改为 2×2 超级单元后，单元内恰有 4 个互不相同的
     * 交点（模 2·cell），每个交点只掷一次骰子并把跨边的副本一起画出，副星总是完整的。
     */
    const S = cell * 2;
    const centers: Array<[number, number]> = [
      [cell / 2, cell / 2],
      [cell * 1.5, cell / 2],
      [cell / 2, cell * 1.5],
      [cell * 1.5, cell * 1.5],
    ];
    // 交点 → 其在超级单元内需要画出的所有副本（跨边的部分由相邻单元接续）
    const nodes: Array<Array<[number, number]>> = [
      [[0, 0], [S, 0], [0, S], [S, S]],
      [[cell, 0], [cell, S]],
      [[0, cell], [S, cell]],
      [[cell, cell]],
    ];

    const marks: string[] = [];

    if (star.visible) {
      let d = '';
      for (const [x, y] of centers) d += starPath(x, y, R, 0.42, rot);
      marks.push(path(d, { fill: star.paintValue, 'fill-opacity': star.opacity }));

      // 交点副星：半径小、旋转错开，点缀主星之间的负空间；seed 决定哪些交点留白
      const cornerR = R * 0.32;
      let dc = '';
      for (const copies of nodes) {
        if (rng() > cornerKeep) continue;
        for (const [x, y] of copies) dc += starPath(x, y, cornerR, 0.45, rot + 45);
      }
      if (dc) marks.push(path(dc, { fill: star.paintValue, 'fill-opacity': star.opacity * 0.75 }));
    }

    // 内星：反向旋转 + 半径按参数缩放，与主星形成「星中有星」
    if (starIn.visible) {
      let d = '';
      for (const [x, y] of centers) d += starPath(x, y, R * ratio, 0.5, rot + 180 / points);
      marks.push(path(d, { fill: starIn.paintValue, 'fill-opacity': starIn.opacity }));
    }

    // 描边：主星轮廓（细、内收）。旧版的单元外框会织出一张硬网格，干扰安静感，已移除。
    if (showStroke && line.visible) {
      let d = '';
      for (const [x, y] of centers) d += starPath(x, y, R * 0.8, 0.42, rot);
      marks.push(
        path(d, {
          fill: 'none',
          stroke: line.paintValue,
          'stroke-width': Math.max(0.5, cell * 0.008),
          'stroke-opacity': line.opacity,
          'stroke-linejoin': 'round',
        }),
      );
    }

    const tileRef = api.tile({
      // key 含 points：角数变了单元内容必须换，否则 defs 会命中去重而复用旧图案
      key: `girih-${api.n(cell)}-${api.n(points)}-${api.n(ratio)}-${showStroke ? 1 : 0}`,
      w: S,
      h: S,
      content: g({}, marks.join('')),
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
