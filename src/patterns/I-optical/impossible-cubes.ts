/**
 * 不可能立方 —— I 光学错觉（等距平铺）。
 *
 * 两种母体，都按「面朝向」上色（亮面 / 中间面 / 暗面），光照方向在整张图里保持一致：
 *  - tribar  彭罗斯三角：三根方梁首尾相接却不可能存在；每块 L 形色区 = 一条边的外侧带 +
 *            下一条边的内侧带（三角格坐标里 6 个顶点，旋转 120° 得到另外两块）。
 *            铺在三角格上，可选正倒交错把格子填满。
 *  - notched 缺角立方：tumbling blocks 的每块立方在正前角被挖掉一个小立方，
 *            凹腔的三面与凸角形状完全相同、明暗却反转 → 视觉在「缺了一角」与「角上多一块」之间来回跳。
 *            可隔块交替（缺角 / 完整），双关更强。
 *
 * ⭐ 体积：整幅一个 `<pattern>`；单元内按颜色合并为 3 条 path（+ 可选描边），与画面尺寸无关。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { numParam, unitOf } from './_helpers';

type Vec = [number, number];
const S3 = Math.sqrt(3);

const def: PatternDef = {
  id: 'impossible-cubes',
  name: '不可能立方',
  category: 'I-optical',
  description: '彭罗斯三角或缺角立方的等距平铺，三种明暗面让平面读出「不可能」的立体。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#2a2c33' }, opacity: 1, visible: true, configurable: true },
    { id: 'face_light', label: '亮面', role: 'primary', paint: { type: 'solid', color: '#e6dccb' }, opacity: 1, visible: true, configurable: true },
    { id: 'face_mid', label: '中间面', role: 'secondary', paint: { type: 'solid', color: '#a8957c' }, opacity: 1, visible: true, configurable: true },
    { id: 'face_dark', label: '暗面', role: 'accent', paint: { type: 'solid', color: '#5b4f45' }, opacity: 1, visible: true, configurable: true },
    { id: 'edge', label: '棱线', role: 'detail', paint: { type: 'solid', color: '#1f2026' }, opacity: 0.6, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'motif',
      label: '母体',
      type: 'select',
      default: 'tribar',
      options: [
        { value: 'tribar', label: '彭罗斯三角' },
        { value: 'notched', label: '缺角立方' },
      ],
    },
    { key: 'size', label: '尺寸', type: 'range', min: 100, max: 360, step: 5, default: 220 },
    { key: 'depth', label: '镂空深度', type: 'range', min: 0.2, max: 0.6, step: 0.02, default: 0.36 },
    { key: 'alternate', label: '交错填充', type: 'toggle', default: true },
    { key: 'line', label: '棱线粗细', type: 'range', min: 0, max: 3, step: 0.25, default: 1 },
  ],

  presets: [
    {
      id: 'sandstone',
      label: '砂岩',
      elements: {
        bg: { paint: { type: 'solid', color: '#2a2c33' } },
        face_light: { paint: { type: 'solid', color: '#e6dccb' } },
        face_mid: { paint: { type: 'solid', color: '#a8957c' } },
        face_dark: { paint: { type: 'solid', color: '#5b4f45' } },
        edge: { paint: { type: 'solid', color: '#1f2026' }, opacity: 0.6 },
      },
    },
    {
      id: 'porcelain',
      label: '青瓷',
      elements: {
        bg: { paint: { type: 'solid', color: '#eef0ec' } },
        face_light: { paint: { type: 'solid', color: '#c6d6d1' } },
        face_mid: { paint: { type: 'solid', color: '#8fb0ab' } },
        face_dark: { paint: { type: 'solid', color: '#3f5f63' } },
        edge: { paint: { type: 'solid', color: '#2c3f42' }, opacity: 0.35 },
      },
      params: { size: 200, alternate: false, line: 0.75 },
    },
    {
      id: 'escher-notch',
      label: '缺角',
      elements: {
        bg: { paint: { type: 'solid', color: '#1e2128' } },
        face_light: { paint: { type: 'solid', color: '#d8cfc0' } },
        face_mid: { paint: { type: 'solid', color: '#8c7f73' } },
        face_dark: { paint: { type: 'solid', color: '#3d3a3e' } },
        edge: { paint: { type: 'solid', color: '#16181d' }, opacity: 0.5 },
      },
      params: { motif: 'notched', size: 180, depth: 0.42, alternate: true, line: 0.75 },
    },
    {
      id: 'dusk-blocks',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#2d2738' } },
        face_light: { paint: { type: 'solid', color: '#e3c7a8' } },
        face_mid: { paint: { type: 'solid', color: '#b07c6e' } },
        face_dark: { paint: { type: 'solid', color: '#4e3d5c' } },
        edge: { paint: { type: 'solid', color: '#241e2e' }, opacity: 0.4 },
      },
      params: { motif: 'notched', size: 220, depth: 0.5, alternate: false, line: 0.5 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['face_light'], secondary: ['face_mid'], accent: ['face_dark'], detail: ['edge'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const u = unitOf(W, H);
    const motif = params.motif === 'notched' ? 'notched' : 'tribar';
    const size = numParam(params, 'size', 100, 360) * u;
    const depth = numParam(params, 'depth', 0.2, 0.6);
    const alternate = params.alternate === true;
    const lineW = numParam(params, 'line', 0, 3) * u;
    const n = api.n;

    // 三种明暗的子路径（单元坐标）。faces = 底层大面，over = 压在上面的凹腔小面
    // （按颜色合并成 path 后，必须「所有大面 → 所有小面」分两层画，否则后画的大面会盖住凹腔）。
    const faces: [string, string, string] = ['', '', ''];
    const over: [string, string, string] = ['', '', ''];
    const poly = (pts: Vec[]): string =>
      `M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join('L')}z`.replace(/ -/g, '-').replace(/L-/g, 'L-');

    let tileW: number;
    let tileH: number;

    if (motif === 'tribar') {
      // ── 彭罗斯三角：三角格 ─────────────────────────
      const L = size;
      const hL = (L * S3) / 2;
      tileW = L;
      tileH = 2 * hL;
      const gap = alternate ? 0.13 : 0.2;
      const Lf = L * (1 - gap);
      const nn = 6 / (1 - depth * 0.75);
      const s = Lf / nn;
      // 三角格坐标 (a,b) → 相对外三角形重心的平面坐标（y 向下）
      const toXY = (a: number, b: number): Vec => [(a + b / 2) * s - Lf / 2, -((b * S3) / 2) * s + (Lf * S3) / 6];
      const R1: Vec[] = [[nn, 0], [1, 0], [1, nn - 3], [2, nn - 4], [2, 1], [nn - 1, 1]];
      const rot = ([a, b]: Vec): Vec => [nn - a - b, a];
      const R2 = R1.map(rot);
      const R3 = R2.map(rot);
      // 外侧带为水平边 → 亮面；右斜边 → 中间面；左斜边 → 暗面（旋转 180° 后各边朝向不变）
      const shapes: Vec[][] = [R1, R2, R3].map((R) => R.map(([a, b]) => toXY(a, b)));
      const place = (cx: number, cy: number, flip: boolean): void => {
        shapes.forEach((sh, k) => {
          faces[k] += poly(sh.map(([x, y]) => (flip ? [cx - x, cy - y] : [cx + x, cy + y])));
        });
      };
      for (let r = -1; r <= 2; r++) {
        const off = ((r % 2) + 2) % 2 === 1 ? L / 2 : 0;
        const yt = r * hL;
        for (let c = -2; c <= 2; c++) {
          const x0 = c * L + off;
          // 正三角（底在下）：重心 (x0 + L/2, yt + 2h/3)
          const ux = x0 + L / 2;
          const uy = yt + (2 * hL) / 3;
          if (ux + L > 0 && ux - L < tileW && uy + L > 0 && uy - L < tileH) place(ux, uy, false);
          if (alternate) {
            const dx = x0 + L;
            const dy = yt + hL / 3;
            if (dx + L > 0 && dx - L < tileW && dy + L > 0 && dy - L < tileH) place(dx, dy, true);
          }
        }
      }
    } else {
      // ── 缺角立方：tumbling blocks（尖顶六边形）──────────
      const s = size / S3; // 六边形外接半径
      const sw = s * S3; // 列距 = 立方宽
      tileW = alternate ? 2 * sw : sw;
      tileH = 3 * s;
      const k = depth;
      const T: Vec = [0, -s];
      const TR: Vec = [sw / 2, -s / 2];
      const BR: Vec = [sw / 2, s / 2];
      const B: Vec = [0, s];
      const BL: Vec = [-sw / 2, s / 2];
      const TL: Vec = [-sw / 2, -s / 2];
      const O: Vec = [0, 0];
      const sc = (p: Vec): Vec => [p[0] * k, p[1] * k];
      const cube = (cx: number, cy: number, notched: boolean): void => {
        const at = (pts: Vec[]): string => poly(pts.map(([x, y]) => [cx + x, cy + y]));
        faces[0] += at([O, TL, T, TR]); // 顶面
        faces[1] += at([O, TL, BL, B]); // 左面
        faces[2] += at([O, TR, BR, B]); // 右面
        if (notched) {
          over[0] += at([O, sc(BR), sc(B), sc(BL)]); // 凹腔底面（亮）
          over[2] += at([O, sc(BL), sc(TL), sc(T)]); // 凹腔左墙（与右面同朝向 → 暗）
          over[1] += at([O, sc(BR), sc(TR), sc(T)]); // 凹腔右墙（与左面同朝向 → 中）
        }
      };
      for (let j = -1; j <= 3; j++) {
        const off = ((j % 2) + 2) % 2 === 1 ? sw / 2 : 0;
        const cy = j * 1.5 * s;
        for (let i = -1; i <= 4; i++) {
          const cx = i * sw + off;
          if (cx + sw < 0 || cx - sw > tileW || cy + s < 0 || cy - s > tileH) continue;
          const notched = alternate ? ((i % 2) + 2) % 2 === 0 : true;
          cube(cx, cy, notched);
        }
      }
    }

    const fl = elements.get('face_light')!;
    const fm = elements.get('face_mid')!;
    const fd = elements.get('face_dark')!;
    const edge = elements.get('edge')!;
    const bg = elements.get('bg')!;
    const strokeOn = edge.visible && lineW > 0;
    const stroke = strokeOn
      ? { stroke: edge.paintValue, 'stroke-opacity': n(edge.opacity), 'stroke-width': n(lineW), 'stroke-linejoin': 'round' }
      : {};
    let content = '';
    for (const layer of [faces, over]) {
      [fl, fm, fd].forEach((el, i) => {
        if (layer[i] === '') return;
        if (el.visible) content += path(layer[i], { fill: el.paintValue, 'fill-opacity': n(el.opacity), ...stroke });
        else if (strokeOn) content += path(layer[i], { fill: 'none', ...stroke });
      });
    }

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    if (content !== '') {
      // 平铺原点移到画面中心，横竖屏都左右对称
      const ref = api.tile({
        key: `ic-${motif}-${n(size)}-${n(depth)}-${alternate ? 1 : 0}`,
        w: tileW,
        h: tileH,
        content,
        transform: `translate(${n(W / 2)} ${n(H / 2)})`,
      });
      parts.push(rect(0, 0, W, H, { fill: ref }));
    }
    return { body: parts.join('') };
  },
};

export default def;
