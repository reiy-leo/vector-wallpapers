/**
 * 云雷纹 —— F 传统纹样（商周青铜器地纹）。
 *
 * 基本单元是一对方螺旋「S 形勾连」：左螺旋自中心顺时针向外绕 t 圈，外臂从顶边伸出，
 * 经两螺旋之间的竖向连杆下行，接入绕 180° 的右螺旋 → 一笔连成的双勾雷纹。
 * 所有线落在步长 s 的网格上，线距恒为 1 格，像铸纹一样匀密。
 *
 * - round 圆润度：转角圆弧半径（0 = 方折雷纹，0.5 = 圆转云纹），模拟铸造后的圆钝棱角；
 * - field 满铺：单元按砖砌错位铺满，隔行镜像，作器身「地纹」；
 * - band  饰带：一行雷纹夹在上下弦纹之间，如鼎口沿；
 * - border：饰带的弦纹；满铺时是线心一道细阴刻（双钩）；
 * - key_shadow：错位投影，给出一点浮雕感。
 *
 * 走 <pattern> 平铺。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';
import { clamp, f, op, unitOf } from './_helpers';

type Pt = [number, number];

/**
 * 一个 S 形双勾单元的折线（网格单位）。返回点列、单元宽 cw、高 bh。
 * 左螺旋占 [0,bw]，连杆在 x = bw+1，右螺旋占 [bw+2, 2bw+2]。
 */
