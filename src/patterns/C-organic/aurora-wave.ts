/**
 * 极光波浪 —— C渐变流体 / 有机形态。
 *
 * 构图要点：夜空竖向渐变打底，上 1/3 到中部悬着若干条**极光光帘**。
 *
 * ⭐ 为什么是「光帘」而不是「色带」——三件事决定它像不像极光：
 *   1. **下缘锐利亮边 + 向上快速衰减成雾**：真实极光的视觉重心在帘幕下沿，
 *      往上迅速弥散成雾。所以每条帘幕用「下亮上透」的 stop 序列（依赖引擎新增的
 *      `stop-opacity`），并在底缘单独描一条亮线。
 *   2. **垂直光射线**：帘幕上密布细窄竖线、上端渐隐 —— 这是极光最标志性的
 *      curtain texture，缺了它就只是色块。
 *   3. **柔和辉光**：整条帘幕过一道轻微软化（feGaussianBlur），
 *      而底缘亮边不参与模糊，于是「柔」与「锐」同时存在。
 *
 * 体积策略：星点必须 tile（多档互质单元打破网格感）；
 * 帘幕本体每条只有 3 个节点（幕身/ 射线 / 亮边），层数拉满也不会逼近节点红线。
 */
import { g, path, rect } from '../../engine/svg';
import type { PaintSpec, PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const def: PatternDef = {
  id: 'aurora-wave',
  name: '极光波浪',
  category: 'C-organic',
  description: '夜空之上悬着数条极光光帘，帘幕下缘亮、向上化作光雾，垂下细密光射线。',
  seedable: true,
  animatable: true,

  elements: [
    {
      id: 'sky',
      label: '夜空',
      role: 'bg',
      paint: {
        type: 'linear',
        angle: 90,
        stops: [
          { offset: 0, color: '#020617' },
          { offset: 0.55, color: '#0b1e3d' },
          { offset: 1, color: '#1e293b' },
        ],
      },
      opacity: 1,
      visible: true,
      configurable: true,
    },
    { id: 'band_a', label: '极光带 · A', role: 'primary', paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#a7f3d0' }, { offset: 1, color: '#22d3ee' }] }, opacity: 0.55, visible: true, configurable: true },
    { id: 'band_b', label: '极光带 · B', role: 'secondary', paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#c4b5fd' }, { offset: 1, color: '#f0abfc' }] }, opacity: 0.45, visible: true, configurable: true },
    { id: 'stars', label: '星点', role: 'detail', paint: { type: 'solid', color: '#e2e8f0' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    { key: 'bands', label: '层数', type: 'range', min: 2, max: 6, step: 1, default: 3, heavy: true },
    { key: 'amp', label: '波幅', type: 'range', min: 0.01, max: 0.25, step: 0.01, default: 0.09 },
    { key: 'thickness', label: '厚度', type: 'range', min: 0.04, max: 0.35, step: 0.01, default: 0.16 },
    { key: 'stars', label: '星点密度', type: 'range', min: 0, max: 30, step: 1, default: 12 },
    { key: 'sway', label: '摆动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'boreal',
      label: '极北',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#010409' }, { offset: 0.6, color: '#052e2b' }, { offset: 1, color: '#0f172a' }] } },
        band_a: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#6ee7b7' }, { offset: 1, color: '#0891b2' }] } },
        band_b: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#a5b4fc' }, { offset: 1, color: '#e879f9' }] } },
        stars: { paint: { type: 'solid', color: '#f8fafc' } },
      },
    },
    {
      id: 'nebula',
      label: '星云',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#0b0416' }, { offset: 0.55, color: '#2e1065' }, { offset: 1, color: '#1e1b4b' }] } },
        band_a: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#f0abfc' }, { offset: 1, color: '#7c3aed' }] } },
        band_b: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#67e8f9' }, { offset: 1, color: '#4f46e5' }] } },
        stars: { paint: { type: 'solid', color: '#ddd6fe' } },
      },
    },
    {
      id: 'ember',
      label: '余烬',
      elements: {
        sky: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#1a0b04' }, { offset: 0.6, color: '#431407' }, { offset: 1, color: '#1c1917' }] } },
        band_a: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fcd34d' }, { offset: 1, color: '#ea580c' }] } },
        band_b: { paint: { type: 'linear', angle: 90, stops: [{ offset: 0, color: '#fb7185' }, { offset: 1, color: '#9f1239' }] } },
        stars: { paint: { type: 'solid', color: '#fed7aa' } },
      },
    },
  ],

  paletteSlots: { bg: ['sky'], primary: ['band_a'], secondary: ['band_b'], detail: ['stars'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
  const { width: W, height: H, params, elements, rng, animate } = cfg;
    const bandCount = Math.max(1, Math.min(6, Math.round(Number(params.bands))));
    const amp = Number(params.amp);
    const thickness = Number(params.thickness);
    const starDensity = Math.round(Number(params.stars));
    const sway = params.sway === true;

    const sky = elements.get('sky')!;
    const bandA = elements.get('band_a')!;
    const bandB = elements.get('band_b')!;
    const stars = elements.get('stars')!;

    const parts: string[] = [rect(0, 0, W, H, { fill: sky.paintValue, 'fill-opacity': sky.opacity })];

    // ── 星点：多档互质单元叠加 ────────────────────────────────
    // 单档tile 的重复周期只有 ~120px，一眼就能看出晶格。
    // 三档尺寸互质（大/中/小）叠加后，视觉重复周期被拉到远大于视野。
    if (stars.visible && starDensity > 0) {
      const base = Math.min(W, H) / Math.max(4, starDensity);
      const scales: Array<[number, number]> = [
        [1, 7],
        [0.43, 5],
        [0.19, 11],
      ];
  for (const [ratio, count] of scales) {
      const cell = base * ratio;
   if (cell < 8) continue;
  const dots: string[] = [];
        for (let i = 0; i < count; i++) {
  // 位置/半径/透明度全部随机 → 单元自身就没有可辨识的规律
          const r = Math.max(0.25, cell * (0.012 + rng() * 0.03));
          const o = 0.25 + rng() * 0.75;
          dots.push(
      `<circle cx="${api.n(rng() * cell)}" cy="${api.n(rng() * cell)}" r="${api.n(r)}" fill="${stars.paintValue}" fill-opacity="${api.n(o * stars.opacity)}"/>`,
       );
        }
     parts.push(
     rect(0, 0, W, H, {
        fill: api.tile({ key: `aw-s${api.n(cell)}-${count}`, w: cell, h: cell, content: dots.join('') }),
   }),
      );
      }
    }

    // ── 极光光帘 ────────────────────────────────────────────────
    // 带子集中在画面上 1/3 到中部：aurora 悬在高处，堆在正中央会糊成一团脏色。
    // 各带的相位「相关而非随机」—— 相邻带轻微偏移，才像同一股气流的几层幕。
    const basePhase = rng() * Math.PI * 2;
    const baseCycles = 2.2 + rng() * 2.2;
    /**
     * 轮廓采样数**随褶皱频率自适应**，而不是固定值。
     *
     * 固定 18 段在低频时是浪费（2.2 周期用 18 段远超奈奎斯特需求）；
     * 但直接压到 12 段会在高频时翻车 —— baseCycles 最高 4.4，
     * 12 段只有 2.7 点/周期，逼近奈奎斯特极限，正弦会渲出明显的折线。
     *
     * 因此取「每周期至少 5 个采样点」，并以 18 封顶（等于原值，绝不劣化）。
     * 低频省字节、高频保质量。
     */
    const segs = Math.min(18, Math.max(10, Math.ceil(baseCycles * 5)));

    for (let i = 0; i < bandCount; i++) {
    const e = i % 2 === 0 ? bandA : bandB;
      if (!e.visible) continue;
      const t = (i + 1) / (bandCount + 1);
      // 帘幕高度（不含位置），先算出来才能据此安排基线
      const curtainH = H * thickness * 1.05 * (1 - i * 0.1);
      /**
       * 底缘基线：**随帘幕高度动态下沉**。
       *
       * 之前 baseY 是固定区间 `H*(0.23 + t*0.23)`，只有默认 thickness 恰好放得下；
       * thickness 拉到 max(0.35) 时 curtainH≈529px，topY 变成 -198px，
       * 帘子顶端冲出画布 —— 用户会看到「半截帘子被切」，不像刻意设计。
       *
       * 现在保证 topY ≥ margin：基线至少要离上边界有「帘幕高 + 最大波幅」那么高，
     * 厚帘自然往下沉，薄帘仍然停在画面上 1/3。
       *
       * ⚠️ 裕量里必须**包含波幅项** `H*amp*0.5`：bottomY 会在 baseY 上下摆动，
       * 只按 curtainH 留裕量的话，amp 拉满时 topY 仍会越过上边界。
       */
      const topMargin = H * 0.03;
 const minBaseY = curtainH + H * amp * 0.5 + topMargin;
      const baseY = Math.max(H * (0.23 + t * 0.23), minBaseY);
      // 相关相位：相邻带只偏移 0.55rad，并共享 cycles → 同源而非乱线
      const phase = basePhase + i * 0.55;
      const cycles = baseCycles + (rng() - 0.5) * 0.4;
      // 起笔错位：各带不从同一点起笔，避免所有带在 x=0 处对齐起笔
      const xShift = rng() * W;

      /**
       * 帘幕上缘 / 下缘。
       *
       * ⭐ 横向必须有多「折」：极光帘幕的辨识度来自**竖直褶皱**，
       * 若 cycles 接近 1，上缘就是一条近乎笔直的水平线，
       * 整体立刻退化成「发光横条」—— 这正是上一版被嫌丑的主因。
       * 下缘起伏刻意更浅：它是极光的「刀刃」，太乱就散了。
       */
      const bottomY = (x: number): number => {
        const u = ((x - xShift) / W) * Math.PI * 2 * cycles + phase;
  return baseY + Math.sin(u) * H * amp * 0.5;
      };
      const topY = (x: number): number => {
      const u = ((x - xShift) / W) * Math.PI * 2 * cycles + phase;
        // 上缘跟随下缘同相，但幅度大得多 → 帘幕厚度随褶皱起伏
        return bottomY(x) - curtainH * (0.72 + 0.28 * Math.sin(u + 0.9));
      };

      // ── 幕身：下亮上透 ──
      // 关键：光雾必须靠 stop 变透明实现。末端再暗的实色也是实色，
    // 只有 alpha 归零才得到真正的「向上化雾」。
  let d = '';
      for (let k = 0; k <= segs; k++) {
        const x = (k / segs) * W;
        d += `${k === 0 ? 'M' : 'L'}${api.n(x)} ${api.n(topY(x))}`;
      }
      for (let k = segs; k >= 0; k--) {
        const x = (k / segs) * W;
  d += ` L${api.n(x)} ${api.n(bottomY(x))}`;
      }
      d += ' Z';

      // 由元件自身颜色派生「下亮上透」的渐变：
      // 保留用户配色（改色命中率 100%），只重排 stop 的位置与透明度。
      const fade = api.linear({
        angle: 270, // 自下而上：offset 0 落在幕身下缘
        key: `aw-fade-${e.id}`,
        stops: [
    // 下缘最亮 → 向上快速衰减 → 在 0.82 处彻底归零。
          // 提前收尾是有意的：若拖到 1.0，帘幕顶端会留下一条悬在夜空里的淡边，
        // 看起来像「没画完」而不是「化进夜空」。
          { offset: 0, color: curtainColor(e.paint, 0), opacity: 0.98 },
          { offset: 0.18, color: curtainColor(e.paint, 1), opacity: 0.8 },
   { offset: 0.5, color: curtainColor(e.paint, 1), opacity: 0.3 },
      { offset: 0.82, color: curtainColor(e.paint, 1), opacity: 0 },
        ],
      });

      /**
       * 光线专用渐变：比幕身**更早**归零（0.55 vs 0.82）。
       *
     * 为什么必须分开：幕身是大面积半透明色块，光线是细亮线。
       * 两者用同一条衰减曲线时，细线在暗背景上的「视觉重量」远超同透明度的色块，
       * 结果光线一直亮到帘幕顶端，在夜空里排成一根根竖条，像条形码。
   * 让光线只在帘幕下半段发光，正好符合真实极光「下亮上散」的观感。
       */
      const rayFade = api.linear({
        angle: 270,
        key: `aw-ray-${e.id}`,
        stops: [
  { offset: 0, color: curtainColor(e.paint, 0), opacity: 1 },
    { offset: 0.22, color: curtainColor(e.paint, 1), opacity: 0.75 },
          { offset: 0.55, color: curtainColor(e.paint, 1), opacity: 0 },
     ],
      });

      // ── 垂直光射线：curtain texture 的关键 ──
      // 每条光线从下缘一直延伸到上缘（跟随帘幕轮廓），
      // 这样竖直褶皱才会与幕身轮廓**对齐** —— 若光线长度随机，
      // 褶皱结构就散了，帘幕又变回一团雾。
      //
      // 单条 path 内 stroke-width 单一，所以用两组叠加制造粗细浓淡对比：
      // 细而密的一组打底，粗而稀的一组提亮，避免整齐如百叶窗。
      let raysFine = '';
      let raysBold = '';
      const rayCount = 34;
      for (let k = 0; k < rayCount; k++) {
        const x = (k / rayCount) * W + (rng() - 0.5) * (W / rayCount) * 1.4;
   // 只向下取偏移：光线必须始终**留在帘幕内部**。
        // 允许越过上缘会冒出一排悬空的竖线，像刺猬的头发而不是极光。
 const yTop = topY(x) + rng() * curtainH * 0.32;
        const yBot = bottomY(x);
        if (yBot - yTop < 2) continue;
        // 整数坐标：光柱本身有宽度，亚像素精度没有视觉意义，却要多付 6~8 字节/条
        const xi = String(Math.round(x));
        const seg = ` M${xi} ${String(Math.round(yTop))} L${xi} ${String(Math.round(yBot))}`;
        raysFine += seg;
    if (rng() > 0.74) raysBold += seg;
      }

      // ── 辉光：只模糊幕身，得到柔和雾感 ──
      // ⚠️ 光线**不能**参与模糊：stdDeviation 与线宽同量级时，
      // 一根 2px 的线会被糊成几乎不可见，帘幕的curtain texture 就消失了
      // （实测踩过：光线在模糊组里时整幅图退化成一条发光色带）。
      // 真实极光的竖直光柱本来就是 comparatively 锐利的。
      const soft = api.blur(H * 0.012);
      parts.push(
  g({ filter: soft }, path(d, { fill: fade, 'fill-opacity': 0.66 })),
      );

      // 细光线：清晰、不模糊 —— 帘幕的织物质感由此而来
      parts.push(
        path(raysFine, {
          fill: 'none',
          stroke: rayFade,
    'stroke-width': Math.max(0.7, H * 0.0018),
          'stroke-opacity': 0.7,
   'stroke-linecap': 'round',
        }),
      );

      // 粗亮光线：清晰、不模糊 —— 这是「帘幕」读起来的关键
      parts.push(
        path(raysBold, {
        fill: 'none',
      stroke: rayFade,
       'stroke-width': Math.max(1.6, H * 0.0038),
          'stroke-opacity': 0.62,
       'stroke-linecap': 'round',
        }),
      );

      // ── 下缘亮边：极光的灵魂。不参与模糊，所以格外锐利 ──
      let edge = '';
      for (let k = 0; k <= segs; k++) {
        const x = (k / segs) * W;
  edge += `${k === 0 ? 'M' : 'L'}${api.n(x)} ${api.n(bottomY(x))}`;
    }
      parts.push(
      path(edge, {
          fill: 'none',
  stroke: fade,
   'stroke-width': Math.max(1.4, H * 0.003),
     'stroke-opacity': Math.min(1, e.opacity + 0.5),
        }),
      );
    }

    const body = parts.join('');
    if (!animate || !sway) return { body };

    // 摆动：光帘整体缓慢横移。柔和光幕横移比硬边色带自然得多。
    const name = api.keyframes(
      'vw-aurora',
  `from{transform:translateX(0)}to{transform:translateX(${api.n(W * 0.04)}px)}`,
    );
    return { body: g({ style: `animation:${name} 20s ease-in-out infinite alternate` }, body) };
  },
};

/** 取 PaintSpec 的代表色（实色直取；渐变取首/末色标）。 */
function paintColorOf(paint: PaintSpec, end: 0 | 1): string {
  if (paint.type === 'solid') return paint.color;
  if (paint.type === 'none') return '#000000';
  const stops = paint.stops;
  if (stops.length === 0) return '#000000';
  return (end === 0 ? stops[0] : stops[stops.length - 1]).color;
}

/** 幕身渐变用色：下缘取该role 的「主色」，上缘取其「辅色」，形成色相过渡。 */
function curtainColor(paint: PaintSpec, end: 0 | 1): string {
  return paintColorOf(paint, end);
}

export default def;
