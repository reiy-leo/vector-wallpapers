/**
 * 极光波浪 —— C 渐变流体 / 有机形态。
 *
 * 2026-10-14 从头重做（Rei：「当前的黑乎乎，没有极光的飘逸和轻盈」）。
 * 上一版是「几块模糊色雾 + 一条柔光线」，在暗底上读作沉闷的色块。
 *
 * 新版思路 —— 丝绸 / 薄纱帘幕：
 *   1. 每层极光 = 一条**参数化**的下缘曲线 (x(s), y(s))。x 不单调：
 *      叠加一个「折叠」项，曲线会在局部回折，像帘幕随风弯折。
 *   2. 沿曲线等弧长参数撒很多**细竖向光丝**（矩形），每条光丝自带竖向渐变：
 *      下缘最亮（氧绿 557.7nm），向上迅速变透明，顶部带一点粉 / 紫（高空氮 / 氧）。
 *      光丝按 s 均匀分布 → 曲线回折处光丝自动加密、叠亮 → 天然的「褶皱亮边」。
 *   3. 光丝高度、亮度沿曲线用低频正弦起伏 → 一簇簇的射线团，两端收尖淡出。
 *   4. 天空是靛蓝 → 深海蓝 → 地平线被映亮的青蓝；地平线一层极光色的低辉光，
 *      加一道可选的远山剪影，画面明亮通透而不是黑底色块。
 *
 * 性能 / 体积：
 *   - 光丝是 `<path d="Mx yvHhWvHz">` 的整数短路径，全部放在一个 `<g>` 里，
 *     共享一个渐变（objectBoundingBox → 每条光丝各自从下缘渐隐到顶）。
 *   - 全局光丝预算固定（与层数无关），层数拉满 4K 仍 < 16KB。
 *   - 只用一个小半径 feGaussianBlur（柔化光丝竖边，防止「硬光射线」的视觉震动）；
 *     下缘亮线与地平线辉光都是纯渐变，无滤镜。
 */
import { g, path, rect } from '../../engine/svg';
import type { PaintSpec, PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

/** 全幅光丝预算（所有层合计）：决定体积上限，与层数无关。 */
const STRAND_BUDGET = 220;
/** 下缘亮线采样点数。 */
const EDGE_PTS = 14;

/** 竖向两色（offset 0 = 下缘色，offset 1 = 上部色）。 */
const band = (lo: string, hi: string): PaintSpec => ({
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: lo },
    { offset: 1, color: hi },
  ],
});
/** 天空：offset 0 在顶部（angle 90 = 自上而下）。 */
const skyOf = (a: string, b: string, c: string): PaintSpec => ({
  type: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: a },
    { offset: 0.62, color: b },
    { offset: 1, color: c },
  ],
});
const solid = (color: string): PaintSpec => ({ type: 'solid', color });

/*
 * 「换一版」配色池（Rei 2026-10-14：大量换一版很难看）。
 * 只收真实极光会出现的颜色：氧绿为主，高空氧红、氮紫 / 粉为辅；
 * 天空一律深靛 / 海蓝，地平线略亮；远山比天空底部更暗一档。
 * 2026-10-14 重做后整体调亮、调通透。
 */
const NAVY = skyOf('#081232', '#143366', '#2a6a8a');
const POLAR = skyOf('#06142a', '#0f3a5a', '#2a7a86');
const INDIGO = skyOf('#0c0c34', '#22246a', '#3e5c94');
const DEEP = skyOf('#050c24', '#0f2850', '#205874');
const STAR = solid('#eef6ff');
/*
 * ⚠️ 明度预算：coloring.ts 的 toneOf 用 HSL 明度（底色 ×2、极光两色 ×1）判深 / 浅底，须 < 0.5。
 * 极光色要「亮」靠高饱和而不是高 HSL 明度：#3cf59c 这类饱和青绿 L≈0.6，看上去比 #b4ffd8（L≈0.85）更像在发光。
 */