function unitPolyline(t: number): { pts: Pt[]; cw: number; bh: number } {
  // 自中心顺时针（y 向下）：右、下、左、上……步长 1,1,2,2,3,3…；最后一段向右，位于顶边
  const dirs: Pt[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const segs = 4 * t + 1;
  const raw: Pt[] = [[0, 0]];
  let x = 0;
  let y = 0;
  for (let k = 0; k < segs; k++) {
    const len = Math.floor(k / 2) + 1;
    x += dirs[k % 4][0] * len;
    y += dirs[k % 4][1] * len;
    raw.push([x, y]);
  }
  const body = raw.slice(0, -1); // 最后一段的终点稍后改到连杆处
  const minX = Math.min(...body.map((p) => p[0]));
  const maxX = Math.max(...body.map((p) => p[0]));
  const minY = Math.min(...raw.map((p) => p[1]));
  const maxY = Math.max(...raw.map((p) => p[1]));
  const bw = maxX - minX;
  const bh = maxY - minY;
  const A: Pt[] = body.map(([px, py]) => [px - minX, py - minY]);
  const mx = bw + 1;
  const eTop: Pt = [mx, raw[raw.length - 1][1] - minY];
  const cw = 2 * mx;
  const rot = ([px, py]: Pt): Pt => [cw - px, bh - py];
  const B = [...A].reverse().map(rot);
  const pts: Pt[] = [...A, eTop, rot(eTop), ...B];
  return { pts, cw, bh };
}

/** 折线 → path，转角用半径 r（网格单位）的二次曲线倒圆。 */
function roundedPath(pts: Pt[], r: number, s: number, ox: number, oy: number, mirror: boolean, cw: number): string {
  const P = ([x, y]: Pt): string => `${f(ox + (mirror ? cw - x : x) * s)} ${f(oy + y * s)}`;
  if (r <= 0.001) return 'M' + pts.map(P).join('L');
  let d = 'M' + P(pts[0]);
  for (let i = 1; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    const [cx, cy] = pts[i + 1];
    const l1 = Math.hypot(bx - ax, by - ay);
    const l2 = Math.hypot(cx - bx, cy - by);
    const r1 = Math.min(r, l1 / 2);
    const r2 = Math.min(r, l2 / 2);
    const p1: Pt = [bx - ((bx - ax) / l1) * r1, by - ((by - ay) / l1) * r1];
    const p2: Pt = [bx + ((cx - bx) / l2) * r2, by + ((cy - by) / l2) * r2];
    d += 'L' + P(p1) + 'Q' + P([bx, by]) + ' ' + P(p2);
  }
  return d + 'L' + P(pts[pts.length - 1]);
}

const def: PatternDef = {
  id: 'meander-key',
  name: '云雷纹',
  category: 'F-ornament',
  description: '商周青铜器上的云雷地纹：一对方螺旋 S 形勾连，错位铺满或作饰带；圈数、线宽、圆润度可调。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#2b3a33' }, opacity: 1, visible: true, configurable: true },
    { id: 'band', label: '饰带底', role: 'secondary', paint: { type: 'solid', color: '#33463d' }, opacity: 1, visible: true, configurable: true },
    { id: 'key', label: '雷纹线', role: 'primary', paint: { type: 'solid', color: '#8fae94' }, opacity: 1, visible: true, configurable: true },
    { id: 'border', label: '弦纹 / 阴刻', role: 'accent', paint: { type: 'solid', color: '#b49a62' }, opacity: 1, visible: true, configurable: true },
    { id: 'key_shadow', label: '投影', role: 'detail', paint: { type: 'solid', color: '#1a241f' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '纹样大小', type: 'range', min: 3, max: 16, step: 1, default: 7, heavy: true },
    { key: 'turns', label: '螺旋圈数', type: 'range', min: 1, max: 4, step: 1, default: 2 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.3, max: 0.65, step: 0.05, default: 0.5 },
    { key: 'round', label: '圆润度', type: 'range', min: 0, max: 0.5, step: 0.05, default: 0.2 },
    { key: 'spacing', label: '带距', type: 'range', min: 0.2, max: 3, step: 0.1, default: 1 },
    {
      key: 'layout', label: '排布', type: 'select', default: 'field', options: [
        { value: 'field', label: '满铺' },
        { value: 'band', label: '饰带' },
      ],
    },
    { key: 'shadow', label: '浮雕投影', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'patina',
      label: '青铜锈',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b3a33' } },
        band: { paint: { type: 'solid', color: '#33463d' } },
        key: { paint: { type: 'solid', color: '#8fae94' } },
        border: { paint: { type: 'solid', color: '#b49a62' } },
        key_shadow: { paint: { type: 'solid', color: '#1a241f' }, opacity: 0.9 },
      },
    },
    {
      id: 'gilt-bronze',
      label: '鎏金',
      elements: {
        bg: { paint: { type: 'solid', color: '#3a2a1c' } },
        band: { paint: { type: 'solid', color: '#46331f' } },
        key: { paint: { type: 'solid', color: '#c9a35c' } },
        border: { paint: { type: 'solid', color: '#e0c486' } },
        key_shadow: { paint: { type: 'solid', color: '#1f160e' }, opacity: 0.85 },
      },
      params: { round: 0.1, turns: 3, size: 6 },
    },
    {
      id: 'rubbing',
      label: '拓片',
      elements: {
        bg: { paint: { type: 'solid', color: '#ece7dc' } },
        band: { paint: { type: 'solid', color: '#e2dccf' } },
        key: { paint: { type: 'solid', color: '#2a2a2a' } },
        border: { paint: { type: 'solid', color: '#6b6258' } },
        key_shadow: { paint: { type: 'solid', color: '#cfc7b8' }, opacity: 0.8 },
      },
      params: { round: 0.3, weight: 0.55, shadow: false },
    },
    {
      id: 'cloud-band',
      label: '云纹饰带',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f2b27' } },
        band: { paint: { type: 'solid', color: '#3c5a4e' } },
        key: { paint: { type: 'solid', color: '#a8c6ae' } },
        border: { paint: { type: 'solid', color: '#c2a36b' } },
        key_shadow: { paint: { type: 'solid', color: '#18221e' }, opacity: 0.9 },
      },
      params: { layout: 'band', round: 0.5, size: 10, spacing: 1.4 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['key'], secondary: ['band'], accent: ['border'], detail: ['key_shadow'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const size = Math.round(clamp(params.size, 3, 16, 7));
    const t = Math.round(clamp(params.turns, 1, 4, 2));
    const weight = clamp(params.weight, 0.3, 0.65, 0.5);
    const round = clamp(params.round, 0, 0.5, 0.2);
    const spacing = clamp(params.spacing, 0.2, 3, 1);
    const field = params.layout !== 'band';
    const shadowOn = params.shadow === true;
    const unit = unitOf(W, H);
    const n = api.n;

    const bg = elements.get('bg')!;
    const band = elements.get('band')!;
    const key = elements.get('key')!;
    const border = elements.get('border')!;
    const shadow = elements.get('key_shadow')!;

    const { pts, cw, bh } = unitPolyline(t);
    const pitchX = cw + 1; // 单元间留 1 格
    // size = 长边方向能放下的单元数 → 网格步长
    const s = Math.max(W, H) / size / pitchX;
    const sw = s * weight;
    const off = Math.max(unit * 0.8, sw * 0.3);
    const tileW = pitchX * s;
    const unitD = (ox: number, oy: number, mirror: boolean): string => roundedPath(pts, round, s, ox, oy, mirror, cw);

    const line = (d: string, el: typeof key, w: number, extra: Record<string, string | undefined> = {}): string =>
      path(d, {
        fill: 'none',
        stroke: el.paintValue,
        'stroke-width': n(w),
        'stroke-opacity': op(el.opacity),
        'stroke-linecap': round > 0 ? 'round' : 'square',
        'stroke-linejoin': round > 0 ? 'round' : 'miter',
        ...extra,
      });
    const withShadow = (d: string): string =>
      (shadowOn ? line(d, shadow, sw, { transform: `translate(${n(off)} ${n(off)})` }) : '') +
      line(d, key, sw) +
      // 满铺时弦纹色作为线心的一道细阴刻（铸纹「双钩」感）；饰带时它是上下弦纹
      (field ? line(d, border, Math.max(unit * 0.6, sw * 0.18)) : '');

    const parts: string[] = [];
    let tileH: number;
    if (field) {
      // 砖砌错位：两行一周期，第二行右移半个单元并左右镜像；跨边的单元左右各补一份
      const rowH = (bh + 1) * s;
      tileH = 2 * rowH;
      let d = unitD(0.5 * s, 0.5 * s, false);
      const x2 = 0.5 * s + tileW / 2;
      d += unitD(x2, rowH + 0.5 * s, true) + unitD(x2 - tileW, rowH + 0.5 * s, true);
      parts.push(rect(0, rowH, tileW, rowH, { fill: band.paintValue, 'fill-opacity': op(band.opacity) }));
      parts.push(withShadow(d));
    } else {
      // 饰带：一行雷纹，上下各一道粗弦纹 + 外侧细弦纹
      const bandH = (bh + 4) * s;
      const gap = bandH * spacing;
      tileH = bandH + gap;
      const y0 = gap / 2;
      parts.push(rect(0, y0, tileW, bandH, { fill: band.paintValue, 'fill-opacity': op(band.opacity) }));
      const ky = y0 + 2 * s;
      parts.push(withShadow(unitD(0.5 * s, ky, false)));
      const b1 = `M0 ${f(ky - s)}H${f(tileW)}M0 ${f(ky + (bh + 1) * s)}H${f(tileW)}`;
      const b2 = `M0 ${f(y0 + sw * 0.4)}H${f(tileW)}M0 ${f(y0 + bandH - sw * 0.4)}H${f(tileW)}`;
      parts.push(
        g(
          { fill: 'none', stroke: border.paintValue, 'stroke-opacity': op(border.opacity) },
          path(b1, { 'stroke-width': n(sw * 0.7) }) + path(b2, { 'stroke-width': n(Math.max(unit * 0.75, sw * 0.3)) }),
        ),
      );
    }

    const tileRef = api.tile({
      key: `leiwen-${n(s)}-${t}-${n(sw)}-${n(round)}-${n(spacing)}-${field ? 1 : 0}-${shadowOn ? 1 : 0}`,
      w: tileW,
      h: tileH,
      content: parts.join(''),
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': op(bg.opacity) }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;
