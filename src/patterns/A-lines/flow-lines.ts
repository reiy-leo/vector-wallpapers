/**
 * 流线曲 —— A 极简几何线条。
 *
 * 一束**永不相交**的平行流线横扫全幅：所有线来自同一个平滑位移场，
 * 相邻线只在相位上缓慢错开，于是线距自然「呼吸」（汇聚 / 舒展），
 * 再由一个 seed 决定位置的「涌泉」把线束撑开一道柳叶形的留白，作为画面焦点。
 *
 * ─────────────────────────────────────────────────────────────────────────
 * 2026-10-12 v2 重做（用户：「还是不好看」）。v1 的病根：
 *
 * ❶ **pattern 平铺把线切断**：tile 高 = 2×行距，而振幅常常大于 tile 高，
 *    波峰波谷被 tile 边界裁掉 → 画面上到处是断头的短线、孤立的小横杠。
 * ❷ **三层各自独立的波互相穿插**：远/中/近三组线束频率、相位都不同，
 *    交叉成一团乱麻，没有「流」的方向感。
 * ❸ **曲线有折角**：二次贝塞尔的控制点取段起点高度，每个节点处切线不连续，
 *    放大后是一串细小的锯齿拐点（chevron 形态更是直接用 |sin| 造尖角）。
 * ❹ 预设全是暗色，且 line_far 与底色太近，远层几乎看不见。
 *
 * v2 的做法：
 *  - **单一位移场**：y_i(x) = 基线_i + F(x, t_i)，F 对 t 的变化率远小于行距
 *    （再加逐列钳制兜底）→ 数学上保证线与线不交叉、间距不塌缩。
 *  - **Catmull-Rom → 三次贝塞尔**，用 `S` 命令串接：x 等距采样时 Catmull-Rom 的
 *    相邻控制点恰好关于节点对称，与 `S` 的反射语义一致 → 全线 C1 连续，零折角。
 *  - **远 / 中 / 近不再是三组独立的波**，而是同一束线里按节奏交织的三种笔触
 *    （细·中·粗 + 三色），层次靠线宽与颜色表达。
 *  - 坐标先取整（小画布保留 1 位小数）再写相对增量，无累计误差；体积 ∝ 线数 × 段数，
 *    由 SEG_BUDGET 分配段数、BYTE_CAP 兜底，任何尺寸/参数极值都 < 20KB。
 *
 * 每层仍包在一个整幅 `<pattern>` 里（tile = 画布 + 动画余量，不发生重复）：
 * 这样每层是一个独立可寻址的绘制层，flow-lines.guard 的分层检测也依赖它。
 *
 * ⚠️ 数据契约（分享链接依赖，**不可改名/删除**）：
 *   元件 id `bg` / `line_far` / `line_mid` / `line_near`
 *   控件 key `density` / `weight` / `amplitude` / `curvature` / `drift` / `morph` / `accent`
 *   （morph 的选项值也保持不变，旧链接语义平滑迁移到新场）
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

/** 线宽缩放基准：「线宽 1.2」在任何画布尺寸下都是同一视觉粗细（短边 / 1080，clamp）。 */
function widthUnit(w: number, h: number): number {
  return Math.min(4, Math.max(0.5, Math.min(w, h) / 1080));
}

type Morph = 'sine' | 'harmonics' | 'chevron' | 'vortex' | 'mixed';
const MORPHS: readonly Morph[] = ['mixed', 'sine', 'harmonics', 'chevron', 'vortex'];

/** 全部线条的贝塞尔段数总预算 —— 体积的主旋钮（每段约 12~16 字节）。 */
const SEG_BUDGET = 1000;
/** 三层 `d` 字符总量硬上限，超出则不再追加线条（实际很少触发）。 */
const BYTE_CAP = 16500;

/** 三种笔触：线宽倍率。远 = 细丝，中 = 主线，近 = 少量粗线做重音。 */
const STROKE_SCALE = [0.6, 1, 1.75] as const;

