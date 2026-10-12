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
    { id: 'star', label: '主星', role: 'primary', paint: { type: 'solid', color: '#1d6b4f' }, opacity: 1, visible: true, configurable: true },
    { id: 'star_in', label: '内星', role: 'secondary', paint: { type: 'solid', color: '#d4a017' }, opacity: 1, visible: true, configurable: true },
    { id: 'line', label: '描边', role: 'detail', paint: { type: 'solid', color: '#f5e6c8' }, opacity: 0.55, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cell', label: '单元尺寸', type: 'range', min: 40, max: 240, step: 5, default: 120, heavy: true },
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
        star: { paint: { type: 'solid', color: '#1d6b4f' } },
        star_in: { paint: { type: 'solid', color: '#d4a017' } },
        line: { paint: { type: 'solid', color: '#f5e6c8' } },
      },
    },
    {
      id: 'porcelain',
      label: '青花',
      elements: {
        bg: { paint: { type: 'solid', color: '#f2f6fb' } },
        star: { paint: { type: 'solid', color: '#1e40af' } },
        star_in: { paint: { type: 'solid', color: '#93c5fd' } },
        line: { paint: { type: 'solid', color: '#0b1e4b' } },
      },
    },
    {
      id: 'sand',
      label: '砂岩',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b1d12' } },
        star: { paint: { type: 'solid', color: '#a16207' } },
        star_in: { paint: { type: 'solid', color: '#fef3c7' } },
        line: { paint: { type: 'solid', color: '#78350f' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['star'], secondary: ['star_in'], detail: ['line'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const cell = Math.max(40, Number(params.cell));
    const ratio = Math.max(0.1, Math.min(0.6, Number(params.ratio)));
    const showStroke = params.stroke === true;
    // 角数必须为偶数（2N 角星才能与外框正 N 边形对齐），并夹到合理区间
    const points = Math.max(6, Math.min(12, Math.round(Number(params.points)) || 8));

    const bg = elements.get('bg')!;
    const star = elements.get('star')!;
    const starIn = elements.get('star_in')!;
    const line = elements.get('line')!;

    const cx = cell / 2;
    const cy = cell / 2;
    // 星的外接半径：留出描边与间隙，不顶满单元
    const R = cell * 0.44;

    /**
     * 正 N 角星 → SVG `d`。
     *
     * 交替取外/内半径得到 2N 个顶点。内半径比例过大会让星形塌成实心多边形，
     * 过小则退化成细刺，故固定 0.42 —— 星形可读性的经验阈值。
     *
     * ⚠️ 这里手写 `d` 而不用 `polygon()`：星形需要**交替半径**的顶点序列，
     * 而 polygon 会原样输出 points，两者在语义上等价但前者少一层字符串处理。
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
    /** 副星保留比例 —— 0 = 全留白，1 = 四角全满。 */
    const cornerKeep = 0.55;

    const marks: string[] = [];

    if (star.visible) {
      marks.push(
        path(starPath(cx, cy, R, 0.42, rot), {
          fill: star.paintValue,
          'fill-opacity': star.opacity,
        }),
      );
    }

    // 内星：反向旋转 + 半径按参数缩放，与主星形成「星中有星」
    if (starIn.visible) {
      marks.push(
        path(starPath(cx, cy, R * ratio, 0.5, rot + 180 / points), {
          fill: starIn.paintValue,
          'fill-opacity': starIn.opacity,
        }),
      );
    }

    // 单元四角的「副星」：半径小、旋转错开，填满主星之间的负空间。
    // 这是让镶嵌显密均匀的关键 —— 缺了它会显得像孤立的星而不是一片镶嵌。
    //
    // ⭐ seed 的作用：决定哪些角落真的画副星。全部画满是最规整的形态，
    // 但真实伊斯兰镶嵌常在局部留白。随机取子集既满足 `seedable` 契约，
    // 又不会破坏秩序（子集仍是确定性的：同 seed 必得同结果）。
    if (star.visible) {
      const cornerR = R * 0.3;
      for (const [ox, oy] of [[0, 0], [cell, 0], [0, cell], [cell, cell]] as Array<[number, number]>) {
        if (rng() > cornerKeep) continue;
        marks.push(
          path(starPath(ox, oy, cornerR, 0.45, rot + 45), {
            fill: star.paintValue,
            'fill-opacity': star.opacity * 0.9,
          }),
        );
      }
    }

    // 描边：主星轮廓 + 单元外框
    if (showStroke && line.visible) {
      marks.push(
        path(starPath(cx, cy, R, 0.42, rot), {
          fill: 'none',
          stroke: line.paintValue,
          'stroke-width': Math.max(0.5, cell * 0.012),
          'stroke-opacity': line.opacity,
          'stroke-linejoin': 'round',
        }),
      );
      marks.push(
        rect(0.5, 0.5, cell - 1, cell - 1, {
          fill: 'none',
          stroke: line.paintValue,
          'stroke-width': Math.max(0.4, cell * 0.006),
          'stroke-opacity': line.opacity * 0.7,
        }),
      );
    }

    const tileRef = api.tile({
      // key 含 points：角数变了单元内容必须换，否则 defs 会命中去重而复用旧图案
      key: `girih-${api.n(cell)}-${api.n(points)}-${api.n(ratio)}-${showStroke ? 1 : 0}`,
      w: cell,
      h: cell,
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
