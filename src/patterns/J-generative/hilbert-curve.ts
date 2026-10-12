/**
 * 空间填充曲线 —— J 数学生成 / 平铺（<pattern>）。
 *
 * 两种曲线（L-system 生成，阶数 2–5，每阶边长翻倍）：
 *  - moore   摩尔曲线：希尔伯特曲线的闭合版，一个单元一个闭环；环内可填色，形成蜿蜒的迷宫色块；
 *  - hilbert 希尔伯特曲线：起止点落在单元上边两角，左右相邻单元首尾相接 → 每一行单元是一条连续长线；
 *            曲线与单元上边围出的区域可填色。
 * 拐角用二次曲线倒圆角（圆角 0 = 直角迷宫，1 = 半格圆弧）。
 *
 * 图层（同一条路径在 <pattern> 内用 <use> 复用）：填充 → 投影（偏移）→ 主线 → 线芯（细亮线，霓虹 / 管道感）。
 *
 * ⭐ 体积：路径在「每格 10 单位」的整数坐标里用相对命令编码，只在单元内画一次，
 * `api.tile` 平铺 → 与分辨率、画面大小无关。非 seedable（数学确定）。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { num, op, pair, unitOf } from './_helpers';

type Pt = [number, number];

/** L-system 展开 + 海龟作图 → 格点序列（每步一格）。 */
function lsystem(axiom: string, rules: Record<string, string>, order: number): Pt[] {
  let s = axiom;
  for (let i = 0; i < order; i++) {
    let t = '';
    for (const ch of s) t += rules[ch] ?? ch;
    s = t;
  }
  const pts: Pt[] = [[0, 0]];
  let x = 0;
  let y = 0;
  let dx = 1;
  let dy = 0;
  for (const ch of s) {
    if (ch === 'F') {
      x += dx;
      y += dy;
      pts.push([x, y]);
    } else if (ch === '+') {
      [dx, dy] = [-dy, dx];
    } else if (ch === '-') {
      [dx, dy] = [dy, -dx];
    }
  }
  return pts;
}

/** 8 种对称变换之一，平移到 [0, N-1]。 */
function normalize(pts: Pt[], k: number): Pt[] {
  const tf = (p: Pt): Pt => {
    let [x, y] = p;
    if (k & 1) x = -x;
    if (k & 2) y = -y;
    if (k & 4) [x, y] = [y, x];
    return [x, y];
  };
  const out = pts.map(tf);
  const mx = Math.min(...out.map((p) => p[0]));
  const my = Math.min(...out.map((p) => p[1]));
  return out.map(([x, y]) => [x - mx, y - my]);
}

const cache = new Map<string, Pt[]>();