/**
 * 笔触节奏：周期 6 —— 近 · 远 · 中 · 远 · 中 · 远。
 * 细线占一半做「底纹」，主线三分之一，粗重音六分之一，读起来像乐谱的强弱拍。
 */
const RHYTHM = [2, 0, 1, 0, 1, 0] as const;

/** 圆角折线波：s→0 退化为正弦，s→1 趋近三角波（但始终光滑，无尖角）。 */
function shapedWave(a: number, s: number): number {
  if (s < 0.01) return Math.sin(a);
  return Math.asin(s * Math.sin(a)) / Math.asin(s);
}

interface Field {
  /** 返回第 t∈[0,1] 条线在 x 处相对基线的位移（px）。 */
  (x: number, t: number): number;
}

function buildField(
  morph: Morph,
  W: number,
  amp: number,
  lambda: number,
  accent: number,
  rng: () => number,
): { f: Field; reach: number; harmonic: boolean } {
  const k = (Math.PI * 2) / lambda;
  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  // 相位随 t 漂移的速率：让上下线错位 → 线距呼吸。符号随 seed。
  const shear = (1.1 + rng() * 0.8) * (rng() < 0.5 ? -1 : 1);
  // 涌泉：横向位置、所在线束高度、宽度
  const sx = W * (0.22 + rng() * 0.56);
  const st = 0.38 + rng() * 0.24;
  const sw = Math.max(lambda * 0.32, W * 0.16);
  const sx2 = sx + (rng() < 0.5 ? -1 : 1) * W * (0.3 + rng() * 0.15);
  const st2 = st + (rng() < 0.5 ? -0.22 : 0.22);

  const base = (x: number, t: number): number => Math.sin(k * x + p1 + shear * t * Math.PI);
  const harm = (x: number, t: number): number => Math.sin(2 * k * x + p2 - shear * t * Math.PI * 1.6);
  const swell = (x: number, t: number, cx: number, ct: number, tau: number): number => {
    const dx = (x - cx) / sw;
    return Math.exp(-dx * dx) * Math.tanh((t - ct) / tau);
  };

  switch (morph) {
    case 'sine':
      return { f: (x, t) => amp * base(x, t), reach: amp, harmonic: false };
    case 'harmonics': {
      const h = 0.18 + accent * 0.32;
      return {
        f: (x, t) => amp * ((1 - h) * base(x, t) + h * harm(x, t)),
        reach: amp,
        harmonic: true,
      };
    }
    case 'chevron': {
      const s = 0.5 + accent * 0.47;
      return {
        f: (x, t) => amp * shapedWave(k * x + p1 + shear * t * Math.PI, s),
        reach: amp,
        harmonic: true,
      };
    }
    case 'vortex': {
      const B = amp * (1 + accent * 1.4);
      return {
        f: (x, t) =>
          amp * 0.5 * base(x, t) + B * swell(x, t, sx, st, 0.09) + B * 0.55 * swell(x, t, sx2, st2, 0.07),
        reach: amp * 0.5 + B * 1.55,
        harmonic: false,
      };
    }
    case 'mixed':
    default: {
      const h = accent * 0.22;
      const B = amp * (0.35 + accent * 0.75);
      return {
        f: (x, t) => amp * ((1 - h) * base(x, t) + h * harm(x, t)) + B * swell(x, t, sx, st, 0.08),
        reach: amp + B,
        harmonic: accent > 0.05,
      };
    }
  }
}

