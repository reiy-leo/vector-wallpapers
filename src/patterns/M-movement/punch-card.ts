/**
 * 打孔卡 / 穿孔纸带 —— M 设计流派（早期计算机的信息美学）。
 *
 * 两种样式（select `mode`）：
 *   - card：IBM 式 80 栏 × 12 行打孔卡，竖长方孔，左上切角、顶部色条、未打孔位印有浅色定位点；
 *     卡片成列排布，每张卡的孔位独立随机（每栏 0~3 孔，近似字母/数字编码的稀疏度）。
 *   - tape：8 通道穿孔纸带，圆孔，第 3/4 通道间一列小送带孔；三条纸带并行、孔位各不相同。
 *
 * ⭐ 体积：全部走 `api.tile`（一张 <pattern>）。孔用「零长度 / 短线段子路径 + 描边」表达
 * （圆孔 = `h0` + 圆头；方孔 = `v` 短线 + 平头），相对坐标，每孔约 6~9B；
 * 图块内容按固定的基础单位写整数坐标，尺寸缩放交给 patternTransform 的 scale。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampNum, op } from './_helpers';

// 卡片几何（基础单位）
const CP = 10; // 栏距
const RP = 26; // 行距
const COLS = 80;
const ROWS = 12;
const MX = 30; // 卡片左右边距
const MY = 34; // 卡片上下边距
const CARD_W = COLS * CP + MX * 2; // 860
const CARD_H = (ROWS - 1) * RP + MY * 2 + 12; // 366
const SLOT_W = 5;
const SLOT_H = 12;

// 纸带几何
const TP = 12; // 孔距
const CH = 8; // 数据通道
const TAPE_ROWS = 72;

const def: PatternDef = {
  id: 'punch-card',
  name: '打孔卡',
  category: 'M-movement',
  description: '复古计算机的打孔卡 / 穿孔纸带阵列：成列的卡片或并行的纸带，孔位随机编码。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#2c3036' }, opacity: 1, visible: true, configurable: true },
    { id: 'paper', label: '卡纸 / 纸带', role: 'primary', paint: { type: 'solid', color: '#e6dbc1' }, opacity: 1, visible: true, configurable: true },
    { id: 'hole', label: '孔', role: 'secondary', paint: { type: 'solid', color: '#2c3036' }, opacity: 1, visible: true, configurable: true },
    { id: 'band', label: '色条 / 送带孔', role: 'accent', paint: { type: 'solid', color: '#b8644f' }, opacity: 1, visible: true, configurable: true },
    { id: 'print', label: '印刷定位', role: 'detail', paint: { type: 'solid', color: '#b69f80' }, opacity: 0.5, visible: true, configurable: true },
    { id: 'shadow', label: '投影', role: 'detail', paint: { type: 'solid', color: '#1d2024' }, opacity: 0.8, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'mode',
      label: '样式',
      type: 'select',
      default: 'card',
      options: [
        { value: 'card', label: '打孔卡' },
        { value: 'tape', label: '纸带' },
      ],
    },
    { key: 'size', label: '尺寸', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'density', label: '打孔密度', type: 'range', min: 0.15, max: 0.6, step: 0.05, default: 0.35 },
    { key: 'gap', label: '间距', type: 'range', min: 0.2, max: 1.5, step: 0.05, default: 0.6 },
    { key: 'tilt', label: '倾斜', type: 'range', min: -30, max: 30, step: 1, default: -8, unit: '°' },
  ],

  presets: [
    {
      id: 'ibm',
      label: '机房',
      elements: {
        bg: { paint: { type: 'solid', color: '#2c3036' } },
        paper: { paint: { type: 'solid', color: '#e6dbc1' } },
        hole: { paint: { type: 'solid', color: '#2c3036' } },
        band: { paint: { type: 'solid', color: '#b8644f' } },
        print: { paint: { type: 'solid', color: '#b69f80' }, opacity: 0.5 },
        shadow: { paint: { type: 'solid', color: '#1d2024' }, opacity: 0.8 },
      },
    },
    {
      id: 'teletype',
      label: '电传纸带',
      elements: {
        bg: { paint: { type: 'solid', color: '#23383a' } },
        paper: { paint: { type: 'solid', color: '#efe3b8' } },
        hole: { paint: { type: 'solid', color: '#23383a' } },
        band: { paint: { type: 'solid', color: '#4f6a68' } },
        print: { paint: { type: 'solid', color: '#c9b98a' }, opacity: 0.8 },
        shadow: { paint: { type: 'solid', color: '#152325' }, opacity: 0.8 },
      },
      params: { mode: 'tape', tilt: -12, gap: 0.9 },
    },
    {
      id: 'manila',
      label: '牛皮纸',
      elements: {
        bg: { paint: { type: 'solid', color: '#ebe6dc' } },
        paper: { paint: { type: 'solid', color: '#cdb487' } },
        hole: { paint: { type: 'solid', color: '#f6f2ea' } },
        band: { paint: { type: 'solid', color: '#6b7f8e' } },
        print: { paint: { type: 'solid', color: '#a88d63' }, opacity: 0.7 },
        shadow: { paint: { type: 'solid', color: '#b9ad97' }, opacity: 0.6 },
      },
      params: { tilt: 8 },
    },
    {
      id: 'blueprint',
      label: '蓝图',
      elements: {
        bg: { paint: { type: 'solid', color: '#24395a' } },
        paper: { paint: { type: 'solid', color: '#d9e1ea' } },
        hole: { paint: { type: 'solid', color: '#24395a' } },
        band: { paint: { type: 'solid', color: '#7f9cc0' } },
        print: { paint: { type: 'solid', color: '#9fb2c8' }, opacity: 0.7 },
        shadow: { paint: { type: 'solid', color: '#18273f' }, opacity: 0.8 },
      },
      params: { mode: 'tape', size: 1.3, gap: 0.5 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['paper'],
    secondary: ['hole'],
    accent: ['band'],
    detail: ['print', 'shadow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const unit = Math.max(0.5, Math.min(4, Math.min(W, H) / 1080));
    const size = clampNum(params.size, 0.3, 2);
    const density = clampNum(params.density, 0.05, 0.8);
    const gapK = clampNum(params.gap, 0, 2);
    const tilt = clampNum(params.tilt, -45, 45);
    const tape = params.mode === 'tape';

    const E = (id: string) => elements.get(id)!;
    const bg = E('bg');
    const paper = E('paper');
    const hole = E('hole');
    const band = E('band');
    const print = E('print');
    const shadow = E('shadow');
    const n = api.n;
    const vis = (e: typeof bg, s: string): string => (e.visible ? s : '');

    let content = '';
    let tw: number;
    let th: number;
    let sc: number;

    if (!tape) {
      // ── 打孔卡：图块 = 2 列 × 2 行共 4 张卡（孔位各异）；第二列错开半个卡位，
      //    跨图块下边界的那张卡在顶部补画一份副本（同一份孔位串，只换起点）→ 无缝 ──
      sc = (Math.min(W, H) * 0.85) / CARD_W / unit * size; // 卡宽约短边 85%
      const gx = 60 + gapK * 200;
      const gy = 20 + gapK * 90;
      const P = CARD_H + gy;
      tw = (CARD_W + gx) * 2;
      th = P * 2;
      const sOff = 9;
      const cut = 34;
      const cardD = (x: number, y: number): string =>
        `M${x + cut} ${y}H${x + CARD_W}V${y + CARD_H}H${x}V${y + cut}z`;

      /** 一张卡的孔位：相对路径串（起点 = 第 0 栏第 0 行孔位的上端）。 */
      const holesOf = (): string => {
        let d = '';
        let px = 0;
        let py = 0;
        for (let col = 0; col < COLS; col++) {
          const k = rng() < density * 2.2 ? 1 + Math.floor(rng() * Math.min(3, 1 + density * 5)) : 0;
          const used = new Set<number>();
          for (let j = 0; j < k; j++) {
            const r = Math.floor(rng() * ROWS);
            if (used.has(r)) continue;
            used.add(r);
            const x = col * CP;
            const y = r * RP;
            d += `m${x - px} ${y - py}v${SLOT_H}`;
            px = x;
            py = y + SLOT_H;
          }
        }
        return d;
      };
      const xA = gx / 2;
      const xB = gx / 2 + CARD_W + gx;
      const cards: Array<{ x: number; y: number; h: string }> = [];
      const hA0 = holesOf();
      const hA1 = holesOf();
      const hB0 = holesOf();
      const hB1 = holesOf();
      cards.push({ x: xA, y: gy / 2, h: hA0 }, { x: xA, y: gy / 2 + P, h: hA1 });
      cards.push({ x: xB, y: gy / 2 + P / 2, h: hB0 }, { x: xB, y: gy / 2 + P * 1.5, h: hB1 });
      cards.push({ x: xB, y: gy / 2 + P * 1.5 - th, h: hB1 }); // 跨界副本
      let paperD = '';
      let shadowD = '';
      let holeD = '';
      let printD = '';
      let bandD = '';
      const r1 = (v: number): number => Math.round(v);
      for (const c of cards) {
        const x = r1(c.x);
        const y = r1(c.y);
        paperD += cardD(x, y);
        shadowD += cardD(x + sOff, y + sOff);
        bandD += `M${x + cut + 6} ${y + 6}H${x + CARD_W - 6}v10H${x + cut + 6}z`;
        const x0 = x + MX + CP / 2;
        const y0 = y + MY + 6;
        // 印刷定位点：每行一条虚线（短划 = 一个定位点）
        for (let r = 0; r < ROWS; r++) printD += `M${x0 - 1} ${y0 + r * RP + 3}h${COLS * CP}`;
        holeD += `M${x0} ${y0}${c.h}`;
      }
      content =
        vis(shadow, `<path d="${shadowD}" fill="${shadow.paintValue}" fill-opacity="${op(shadow.opacity)}"/>`) +
        vis(paper, `<path d="${paperD}" fill="${paper.paintValue}" fill-opacity="${op(paper.opacity)}"/>`) +
        vis(band, `<path d="${bandD}" fill="${band.paintValue}" fill-opacity="${op(band.opacity)}"/>`) +
        vis(print, `<path d="${printD}" fill="none" stroke="${print.paintValue}" stroke-opacity="${op(print.opacity)}" stroke-width="3" stroke-dasharray="2 ${CP - 2}"/>`) +
        vis(hole, `<path d="${holeD}" fill="none" stroke="${hole.paintValue}" stroke-opacity="${op(hole.opacity)}" stroke-width="${SLOT_W}"/>`);
    } else {
      // ── 纸带：三条并行，每条 8 数据通道 + 送带孔列 ──
      sc = (Math.min(W, H) * 0.028) / TP / unit * size; // 孔距约短边 2.8%
      const stripW = (CH + 1) * TP + TP * 2; // 含送带孔列 + 两侧边距
      const g = TP * (1 + gapK * 6);
      tw = (stripW + g) * 3;
      th = TAPE_ROWS * TP;
      let paperD = '';
      let shadowD = '';
      let holeD = '';
      let feedD = '';
      let printD = '';
      const sOff = 4;
      let px = 0;
      let py = 0;
      for (let s = 0; s < 3; s++) {
        const x = Math.round(g / 2 + s * (stripW + g));
        paperD += `M${x} 0h${stripW}v${th}h${-stripW}z`;
        shadowD += `M${x + sOff} 0h${stripW}v${th}h${-stripW}z`;
        // 印刷：纸带两侧细边线
        printD += `M${x + 4} 0v${th}M${x + stripW - 4} 0v${th}`;
        const cx0 = x + TP * 1.5;
        for (let row = 0; row < TAPE_ROWS; row++) {
          const y = row * TP + TP / 2;
          // 送带孔列位于第 3、4 数据通道之间
          feedD += `M${cx0 + 3 * TP} ${y}h0`;
          // 每行先抽是否为「空行」（纸带上常见的连续空白段）
          const blank = rng() < 0.12;
          for (let c = 0; c < CH; c++) {
            const on = rng() < density * 1.3;
            if (blank || !on) continue;
            const hx = cx0 + (c < 3 ? c : c + 1) * TP;
            holeD += `m${hx - px} ${y - py}h0`;
            px = hx;
            py = y;
          }
        }
      }
      content =
        vis(shadow, `<path d="${shadowD}" fill="${shadow.paintValue}" fill-opacity="${op(shadow.opacity)}"/>`) +
        vis(paper, `<path d="${paperD}" fill="${paper.paintValue}" fill-opacity="${op(paper.opacity)}"/>`) +
        vis(print, `<path d="${printD}" fill="none" stroke="${print.paintValue}" stroke-opacity="${op(print.opacity)}" stroke-width="1.5"/>`) +
        vis(band, `<path d="${feedD}" fill="none" stroke="${band.paintValue}" stroke-opacity="${op(band.opacity)}" stroke-width="4" stroke-linecap="round"/>`) +
        vis(hole, `<path d="M0 0${holeD}" fill="none" stroke="${hole.paintValue}" stroke-opacity="${op(hole.opacity)}" stroke-width="8" stroke-linecap="round"/>`);
    }

    const k = sc * unit;
    const tf = `${tilt !== 0 ? `rotate(${n(tilt)})` : ''}scale(${n(Math.round(k * 1000) / 1000)})`;
    const ref = api.tile({ key: `pc-${tape ? 't' : 'c'}`, w: tw, h: th, content, transform: tf });
    return {
      body:
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }) +
        rect(0, 0, W, H, { fill: ref }),
    };
  },
};

export default def;
