/**
 * 一维元胞自动机 —— J 数学生成 / 单幅构图（seedable）。
 *
 * 沃尔夫勒姆初等元胞自动机：每一行由上一行按「左-中-右」三格邻域查规则表得出（Rule 30 / 90 / 110 …），
 * 从顶行开始逐行向下演化，左右边界周期回绕。单点起始时长出标志性的三角图样（Rule 30 的混沌锥、
 * Rule 90 的谢尔宾斯基三角）；随机起始则是满屏交织的三角纹理。
 *
 * 配色：按「左上邻是否活着」把活细胞分两色 → Rule 90 的谢尔宾斯基三角左右两边自然分色，Rule 30 的混沌锥出现斜纹；
 * 少量随机「火花」细胞用强调色点亮；可选底层格点（空细胞位置的淡点，<pattern> 平铺）。
 *
 * 形状：像素（同行连续段合并、锐利边）/ 方块（逐格留缝）/ 胶囊（连续段圆头）/ 圆点。
 *
 * ⭐ 体积：所有细胞在「每格 1 单位」坐标中用相对命令编码（`m dx 1h len`），整体 scale；
 * 路径字节超过 PATH_CAP 时自动加粗格子（减少格数）重算 → 任何参数组合都在红线内。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { num, op, unitOf } from './_helpers';

const PATH_CAP = 15000;
const RULES = ['30', '90', '110', '150', '45', '73'];

/** 演化：返回 rows × cols 的状态（0 空，1 由左上邻触发，2 其余）。 */
function evolve(rule: number, cols: number, rows: number, init: Uint8Array, pad: number): Uint8Array[] {
  // pad > 0：左右各加 pad 格「画外」空间，图样从画面边缘自然出画而不回绕；pad = 0：周期回绕
  const out: Uint8Array[] = [];
  const full = cols + pad * 2;
  let cur = new Uint8Array(full);
  cur.set(init, pad);
  const first = new Uint8Array(cols);
  for (let i = 0; i < cols; i++) first[i] = init[i] ? 2 : 0;
  out.push(first);
  for (let r = 1; r < rows; r++) {
    const next = new Uint8Array(full);
    const st = new Uint8Array(cols);
    for (let i = 0; i < full; i++) {
      const l = cur[(i - 1 + full) % full] ? 4 : 0;
      const c = cur[i] ? 2 : 0;
      const rr = cur[(i + 1) % full] ? 1 : 0;
      const alive = (rule >> (l | c | rr)) & 1;
      next[i] = alive;
      const k = i - pad;
      if (k >= 0 && k < cols) st[k] = alive ? (l ? 1 : 2) : 0;
    }
    out.push(st);
    cur = next;
  }
  return out;
}

