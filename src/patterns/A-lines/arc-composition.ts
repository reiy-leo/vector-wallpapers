/**
 * 弧光构成 —— A 极简线条 / 几何。
 *
 * 2026-10-12 重做：旧版名为「构成」，实际是把一个小单元（三档小螺旋弧）
 * 用 <pattern> 平铺满屏，读起来是密密麻麻的贴纸。
 *
 * 新版是**单幅大尺度构成**（包豪斯 / 瑞士海报式）：
 *   - 三组同心弧，各自一个圆心，按「大 · 中 · 小」三档尺度错落布局：
 *     大组压在画面一角、只露出一部分，中组居于对角，小组作点睛；
 *   - 同组内的弧依次旋转错开起点、张角渐收，形成节奏；大组线最粗、小组最细；
 *   - 节点圆点落在部分弧的端点与圆心上，一组 1~2 个，克制；
 *   - 画面大部分是留白。
 *
 * 构图随 seed 在几种镜像 / 起始角之间变化；尺寸全部按短边比例计算。
 */
import { circle, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'arc-composition',
  name: '弧光构成',
  category: 'B-repeat',
  description: '三组大尺度同心弧错落构成，缀以节点圆点，大面积留白的包豪斯式构图。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#f2eee6' }, opacity: 1, visible: true, configurable: true },
    { id: 'arc_big', label: '大弧', role: 'primary', paint: { type: 'solid', color: '#2f3d52' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'arc_mid', label: '中弧', role: 'secondary', paint: { type: 'solid', color: '#7f9bb0' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'arc_small', label: '小弧', role: 'accent', paint: { type: 'solid', color: '#c97a55' }, opacity: 0.95, visible: true, configurable: true },
    { id: 'node', label: '节点圆点', role: 'detail', paint: { type: 'solid', color: '#b5583c' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '构图尺度', type: 'range', min: 70, max: 400, step: 10, default: 180, heavy: true },
    { key: 'arcs', label: '每组弧数', type: 'range', min: 1, max: 5, step: 1, default: 4 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.6, max: 8, step: 0.1, default: 3, unit: 'px' },
    { key: 'sweep', label: '弧张角', type: 'angle', default: 200 },
    { key: 'nodes', label: '节点圆点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'blueprint',
      label: '蓝图',
      elements: {
        bg: { paint: { type: 'solid', color: '#eef2f6' } },
        arc_big: { paint: { type: 'solid', color: '#26405f' } },
        arc_mid: { paint: { type: 'solid', color: '#5f84a8' } },
        arc_small: { paint: { type: 'solid', color: '#9bb7d1' } },
        node: { paint: { type: 'solid', color: '#26405f' } },
      },
    },
    {
      id: 'sunset',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1b26' } },
        arc_big: { paint: { type: 'solid', color: '#e7cfae' } },
        arc_mid: { paint: { type: 'solid', color: '#a88a8e' } },
        arc_small: { paint: { type: 'solid', color: '#e08a63' } },
        node: { paint: { type: 'solid', color: '#f3e7d6' } },
      },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#eef4ef' } },
        arc_big: { paint: { type: 'solid', color: '#2f5b4c' } },
        arc_mid: { paint: { type: 'solid', color: '#7fae98' } },
        arc_small: { paint: { type: 'solid', color: '#d99a6c' } },
        node: { paint: { type: 'solid', color: '#2f5b4c' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['arc_big'],
    secondary: ['arc_mid'],
    accent: ['arc_small'],
    detail: ['node'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const S = Math.min(W, H);
    const unit = Math.max(0.5, Math.min(4, S / 1080));
    const scale = Math.max(0.3, Number(params.size) / 180);
    const perGroup = Math.max(1, Math.min(5, Math.round(Number(params.arcs))));
    const weight = Math.max(0.4, Number(params.weight)) * unit;
    const sweepDeg = Math.max(20, Math.min(340, Number(params.sweep)));
    const showNodes = params.nodes === true;
    const n = api.n;

    const bg = elements.get('bg')!;
    const aBig = elements.get('arc_big')!;
    const aMid = elements.get('arc_mid')!;
    const aSmall = elements.get('arc_small')!;
    const node = elements.get('node')!;

    // 构图随 seed：水平 / 垂直镜像 + 微小位移与旋转，所有随机量先抽完
    const flipX = rng() < 0.5;
    const flipY = rng() < 0.5;
    const baseRot = (rng() - 0.5) * 24;
    const jit = [rng(), rng(), rng(), rng(), rng(), rng()];
    const mx = (x: number): number => (flipX ? W - x : x);
    const my = (y: number): number => (flipY ? H - y : y);
    const deg = (dx: number, dy: number): number => (Math.atan2(dy, dx) * 180) / Math.PI;

    interface Group {
      e: typeof aBig;
      cx: number;
      cy: number;
      r0: number; // 最外弧半径
      gap: number; // 相邻弧间距
      facing: number; // 弧的中点朝向（度，屏幕坐标：0=右，90=下）
      step: number; // 相邻两层的错位旋转量
      sweep: number;
      w: number;
    }

    // 三个圆心（镜像后的屏幕坐标）
    const bx = mx(W * (0.1 + jit[0] * 0.05));
    const by = my(H * (0.88 + jit[1] * 0.05));
    const mcx = mx(W * (0.72 + jit[2] * 0.06));
    const mcy = my(H * (0.3 + jit[3] * 0.06));
    const scx = mx(W * (0.5 + jit[4] * 0.06));
    const scy = my(H * (0.68 + jit[5] * 0.05));

    const groups: Group[] = [
      // 大组：圆心在画面一角，弧面朝向画面中心 → 一组大四分弧扫过画面
      {
        e: aBig,
        cx: bx,
        cy: by,
        r0: S * 0.66 * scale,
        gap: S * 0.06 * scale,
        facing: deg(W / 2 - bx, H / 2 - by) + baseRot,
        step: 7,
        sweep: Math.min(340, sweepDeg * 0.6),
        w: weight * 1.6,
      },
      // 中组：对角，弧背朝外、开口迎向大组 —— 两组形成呼应
      {
        e: aMid,
        cx: mcx,
        cy: mcy,
        r0: S * 0.2 * scale,
        gap: S * 0.032 * scale,
        facing: deg(mcx - bx, mcy - by) + baseRot,
        step: -18,
        sweep: sweepDeg,
        w: weight,
      },
      // 小组：点睛，弧面朝向中组
      {
        e: aSmall,
        cx: scx,
        cy: scy,
        r0: S * 0.075 * scale,
        gap: S * 0.018 * scale,
        facing: deg(mcx - scx, mcy - scy) - baseRot,
        step: 26,
        sweep: Math.min(340, sweepDeg * 0.9),
        w: weight * 0.85,
      },
    ];

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const dots: string[] = [];
    const pt = (cx: number, cy: number, r: number, a: number): [number, number] => {
      const t = (a * Math.PI) / 180;
      return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
    };

    for (let gi = 0; gi < groups.length; gi++) {
      const G = groups[gi];
      const { cx, cy } = G;
      let d = '';
      for (let k = 0; k < perGroup; k++) {
        const r = Math.max(1, G.r0 - k * G.gap);
        // 内弧张角略收，并以组中心为轴依次错位，层次自然
        const sw = Math.max(20, G.sweep * (1 - k * 0.08));
        const mid = G.facing + (k - (perGroup - 1) / 2) * G.step;
        const a0 = mid - sw / 2;
        const a1 = mid + sw / 2;
        const [x0, y0] = pt(cx, cy, r, a0);
        const [x1, y1] = pt(cx, cy, r, a1);
        d += `M${n(x0)} ${n(y0)}A${n(r)} ${n(r)} 0 ${sw > 180 ? 1 : 0} 1 ${n(x1)} ${n(y1)}`;
        // 节点：外弧的终点 + 中/小组第二层弧的起点
        if (k === 0) dots.push(`${n(x1)},${n(y1)},${n(G.w * 2)}`);
        if (k === 1 && gi !== 0) dots.push(`${n(x0)},${n(y0)},${n(G.w * 1.5)}`);
      }
      if (gi === 1) dots.push(`${n(cx)},${n(cy)},${n(weight * 1.6)}`); // 中组圆心
      if (gi === 1) dots.push(`${n(cx)},${n(cy)},${n(weight * 1.8)}`); // 中组圆心
      if (!G.e.visible) continue;
      parts.push(
        path(d, {
          fill: 'none',
          stroke: G.e.paintValue,
          'stroke-width': G.w,
          'stroke-opacity': G.e.opacity,
          'stroke-linecap': 'round',
        }),
      );
    }

    if (showNodes && node.visible) {
      for (const s of dots) {
        const [x, y, r] = s.split(',').map(Number);
        parts.push(circle(x, y, Math.max(1.5, r), { fill: node.paintValue, 'fill-opacity': node.opacity }));
      }
    }

    return { body: parts.join('') };
  },
};

export default def;
