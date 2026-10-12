/**
 * 构成主义 —— M 设计流派（俄国构成主义 / 至上主义海报构图）。
 *
 * 与 `bauhaus-blocks`（正交模块格、平铺、安静）相反，这里是**动势**：
 *   - 整个构图沿一条斜轴（默认约 28°）组织：大斜色面横切画面，
 *     一枚长红楔从画外刺入大圆盘（致敬 Lissitzky「红楔」的结构，非复刻），
 *   - 粗黑条平行 / 垂直于斜轴错落，长细线贯穿全画面，几枚小圆、小方作为节奏点；
 *   - 红、黑、米色为主，低饱和、带纸感。
 *
 * 构图在「斜轴坐标系」里写（x 沿轴、y 垂直轴），外层一个 rotate 摆正；
 * 虚拟坐标短边 = 1000，体积与分辨率无关（< 30 个图形）。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampNum, op, ri } from './_helpers';

const V = 1000;

const def: PatternDef = {
  id: 'constructivist',
  name: '构成主义',
  category: 'M-movement',
  description: '沿斜轴展开的海报构图：大斜色面、刺入圆盘的红楔、粗黑条与贯穿全幅的细线，红黑米色。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '纸色', role: 'bg', paint: { type: 'solid', color: '#e8dfcd' }, opacity: 1, visible: true, configurable: true },
    { id: 'plane', label: '斜色面', role: 'detail', paint: { type: 'solid', color: '#d8cab0' }, opacity: 1, visible: true, configurable: true },
    { id: 'disc', label: '圆盘', role: 'secondary', paint: { type: 'solid', color: '#1f1d1b' }, opacity: 1, visible: true, configurable: true },
    { id: 'wedge', label: '红楔', role: 'primary', paint: { type: 'solid', color: '#b23a2e' }, opacity: 1, visible: true, configurable: true },
    { id: 'bars', label: '粗条', role: 'secondary', paint: { type: 'solid', color: '#2a2724' }, opacity: 1, visible: true, configurable: true },
    { id: 'lines', label: '细线', role: 'detail', paint: { type: 'solid', color: '#2a2724' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'accent', label: '小圆 / 小方', role: 'accent', paint: { type: 'solid', color: '#b23a2e' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'tilt', label: '斜轴角度', type: 'range', min: 0, max: 60, step: 1, default: 28, unit: '°' },
    { key: 'weight', label: '粗条分量', type: 'range', min: 0.5, max: 1.6, step: 0.05, default: 1 },
    { key: 'bars', label: '粗条数量', type: 'range', min: 1, max: 6, step: 1, default: 3 },
    { key: 'lines', label: '细线数量', type: 'range', min: 0, max: 8, step: 1, default: 4 },
    { key: 'mirror', label: '镜像构图', type: 'toggle', default: false },
  ],

  presets: [
    {
      id: 'agitprop',
      label: '红楔',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8dfcd' } },
        plane: { paint: { type: 'solid', color: '#d8cab0' } },
        disc: { paint: { type: 'solid', color: '#1f1d1b' } },
        wedge: { paint: { type: 'solid', color: '#b23a2e' } },
        bars: { paint: { type: 'solid', color: '#2a2724' } },
        lines: { paint: { type: 'solid', color: '#2a2724' }, opacity: 0.85 },
        accent: { paint: { type: 'solid', color: '#b23a2e' } },
      },
    },
    {
      id: 'black-square',
      label: '黑底',
      elements: {
        bg: { paint: { type: 'solid', color: '#1d1b19' } },
        plane: { paint: { type: 'solid', color: '#2c2926' } },
        disc: { paint: { type: 'solid', color: '#e4d9c3' } },
        wedge: { paint: { type: 'solid', color: '#b8402f' } },
        bars: { paint: { type: 'solid', color: '#cfc3ab' } },
        lines: { paint: { type: 'solid', color: '#cfc3ab' }, opacity: 0.6 },
        accent: { paint: { type: 'solid', color: '#c9a34c' } },
      },
      params: { tilt: 34 },
    },
    {
      id: 'newsprint',
      label: '旧报纸',
      elements: {
        bg: { paint: { type: 'solid', color: '#ddd6c6' } },
        plane: { paint: { type: 'solid', color: '#a9a294' } },
        disc: { paint: { type: 'solid', color: '#9c3b2f' } },
        wedge: { paint: { type: 'solid', color: '#2b2a28' } },
        bars: { paint: { type: 'solid', color: '#2b2a28' } },
        lines: { paint: { type: 'solid', color: '#2b2a28' }, opacity: 0.7 },
        accent: { paint: { type: 'solid', color: '#9c3b2f' } },
      },
      params: { mirror: true, tilt: 20 },
    },
    {
      id: 'steel',
      label: '钢蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#e3e1da' } },
        plane: { paint: { type: 'solid', color: '#9fb0b8' } },
        disc: { paint: { type: 'solid', color: '#26313a' } },
        wedge: { paint: { type: 'solid', color: '#c0533a' } },
        bars: { paint: { type: 'solid', color: '#26313a' } },
        lines: { paint: { type: 'solid', color: '#26313a' }, opacity: 0.75 },
        accent: { paint: { type: 'solid', color: '#c0533a' } },
      },
      params: { tilt: 40, bars: 4 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['wedge'],
    secondary: ['disc', 'bars'],
    accent: ['accent'],
    detail: ['plane', 'lines'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const tilt = clampNum(params.tilt, 0, 89);
    const weight = clampNum(params.weight, 0.3, 2);
    const nBars = Math.round(clampNum(params.bars, 0, 8));
    const nLines = Math.round(clampNum(params.lines, 0, 12));
    const mirror = params.mirror === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    const cx = Wv / 2;
    const cy = Hv / 2;
    // 斜轴坐标系的半径：覆盖整幅画面旋转后的外接圆
    const D = Math.hypot(Wv, Hv) / 2 + 20;
    const S = Math.min(Wv, Hv); // 构图尺度
    const L = Math.max(Wv, Hv);

    const E = (id: string) => elements.get(id)!;
    const bg = E('bg');
    const plane = E('plane');
    const disc = E('disc');
    const wedge = E('wedge');
    const bars = E('bars');
    const lines = E('lines');
    const accent = E('accent');
    const fillA = (e: typeof bg): string => `fill="${e.paintValue}" fill-opacity="${op(e.opacity)}"`;

    // 以画布中心为原点的斜轴坐标（u 沿轴，v 垂直轴）
    const jitter = (k: number): number => (rng() * 2 - 1) * k;

    // 种子级朝向：与「镜像构图」开关异或 → 换 seed 时构图左右翻转，开关仍然有效
    const seedFlip = rng() < 0.5;
    const flip = mirror !== seedFlip;
    const rot = flip ? tilt : -tilt;
    const rad = (rot * Math.PI) / 180;

    // 圆盘：先在**屏幕**上选位置（保证整圆基本在画内），再反旋转回斜轴坐标
    const dr = S * (0.21 + rng() * 0.08);
    const sx = Math.min(Wv / 2 - dr * 1.08, L * (0.1 + rng() * 0.12));
    const sy = Math.max(-(Hv / 2 - dr * 1.08), Math.min(Hv / 2 - dr * 1.08, Hv * (-0.12 + jitter(0.1))));
    const du = sx * Math.cos(rad) + sy * Math.sin(rad);
    const dv = -sx * Math.sin(rad) + sy * Math.cos(rad);

    // 斜色面：一条宽带，平行于轴，压在圆盘下方或上方（种子决定），贯穿全画面
    const below = rng() < 0.7;
    const ph = S * (0.3 + rng() * 0.1);
    const pv = below ? dv + dr * (0.2 + rng() * 0.3) : dv - dr * (0.2 + rng() * 0.3) - ph;

    // 红楔：底边在画外（u = -D），尖端刺入圆盘中心偏后一点
    const wTipU = du - dr * 0.25;
    const wTipV = dv + dr * 0.12;
    const wBase = S * 0.26;
    const wBaseV = S * 0.12 + jitter(S * 0.04);

    let inner = '';
    if (plane.visible) {
      inner += `<rect x="${ri(-D)}" y="${ri(pv)}" width="${ri(2 * D)}" height="${ri(ph)}" ${fillA(plane)}/>`;
    }

    // 细线：多数平行于轴（u 方向），少数垂直；贯穿全幅
    let ld = '';
    for (let i = 0; i < nLines; i++) {
      if (i % 3 === 2) {
        const u = jitter(L * 0.45);
        ld += `M${ri(u)} ${ri(-D)}V${ri(D)}`;
      } else {
        const v = jitter(S * 0.55);
        ld += `M${ri(-D)} ${ri(v)}H${ri(D)}`;
      }
    }
    // 先抽随机，后决定是否输出（开关元件不改变其它元件布局）
    if (lines.visible && ld !== '') {
      inner += `<path d="${ld}" fill="none" stroke="${lines.paintValue}" stroke-opacity="${op(lines.opacity)}" stroke-width="${ri(Math.max(2, S * 0.005))}"/>`;
    }

    if (disc.visible) {
      inner += `<circle cx="${ri(du)}" cy="${ri(dv)}" r="${ri(dr)}" ${fillA(disc)}/>`;
    }

    // 粗条：交替平行 / 垂直于轴；长度、粗细各异，落在圆盘与楔之外的空区
    let bd = '';
    const slots = [
      { u: -L * 0.32, v: S * 0.3 },
      { u: L * 0.05, v: S * 0.36 },
      { u: -L * 0.12, v: -S * 0.32 },
      { u: L * 0.38, v: S * 0.22 },
      { u: -L * 0.4, v: -S * 0.12 },
      { u: L * 0.3, v: -S * 0.38 },
      { u: 0, v: -S * 0.42 },
      { u: -L * 0.22, v: S * 0.44 },
    ];
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      const len = S * (0.22 + rng() * 0.28);
      const th = S * (0.022 + rng() * 0.03) * weight;
      const perp = rng() < 0.3;
      const u = s.u + jitter(S * 0.05);
      const v = s.v + jitter(S * 0.04);
      if (i >= nBars) continue;
      bd += perp
        ? `M${ri(u - th / 2)} ${ri(v - len / 2)}h${ri(th)}v${ri(len)}h${ri(-th)}z`
        : `M${ri(u - len / 2)} ${ri(v - th / 2)}h${ri(len)}v${ri(th)}h${ri(-len)}z`;
    }
    if (bars.visible && bd !== '') inner += `<path d="${bd}" ${fillA(bars)}/>`;

    if (wedge.visible) {
      inner += `<path d="M${ri(-D)} ${ri(wBaseV - wBase / 2)}L${ri(wTipU)} ${ri(wTipV)}L${ri(-D)} ${ri(wBaseV + wBase / 2)}z" ${fillA(wedge)}/>`;
    }

    // 节奏点：小圆 ×2、小方 ×1、细长条 ×1（与楔同色系的点缀）
    const a1u = du + dr * 1.25;
    const a1v = dv + dr * 0.85;
    const sq = S * 0.06;
    const acc =
      `<circle cx="${ri(a1u)}" cy="${ri(a1v)}" r="${ri(S * 0.045)}"/>` +
      `<circle cx="${ri(-L * 0.28 + jitter(S * 0.05))}" cy="${ri(-S * 0.22 + jitter(S * 0.04))}" r="${ri(S * 0.022)}"/>` +
      `<rect x="${ri(du - dr * 1.6)}" y="${ri(dv - dr * 1.1)}" width="${ri(sq)}" height="${ri(sq)}"/>` +
      `<rect x="${ri(-L * 0.05)}" y="${ri(pv + ph + S * 0.05)}" width="${ri(S * 0.3)}" height="${ri(Math.max(3, S * 0.012) * weight)}"/>`;
    if (accent.visible) inner += `<g ${fillA(accent)}>${acc}</g>`;

    const n = api.n;
    const head = flip ? `translate(${n(W)} 0)scale(-1 1)` : '';
    const body =
      rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) +
      `<g transform="${head}scale(${q})translate(${ri(cx)} ${ri(cy)})rotate(${n(rot)})">${inner}</g>`;
    return { body };
  },
};

export default def;
