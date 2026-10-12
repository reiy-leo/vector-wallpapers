/**
 * 城市天际线 —— E 风景 / 单幅构图。
 *
 * 构图要点：低饱和的暮色天空 + 地平线辉光（5 条自下而上叠压的半透明色带，
 * 形成阶梯式「伪渐变」，元件仍是纯色）+ 一轮月亮；
 * 楼群分 3 个深度层：远层浅而朦胧、楼高而窄密，近层深、楼矮而宽；
 * 楼顶有平顶 / 屋顶机房 / 退台 / 天线 / 阶梯 / 尖顶几种形态；
 * 中、近两层楼体上散布点亮的窗（亮窗比例可调，按楼、按行起伏，不均匀）。
 *
 * ⭐ 体积/节点策略：
 *   - 坐标系：所有几何画在「短边 = 1000」的虚拟坐标里，整体 `<g transform="scale(q)">`
 *     放大到真实像素 → 坐标与分辨率解耦，整数即可（3840×2160 与 1920×1080 字节相同）。
 *   - 每层楼合并为一条 path（同向子路径 nonzero 并集），直角轮廓用 h/v 相对命令。
 *   - 窗：每扇亮窗 = 一段 `h` + 平头描边（stroke-width = 窗高），约 9B/扇；
 *     每层 × 4 个明灭子组各一条 path。超出 WIN_CAP 时按预抽随机数确定性抽稀。
 * 动画（仅预览，cfg.animate 且开关打开）：
 *   - 下雨：3 个深度层的斜向雨丝（月光色、低不透明度），线性平移一屏 + `<use>` 补副本无缝循环；
 *     雨只存在于动画预览，导出保持静态无雨。
 *   - 窗灯明灭：4 个子组中 3 组以不同周期 / 相位短暂熄灭再亮起。
 */