const REROLL: NonNullable<PatternDef['rerollSchemes']> = [
  { id: 'aurora:green', elements: { sky: POLAR, band_a: band('#3cf59c', '#2ec4b4'), band_b: band('#7af5c0', '#5a9cf5'), stars: STAR, ridge: solid('#06121c') } },
  { id: 'aurora:green-violet', elements: { sky: NAVY, band_a: band('#3cf59a', '#8a5cf5'), band_b: band('#6ae0f5', '#a870f5'), stars: STAR, ridge: solid('#071022') } },
  { id: 'aurora:green-pink', elements: { sky: INDIGO, band_a: band('#45f5a0', '#f05aa8'), band_b: band('#6af0d0', '#c060f0'), stars: STAR, ridge: solid('#0a0c26') } },
  { id: 'aurora:teal-blue', elements: { sky: DEEP, band_a: band('#4ae6f5', '#4a7af5'), band_b: band('#6af5c4', '#7a8af5'), stars: STAR, ridge: solid('#050d1e') } },
  { id: 'aurora:storm', elements: { sky: INDIGO, band_a: band('#b860f5', '#f0509a'), band_b: band('#4af0b8', '#9070f5'), stars: STAR, ridge: solid('#0a0a24') } },
  { id: 'aurora:red-crown', elements: { sky: NAVY, band_a: band('#45f59e', '#f04a64'), band_b: band('#80f5b4', '#f06a6a'), stars: STAR, ridge: solid('#081020') } },
  { id: 'aurora:pastel', elements: { sky: skyOf('#0a1430', '#1a3060', '#3a6488'), band_a: band('#5aecb4', '#9070ec'), band_b: band('#6ad0ec', '#ec70b4'), stars: STAR, ridge: solid('#0c1630') } },
  { id: 'aurora:cyan', elements: { sky: POLAR, band_a: band('#5af5e0', '#3aa8f5'), band_b: band('#40f590', '#7aa4f5'), stars: STAR, ridge: solid('#04121c') } },
];