const def: PatternDef = {
  id: 'flow-lines',
  name: '流线曲',
  category: 'A-lines',
  description: '一束永不相交的平行流线横扫画面，线距随波呼吸，在焦点处舒展出一道留白。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#0e1424' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_far', label: '细线', role: 'secondary', paint: { type: 'solid', color: '#5b78b0' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_mid', label: '主线', role: 'primary', paint: { type: 'solid', color: '#9db8f2' }, opacity: 1, visible: true, configurable: true },
    { id: 'line_near', label: '重音线', role: 'accent', paint: { type: 'solid', color: '#f7b267' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'density', label: '密度', type: 'range', min: 4, max: 60, step: 1, default: 26, heavy: true },
    { key: 'weight', label: '线宽', type: 'range', min: 0.4, max: 8, step: 0.1, default: 1.4, unit: 'px' },
    { key: 'amplitude', label: '振幅', type: 'range', min: 0, max: 0.35, step: 0.01, default: 0.1 },
    { key: 'curvature', label: '曲率', type: 'range', min: 0.5, max: 4, step: 0.1, default: 1.2 },
    { key: 'morph', label: '形态', type: 'select', default: 'mixed', options: [
      { value: 'mixed', label: '流波涌泉' },
      { value: 'sine', label: '统一柔波' },
      { value: 'harmonics', label: '双频密纹' },
      { value: 'chevron', label: '折角几何' },
      { value: 'vortex', label: '涡旋起伏' },
    ] },
    /** 形态强度：谐波占比 / 折角锐度 / 涌泉张开程度 */
    { key: 'accent', label: '形态强度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.6 },
    { key: 'drift', label: '流动动画', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'paper',
      label: '宣纸',
      // 亮色：暖白底 + 墨灰细线 + 朱砂重音
      elements: {
        bg: { paint: { type: 'solid', color: '#f5f0e6' } },
        line_far: { paint: { type: 'solid', color: '#9a8f80' } },
        line_mid: { paint: { type: 'solid', color: '#4a4f5c' } },
        line_near: { paint: { type: 'solid', color: '#c8553d' } },
      },
      params: { morph: 'mixed', density: 30, weight: 1.2, amplitude: 0.09 },
    },
    {
      id: 'seafoam',
      label: '海雾',
      // 亮色：雾青底 + 青绿 / 深海蓝
      elements: {
        bg: { paint: { type: 'solid', color: '#e8f3f1' } },
        line_far: { paint: { type: 'solid', color: '#5fa59a' } },
        line_mid: { paint: { type: 'solid', color: '#1f7a72' } },
        line_near: { paint: { type: 'solid', color: '#16405a' } },
      },
      params: { morph: 'sine', density: 34, weight: 1.1, amplitude: 0.12, curvature: 0.9 },
    },
    {
      id: 'midnight',
      label: '午夜蓝',
      elements: {
        bg: { paint: { type: 'solid', color: '#070b1a' } },
        line_far: { paint: { type: 'solid', color: '#3d62c4' } },
        line_mid: { paint: { type: 'solid', color: '#7fb0ff' } },
        line_near: { paint: { type: 'solid', color: '#e6f0ff' } },
      },
      params: { morph: 'harmonics', density: 32, weight: 1.2, accent: 0.45 },
    },
    {
      id: 'sakura',
      label: '樱',
      elements: {
        bg: { paint: { type: 'solid', color: '#241626' } },
        line_far: { paint: { type: 'solid', color: '#9a5a9e' } },
        line_mid: { paint: { type: 'solid', color: '#ec8fb5' } },
        line_near: { paint: { type: 'solid', color: '#ffe3ee' } },
      },
      params: { morph: 'vortex', density: 28, amplitude: 0.08, accent: 0.55 },
    },
    {
      id: 'mint',
      label: '薄荷',
      elements: {
        bg: { paint: { type: 'solid', color: '#05201e' } },
        line_far: { paint: { type: 'solid', color: '#1f8f84' } },
        line_mid: { paint: { type: 'solid', color: '#4fe0c8' } },
        line_near: { paint: { type: 'solid', color: '#d8fff2' } },
      },
      params: { morph: 'mixed', density: 22, curvature: 1.6, accent: 0.8 },
    },
    {
      id: 'graphite',
      label: '石墨',
      /**
       * 单色系：层次全靠**明度阶梯**（bg < 细 < 主 < 重音，单调递增）。
       * ⚠️ 不要用降 opacity 去「补偿」对比度 —— alpha 只会把线拉向底色。
       * 正确做法是提高原色明度，alpha 保持 1（flow-lines.guard ⑪b / ⑬）。
       */
      elements: {
        bg: { paint: { type: 'solid', color: '#0c0c0e' } },
        line_far: { paint: { type: 'solid', color: '#6f7782' } },
        line_mid: { paint: { type: 'solid', color: '#b4bcc7' } },
        line_near: { paint: { type: 'solid', color: '#f7f9fc' } },
      },
      params: { morph: 'chevron', accent: 0.6, density: 24, weight: 1.5, curvature: 1.4 },
    },
  ],

  paletteSlots: { bg: ['bg'], secondary: ['line_far'], primary: ['line_mid'], accent: ['line_near'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const density = Math.min(60, Math.max(2, Number(params.density) || 26));
    const weight = Math.max(0.1, Number(params.weight) || 1.4);
    const amplitude = Math.min(0.5, Math.max(0, Number(params.amplitude) || 0));
    const curvature = Math.min(6, Math.max(0.2, Number(params.curvature) || 1.2));
    const accent = Math.min(1, Math.max(0, Number(params.accent ?? 0.6)));
    const drift = params.drift === true;
    const morphRaw = String(params.morph);
    const morph: Morph = (MORPHS as readonly string[]).includes(morphRaw) ? (morphRaw as Morph) : 'mixed';

    const unit = widthUnit(W, H);
    const bg = elements.get('bg')!;
    const layerEls = [elements.get('line_far')!, elements.get('line_mid')!, elements.get('line_near')!];

    const bgRect = rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity });
    const parts: string[] = [];

    // ── 几何尺度：波长以宽为主、长边为辅（竖屏也有完整的起伏），振幅按短边 ──
    const lambda = (W * 0.6 + Math.max(W, H) * 0.4) / curvature;
    const amp = Math.min(W, H) * amplitude;
    const { f, reach, harmonic } = buildField(morph, W, amp, lambda, accent, rng);

    const gap = H / density;
    // 动画余量：左右各多画一截，平移时边缘不露底
    const moving = animate && drift;
    const margin = moving ? Math.round(W * 0.04) : 0;
    const x0 = -margin - W * 0.01;
    const x1 = W + margin + W * 0.01;

    // 线束必须盖满画面：上下各溢出「最大位移 + 一个行距」
    const pad = reach + gap;
    const lineCount = Math.max(2, Math.ceil((H + pad * 2) / gap) + 1);
    const yStart = -pad + ((rng() - 0.5) * gap) / 2;
    const rhythmOff = Math.floor(rng() * RHYTHM.length);

    // ── 段数分配：既要够光滑（每周期 ≥ 7 段），又不能击穿体积 ──
    const cyclesAcross = (x1 - x0) / lambda;
    const want = Math.ceil(cyclesAcross * (harmonic ? 13 : 8)) + 2;
    const segs = Math.max(6, Math.min(48, want, Math.floor(SEG_BUDGET / lineCount)));
    const step = (x1 - x0) / segs;

    // 坐标精度：小画布保留 1 位小数，其余取整（视觉无差、体积省一半）
    const q = Math.min(W, H) < 700 ? 10 : 1;
    const r = (v: number): number => Math.round(v * q) / q;
    const fmt = (v: number): string => {
      const s = String(Math.round(v * q) / q);
      return s === '-0' ? '0' : s;
    };
    // 紧凑拼接：负号自带分隔，正数前补空格
    const join = (vals: number[]): string => {
      let out = '';
      for (const v of vals) {
        const s = fmt(v);
        out += out === '' || s[0] === '-' ? s : ` ${s}`;
      }
      return out;
    };

    // ── 采样整个场，逐列钳制保证不交叉 ──
    const minGap = gap * 0.32;
    const xs: number[] = [];
    for (let k = -1; k <= segs + 1; k++) xs.push(x0 + step * k);
    let prev: number[] | null = null;
    const ds = ['', '', ''];
    let total = 0;

    for (let i = 0; i < lineCount; i++) {
      const t = lineCount === 1 ? 0.5 : i / (lineCount - 1);
      const baseY = yStart + i * gap;
      const ys = xs.map((x) => baseY + f(x, t));
      if (prev) for (let k = 0; k < ys.length; k++) ys[k] = Math.max(ys[k], prev[k] + minGap);
      prev = ys;

      // 整条线都在画面外 → 不画（但仍参与钳制链）
      let lo = Infinity;
      let hi = -Infinity;
      for (const y of ys) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
      if (hi < -gap || lo > H + gap) continue;

      const layer = RHYTHM[(i + rhythmOff) % RHYTHM.length];
      if (!layerEls[layer].visible) continue;

      // Catmull-Rom（均匀）→ 三次贝塞尔：c2 = P(k+1) - (P(k+2) - P(k)) / 6。
      // x 等距，故 c1 正好是上一段 c2 关于节点的反射 → 用 `S` 省掉一半控制点。
      // 先取整再求差分 → 相对坐标无累计误差。
      // tile 原点被挪到 (-margin, -2gap)，故写入的坐标整体 +(margin, 2gap)。
      const ox = margin;
      const oy = gap * 2;
      const px = xs.map((x) => r(x + ox));
      const py = ys.map((y) => r(y + oy));
      // 首段用 C（需给出 c1），其后全是 S
      const c1x = r(xs[1] + (xs[2] - xs[0]) / 6 + ox);
      const c1y = r(ys[1] + (ys[2] - ys[0]) / 6 + oy);
      let d = `M${fmt(px[1])} ${fmt(py[1])}`;
      for (let k = 1; k <= segs; k++) {
        const cx2 = r(xs[k + 1] - (xs[k + 2] - xs[k]) / 6 + ox);
        const cy2 = r(ys[k + 1] - (ys[k + 2] - ys[k]) / 6 + oy);
        const ex = px[k + 1];
        const ey = py[k + 1];
        if (k === 1) d += `c${join([c1x - px[k], c1y - py[k], cx2 - px[k], cy2 - py[k], ex - px[k], ey - py[k]])}`;
        else d += `s${join([cx2 - px[k], cy2 - py[k], ex - px[k], ey - py[k]])}`;
      }
      if (total + d.length > BYTE_CAP) break;
      total += d.length;
      ds[layer] += d;
    }

    const tileW = W + margin * 2;
    layerEls.forEach((e, li) => {
      if (!e.visible || ds[li] === '') return;
      const content = path(ds[li], {
        fill: 'none',
        stroke: e.paintValue,
        'stroke-width': api.n(weight * STROKE_SCALE[li] * unit),
        'stroke-opacity': e.opacity,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      });
      const ref = api.tile({
        key: `fl2-${li}-${api.n(W)}-${api.n(H)}-${margin}`,
        w: tileW,
        h: H + gap * 4,
        // tile 原点挪到 (-margin, -2gap)，尺寸 = 画布 + 余量 → 整幅不发生重复
        transform: `translate(${api.n(-margin)} ${api.n(-gap * 2)})`,
        content,
      });
      parts.push(rect(-margin, 0, tileW, H, { fill: ref }));
    });

    const lines = parts.join('');
    if (!moving) return { body: bgRect + lines };

    // 动画：整体左右缓缓漂移一个余量宽度，往复无缝
    const name = api.keyframes(
      'vw-flow',
      `from{transform:translateX(${api.n(-margin * 0.9)}px)}to{transform:translateX(${api.n(margin * 0.9)}px)}`,
    );
    // 底色不参与平移，只让线漂
    return {
      body: bgRect + g({ class: name, style: `animation:${name} 18s ease-in-out infinite alternate` }, lines),
    };
  },
};

export default def;