import { path, rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

/** 虚拟坐标短边。 */
const V = 1000;
/** 窗 path 数据字节上限。 */
const WIN_CAP = 8200;
/** 楼群 path 数据字节上限（超宽画幅兜底）。 */
const BLD_CAP = 7200;
/** 雨丝 path 数据字节上限（仅动画预览）。 */
const RAIN_CAP = 2400;

/** 各层：楼高范围（相对场景高）、楼宽范围（相对短边）、是否有窗及窗网格（相对短边）。 */
const LAYERS = [
  { id: 'bld_far', hMin: 0.3, hMax: 0.66, wMin: 0.035, wMax: 0.075, win: null },
  { id: 'bld_mid', hMin: 0.2, hMax: 0.48, wMin: 0.05, wMax: 0.1, win: { px: 11, py: 15 } },
  { id: 'bld_near', hMin: 0.1, hMax: 0.32, wMin: 0.075, wMax: 0.15, win: { px: 17, py: 23 } },
] as const;

interface Block {
  x0: number;
  x1: number;
  top: number;
}

interface Win {
  x: number;
  y: number;
  /** 子组（明灭相位）0..3 */
  grp: number;
  /** 抽稀用随机数 */
  keep: number;
}

/** 点列 → 闭合 path（整数相对坐标；纯水平 / 竖直段用 h / v）。 */
function enc(pts: Array<[number, number]>): string {
  let px = Math.round(pts[0][0]);
  let py = Math.round(pts[0][1]);
  let d = `M${px} ${py}`;
  for (let i = 1; i < pts.length; i++) {
    const x = Math.round(pts[i][0]);
    const y = Math.round(pts[i][1]);
    const dx = x - px;
    const dy = y - py;
    if (dx === 0 && dy === 0) continue;
    if (dy === 0) d += `h${dx}`;
    else if (dx === 0) d += `v${dy}`;
    else d += `l${dx}${dy < 0 ? '' : ' '}${dy}`;
    px = x;
    py = y;
  }
  return `${d}z`;
}

const def: PatternDef = {
  id: 'city-skyline',
  name: '城市天际线',
  category: 'E-scene',
  description: '暮色中的城市剪影：三层楼群由远及近、由浅到深，地平线余晖与一轮月亮，楼体上散落点亮的窗。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天空', role: 'bg', paint: { type: 'solid', color: '#2e3b5c' }, opacity: 1, visible: true, configurable: true },
    { id: 'glow', label: '地平线余晖', role: 'detail', paint: { type: 'solid', color: '#d99a86' }, opacity: 0.12, visible: true, configurable: true },
    { id: 'moon', label: '月亮', role: 'accent', paint: { type: 'solid', color: '#f3e6c8' }, opacity: 1, visible: true, configurable: true },
    { id: 'bld_far', label: '楼群 · 远', role: 'detail', paint: { type: 'solid', color: '#57607e' }, opacity: 1, visible: true, configurable: true },
    { id: 'bld_mid', label: '楼群 · 中', role: 'secondary', paint: { type: 'solid', color: '#343d5a' }, opacity: 1, visible: true, configurable: true },
    { id: 'bld_near', label: '楼群 · 近', role: 'primary', paint: { type: 'solid', color: '#1b2137' }, opacity: 1, visible: true, configurable: true },
    { id: 'windows', label: '窗灯', role: 'accent', paint: { type: 'solid', color: '#f0c46e' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'buildingHeight', label: '楼高', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1, heavy: true },
    { key: 'litRatio', label: '亮窗比例', type: 'range', min: 0, max: 1, step: 0.05, default: 0.35 },
    { key: 'rain', label: '下雨', type: 'toggle', default: false, group: '动画' },
    { key: 'flicker', label: '窗灯明灭', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'dusk',
      label: '暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#2e3b5c' } },
        glow: { paint: { type: 'solid', color: '#d99a86' }, opacity: 0.12 },
        moon: { paint: { type: 'solid', color: '#f3e6c8' } },
        bld_far: { paint: { type: 'solid', color: '#57607e' } },
        bld_mid: { paint: { type: 'solid', color: '#343d5a' } },
        bld_near: { paint: { type: 'solid', color: '#1b2137' } },
        windows: { paint: { type: 'solid', color: '#f0c46e' } },
      },
    },
    {
      id: 'midnight',
      label: '午夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#10172a' } },
        glow: { paint: { type: 'solid', color: '#3a4f7a' }, opacity: 0.17 },
        moon: { paint: { type: 'solid', color: '#e6ebf5' } },
        bld_far: { paint: { type: 'solid', color: '#28344f' } },
        bld_mid: { paint: { type: 'solid', color: '#19223a' } },
        bld_near: { paint: { type: 'solid', color: '#0b1120' } },
        windows: { paint: { type: 'solid', color: '#ffd98c' } },
      },
      params: { litRatio: 0.45 },
    },
    {
      id: 'dawn',
      label: '晨曦',
      elements: {
        bg: { paint: { type: 'solid', color: '#efd9cb' } },
        glow: { paint: { type: 'solid', color: '#f4b496' }, opacity: 0.22 },
        moon: { paint: { type: 'solid', color: '#fff6ea' } },
        bld_far: { paint: { type: 'solid', color: '#d3b7b1' } },
        bld_mid: { paint: { type: 'solid', color: '#a68b93' } },
        bld_near: { paint: { type: 'solid', color: '#6b5a6c' } },
        windows: { paint: { type: 'solid', color: '#fbe7c0' } },
      },
      params: { litRatio: 0.15 },
    },
    {
      id: 'fog',
      label: '雾都',
      elements: {
        bg: { paint: { type: 'solid', color: '#c8d2d3' } },
        glow: { paint: { type: 'solid', color: '#eef1ee' }, opacity: 0.22 },
        moon: { paint: { type: 'solid', color: '#f8f8f3' } },
        bld_far: { paint: { type: 'solid', color: '#a9b6b8' } },
        bld_mid: { paint: { type: 'solid', color: '#7d8d91' } },
        bld_near: { paint: { type: 'solid', color: '#4b5a5f' } },
        windows: { paint: { type: 'solid', color: '#f3dca3' } },
      },
      params: { litRatio: 0.2 },
    },
    {
      id: 'plum-night',
      label: '紫夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#2a2139' } },
        glow: { paint: { type: 'solid', color: '#9a6680' }, opacity: 0.17 },
        moon: { paint: { type: 'solid', color: '#f2dfe8' } },
        bld_far: { paint: { type: 'solid', color: '#4a3d5c' } },
        bld_mid: { paint: { type: 'solid', color: '#2f2642' } },
        bld_near: { paint: { type: 'solid', color: '#1a1527' } },
        windows: { paint: { type: 'solid', color: '#f2b99c' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['bld_near'],
    secondary: ['bld_mid'],
    accent: ['windows', 'moon'],
    detail: ['bld_far', 'glow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate, seed } = cfg;
    const num = (k: string, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Number(params[k])));
    const hk = num('buildingHeight', 0.4, 2);
    const lit = num('litRatio', 0, 1);
    const raining = animate && params.rain === true;
    const flicker = animate && params.flicker === true;

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;
    // 场景高度：竖屏时楼不至于拉成细杆
    const S = Math.min(Hv, V * 1.35);
    const B = Math.ceil(Hv) + 2;
    const op = (v: number): string => api.n(Math.max(0, Math.min(1, v)));

    const bg = elements.get('bg')!;
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';

    // ── 地平线余晖：5 条自下而上的叠色带 ─────────────────
    const glow = elements.get('glow')!;
    if (glow.visible) {
      // 5 条带各自独立叠色（同一 path 内 nonzero 不会叠色，故分开输出；均在缩放组内，不计顶层节点）
      for (let i = 0; i < 5; i++) {
        const y = Math.round(Hv - S * (0.66 - 0.12 * i));
        inner += path(`M0 ${y}H${Math.ceil(Wv)}V${B}H0z`, { fill: glow.paintValue, 'fill-opacity': glow.opacity });
      }
    }

    // ── 月亮（含两圈淡晕）────────────────────────────
    const moon = elements.get('moon')!;
    const mx = Math.round(Wv * (0.68 + rng() * 0.14));
    const my = Math.round(Math.max(V * 0.12, Hv - S * (0.84 + rng() * 0.06)));
    const mr = Math.round(V * 0.04);
    if (moon.visible) {
      inner +=
        `<circle cx="${mx}" cy="${my}" r="${Math.round(mr * 2.6)}" fill="${moon.paintValue}" fill-opacity="${op(moon.opacity * 0.06)}"/>` +
        `<circle cx="${mx}" cy="${my}" r="${Math.round(mr * 1.6)}" fill="${moon.paintValue}" fill-opacity="${op(moon.opacity * 0.1)}"/>` +
        `<circle cx="${mx}" cy="${my}" r="${mr}" fill="${moon.paintValue}" fill-opacity="${op(moon.opacity)}"/>`;
    }

    // ── 楼群布局（一次性抽完随机数）───────────────────
    const layerPolys: Array<Array<Array<[number, number]>>> = [];
    const layerBlocks: Block[][][] = [];
    LAYERS.forEach((L) => {
      const polys: Array<Array<[number, number]>> = [];
      const blocks: Block[][] = [];
      let x = -rng() * L.wMax * V;
      while (x < Wv) {
        const w = V * (L.wMin + rng() * (L.wMax - L.wMin));
        const h = S * hk * (L.hMin + Math.pow(rng(), 1.4) * (L.hMax - L.hMin));
        const top = Hv - h;
        const kind = rng();
        const a = rng();
        const b = rng();
        const pts: Array<[number, number]> = [[x, B]];
        const bl: Block[] = [];
        if (kind < 0.36) {
          // 平顶 + 屋顶机房
          const bw = w * (0.2 + a * 0.25);
          const bx = x + w * (0.12 + b * 0.5);
          const bh = Math.max(4, h * 0.035);
          pts.push([x, top], [bx, top], [bx, top - bh], [bx + bw, top - bh], [bx + bw, top], [x + w, top]);
          bl.push({ x0: x, x1: x + w, top });
        } else if (kind < 0.58) {
          // 退台：下部整宽，上部收窄
          const uw = w * (0.55 + a * 0.2);
          const ux = x + (w - uw) * (0.2 + b * 0.6);
          const lowTop = top + h * (0.22 + a * 0.18);
          pts.push([x, lowTop], [ux, lowTop], [ux, top], [ux + uw, top], [ux + uw, lowTop], [x + w, lowTop]);
          bl.push({ x0: x, x1: x + w, top: lowTop }, { x0: ux, x1: ux + uw, top });
        } else if (kind < 0.74) {
          // 平顶 + 天线
          const ax = x + w * (0.35 + a * 0.3);
          const aw = Math.max(3, w * 0.05);
          const ah = h * (0.1 + b * 0.12);
          pts.push([x, top], [ax, top], [ax, top - ah], [ax + aw, top - ah], [ax + aw, top], [x + w, top]);
          bl.push({ x0: x, x1: x + w, top });
        } else if (kind < 0.9) {
          // 阶梯三级
          const s1 = top + h * 0.1;
          const s2 = top + h * 0.2;
          const i1 = w * 0.14;
          const i2 = w * 0.28;
          pts.push([x, s2], [x + i1, s2], [x + i1, s1], [x + i2, s1], [x + i2, top], [x + w - i2, top], [x + w - i2, s1], [x + w - i1, s1], [x + w - i1, s2], [x + w, s2]);
          bl.push({ x0: x, x1: x + w, top: s2 });
        } else {
          // 尖顶
          const peak = top - w * (0.35 + a * 0.35);
          pts.push([x, top], [x + w * 0.5, peak], [x + w, top]);
          bl.push({ x0: x, x1: x + w, top });
        }
        pts.push([x + w, B]);
        polys.push(pts);
        blocks.push(bl);
        x += w * (0.78 + rng() * 0.34);
      }
      layerPolys.push(polys);
      layerBlocks.push(blocks);
    });

    // ── 窗（每扇固定消耗 2 个随机数，亮窗比例只改阈值 → 不打乱布局）──
    const layerWins: Win[][] = LAYERS.map((L, li) => {
      const wins: Win[] = [];
      if (!L.win) return wins;
      const { px, py } = L.win;
      layerBlocks[li].forEach((bl) => {
        const level = Math.min(1, lit * (0.35 + rng() * 1.3));
        bl.forEach((blk) => {
          const inset = px * 0.6;
          const cols = Math.floor((blk.x1 - blk.x0 - inset * 2) / px);
          if (cols < 1) return;
          const x0 = blk.x0 + (blk.x1 - blk.x0 - cols * px) / 2 + px * 0.25;
          for (let y = blk.top + py * 0.9; y < Hv; y += py) {
            const rowOn = rng() < 0.78 ? 1 : 0.25;
            for (let c = 0; c < cols; c++) {
              const r = rng();
              const g = rng();
              if (r < level * rowOn) wins.push({ x: Math.round(x0 + c * px), y: Math.round(y), grp: Math.floor(g * 4) % 4, keep: (r * 7919 + g) % 1 });
            }
          }
        });
      });
      return wins;
    });

    // ── 楼群输出（超宽兜底：按比例省略过窄的远层楼）─────────
    let bldDs = layerPolys.map((polys) => polys.map(enc).join(''));
    if (bldDs.reduce((a, d) => a + d.length, 0) > BLD_CAP) {
      bldDs = layerPolys.map((polys, li) => polys.filter((_p, i) => li > 0 || i % 4 !== 3).map(enc).join(''));
    }

    // ── 窗 path（按行排序 → 相对位移短）────────────────
    const winH = LAYERS.map((L) => (L.win ? Math.round(L.win.py * 0.48) : 0));
    const winW = LAYERS.map((L) => (L.win ? Math.round(L.win.px * 0.5) : 0));
    const buildWins = (keepFrac: number): string[][] =>
      layerWins.map((wins, li) => {
        const out = ['', '', '', ''];
        const pos = [null, null, null, null] as Array<[number, number] | null>;
        const list = wins.filter((w) => w.keep < keepFrac).sort((a, b) => a.y - b.y || a.x - b.x);
        for (const w of list) {
          const p = pos[w.grp];
          out[w.grp] += p ? `m${w.x - p[0]} ${w.y - p[1]}h${winW[li]}` : `M${w.x} ${w.y}h${winW[li]}`;
          pos[w.grp] = [w.x + winW[li], w.y];
        }
        return out;
      });
    let keepFrac = 1;
    let winDs = buildWins(keepFrac);
    for (let guard = 0; guard < 30 && winDs.flat().reduce((a, d) => a + d.length, 0) > WIN_CAP; guard++) {
      keepFrac *= 0.88;
      winDs = buildWins(keepFrac);
    }

    const win = elements.get('windows')!;
    const flName = flicker ? api.keyframes('vw-csflick', '0%,46%,64%,100%{opacity:1}50%,60%{opacity:.15}') : '';
    const FL = [
      { dur: 0, delay: 0 },
      { dur: 11, delay: 2 },
      { dur: 17, delay: 9 },
      { dur: 23, delay: 5 },
    ];
    LAYERS.forEach((L, li) => {
      const e = elements.get(L.id)!;
      if (e.visible && bldDs[li] !== '') inner += path(bldDs[li], { fill: e.paintValue, 'fill-opacity': e.opacity });
      if (!L.win || !win.visible) return;
      const wo = win.opacity * (li === 1 ? 0.72 : 1);
      let wg = '';
      winDs[li].forEach((d, gi) => {
        if (d === '') return;
        const st = flicker && FL[gi].dur > 0 ? ` style="animation:${flName} ${FL[gi].dur + li * 2}s linear -${FL[gi].delay + li * 3}s infinite"` : '';
        wg += `<path d="${d}"${st}/>`;
      });
      if (wg !== '') inner += `<g fill="none" stroke="${win.paintValue}" stroke-opacity="${op(wo)}" stroke-width="${winH[li]}">${wg}</g>`;
    });

    // ── 雨（仅动画预览）──────────────────────────────
    if (raining && moon.visible) {
      const slant = 0.16;
      const dxT = Math.round(Hv * slant);
      const RL = [
        { n: 0.5, len: 26, sw: 1.2, o: 0.22, dur: 1.9 },
        { n: 0.32, len: 42, sw: 1.8, o: 0.3, dur: 1.3 },
        { n: 0.18, len: 64, sw: 2.6, o: 0.36, dur: 0.9 },
      ];
      const total = Math.round(((Wv + dxT) * Hv) / 2600);
      let used = 0;
      let rainMk = '';
      const fall = api.keyframes(`vw-csrain-${dxT}-${Math.round(Hv)}`, `to{transform:translate(${dxT}px,${Math.round(Hv)}px)}`);
      RL.forEach((R, ri) => {
        const cnt = Math.round(total * R.n);
        const ldx = Math.round(R.len * slant);
        let d = '';
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < cnt; i++) pts.push([Math.round(rng() * (Wv + dxT) - dxT), Math.round(rng() * Hv)]);
        pts.sort((a, b) => a[0] - b[0]);
        let px = 0;
        let py = 0;
        for (const [x, y] of pts) {
          const seg = `${d === '' ? `M${x} ${y}` : `m${x - px} ${y - py}`}l${ldx} ${R.len}`;
          if (used + seg.length > RAIN_CAP) break;
          d += seg;
          used += seg.length;
          px = x + ldx;
          py = y + R.len;
        }
        if (d === '') return;
        const id = `cs${seed}r${ri}`;
        rainMk +=
          `<g style="animation:${fall} ${R.dur}s linear -${Math.round(R.dur * 0.37 * (ri + 1) * 100) / 100}s infinite">` +
          `<path id="${id}" d="${d}" stroke-width="${R.sw}" stroke-opacity="${op(moon.opacity * R.o)}"/>` +
          `<use href="#${id}" x="${-dxT}" y="${-Math.round(Hv)}"/></g>`;
      });
      if (rainMk !== '') inner += `<g fill="none" stroke="${moon.paintValue}" stroke-linecap="round">${rainMk}</g>`;
    }

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
