/**
 * 山湖倒影 —— E 风景 / 单幅构图。
 *
 * 构图要点：远山淡、主峰峻（亮面 / 背光面两色，峰顶积雪带锯齿雪线），山脚一抹雾，
 * 湖岸两排针叶林剪影；湖面是整幅上景的镜像倒影，被一道道水平的水纹缝隙切开
 * （越近缝隙越宽越疏），再叠少量亮色水纹线与向近处加深的水色。
 *
 * ⭐ 体积/节点策略：
 *   - 虚拟坐标「短边 = 1000」，整体 `scale(q)`；所有轮廓整数相对坐标。
 *   - 倒影：岸上景物放进 `<g id>`，用一个 `<use>` + 垂直翻转矩阵复用 —— 零额外几何。
 *   - 雪区 / 背光面只为「有面积的区段」输出子路径；SCENE_CAP 超限时整体放疏采样步长。
 * 动画（仅预览，cfg.animate && ripple）：倒影左右轻晃，两组水纹缝隙反向缓慢漂移、亮纹明灭。
 */
import { g, path, rect } from '../../engine/svg';
import { encDashes, encLine, f1, fractal1D, mix, num, peakRange, virt } from './_scene';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;
/** 岸上景物（山 / 雪 / 背光面 / 林线）path 数据字节上限。 */
const SCENE_CAP = 11500;
/** 水纹 path 数据字节上限。 */
const RIPPLE_CAP = 3600;

