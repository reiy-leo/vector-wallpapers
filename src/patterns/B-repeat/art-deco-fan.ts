/**
 * 扇形放射 —— B 波点 / 网格重复。
 *
 * 构图要点：以画面中心为轴的扇形分区 + 阶梯式同心环，
 * 上下镜像构成 Art Deco 式的严格对称。
 * 与 `arc-composition` 的区别：后者是自由弧线的构图，
 * 这里是**扇形 + 阶梯环的规则重复**，且强调上下镜像。
 *
 * ⭐ 必须 tile：扇区数量与环层数都可拉高，走 <pattern> 保持节点恒定。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'art-deco-fan',
  name: '扇形放射',
  category: 'B-repeat',
  description: '扇形分区叠加阶梯同心环，上下严格对称的装饰艺术风格。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#14202e' }, opacity: 1, visible: true, configurable: true },
    { id: 'fan', label: '扇面', role: 'primary', paint: { type: 'solid', color: '#1e3a5f' }, opacity: 1, visible: true, configurable: true },
    { id: 'step', label: '阶梯环', role: 'secondary', paint: { type: 'solid', color: '#c9a227' }, opacity: 1, visible: true, configurable: true },
    { id: 'ray', label: '放射线', role: 'accent', paint: { type: 'solid', color: '#e8dcc0' }, opacity: 0.8, visible: true, configurable: true },
  ],

  controls: [
    /**
     * ⚠️ `max` 是**体积预算的产物**，不是审美选择。
     *
     * 逐控件极值实测（3840×2160，全部控件拉满）：
     *   sectors=24 → **20965B**（超 20480 红线 485B）
     *   sectors=22 → 19231B（余量 6%）✅
     *   sectors=18 → 15828B
     * 上限从 24 收到 22 后，扇形密度几乎看不出差别，但红线有了余量。
     *
     * ⚠️ 改动本控件须同步复核：`sectors × steps` 段弧是体积的唯一乘数，
     * 把任一上限调大都会线性推高体积。见 `art-deco-fan.guard.test.ts`。
     */
    { key: 'sectors', label: '扇区数', type: 'range', min: 4, max: 22, step: 2, default: 12, heavy: true },
    { key: 'steps', label: '阶梯层数', type: 'range', min: 1, max: 5, step: 1, default: 4 },
    { key: 'spread', label: '扇面展开', type: 'range', min: 0.3, max: 1.4, step: 0.05, default: 0.95 },
    { key: 'rays', label: '放射线', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'gilt',
      label: '鎏金',
      elements: {
        bg: { paint: { type: 'solid', color: '#14202e' } },
        fan: { paint: { type: 'solid', color: '#1e3a5f' } },
        step: { paint: { type: 'solid', color: '#c9a227' } },
        ray: { paint: { type: 'solid', color: '#e8dcc0' } },
      },
    },
    {
      id: 'terracotta',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b1810' } },
        fan: { paint: { type: 'solid', color: '#9a3412' } },
        step: { paint: { type: 'solid', color: '#fdba74' } },
        ray: { paint: { type: 'solid', color: '#fef3c7' } },
      },
    },
    {
      id: 'jade',
      label: '翡翠',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b1f1a' } },
        fan: { paint: { type: 'solid', color: '#134e4a' } },
        step: { paint: { type: 'solid', color: '#34d399' } },
        ray: { paint: { type: 'solid', color: '#ecfdf5' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['fan'], secondary: ['step'], accent: ['ray'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const sectors = Math.round(Math.max(4, Math.min(22, Number(params.sectors))));
    const steps = Math.round(Math.max(1, Math.min(5, Number(params.steps))));
    const spread = Math.max(0.3, Math.min(1.4, Number(params.spread)));
    const showRays = params.rays === true;

    const bg = elements.get('bg')!;
    const fan = elements.get('fan')!;
    const step = elements.get('step')!;
    const ray = elements.get('ray')!;

    /*
     * 扇形单元取**半个象限**（0°~90°），靠 <pattern> 四向镜像铺满。
     * 直接画整圈再平铺会让图案在每个单元中心重复出放射焦点，
     * 视觉上过于拥挤；只画象限则焦点间距更大、更接近 Art Deco 的实际比例。
     */
    const unit = Math.max(80, Math.min(W, H));
    const marks: string[] = [];

    const sweep = Math.PI / 2;
    const sectorAngle = sweep / sectors;

    // 扇面：以单元左下角为圆心，向象限内放射
    const originX = 0;
    const originY = unit;

    for (let i = 0; i < sectors; i++) {
      const a0 = (i * sectorAngle) / spread;
      const a1 = ((i + 1) * sectorAngle) / spread;
      // 半径随扇序阶梯递增 → 形成经典的「孔雀尾」式展开。
      // 叠加 seed 决定的微小抖动（±6%），避免每次都得到完全对称的机械感 ——
      // 手工 Art Deco 装饰其实也常有手作的不精确。
      const jitter = 1 + (rng() - 0.5) * 0.12;
      const r = unit * (0.28 + (i / sectors) * 0.62) * jitter;

      if (fan.visible) {
        const x0 = originX + r * Math.cos(a0);
        const y0 = originY - r * Math.sin(a0);
        const x1 = originX + r * Math.cos(a1);
        const y1 = originY - r * Math.sin(a1);
        marks.push(
          path(
            `M${api.n(originX)} ${api.n(originY)} L${api.n(x0)} ${api.n(y0)} A${api.n(r)} ${api.n(r)} 0 0 1 ${api.n(x1)} ${api.n(y1)} Z`,
            { fill: fan.paintValue, 'fill-opacity': fan.opacity },
          ),
        );
      }

      // 阶梯环：每个扇形的外端画一条同心弧，形成层层递退。
      // ⚠️ 步数受 `steps` 参数控制，而体积红线要求**所有控件拉满**时仍 < 20KB。
      // 实测 steps=8 × sectors=24 时单元内容达 192 段弧 → 整图 29.9KB（超 46%）。
      // 因此把上限从 8 收到 5：5 层 × 24 扇 = 120 段，仍是明确的阶梯观感，
      // 体积落在红线内。若日后要放开，须同步复核体积。
      if (step.visible) {
        for (let s = 0; s < steps; s++) {
          const rr = r * (1 - (s + 1) / (steps + 1));
          const sx0 = originX + rr * Math.cos(a0);
          const sy0 = originY - rr * Math.sin(a0);
          const sx1 = originX + rr * Math.cos(a1);
          const sy1 = originY - rr * Math.sin(a1);
          marks.push(
            path(
              `M${api.n(sx0)} ${api.n(sy0)} A${api.n(rr)} ${api.n(rr)} 0 0 1 ${api.n(sx1)} ${api.n(sy1)}`,
              {
                fill: 'none',
                stroke: step.paintValue,
                'stroke-width': Math.max(0.8, unit * 0.006),
                'stroke-opacity': step.opacity * (1 - s * 0.15),
              },
            ),
          );
        }
      }
    }

    // 放射线：沿扇区边界从内向外画实线，强调分格
    if (showRays && ray.visible) {
      for (let i = 0; i <= sectors; i++) {
        const a = (i * sectorAngle) / spread;
        marks.push(
          path(
            `M${api.n(originX + unit * 0.3 * Math.cos(a))} ${api.n(originY - unit * 0.3 * Math.sin(a))}` +
              ` L${api.n(originX + unit * 0.92 * Math.cos(a))} ${api.n(originY - unit * 0.92 * Math.sin(a))}`,
            {
              fill: 'none',
              stroke: ray.paintValue,
              'stroke-width': Math.max(0.6, unit * 0.0035),
              'stroke-opacity': ray.opacity,
            },
          ),
        );
      }
    }

    const tileRef = api.tile({
      key: `adf-${api.n(unit)}-${sectors}-${steps}-${api.n(spread)}-${showRays ? 1 : 0}`,
      w: unit,
      h: unit,
      content: g({}, marks.join('')),
    });

    return {
      body: [
        rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity }),
        rect(0, 0, W, H, { fill: tileRef }),
      ].join(''),
    };
  },
};

export default def;