function curvePoints(kind: 'moore' | 'hilbert', order: number): Pt[] {
  const key = `${kind}${order}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let pts: Pt[];
  if (kind === 'moore') {
    // 摩尔曲线 order≥1：边长 2^order
    pts = normalize(lsystem('LFL+F+LFL', { L: '-RF+LFL+FR-', R: '+LF-RFR-FL+' }, order - 1), 0);
  } else {
    const raw = lsystem('A', { A: '+BF-AFA-FB+', B: '-AF+BFB+FA-' }, order);
    const N = 2 ** order;
    pts = raw;
    for (let k = 0; k < 8; k++) {
      const c = normalize(raw, k);
      const a = c[0];
      const b = c[c.length - 1];
      if (a[1] === 0 && b[1] === 0 && Math.min(a[0], b[0]) === 0 && Math.max(a[0], b[0]) === N - 1) {
        pts = a[0] === 0 ? c : c.slice().reverse();
        break;
      }
    }
  }
  cache.set(key, pts);
  return pts;
}

/**
 * 格点序列 → 圆角相对路径（坐标 ×10，格心在 5、15、25…）。
 * 只保留拐点；每个拐点前后各让出 r，用 q 以拐点为控制点连接。
 */
function roundedPath(cells: Pt[], r: number, closed: boolean, lead: Pt | null, tail: Pt | null): string {
  const P = cells.map(([x, y]): Pt => [x * 10 + 5, y * 10 + 5]);
  if (lead) P.unshift(lead);
  if (tail) P.push(tail);
  // 拐点压缩
  const C: Pt[] = [];
  const m = P.length;
  for (let i = 0; i < m; i++) {
    if (!closed && (i === 0 || i === m - 1)) {
      C.push(P[i]);
      continue;
    }
    const a = P[(i - 1 + m) % m];
    const b = P[i];
    const c = P[(i + 1) % m];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) C.push(b);
  }
  const n = C.length;
  const sgn = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0);
  let d = '';
  let cx = 0;
  let cy = 0;
  const lineTo = (x: number, y: number): void => {
    if (x === cx && y === cy) return;
    d += x === cx ? `v${y - cy}` : y === cy ? `h${x - cx}` : `l${pair(x - cx, y - cy)}`;
    cx = x;
    cy = y;
  };
  const corner = (prev: Pt, at: Pt, next: Pt): void => {
    const ix = sgn(at[0] - prev[0]);
    const iy = sgn(at[1] - prev[1]);
    const ox = sgn(next[0] - at[0]);
    const oy = sgn(next[1] - at[1]);
    if (r <= 0) {
      lineTo(at[0], at[1]);
      return;
    }
    lineTo(at[0] - ix * r, at[1] - iy * r);
    const ex = at[0] + ox * r;
    const ey = at[1] + oy * r;
    d += `q${pair(at[0] - cx, at[1] - cy)}${ex - cx < 0 ? '' : ' '}${pair(ex - cx, ey - cy)}`;
    cx = ex;
    cy = ey;
  };
  if (closed) {
    // 从第 0 个拐点之后的边中点起笔
    const s0 = C[0];
    const s1 = C[1 % n];
    cx = Math.round((s0[0] + s1[0]) / 2);
    cy = Math.round((s0[1] + s1[1]) / 2);
    d = `M${pair(cx, cy)}`;
    for (let k = 1; k <= n; k++) corner(C[(k - 1 + n) % n], C[k % n], C[(k + 1) % n]);
    d += 'z';
  } else {
    cx = C[0][0];
    cy = C[0][1];
    d = `M${pair(cx, cy)}`;
    for (let k = 1; k < n - 1; k++) corner(C[k - 1], C[k], C[k + 1]);
    lineTo(C[n - 1][0], C[n - 1][1]);
  }
  return d;
}

const def: PatternDef = {
  id: 'hilbert-curve',
  name: '空间填充曲线',
  category: 'J-generative',
  description: '希尔伯特 / 摩尔空间填充曲线平铺成的圆角迷宫，可填色、加投影与线芯；阶数决定自相似的层级。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#1c232d' }, opacity: 1, visible: true, configurable: true },
    { id: 'fill', label: '环内填色', role: 'secondary', paint: { type: 'solid', color: '#2c3a48' }, opacity: 1, visible: true, configurable: true },
    { id: 'shadow', label: '投影', role: 'detail', paint: { type: 'solid', color: '#141a22' }, opacity: 0.7, visible: true, configurable: true },
    { id: 'line', label: '曲线', role: 'primary', paint: { type: 'solid', color: '#7fa3b8' }, opacity: 1, visible: true, configurable: true },
    { id: 'core', label: '线芯', role: 'accent', paint: { type: 'solid', color: '#d8e6ea' }, opacity: 0.55, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'curve', label: '曲线', type: 'select', default: 'moore', options: [
        { value: 'moore', label: '摩尔（闭环）' },
        { value: 'hilbert', label: '希尔伯特（连续）' },
      ],
    },
    { key: 'order', label: '阶数', type: 'range', min: 2, max: 5, step: 1, default: 4, heavy: true },
    { key: 'cells', label: '格密度', type: 'range', min: 14, max: 60, step: 1, default: 34 },
    { key: 'round', label: '圆角', type: 'range', min: 0, max: 1, step: 0.1, default: 1 },
    { key: 'weight', label: '线宽', type: 'range', min: 0.1, max: 0.6, step: 0.02, default: 0.3 },
    { key: 'shadowOn', label: '投影', type: 'toggle', default: true },
    { key: 'tilt', label: '旋转 45°', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'night-circuit',
      label: '夜色回路',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c232d' } },
        fill: { paint: { type: 'solid', color: '#2c3a48' } },
        shadow: { paint: { type: 'solid', color: '#141a22' }, opacity: 0.7 },
        line: { paint: { type: 'solid', color: '#7fa3b8' } },
        core: { paint: { type: 'solid', color: '#d8e6ea' }, opacity: 0.55 },
      },
    },
    {
      id: 'terracotta',
      label: '陶土迷宫',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe6da' } },
        fill: { paint: { type: 'solid', color: '#e2cdb6' } },
        shadow: { paint: { type: 'solid', color: '#c9b39b' }, opacity: 0.6 },
        line: { paint: { type: 'solid', color: '#b5674d' } },
        core: { paint: { type: 'solid', color: '#f4e3d0' }, opacity: 0.5 },
      },
      params: { curve: 'hilbert', order: 4, cells: 30, weight: 0.36 },
    },
    {
      id: 'mint-line',
      label: '薄荷细线',
      elements: {
        bg: { paint: { type: 'solid', color: '#eef2ee' } },
        fill: { paint: { type: 'solid', color: '#dfe9e2' } },
        shadow: { paint: { type: 'solid', color: '#cddbd2' }, opacity: 0.8 },
        line: { paint: { type: 'solid', color: '#6f9483' } },
        core: { paint: { type: 'solid', color: '#f7faf7' }, opacity: 0.6 },
      },
      params: { order: 4, cells: 46, weight: 0.16, shadowOn: false, tilt: true },
    },
    {
      id: 'plum-pipe',
      label: '梅紫管道',
      elements: {
        bg: { paint: { type: 'solid', color: '#2a2230' } },
        fill: { paint: { type: 'solid', color: '#3b2f42' } },
        shadow: { paint: { type: 'solid', color: '#17121b' }, opacity: 0.8 },
        line: { paint: { type: 'solid', color: '#b98aa6' } },
        core: { paint: { type: 'solid', color: '#f0d9e4' }, opacity: 0.7 },
      },
      params: { order: 3, cells: 22, weight: 0.5, round: 1 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['line'],
    secondary: ['fill'],
    accent: ['core'],
    detail: ['shadow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const kind = params.curve === 'hilbert' ? 'hilbert' : 'moore';
    const order = Math.round(num(params, 'order', 2, 5));
    const cellsAcross = num(params, 'cells', 14, 60);
    const roundK = num(params, 'round', 0, 1);
    const weight = num(params, 'weight', 0.1, 0.6);
    const shadowOn = params.shadowOn === true;
    const tilt = params.tilt === true;
    const unit = unitOf(W, H);

    const N = 2 ** order;
    const cell = Math.min(W, H) / cellsAcross; // 像素
    const k = cell / 10; // 每格 10 单位 → 像素
    const r = Math.round(roundK * 5);
    const pts = curvePoints(kind, order);

    const bgEl = elements.get('bg')!;
    const fill = elements.get('fill')!;
    const shadow = elements.get('shadow')!;
    const line = elements.get('line')!;
    const core = elements.get('core')!;

    // 希尔伯特：左右各补半格，与相邻单元首尾相接；填色区 = 曲线与单元上边围成的区域
    const dLine = kind === 'moore' ? roundedPath(pts, r, true, null, null) : roundedPath(pts, r, false, [0, 5], [N * 10, 5]);

    const id = `hc${kind[0]}${order}r${r}`;
    const sw = weight * 10;
    const minPx = 0.8 * unit; // 线宽下限（像素）
    const swU = Math.max(sw, minPx / k);
    // 希尔伯特：单元高 2 行，第二行上下镜像 → 填色区跨行相连，不出现横向接缝
    const T = N * 10;
    const TH = kind === 'hilbert' ? 2 * T : T;
    const mirror = `matrix(1 0 0 -1 0 ${TH})`;
    const gid = `${id}g`;
    const curveG = kind === 'hilbert' ? `<use href="#${id}"/><use href="#${id}" transform="${mirror}"/>` : `<use href="#${id}"/>`;
    let content = `<defs><path id="${id}" d="${dLine}"/><g id="${gid}">${curveG}</g></defs>`;
    if (fill.visible) {
      // 复用同一条路径作填充（开放路径按首尾连线隐式闭合）；希尔伯特再补上曲线与单元上边之间的 5 单位窄条
      const f = `fill="${fill.paintValue}" fill-opacity="${op(fill.opacity)}"`;
      content += kind === 'hilbert'
        ? `<g ${f}><use href="#${gid}"/><rect width="${T}" height="5"/><rect y="${TH - 5}" width="${T}" height="5"/></g>`
        : `<use href="#${id}" ${f}/>`;
    }
    const strokeCommon = `fill="none" stroke-linecap="round" stroke-linejoin="round"`;
    if (shadowOn && shadow.visible) {
      const off = Math.max(0.6, swU * 0.45);
      // 投影越过单元右 / 下边的部分会被 <pattern> 裁掉 → 在左 / 上方补三份回绕副本
      let uses = '';
      for (const [ox, oy] of [[0, 0], [-T, 0], [0, -TH], [-T, -TH]]) {
        uses += `<use href="#${gid}" x="${api.n(off + ox)}" y="${api.n(off + oy)}"/>`;
      }
      content += `<g ${strokeCommon} stroke="${shadow.paintValue}" stroke-opacity="${op(shadow.opacity)}" stroke-width="${api.n(swU)}">${uses}</g>`;
    }
    if (line.visible) content += `<use href="#${gid}" ${strokeCommon} stroke="${line.paintValue}" stroke-opacity="${op(line.opacity)}" stroke-width="${api.n(swU)}"/>`;
    if (core.visible) content += `<use href="#${gid}" ${strokeCommon} stroke="${core.paintValue}" stroke-opacity="${op(core.opacity)}" stroke-width="${api.n(Math.max(swU * 0.28, (0.6 * unit) / k))}"/>`;

    // 单元内用「每格 10 单位」坐标，外包一层 scale
    const kk = Math.round(k * 1e4) / 1e4;
    const tileRef = api.tile({
      key: `hilbert-${id}-${api.n(k)}-${api.n(swU)}-${shadowOn ? 1 : 0}-${tilt ? 1 : 0}`,
      w: T * kk,
      h: TH * kk,
      content: `<g transform="scale(${kk})">${content}</g>`,
      transform: tilt ? `rotate(45 ${api.n(W / 2)} ${api.n(H / 2)})` : undefined,
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bgEl.paintValue, 'fill-opacity': bgEl.opacity }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;