const def: PatternDef = {
  id: 'mountain-lake',
  name: '山湖倒影',
  category: 'E-scene',
  description: '雪峰与湖岸林线倒映在平静湖面，倒影被一道道水平水纹切开。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天空', role: 'bg', paint: { type: 'solid', color: '#dae4e9' }, opacity: 1, visible: true, configurable: true },
    { id: 'sky_glow', label: '天际 / 山雾', role: 'detail', paint: { type: 'solid', color: '#f3e4d6' }, opacity: 1, visible: true, configurable: true },
    { id: 'peak_far', label: '远山', role: 'detail', paint: { type: 'solid', color: '#adbecb' }, opacity: 1, visible: true, configurable: true },
    { id: 'peak_main', label: '主峰', role: 'secondary', paint: { type: 'solid', color: '#6e8597' }, opacity: 1, visible: true, configurable: true },
    { id: 'peak_shade', label: '山体背光面', role: 'secondary', paint: { type: 'solid', color: '#3c4f60' }, opacity: 1, visible: true, configurable: true },
    { id: 'snow', label: '积雪', role: 'accent', paint: { type: 'solid', color: '#f7f9fa' }, opacity: 1, visible: true, configurable: true },
    { id: 'trees', label: '林线', role: 'primary', paint: { type: 'solid', color: '#2b4643' }, opacity: 1, visible: true, configurable: true },
    { id: 'water', label: '湖水', role: 'primary', paint: { type: 'solid', color: '#93abb8' }, opacity: 1, visible: true, configurable: true },
    { id: 'ripple', label: '水纹亮线', role: 'accent', paint: { type: 'solid', color: '#eef3f5' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'waterLevel', label: '水位', type: 'range', min: 0.45, max: 0.78, step: 0.01, default: 0.6, heavy: true },
    { key: 'rippleDensity', label: '水纹密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'peakHeight', label: '山峰高度', type: 'range', min: 0.6, max: 1.4, step: 0.05, default: 1, heavy: true },
    { key: 'snowLine', label: '雪线', type: 'range', min: 0, max: 1, step: 0.05, default: 0.5 },
    { key: 'reflection', label: '倒影清晰度', type: 'range', min: 0.2, max: 1, step: 0.05, default: 0.75 },
    { key: 'ripple', label: '水波荡漾', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'alpine-morning',
      label: '晨光雪山',
      elements: {
        bg: { paint: { type: 'solid', color: '#dae4e9' } },
        sky_glow: { paint: { type: 'solid', color: '#f3e4d6' } },
        peak_far: { paint: { type: 'solid', color: '#adbecb' } },
        peak_main: { paint: { type: 'solid', color: '#6e8597' } },
        peak_shade: { paint: { type: 'solid', color: '#3c4f60' } },
        snow: { paint: { type: 'solid', color: '#f7f9fa' } },
        trees: { paint: { type: 'solid', color: '#2b4643' } },
        water: { paint: { type: 'solid', color: '#93abb8' } },
        ripple: { paint: { type: 'solid', color: '#eef3f5' } },
      },
    },
    {
      id: 'blue-hour',
      label: '蓝调时刻',
      elements: {
        bg: { paint: { type: 'solid', color: '#6c83a6' } },
        sky_glow: { paint: { type: 'solid', color: '#c6a8b8' } },
        peak_far: { paint: { type: 'solid', color: '#5e7395' } },
        peak_main: { paint: { type: 'solid', color: '#3d4f6e' } },
        peak_shade: { paint: { type: 'solid', color: '#1f2a42' } },
        snow: { paint: { type: 'solid', color: '#dde5f0' } },
        trees: { paint: { type: 'solid', color: '#16213a' } },
        water: { paint: { type: 'solid', color: '#4b6084' } },
        ripple: { paint: { type: 'solid', color: '#a8b9d2' } },
      },
    },
    {
      id: 'emerald-lake',
      label: '碧湖',
      elements: {
        bg: { paint: { type: 'solid', color: '#d6e7e5' } },
        sky_glow: { paint: { type: 'solid', color: '#eef2dc' } },
        peak_far: { paint: { type: 'solid', color: '#a0bdbb' } },
        peak_main: { paint: { type: 'solid', color: '#5f807f' } },
        peak_shade: { paint: { type: 'solid', color: '#34504f' } },
        snow: { paint: { type: 'solid', color: '#f5faf9' } },
        trees: { paint: { type: 'solid', color: '#1e3e34' } },
        water: { paint: { type: 'solid', color: '#4f8e89' } },
        ripple: { paint: { type: 'solid', color: '#d5ebe8' } },
      },
      params: { snowLine: 0.65 },
    },
    {
      id: 'autumn-lake',
      label: '秋湖',
      elements: {
        bg: { paint: { type: 'solid', color: '#e8e0d2' } },
        sky_glow: { paint: { type: 'solid', color: '#f1d0ad' } },
        peak_far: { paint: { type: 'solid', color: '#bab3aa' } },
        peak_main: { paint: { type: 'solid', color: '#7f7976' } },
        peak_shade: { paint: { type: 'solid', color: '#4b4545' } },
        snow: { paint: { type: 'solid', color: '#faf7f2' } },
        trees: { paint: { type: 'solid', color: '#5c452f' } },
        water: { paint: { type: 'solid', color: '#a6a495' } },
        ripple: { paint: { type: 'solid', color: '#f4efe6' } },
      },
      params: { snowLine: 0.35 },
    },
    {
      id: 'ink-wash',
      label: '水墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#ecebe7' } },
        sky_glow: { paint: { type: 'solid', color: '#f7f5f0' } },
        peak_far: { paint: { type: 'solid', color: '#c4c2be' } },
        peak_main: { paint: { type: 'solid', color: '#8b8985' } },
        peak_shade: { paint: { type: 'solid', color: '#55534f' } },
        snow: { paint: { type: 'solid', color: '#fbfaf8' } },
        trees: { paint: { type: 'solid', color: '#3a3936' } },
        water: { paint: { type: 'solid', color: '#bab8b3' } },
        ripple: { paint: { type: 'solid', color: '#f5f4f1' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['trees', 'water'],
    secondary: ['peak_main', 'peak_shade'],
    accent: ['snow', 'ripple'],
    detail: ['peak_far', 'sky_glow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const level = num(params, 'waterLevel', 0.3, 0.9);
    const rippleD = num(params, 'rippleDensity', 0, 1);
    const ph = num(params, 'peakHeight', 0.3, 2);
    const snowLine = num(params, 'snowLine', 0, 1);
    const refl = num(params, 'reflection', 0, 1);
    const anim = cfg.animate && params.ripple === true;

    const { Wv, Hv, tf } = virt(W, H, V);
    const k = Wv / V;
    const wy = Math.round(Hv * level);
    const bottom = Math.ceil(Hv) + 4;
    const el = (id: string) => elements.get(id)!;
    const hex = (v: string): boolean => v.startsWith('#');
    const bg = el('bg');
    const out: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const inner: string[] = [];

    // 山体高度随可用天空高度收放（竖屏 / 高水位时不顶天）
    const sky = wy;
    const hk = ph * Math.min(1, sky / (V * 0.62));
    const x0 = -V * 0.15;
    const x1 = Wv + V * 0.15;

    // ── 随机布局（固定消耗顺序）────────────────────────────────
    const farR = peakRange(rng, { x0, x1, count: Math.max(3, Math.round(k * 3.4)), height: V * 0.3 * hk, slope: [0.35, 0.6], detail: V * 0.02 * hk });
    const mainR = peakRange(rng, { x0, x1, count: Math.max(2, Math.round(k * 1.9)), height: V * 0.44 * hk, slope: [0.55, 0.95], detail: V * 0.035 * hk });
    const snowJag = fractal1D(rng, 8, 0.95, 2);
    const spineJag = fractal1D(rng, 7, 0.9, 1);
    const treeR: number[] = [];
    for (let i = 0; i < 900; i++) treeR.push(rng());
    const rip: number[] = [];
    for (let i = 0; i < 1200; i++) rip.push(rng());

    const farBase = wy - V * 0.012;
    const mainBase = wy + 1;
    const farY = (x: number): number => farBase - V * 0.06 * hk - farR(x);
    const mainY = (x: number): number => mainBase - mainR(x);
    const mainMax = V * 0.44 * hk;

    // ── 岸上景物几何（按字节放疏步长）──────────────────────────
    const far = el('peak_far');
    const main = el('peak_main');
    const shade = el('peak_shade');
    const snow = el('snow');
    const trees = el('trees');
    const sg = el('sky_glow');

    const build = (step: number, tw: number): { far: string; main: string; snow: string; shade: string; treesFar: string; treesNear: string } => {
      const xs: number[] = [];
      for (let x = x0; x <= x1 + step; x += step) xs.push(x);
      const fy = xs.map(farY);
      const my = xs.map(mainY);
      const farD = `${encLine(xs.map((x, i) => [x, fy[i]] as [number, number]))}V${wy}H${Math.round(x0)}z`;
      const mainD = `${encLine(xs.map((x, i) => [x, my[i]] as [number, number]))}V${wy}H${Math.round(x0)}z`;

      // 雪：顶 = 山脊，底 = max(山脊, 雪线 + 锯齿)
      const sl = mainBase - mainMax * (0.88 - snowLine * 0.5);
      const amp = V * 0.06 * hk;
      let snowD = '';
      let run: Array<[number, number]> = [];
      let back: Array<[number, number]> = [];
      const flush = (): void => {
        if (run.length > 1) snowD += `${encLine([...run, ...back.reverse()])}z`;
        run = [];
        back = [];
      };
      xs.forEach((x, i) => {
        const top = my[i];
        const jag = snowJag((x - x0) / (x1 - x0));
        // 雪线在山脊凸处下探、凹处上收：跟随地形的一点起伏
        const bot = sl + jag * amp + (top - sl) * 0.4;
        if (bot - top > 0.8) {
          run.push([x, top]);
          back.push([x, bot]);
        } else flush();
      });
      flush();

      // 背光面（光从左上来）：每座显著山峰 → 山脊向右下行段 + 斜向下的山脊线围成
      let shadeD = '';
      for (let i = 2; i < xs.length - 2; i++) {
        if (!(my[i] <= my[i - 1] && my[i] <= my[i + 1] && my[i] <= my[i - 2] && my[i] <= my[i + 2])) continue;
        const prom = mainBase - my[i];
        if (prom < V * 0.08 * hk) continue;
        // 向右走到山谷：越过细碎起伏，直到山脊回升超过容差
        const tol = V * 0.02 * hk;
        let j = i + 1;
        let best = j;
        while (j < xs.length - 1) {
          j++;
          if (my[j] > my[best]) best = j;
          if (my[j] < my[best] - tol) break;
        }
        j = best;
        if (xs[j] - xs[i] < V * 0.03) continue;
        const pts: Array<[number, number]> = [];
        for (let t = i; t <= j; t++) pts.push([xs[t], my[t]]);
        // 背光面下缘：山谷 → 斜向左下的「山脊线底点」，再沿山脊线回到峰顶
        const sx = xs[i] + (xs[j] - xs[i]) * 0.28;
        const sy = Math.min(wy, my[j] + (wy - my[j]) * 0.75);
        const nSp = 8;
        const spine: Array<[number, number]> = [];
        for (let s2 = nSp; s2 >= 0; s2--) {
          const f = s2 / nSp;
          const y = my[i] + (sy - my[i]) * f;
          const x = xs[i] + (sx - xs[i]) * Math.pow(f, 0.8) + spineJag(((xs[i] - x0) / (x1 - x0) + f * 0.05) % 1) * V * 0.02 * f;
          spine.push([x, y]);
        }
        pts.push(...spine);
        shadeD += `${encLine(pts)}z`;
        i = j;
      }

      // 林线：两排针叶树剪影
      const treeRow = (base: number, hMin: number, hMax: number, off: number): string => {
        const pts: Array<[number, number]> = [[x0, base]];
        let x = x0;
        let r = off;
        const R = (): number => treeR[r++ % treeR.length];
        while (x < x1) {
          const h = hMin + (hMax - hMin) * (0.25 + 0.75 * R());
          const w = h * (0.42 + R() * 0.16) * tw;
          const v = base - h * (0.12 + R() * 0.2);
          // 两层枝的针叶树：肩部一处小凹口
          pts.push([x + w * 0.16, base - h * 0.38], [x + w * 0.3, base - h * 0.4], [x + w * 0.5, base - h], [x + w * 0.7, base - h * 0.4], [x + w * 0.84, base - h * 0.38], [x + w * 1.0, v]);
          x += w * (0.62 + R() * 0.3);
        }
        pts.push([x1, base]);
        return `${encLine(pts)}z`;
      };
      const treesFar = treeRow(wy + 1, V * 0.018, V * 0.04, 0);
      const treesNear = treeRow(wy + 1, V * 0.014, V * 0.032, 450);
      return { far: farD, main: mainD, snow: snowD, shade: shadeD, treesFar, treesNear };
    };

    let step = 4;
    let tw = 1;
    let geo = build(step, tw);
    const size = (o: ReturnType<typeof build>): number => o.far.length + o.main.length + o.snow.length + o.shade.length + o.treesFar.length + o.treesNear.length;
    for (let guard = 0; guard < 10 && size(geo) > SCENE_CAP; guard++) {
      step *= 1.2;
      tw *= 1.12;
      geo = build(step, tw);
    }

    // ── 天空辉光 ──────────────────────────────────────────
    if (sg.visible) {
      const fill = hex(sg.paintValue)
        ? api.linear({ key: 'ml-sky', angle: 90, stops: [{ offset: 0, color: sg.paintValue, opacity: 0 }, { offset: 1, color: sg.paintValue, opacity: 0.95 }] })
        : sg.paintValue;
      inner.push(rect(0, Math.round(wy * 0.25), Math.ceil(Wv), Math.round(wy * 0.75 + 1), { fill, 'fill-opacity': sg.opacity }));
    }

    // ── 岸上景物（同一份用于倒影）──────────────────────────────
    const scene: string[] = [];
    if (far.visible) scene.push(path(geo.far, { fill: far.paintValue, 'fill-opacity': far.opacity }));
    if (sg.visible && hex(sg.paintValue)) {
      // 远山脚的雾
      const mist = api.linear({ key: 'ml-mist', angle: 90, stops: [{ offset: 0, color: sg.paintValue, opacity: 0 }, { offset: 1, color: sg.paintValue, opacity: 0.7 }] });
      scene.push(rect(Math.round(x0), Math.round(wy - V * 0.14 * hk), Math.round(x1 - x0), Math.round(V * 0.14 * hk), { fill: mist, 'fill-opacity': sg.opacity }));
    }
    if (main.visible) scene.push(path(geo.main, { fill: main.paintValue, 'fill-opacity': main.opacity }));
    if (snow.visible && geo.snow !== '') scene.push(path(geo.snow, { fill: snow.paintValue, 'fill-opacity': snow.opacity }));
    if (shade.visible && main.visible && geo.shade !== '') scene.push(path(geo.shade, { fill: shade.paintValue, 'fill-opacity': api.n(0.55 * shade.opacity) }));
    if (sg.visible && hex(sg.paintValue)) {
      const mist2 = api.linear({ key: 'ml-mist2', angle: 90, stops: [{ offset: 0, color: sg.paintValue, opacity: 0 }, { offset: 1, color: sg.paintValue, opacity: 0.55 }] });
      scene.push(rect(Math.round(x0), Math.round(wy - V * 0.07 * hk), Math.round(x1 - x0), Math.round(V * 0.07 * hk), { fill: mist2, 'fill-opacity': sg.opacity }));
    }
    if (trees.visible) {
      scene.push(path(geo.treesFar, { fill: far.visible ? mix(trees.paintValue, far.paintValue, 0.45) : trees.paintValue, 'fill-opacity': trees.opacity }));
      scene.push(path(geo.treesNear, { fill: trees.paintValue, 'fill-opacity': trees.opacity }));
    }
    const sid = `ml${cfg.seed}s`;
    inner.push(`<g id="${sid}">${scene.join('')}</g>`);

    // ── 湖面：底色 → 倒影 → 水色加深 → 水纹缝隙 / 亮纹 ─────────────
    const water = el('water');
    const wfill = water.paintValue;
    const seaH = bottom - wy;
    if (water.visible) inner.push(rect(0, wy, Math.ceil(Wv), seaH, { fill: wfill, 'fill-opacity': water.opacity }));
    let reflMarkup = `<use href="#${sid}" transform="matrix(1 0 0 -1 0 ${wy * 2})" opacity="${api.n(0.35 + 0.6 * refl)}"/>`;
    if (anim) {
      const kf = api.keyframes('vw-ml-wob', 'from{transform:translateX(-1.5px)}to{transform:translateX(1.5px)}');
      reflMarkup = `<g style="animation:${kf} 3.2s ease-in-out infinite alternate">${reflMarkup}</g>`;
    }
    inner.push(reflMarkup);
    if (water.visible && hex(wfill)) {
      const deepen = api.linear({
        key: 'ml-deep',
        angle: 90,
        stops: [
          { offset: 0, color: wfill, opacity: 0.06 + (1 - refl) * 0.3 },
          { offset: 1, color: wfill, opacity: 0.42 + (1 - refl) * 0.35 },
        ],
      });
      inner.push(rect(0, wy, Math.ceil(Wv), seaH, { fill: deepen, 'fill-opacity': water.opacity }));
    }

    // 水纹：缝隙（水色，切开倒影）+ 亮纹（ripple 色）
    const ripple = el('ripple');
    let gaps: Array<Array<[number, number, number]>> = [[], []];
    let lights: Array<[number, number, number]> = [];
    let rows = Math.round(10 + rippleD * 38);
    for (let guard = 0; guard < 20; guard++) {
      gaps = [[], []];
      lights = [];
      let r = 0;
      const R = (): number => rip[r++ % rip.length];
      for (let i = 0; i < rows; i++) {
        const f = (i + R() * 0.6) / rows;
        const y = wy + 3 + Math.pow(f, 1.5) * (seaH - 3);
        const depth = (y - wy) / seaH;
        // 一行：若干段长短不一的缝隙
        let x = -R() * V * 0.3;
        while (x < Wv) {
          const len = V * (0.08 + R() * 0.5) * (0.6 + depth);
          const gap = V * (0.02 + R() * 0.25);
          if (R() < 0.82) gaps[depth > 0.4 ? 1 : 0].push([x, y, len]);
          else if (R() < 0.5) lights.push([x + len * 0.2, y, len * 0.5]);
          x += len + gap;
        }
      }
      const est = (gaps[0].length + gaps[1].length + lights.length) * 9;
      if (est <= RIPPLE_CAP || rows <= 4) break;
      rows = Math.max(4, Math.floor(rows * 0.85));
    }
    let ripBytes = 0;
    const gapDs = gaps.map((list) => {
      const d = encDashes(list);
      ripBytes += d.length;
      return d;
    });
    const lightD = ripBytes < RIPPLE_CAP * 1.2 ? encDashes(lights) : '';
    if (water.visible && rippleD > 0) {
      // 缝隙宽度随透视增大：远 / 近两组线宽
      const sw0 = f1(V * 0.0028);
      const sw1 = f1(V * 0.0045);
      gapDs.forEach((d, i) => {
        if (d === '') return;
        let p = `<path d="${d}" stroke-width="${i === 0 ? sw0 : sw1}"/>`;
        if (anim) {
          const kf = api.keyframes(`vw-ml-g${i}`, `from{transform:translateX(${i ? '' : '-'}6px)}to{transform:translateX(${i ? '-' : ''}6px)}`);
          p = `<g style="animation:${kf} ${i ? 5.3 : 4.1}s ease-in-out infinite alternate">${p}</g>`;
        }
        inner.push(g({ stroke: wfill, 'stroke-linecap': 'round', 'stroke-opacity': api.n(0.9 * water.opacity) }, p));
      });
    }
    if (ripple.visible && rippleD > 0 && lightD !== '') {
      let p = `<path d="${lightD}" stroke="${ripple.paintValue}" stroke-width="${f1(V * 0.0018)}" stroke-linecap="round" stroke-opacity="${api.n(0.55 * ripple.opacity)}"/>`;
      if (anim) p = `<g style="animation:${api.keyframes('vw-ml-l', 'to{opacity:.2}')} 2.6s ease-in-out infinite alternate">${p}</g>`;
      inner.push(p);
    }

    out.push(g({ transform: tf }, inner.join('')));
    return { body: out.join('') };
  },
};

export default def;