const def: PatternDef = {
  id: 'aurora-wave',
  tones: ['dark'],
  name: '极光波浪',
  category: 'E-scene',
  description: '靛蓝夜空中垂挂的极光帘幕：下缘亮青绿，向上化作透明的竖向光丝，随风弯折，远山与星点点缀。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'sky', label: '夜空', role: 'bg', paint: skyOf('#071030', '#123264', '#24607e'), opacity: 1, visible: true, configurable: true },
    { id: 'band_a', label: '极光带 · A（下缘 → 上部）', role: 'primary', paint: band('#3cf59c', '#8f5cf5'), opacity: 0.95, visible: true, configurable: true },
    { id: 'band_b', label: '极光带 · B（下缘 → 上部）', role: 'secondary', paint: band('#5ae8f5', '#f05aa8'), opacity: 0.8, visible: true, configurable: true },
    { id: 'stars', label: '星点', role: 'detail', paint: solid('#eef6ff'), opacity: 0.75, visible: true, configurable: true },
    { id: 'ridge', label: '远山剪影', role: 'accent', paint: solid('#07112a'), opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'bands', label: '层数', type: 'range', min: 2, max: 6, step: 1, default: 3, heavy: true },
    { key: 'amp', label: '弯折幅度', type: 'range', min: 0.01, max: 0.25, step: 0.01, default: 0.1 },
    { key: 'thickness', label: '帘幕高度', type: 'range', min: 0.04, max: 0.35, step: 0.01, default: 0.22 },
    { key: 'stars', label: '星点密度', type: 'range', min: 0, max: 30, step: 1, default: 12 },
    { key: 'sway', label: '摆动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'boreal',
      label: '极北',
      elements: {
        sky: { paint: POLAR },
        band_a: { paint: band('#3cf59c', '#2ec4b4') },
        band_b: { paint: band('#86f5c4', '#5a9cf5') },
        stars: { paint: solid('#effff8') },
        ridge: { paint: solid('#05121c') },
      },
    },
    {
      id: 'nebula',
      label: '星云',
      elements: {
        sky: { paint: INDIGO },
        band_a: { paint: band('#b86af5', '#f05aa8') },
        band_b: { paint: band('#5af0c8', '#8a6af5') },
        stars: { paint: solid('#f2ecff') },
        ridge: { paint: solid('#0b0a26') },
      },
    },
    {
      id: 'ember',
      label: '余烬',
      elements: {
        sky: { paint: skyOf('#120a24', '#2c1a48', '#5a3a62') },
        band_a: { paint: band('#f59a5a', '#f04a6a') },
        band_b: { paint: band('#5af5a0', '#f0607a') },
        stars: { paint: solid('#fff0e2') },
        ridge: { paint: solid('#140a1c') },
      },
    },
    {
      id: 'dawn',
      label: '晨雾',
      elements: {
        sky: { paint: skyOf('#22386a', '#5a7cae', '#b4c4d8') },
        band_a: { paint: band('#c4ffe6', '#c8b8ff') },
        band_b: { paint: band('#e2f6ff', '#ffc8e6') },
        stars: { paint: solid('#f6f8ff') },
        ridge: { paint: solid('#2a3a5c') },
      },
      params: { stars: 4 },
    },
  ],

  paletteSlots: { bg: ['sky'], primary: ['band_a'], secondary: ['band_b'], detail: ['stars'], accent: ['ridge'] },
  rerollSchemes: REROLL,

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const n = api.n;
    const bandCount = Math.max(1, Math.min(6, Math.round(Number(params.bands))));
    const amp = Number(params.amp);
    const thickness = Number(params.thickness);
    const starDensity = Math.round(Number(params.stars));
    const sway = params.sway === true;
    const S = Math.min(W, H);

    const sky = elements.get('sky')!;
    const bandA = elements.get('band_a')!;
    const bandB = elements.get('band_b')!;
    const stars = elements.get('stars')!;
    const ridge = elements.get('ridge')!;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // ── 星点：稀疏；两档大尺寸互质单元，只铺上 3/4 天空 ─────────
    // 随机量一律先抽完（无论是否绘制），保证极光形态不随星点密度 / 显隐变化。
    const starCells: Array<{ cell: number; dots: string }> = [];
    const starScales: Array<[number, number]> = [
      [0.53, 1],
      [0.37, 0.6],
    ];
    for (const [ratio, bright] of starScales) {
      const cell = S * ratio;
      const count = Math.max(0, Math.round((starDensity / 30) * 9 * bright));
      let dots = '';
      for (let i = 0; i < count; i++) {
        const x = rng() * cell;
        const y = rng() * cell;
        const r = S * (0.0009 + rng() * 0.0014) * (0.8 + bright * 0.4);
        const o = (0.4 + rng() * 0.6) * bright * stars.opacity;
        dots += `<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" fill="${stars.paintValue}" fill-opacity="${n(o)}"/>`;
      }
      starCells.push({ cell, dots });
    }
    if (stars.visible && starDensity > 0) {
      for (const { cell, dots } of starCells) {
        if (dots === '') continue;
        parts.push(rect(0, 0, W, H * 0.8, { fill: api.tile({ key: `aw-s${n(cell)}`, w: cell, h: cell, content: dots }) }));
      }
    }

    // ── 地平线辉光：极光把低空映亮（纯渐变，无滤镜）────────────────
    if (bandA.visible || bandB.visible) {
      const glowC = colorOf((bandA.visible ? bandA : bandB).paint, 0);
      const glow = api.linear({
        angle: 90,
        key: 'aw-horizon',
        stops: [
          { offset: 0, color: glowC, opacity: 0 },
          { offset: 0.55, color: glowC, opacity: 0.07 },
          { offset: 1, color: glowC, opacity: 0.22 },
        ],
      });
      parts.push(rect(0, H * 0.45, W, H * 0.55, { fill: glow }));
    }

    // ── 极光帘幕 ──────────────────────────────────────────────
    // 共享一股「气流」：各层同向流动、相位相邻偏移 → 像同一片极光的几层幕。
    const flowPhase = rng() * Math.PI * 2;
    const flowCycles = 0.55 + rng() * 0.45; // 整幅约半个到一个 S
    const tilt = (rng() < 0.5 ? -1 : 1) * (0.06 + rng() * 0.1); // 斜贯画面
    const perBand = Math.floor(STRAND_BUDGET / bandCount);

    const strandsOut: string[] = [];
    const edgesOut: string[] = [];
    const ridgeTopY = H * 0.86;

    for (let i = 0; i < bandCount; i++) {
      const e = i % 2 === 0 ? bandA : bandB;
      // depth: 0 = 最近（最高最亮），1 = 最远（贴近地平线、更矮更淡）
      const depth = bandCount === 1 ? 0 : i / (bandCount - 1);
      const near = 1 - depth;
      const curtainH = H * thickness * (1.25 + near * 0.9);
      // 基线中心：近层偏上、远层贴近地平线；波幅受限，保证下缘始终落在 [22%, 82%] H
      const baseY = H * (0.5 + depth * 0.16 + (rng() - 0.5) * 0.05);
      const room = Math.min(baseY - H * 0.22, H * 0.82 - baseY) - (Math.abs(tilt) * H) / 2;
      const waveA = Math.max(0, Math.min(H * amp * (0.9 + near * 0.9), room / 1.22));
      const phase = flowPhase + i * 0.9 + rng() * 0.5;
      const c2 = 1.6 + rng() * 1.2;
      const p2 = rng() * Math.PI * 2;
      // 折叠：x 方向的回折。幅度 × 频率超过阈值时曲线会局部回折（帘幕褶皱）
      const foldCycles = 2 + rng() * 2.5;
      const foldAmp = (0.35 + rng() * 0.5) * (0.4 + amp * 4) / (Math.PI * 2 * foldCycles);
      const pf = rng() * Math.PI * 2;
      // 光丝簇：亮度与高度的中频起伏
      const rayCycles = 5 + rng() * 6;
      const pr = rng() * Math.PI * 2;
      const hCycles = 1.2 + rng() * 1.5;
      const ph = rng() * Math.PI * 2;
      // 起止：可略超出画布两侧（帘幕从画外流入），位置随 seed 错开
      const span = W * (0.85 + rng() * 0.35 - depth * 0.15);
      const x0 = (W - span) * (0.5 + (rng() - 0.5) * 0.9);
      const jitter: number[] = [];
      for (let k = 0; k < perBand; k++) jitter.push(rng(), rng(), rng());

      const bottomAt = (s: number): [number, number] => {
        const x = x0 + span * (s + foldAmp * Math.sin(Math.PI * 2 * foldCycles * s + pf));
        const u = x / W;
        const y =
          baseY +
          Math.sin(u * Math.PI * 2 * flowCycles + phase) * waveA +
          Math.sin(u * Math.PI * 2 * c2 + p2) * waveA * 0.22 +
          (u - 0.5) * tilt * H;
        return [x, Math.min(ridgeTopY, y)];
      };
      // 两端收尖的平顶包络
      const envAt = (s: number): number => Math.pow(Math.min(1, Math.sin(Math.PI * s) * 1.8), 1.2);

      if (!e.visible) {
        strandsOut.push('');
        edgesOut.push('');
        continue;
      }
      const lo = colorOf(e.paint, 0);
      const hi = colorOf(e.paint, 1);
      const alpha = e.opacity * (1 - depth * 0.4);

      // 光丝渐变：objectBoundingBox → 每条光丝各自从下缘（offset 0）亮到顶部透明
      const strandFill = api.linear({
        angle: 270,
        key: `aw-strand-${e.id}`,
        stops: [
          // 下缘不做透明过渡：斜切的光丝里，水平的渐隐带会和斜下缘错开成锯齿
          { offset: 0, color: lo, opacity: 0.9 },
          { offset: 0.1, color: lo, opacity: 0.6 },
          { offset: 0.4, color: lo, opacity: 0.22 },
          { offset: 0.68, color: hi, opacity: 0.14 },
          { offset: 1, color: hi, opacity: 0 },
        ],
      });

      const strandW = (span / perBand) * 2.2;
      const groups = ['', '', ''];
      for (let k = 0; k < perBand; k++) {
        const s = (k + jitter[k * 3]) / perBand;
        const [x, y] = bottomAt(s);
        const env = envAt(s);
        const ray = 0.5 + 0.5 * Math.sin(Math.PI * 2 * rayCycles * s + pr);
        const tall = 0.55 + 0.45 * Math.sin(Math.PI * 2 * hCycles * s + ph);
        let h = curtainH * env * (0.45 + 0.4 * tall + 0.35 * jitter[k * 3 + 1]);
        h = Math.min(h, y - H * 0.02);
        if (h < H * 0.01) continue;
        const w = Math.max(2, Math.round(strandW * (0.5 + jitter[k * 3 + 2])));
        if (x + w < 0 || x > W) continue;
        const o = env * (0.2 + 0.6 * ray * ray + 0.2 * jitter[k * 3 + 1]);
        const gi = o > 0.6 ? 2 : o > 0.33 ? 1 : o > 0.1 ? 0 : -1;
        if (gi < 0) continue;
        // 下缘贴着曲线斜切（避免台阶），上端水平（顶部已渐隐到 0，看不出）
        // 斜率取局部导数 dy/dx（x(s) 因折叠项非线性，不能用 s + w/span 直接取点）
        const [xb, yb] = bottomAt(Math.min(1, s + 0.002));
        const slope = Math.abs(xb - x) > 1e-6 ? (yb - y) / (xb - x) : 0;
        const by = Math.round(y + H * 0.004);
        const dy = Math.round(Math.max(-1.5, Math.min(1.5, slope)) * w); // 折叠回折处斜率趋∞，夹住防跳变
        const hh = Math.round(h);
        groups[gi] += `<path d="M${Math.round(x)} ${by}l${w} ${dy}v${-hh - dy}h${-w}z"/>`;
      }
      // ⚠️ 每条光丝必须是独立元素：objectBoundingBox 渐变按各自包围盒走，
      // 合成一条多子路径时会按整组包围盒渐隐，矮光丝就看不到亮下缘了。
      strandsOut.push(
        [0.32, 0.6, 0.95]
          .map((k, gi) => (groups[gi] === '' ? '' : g({ fill: strandFill, 'fill-opacity': n(alpha * k) }, groups[gi])))
          .join(''),
      );

      const pts: Array<[number, number]> = [];
      // 只沿帘幕主体取样（两端包络很低处不画亮线，否则读成悬空的「电线」）
      for (let k = 0; k < EDGE_PTS; k++) pts.push(bottomAt(0.08 + (0.84 * k) / (EDGE_PTS - 1)));

      // 下缘亮线：细、亮、两端淡出（纯渐变描边）
      const edgeFade = api.linear({
        angle: 0,
        key: `aw-edge-${e.id}`,
        stops: [
          { offset: 0, color: lo, opacity: 0 },
          { offset: 0.3, color: lo, opacity: 1 },
          { offset: 0.7, color: lo, opacity: 1 },
          { offset: 1, color: lo, opacity: 0 },
        ],
      });
      edgesOut.push(
        path(smooth(pts, api, true), {
          fill: 'none',
          stroke: edgeFade,
          'stroke-width': n(H * 0.0035),
          'stroke-opacity': n(alpha * 0.55),
          'stroke-linecap': 'round',
        }),
      );
    }

    // 远层先画（倒序），近层压在上面
    const aurora: string[] = [];
    for (let i = bandCount - 1; i >= 0; i--) aurora.push(strandsOut[i], edgesOut[i]);
    const auroraBody = aurora.join('');
    if (auroraBody !== '') {
      // 唯一的滤镜：小半径柔化光丝竖边（防「硬光射线」震动），不做大半径辉光
      let grp = g({ filter: api.blur(H * 0.0042) }, auroraBody);
      if (animate && sway) {
        const ox = n(W / 2);
        const oy = n(H * 0.7);
        const dx = n(W * 0.018);
        const name = api.keyframes(
          'vw-aurora',
          `from{transform:translateX(${-dx}px) skewX(-2.5deg)}to{transform:translateX(${dx}px) skewX(2.5deg)}`,
        );
        grp = g({ style: `transform-origin:${ox}px ${oy}px;animation:${name} 14s ease-in-out infinite alternate` }, grp);
      }
      parts.push(grp);
    }

    // ── 远山剪影：两层平缓山脊（随机量先抽完）────────────────────
    const ridgeLayers: string[] = [];
    for (let L = 0; L < 2; L++) {
      const top = H * (L === 0 ? 0.885 : 0.925);
      const a = H * (L === 0 ? 0.035 : 0.025);
      const c1 = 1.2 + rng() * 1.5;
      const c3 = 3 + rng() * 4;
      const q1 = rng() * Math.PI * 2;
      const q3 = rng() * Math.PI * 2;
      const pts: Array<[number, number]> = [];
      for (let k = 0; k <= 16; k++) {
        const u = k / 16;
        pts.push([u * W, top + a * (Math.sin(u * Math.PI * 2 * c1 + q1) * 0.7 + Math.sin(u * Math.PI * 2 * c3 + q3) * 0.3)]);
      }
      ridgeLayers.push(`${smooth(pts, api, true)} L${n(W)} ${n(H)} L0 ${n(H)} Z`);
    }
    if (ridge.visible) {
      parts.push(path(ridgeLayers[0], { fill: ridge.paintValue, 'fill-opacity': n(ridge.opacity * 0.72) }));
      parts.push(path(ridgeLayers[1], { fill: ridge.paintValue, 'fill-opacity': ridge.opacity }));
    }

    return { body: parts.join('') };
  },
};