const def: PatternDef = {
  id: 'cellular-automaton',
  name: '元胞自动机',
  category: 'J-generative',
  description: '一维初等元胞自动机（Rule 30 / 90 / 110 …）逐行演化出的三角图样；像素、方块、胶囊或圆点，新生与延续细胞分色。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f1ece3' }, opacity: 1, visible: true, configurable: true },
    { id: 'grid', label: '格点', role: 'detail', paint: { type: 'solid', color: '#d8cfc1' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'cell_a', label: '细胞 · 左承', role: 'primary', paint: { type: 'solid', color: '#3f4a52' }, opacity: 1, visible: true, configurable: true },
    { id: 'cell_b', label: '细胞 · 右承', role: 'secondary', paint: { type: 'solid', color: '#8e9fa4' }, opacity: 1, visible: true, configurable: true },
    { id: 'spark', label: '火花', role: 'accent', paint: { type: 'solid', color: '#d07a52' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'rule', label: '规则', type: 'select', default: '90',
      options: RULES.map((r) => ({ value: r, label: `Rule ${r}` })),
    },
    {
      key: 'init', label: '起始行', type: 'select', default: 'single', options: [
        { value: 'single', label: '单点' },
        { value: 'random', label: '随机' },
        { value: 'sparse', label: '稀疏多点' },
      ],
    },
    {
      key: 'shape', label: '细胞形状', type: 'select', default: 'tile', options: [
        { value: 'tile', label: '方块' },
        { value: 'pixel', label: '像素' },
        { value: 'pill', label: '胶囊' },
        { value: 'dot', label: '圆点' },
      ],
    },
    { key: 'cells', label: '格密度', type: 'range', min: 20, max: 64, step: 1, default: 42, heavy: true },
    { key: 'gap', label: '间隙', type: 'range', min: 0, max: 0.4, step: 0.02, default: 0.14 },
    { key: 'spark', label: '火花比例', type: 'range', min: 0, max: 0.1, step: 0.005, default: 0.025 },
    { key: 'gridOn', label: '格点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'paper',
      label: '纸本',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1ece3' } },
        grid: { paint: { type: 'solid', color: '#d8cfc1' }, opacity: 0.8 },
        cell_a: { paint: { type: 'solid', color: '#3f4a52' } },
        cell_b: { paint: { type: 'solid', color: '#8e9fa4' } },
        spark: { paint: { type: 'solid', color: '#d07a52' } },
      },
    },
    {
      id: 'terminal',
      label: '终端',
      elements: {
        bg: { paint: { type: 'solid', color: '#151a1c' } },
        grid: { paint: { type: 'solid', color: '#26302f' }, opacity: 1 },
        cell_a: { paint: { type: 'solid', color: '#5f9a83' } },
        cell_b: { paint: { type: 'solid', color: '#a5cdb5' } },
        spark: { paint: { type: 'solid', color: '#e2c17a' } },
      },
      params: { rule: '30', shape: 'dot', cells: 48, gap: 0.24 },
    },
    {
      id: 'loom',
      label: '织机',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b2633' } },
        grid: { paint: { type: 'solid', color: '#3a3444' }, opacity: 0.9 },
        cell_a: { paint: { type: 'solid', color: '#c48f86' } },
        cell_b: { paint: { type: 'solid', color: '#e3c4a8' } },
        spark: { paint: { type: 'solid', color: '#8fb0c4' } },
      },
      params: { rule: '110', init: 'sparse', shape: 'pill', cells: 40, gap: 0.2, spark: 0.015 },
    },
    {
      id: 'mineral',
      label: '矿物',
      elements: {
        bg: { paint: { type: 'solid', color: '#e6e8e3' } },
        grid: { paint: { type: 'solid', color: '#e6e8e3' }, opacity: 0 },
        cell_a: { paint: { type: 'solid', color: '#566b6a' } },
        cell_b: { paint: { type: 'solid', color: '#a9b8b0' } },
        spark: { paint: { type: 'solid', color: '#b58a5c' } },
      },
      params: { rule: '150', init: 'single', shape: 'pixel', cells: 52, gridOn: false },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['cell_a'],
    secondary: ['cell_b'],
    accent: ['spark'],
    detail: ['grid'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const rule = RULES.includes(String(params.rule)) ? Number(params.rule) : 90;
    const init = params.init === 'random' || params.init === 'sparse' ? params.init : 'single';
    const shape = ['pixel', 'pill', 'dot'].includes(String(params.shape)) ? String(params.shape) : 'tile';
    const cellsReq = num(params, 'cells', 20, 64);
    const gap = num(params, 'gap', 0, 0.4);
    const sparkK = num(params, 'spark', 0, 0.1);
    const gridOn = params.gridOn === true;
    const unit = unitOf(W, H);

    // 随机量一次性取够（固定消耗），保证「加粗重算」时结构不变
    const rand = new Float64Array(64 * 3 * 64 * 4);
    const originJ = rng() - 0.5;
    for (let i = 0; i < rand.length; i++) rand[i] = rng();

    const build = (cellsShort: number): { c: number; cols: number; rows: number; d: string[]; bytes: number } => {
      const c = Math.min(W, H) / cellsShort; // 像素 / 格
      const cols = Math.ceil(W / c);
      const rows = Math.ceil(H / c);
      const row0 = new Uint8Array(cols);
      if (init === 'random') {
        for (let i = 0; i < cols; i++) row0[i] = rand[i] < 0.5 ? 1 : 0;
      } else if (init === 'sparse') {
        for (let i = 0; i < cols; i++) row0[i] = rand[i] < 0.06 ? 1 : 0;
        row0[Math.floor(cols / 2)] = 1;
      } else {
        // Rule 110 只向左生长 → 起点靠右；其余居中，seed 让起点左右漂移
        const base = rule === 110 ? 0.82 : 0.5;
        const pos = Math.floor(cols * (base + originJ * (rule === 110 ? 0.12 : 0.18)));
        row0[Math.max(0, Math.min(cols - 1, pos))] = 1;
      }
      const grid = evolve(rule, cols, rows, row0, init === 'random' ? 0 : rows + 2);

      // 火花：从活细胞中按比例抽取（每格固定一个随机数）
      const isSpark = (r: number, i: number): boolean => sparkK > 0 && rand[(r * 131 + i * 7) % rand.length] < sparkK;

      const runMode = shape === 'pixel' || shape === 'pill';
      const encode = (want: (s: number, r: number, i: number) => boolean, perCell: boolean): string => {
        let d = '';
        let cx = 0;
        let cy = 0;
        const g = shape === 'pixel' ? 0 : gap;
        const capInset = shape === 'pill' ? 0.5 : 0; // 圆头会外扩半个线宽
        const lw = 1 - g;
        for (let r = 0; r < rows; r++) {
          const st = grid[r];
          let i = 0;
          while (i < cols) {
            if (!want(st[i], r, i)) {
              i++;
              continue;
            }
            let j = i + 1;
            if (!perCell) while (j < cols && want(st[j], r, j)) j++;
            const len = j - i;
            // 段的起止（格单位）
            let x0: number;
            let L: number;
            if (shape === 'dot') {
              x0 = i + 0.5;
              L = 0;
            } else if (shape === 'pill') {
              x0 = i + g / 2 + capInset * lw;
              L = Math.max(0, len - g - lw);
            } else {
              x0 = i + (perCell ? g / 2 : 0);
              L = perCell ? lw : len;
            }
            const X = Math.round(x0 * 100) / 100;
            const dx = Math.round((X - cx) * 100) / 100;
            const dy = r - cy;
            d += d === '' ? `M${X} ${r}` : `m${dx} ${dy}`;
            d += `h${Math.round(L * 100) / 100}`;
            cx = Math.round((X + L) * 100) / 100;
            cy = r;
            i = j;
          }
        }
        return d.replace(/ 0\./g, ' .').replace(/-0\./g, '-.');
      };
      const perCell = !runMode;
      const dA = encode((s, r, i) => s === 1 && !isSpark(r, i), perCell);
      const dB = encode((s, r, i) => s === 2 && !isSpark(r, i), perCell);
      const dS = encode((s, r, i) => s !== 0 && isSpark(r, i), true);
      return { c, cols, rows, d: [dA, dB, dS], bytes: dA.length + dB.length + dS.length };
    };

    let cellsShort = cellsReq;
    let geo = build(cellsShort);
    while (geo.bytes > PATH_CAP && cellsShort > 8) {
      cellsShort = Math.max(8, Math.floor(cellsShort * 0.92));
      geo = build(cellsShort);
    }

    const { c } = geo;
    const bg = elements.get('bg')!;
    const gridEl = elements.get('grid')!;
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];

    // 格点：空细胞位置的淡点（平铺，细胞会覆盖在上面）
    if (gridOn && gridEl.visible) {
      const rr = Math.max(0.6 * unit, c * 0.07);
      const tile = api.tile({
        key: `ca-grid-${api.n(c)}-${api.n(rr)}`,
        w: c,
        h: c,
        content: `<circle cx="${api.n(c / 2)}" cy="${api.n(c / 2)}" r="${api.n(rr)}" fill="${gridEl.paintValue}" fill-opacity="${op(gridEl.opacity)}"/>`,
      });
      parts.push(rect(0, 0, W, H, { fill: tile }));
    }

    const g = shape === 'pixel' ? 0 : gap;
    const lw = Math.max(0.05, 1 - g);
    const cap = shape === 'pill' || shape === 'dot' ? 'round' : 'butt';
    const crisp = shape === 'pixel' || shape === 'tile' ? ' shape-rendering="crispEdges"' : '';
    const kk = Math.round(c * 1e4) / 1e4;
    let inner = '';
    const ids = ['cell_a', 'cell_b', 'spark'];
    ids.forEach((id, k) => {
      const e = elements.get(id)!;
      const d = geo.d[k];
      if (!e.visible || d === '') return;
      inner += `<path d="${d}" stroke="${e.paintValue}" stroke-opacity="${op(e.opacity)}"/>`;
    });
    if (inner !== '') {
      parts.push(
        `<g transform="scale(${kk})translate(0 .5)" fill="none" stroke-width="${api.n(lw)}" stroke-linecap="${cap}"${crisp}>${inner}</g>`,
      );
    }
    return { body: parts.join('') };
  },
};

export default def;
