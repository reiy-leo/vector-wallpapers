/**
 * 三角铺排 —— B 波点 / 网格重复。
 *
 * 构图要点：等边三角形的经典密铺 —— 上、下三角交替，相邻三角共享斜边。
 * 密铺能成立的关键是**平铺单元取 2×2 个三角**（宽 2w、高 2h，h = w·√3/2）：
 * 单元上半是两个「下三角」、下半是两个「上三角」，面积恰好 2wh = 单元面积，
 * 因此四边形无缝、无需裁剪。
 *
 * ⭐ tile 的必要性：三角形数量随密度平方增长，逐个画必然突破节点红线。
 *
 * ⭐ 色值可达性：上/下三角在**每个**单元内各出现 2 个，
 * 因此两个元件的改色命中率恒为 100%，与参数、seed 无关。
 * 种子只影响 `stud` 小圆的微偏移 —— 那才是「换一版」真正变化的来源。
 */
import { circle, polygon, rect } from '../../engine/svg';
import type { PatternDef, ResolvedConfig, RenderApi, RenderResult } from '../types';

const def: PatternDef = {
  id: 'triangle-tiling',
  name: '三角铺排',
  category: 'B-repeat',
  description: '等边三角形密铺，上下方三角交替咬合，节点缀以细小圆点。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '底色', role: 'bg', paint: { type: 'solid', color: '#111827' }, opacity: 1, visible: true, configurable: true },
    { id: 'tri_up', label: '上三角', role: 'primary', paint: { type: 'solid', color: '#38bdf8' }, opacity: 1, visible: true, configurable: true },
    { id: 'tri_down', label: '下三角', role: 'secondary', paint: { type: 'solid', color: '#f472b6' }, opacity: 1, visible: true, configurable: true },
    { id: 'stud', label: '节点圆点', role: 'accent', paint: { type: 'solid', color: '#fde68a' }, opacity: 0.9, visible: true, configurable: true },
  ],

  controls: [
    { key: 'size', label: '三角边长', type: 'range', min: 14, max: 140, step: 2, default: 56, heavy: true },
    { key: 'grout', label: '间隙', type: 'range', min: 0, max: 0.32, step: 0.01, default: 0.06 },
    { key: 'studSize', label: '圆点大小', type: 'range', min: 0.02, max: 0.3, step: 0.01, default: 0.12 },
    { key: 'studs', label: '节点圆点', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'candy',
      label: '糖果',
      elements: {
        bg: { paint: { type: 'solid', color: '#fff7ed' } },
        tri_up: { paint: { type: 'solid', color: '#fb7185' } },
        tri_down: { paint: { type: 'solid', color: '#0ea5e9' } },
        stud: { paint: { type: 'solid', color: '#7c2d12' } },
      },
    },
    {
      id: 'forest',
      label: '林间',
      elements: {
        bg: { paint: { type: 'solid', color: '#0b1f16' } },
        tri_up: { paint: { type: 'solid', color: '#34d399' } },
        tri_down: { paint: { type: 'solid', color: '#065f46' } },
        stud: { paint: { type: 'solid', color: '#d9f99d' } },
      },
    },
    {
      id: 'mono',
      label: '素色',
      elements: {
        bg: { paint: { type: 'solid', color: '#18181b' } },
        tri_up: { paint: { type: 'solid', color: '#e4e4e7' } },
        tri_down: { paint: { type: 'solid', color: '#52525b' } },
        stud: { paint: { type: 'solid', color: '#fafafa' } },
      },
    },
  ],

  paletteSlots: { bg: ['bg'], primary: ['tri_up'], secondary: ['tri_down'], accent: ['stud'] },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const w = Math.max(6, Number(params.size));
    const grout = Math.max(0, Math.min(0.32, Number(params.grout)));
    const studSize = Math.max(0, Number(params.studSize));
 const showStuds = params.studs === true;

    const bg = elements.get('bg')!;
    const up = elements.get('tri_up')!;
    const down = elements.get('tri_down')!;
    const stud = elements.get('stud')!;

    // 等边三角形的行高：h = w·√3/2
    const h = (w * Math.sqrt(3)) / 2;
    const tileW = w * 2;
    const tileH = h * 2;
    // 间隙：把每个三角沿重心内缩，缩进量由 grout × 三角尺寸决定
    // 恒存在的 seeded 尺寸微差。
    // 为什么必须有它：`studSize` 调到最小、且三角完全无缝时，
    // 若无此处抖动，整幅图就是规则密铺 + 无随机元素 → 换 seed 无变化，
    // 正是 memphis-grid `extra=0` 那类「参数极端时 seed 失效」的盲区。
    // 幅度 0~3% 的随机收缩，视觉上呈出手作的不完全规整感。
    const shrinkJitter = rng() * 0.03;

    /**
     * 以 (cx, cy) 为重心生成一个等边三角形的三个顶点。
     * `dir` = 1 朝上、-1 朝下；`shrink` 用于制造留白间隙。
     */
  const tri = (cx: number, cy: number, dir: 1 | -1, shrink: number): Array<[number, number]> => {
      const r = (w / 2) * (1 - shrink);
      return [
        [cx, cy - (dir * h) / 3 - (dir * r * h) / w],
        [cx - r, cy + (dir * h) / 6 + (dir * r * h) / (3 * w)],
        [cx + r, cy + (dir * h) / 6 + (dir * r * h) / (3 * w)],
      ];
    };

    const marks: string[] = [];

    // 单元上半：两个下三角（底边在 y=0 / y=0，顶点朝下）
    if (down.visible) {
      marks.push(polygon(tri(w * 0.5, h / 3, 1, (grout * 0.5 + shrinkJitter + rng() * 0.03) ), { fill: down.paintValue, 'fill-opacity': down.opacity }));
      marks.push(polygon(tri(w * 1.5, h / 3, 1, (grout * 0.5 + shrinkJitter + rng() * 0.03) ), { fill: down.paintValue, 'fill-opacity': down.opacity }));
    }
    // 单元下半：两个上三角（底边在 y=2h，顶点朝上）
    if (up.visible) {
      marks.push(polygon(tri(w * 0.5, (h * 5) / 3, -1, (grout * 0.5 + shrinkJitter + rng() * 0.03) ), { fill: up.paintValue, 'fill-opacity': up.opacity }));
      marks.push(polygon(tri(w * 1.5, (h * 5) / 3, -1, (grout * 0.5 + shrinkJitter + rng() * 0.03) ), { fill: up.paintValue, 'fill-opacity': up.opacity }));
    }

    /**
     * 节点圆点：放在上三角的重心附近，并加 seeded 微偏移。
     * 微偏移是「换一版」的**唯一**来源 —— 三角密铺本身是规则几何，
     * 不能靠随机它来变（那会破坏密铺），所以种子的作用必须落在这里。
     * 偏移幅度远小于三角边距，视觉上只是小点换了个位置。
     */
    if (showStuds && stud.visible && studSize > 0) {
      for (const cx of [w * 0.5, w * 1.5]) {
        const cy = (h * 5) / 3;
        const jx = cx + (rng() - 0.5) * w * 0.3;
        const jy = cy + (rng() - 0.5) * h * 0.3;
        marks.push(
          circle(jx, jy, Math.max(0.5, w * studSize * 0.35), {
            fill: stud.paintValue,
            'fill-opacity': stud.opacity,
          }),
        );
      }
    }

    const tileRef = api.tile({
      key: `tt-${api.n(w)}-${api.n(grout)}-${api.n(studSize)}-${showStuds ? 1 : 0}`,
      w: tileW,
      h: tileH,
      content: marks.join(''),
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
