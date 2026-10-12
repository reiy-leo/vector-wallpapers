/**
 * 扇形放射 —— B 波点 / 网格重复。
 *
 * 2026-10-12 重做：旧版以单元左下角为圆心画一个「象限扇」再平铺，
 * 单元取 min(W,H)，于是 16:9 画面上只出现两把被裁切的扇子，构图像坏掉。
 *
 * 新版是经典的 **Art Deco 扇贝鳞片平铺**：
 *   - 每把扇 = 一个朝上的半圆，圆心在底部；扇面内有阶梯同心环与放射线，
 *     底部圆心处一个小扇骨（hub）。
 *   - 行距 = 半径的一半、相邻行错开半个扇宽，后画的行压住前一行的下半部，
 *     露出的部分就是层层叠叠的鳞片。扇与扇之间留一圈细缝透出底色。
 *   - 扇宽按画面宽度取整：横向恰好排下整数把扇，左右两端对称、不被裁半。
 *
 * ⭐ 走 <pattern>：单元 = 2r × r，只含 5 把完整扇 + 3 片跨边界的扇面填充，
 * 节点数与体积都与画面尺寸无关。规则几何、无随机 → seedable: false。
 */
import { g, path, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'art-deco-fan',
  name: '扇形放射',
  category: 'B-repeat',
  description: 'Art Deco 扇贝鳞片平铺：每把扇带阶梯同心环与放射线，层层错叠。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#141c26' }, opacity: 1, visible: true, configurable: true },
    { id: 'fan', label: '扇面', role: 'primary', paint: { type: 'solid', color: '#1f3247' }, opacity: 1, visible: true, configurable: true },
    { id: 'step', label: '阶梯环', role: 'secondary', paint: { type: 'solid', color: '#c2a35a' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'ray', label: '放射线', role: 'accent', paint: { type: 'solid', color: '#d9ccab' }, opacity: 0.35, visible: true, configurable: true },
  ],

  controls: [
    { key: 'sectors', label: '扇骨数', type: 'range', min: 4, max: 22, step: 2, default: 10, heavy: true },
    { key: 'steps', label: '阶梯层数', type: 'range', min: 1, max: 5, step: 1, default: 3 },
    { key: 'spread', label: '扇面大小', type: 'range', min: 0.3, max: 1.4, step: 0.05, default: 0.9 },
    { key: 'rays', label: '放射线', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'gilt',
      label: '鎏金',
      elements: {
        bg: { paint: { type: 'solid', color: '#141c26' } },
        fan: { paint: { type: 'solid', color: '#1f3247' } },
        step: { paint: { type: 'solid', color: '#c2a35a' } },
        ray: { paint: { type: 'solid', color: '#d9ccab' } },
      },
    },
    {
      id: 'terracotta',
      label: '陶土',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1e6d6' } },
        fan: { paint: { type: 'solid', color: '#c9876a' } },
        step: { paint: { type: 'solid', color: '#f6ead8' } },
        ray: { paint: { type: 'solid', color: '#8f4f3a' } },
      },
    },
    {
      id: 'jade',
      label: '翡翠',
      elements: {
        bg: { paint: { type: 'solid', color: '#0f1d1a' } },
        fan: { paint: { type: 'solid', color: '#24453e' } },
        step: { paint: { type: 'solid', color: '#9cc9b4' } },
        ray: { paint: { type: 'solid', color: '#d7ebe0' } },
      },
    },
    {
      id: 'ivory',
      label: '象牙',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9e3d6' } },
        fan: { paint: { type: 'solid', color: '#f7f3ea' } },
        step: { paint: { type: 'solid', color: '#b89a63' } },
        ray: { paint: { type: 'solid', color: '#c8bba0' } },
      },
      params: { steps: 2 },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['fan'], secondary: ['step'], accent: ['ray'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const sectors = Math.round(Math.max(4, Math.min(22, Number(params.sectors))));
    const steps = Math.round(Math.max(1, Math.min(5, Number(params.steps))));
    const spread = Math.max(0.3, Math.min(1.4, Number(params.spread)));
    const showRays = params.rays === true;
    const n = api.n;

    const bg = elements.get('bg')!;
    const fan = elements.get('fan')!;
    const step = elements.get('step')!;
    const ray = elements.get('ray')!;

    // 扇半径：以短边为基准，再按画面宽度取整，使横向恰好排下整数把扇
    const S = Math.min(W, H);
    const r0 = Math.max(24, S * 0.2 * spread);
    const cols = Math.max(2, Math.round(W / (2 * r0)));
    const r = W / (2 * cols);

    const R = r * 0.95; // 扇面半径（与 r 的差即鳞片间的细缝）
    const hub = R * 0.13;
    const ringW = Math.max(0.6, r * 0.018);
    const rayW = Math.max(0.5, r * 0.009);

    /** 一把扇：圆心 (cx, cy) 在底部，向上展开的半圆。 */
    const fanAt = (cx: number, cy: number, fillOnly = false): string => {
      const out: string[] = [];
      const semi = (rad: number): string =>
        `M${n(cx - rad)} ${n(cy)}A${n(rad)} ${n(rad)} 0 0 1 ${n(cx + rad)} ${n(cy)}`;

      // 扇面用整圆填充：下半圆几乎都被下一行压住，但扇骨正下方那一小块
      // 必须是扇面色 —— 用半圆的话那里会露出一道底色横缝，像「搁板」。
      if (fan.visible) {
        out.push(
          path(`${semi(R)}A${n(R)} ${n(R)} 0 0 1 ${n(cx - R)} ${n(cy)}Z`, {
            fill: fan.paintValue,
            'fill-opacity': fan.opacity,
          }),
        );
      }
      if (fillOnly) return out.join('');
      if (showRays && ray.visible) {
        let d = '';
        for (let k = 1; k < sectors; k++) {
          const a = Math.PI * (k / sectors);
          const c = -Math.cos(a);
          const s = -Math.sin(a);
          d += `M${n(cx + c * hub * 1.6)} ${n(cy + s * hub * 1.6)}L${n(cx + c * R * 0.9)} ${n(cy + s * R * 0.9)}`;
        }
        out.push(path(d, { fill: 'none', stroke: ray.paintValue, 'stroke-width': rayW, 'stroke-opacity': ray.opacity }));
      }
      if (step.visible) {
        // 阶梯环：集中在扇面外半圈（鳞片露出的部分），等距排布
        let d = '';
        for (let s = 1; s <= steps; s++) {
          const rad = R * (0.9 - (0.42 * (steps - s)) / Math.max(1, steps));
          d += semi(rad);
        }
        out.push(path(d, { fill: 'none', stroke: step.paintValue, 'stroke-width': ringW, 'stroke-opacity': step.opacity }));
        out.push(path(`${semi(hub)}Z`, { fill: step.paintValue, 'fill-opacity': step.opacity }));
      }
      return out.join('');
    };

    // 单元 2r × r：行距 r/2、相邻行错开 r。按 cy 升序绘制 → 下一行压住上一行。
    // 圆心在单元上方的两行只有下半圆伸进单元，只需画填充。
    const marks = [
      fanAt(0, -r / 2, true),
      fanAt(2 * r, -r / 2, true),
      fanAt(r, 0, true),
      fanAt(0, r / 2),
      fanAt(2 * r, r / 2),
      fanAt(r, r),
      fanAt(0, r * 1.5),
      fanAt(2 * r, r * 1.5),
    ].join('');

    const tileRef = api.tile({
      key: `adf-${n(r)}-${sectors}-${steps}-${showRays ? 1 : 0}`,
      w: 2 * r,
      h: r,
      content: g({}, marks),
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