/**
 * 过点序列 → 平滑三次贝塞尔（Catmull-Rom，张力 1/6）。
 * `move=true` 时以 M 起笔；否则直接接 c 段（调用方已用 L 连到首点）。
 * 整数像素 + 相对坐标 `c`（4K 下数值更短，省体积）。各段终点按取整后的位置累计，避免误差漂移。
 */
function smooth(pts: Array<[number, number]>, _api: RenderApi, move: boolean): string {
  const r = Math.round;
  const P = pts.map(([x, y]) => [r(x), r(y)] as [number, number]);
  let d = move ? `M${P[0][0]} ${P[0][1]}` : '';
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[Math.min(P.length - 1, i + 2)];
    const c1x = r((p2[0] - p0[0]) / 6);
    const c1y = r(Math.max(-p1[1], (p2[1] - p0[1]) / 6));
    const c2x = r(p2[0] - p1[0] - (p3[0] - p1[0]) / 6);
    const c2y = r(Math.max(-p1[1], p2[1] - p1[1] - (p3[1] - p1[1]) / 6));
    d += `c${c1x} ${c1y} ${c2x} ${c2y} ${p2[0] - p1[0]} ${p2[1] - p1[1]}`;
  }
  return d;
}

/** 取 PaintSpec 的代表色（实色直取；渐变取首/末色标）。 */
function colorOf(paint: PaintSpec, end: 0 | 1): string {
  if (paint.type === 'solid') return paint.color;
  if (paint.type === 'none') return '#000000';
  const stops = paint.stops;
  if (stops.length === 0) return '#000000';
  return (end === 0 ? stops[0] : stops[stops.length - 1]).color;
}

export default def;
