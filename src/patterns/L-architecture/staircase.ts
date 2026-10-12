/**
 * 错落阶梯 —— L 建筑空间 / 等距平铺。
 *
 * 构图：等距视角下一片无尽的台阶地景。台阶沿一个方向逐级下行，每 N 级接一段平台；
 * 横向被切成若干「梯带」，相邻梯带整体下沉并沿行进方向错开相位 → 梯带之间露出阶梯形的侧墙，
 * 侧墙再在下一条梯带上投下一道影子。踏面 / 踢面 / 侧墙三种明度 + 踏口亮边，扁平插画质感。
 *
 * ⭐ 平铺：台阶表面是「高度场」的投影，所有可见面在屏幕上恰好铺满平面、互不重叠，
 *   所以同类面可合并成一条 path，无需画家算法。周期格是斜格（步进向量 V1 = 一段梯段 + 平台，
 *   V2 = 换到下一条梯带），用 `api.tile()` 的 `patternTransform="matrix(V1/100, V2/100)"`
 *   让 <pattern> 沿斜格重复；单元内容用「格坐标」(0~100) 书写，各面按需复制到相邻格以盖满单元。
 *   因此任意踏步尺寸 / 梯带宽 / 错位都无缝，顶层节点数恒定。
 * ⚠️ 填色不描边：patternTransform 会把描边拉成不等宽，故全部用填充面表达。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clamp, f, op } from './_helpers';

type P3 = [number, number, number];
type P2 = [number, number];

const C30 = Math.cos(Math.PI / 6);

const def: PatternDef = {
  id: 'staircase',
  name: '错落阶梯',
  category: 'L-architecture',
  description: '等距视角下逐级下行的台阶地景，梯带之间错位下沉，露出阶梯形侧墙与投影。',
  seedable: false,
  animatable: false,

  elements: [
    { id: 'tread', label: '踏面', role: 'bg', paint: { type: 'solid', color: '#efe2cf' }, opacity: 1, visible: true, configurable: true },
    { id: 'riser', label: '踢面', role: 'primary', paint: { type: 'solid', color: '#d8b898' }, opacity: 1, visible: true, configurable: true },
    { id: 'side', label: '侧墙', role: 'secondary', paint: { type: 'solid', color: '#b58c70' }, opacity: 1, visible: true, configurable: true },
    { id: 'nosing', label: '踏口亮边', role: 'accent', paint: { type: 'solid', color: '#fbf5ec' }, opacity: 1, visible: true, configurable: true },
    { id: 'shadow', label: '投影', role: 'detail', paint: { type: 'solid', color: '#6e4f3e' }, opacity: 0.22, visible: true, configurable: true },
    {
      id: 'glow',
      label: '天光',
      role: 'detail',
      paint: {
        type: 'radial',
        cx: 0.2,
        cy: 0.1,
        r: 0.95,
        stops: [
          { offset: 0, color: '#fff4dd', opacity: 1 },
          { offset: 1, color: '#fff4dd', opacity: 0 },
        ],
      },
      opacity: 0.45,
      visible: true,
      configurable: true,
    },
  ],

  controls: [
    { key: 'size', label: '踏步尺寸', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1, heavy: true },
    { key: 'rise', label: '踏步高度', type: 'range', min: 0.35, max: 1, step: 0.05, default: 0.55 },
    { key: 'flight', label: '每段级数', type: 'range', min: 2, max: 8, step: 1, default: 4 },
    { key: 'band', label: '梯带宽', type: 'range', min: 1.5, max: 6, step: 0.25, default: 3 },
    { key: 'stagger', label: '错位', type: 'range', min: 0, max: 1, step: 0.05, default: 0.45 },
    {
      key: 'direction',
      label: '下行方向',
      type: 'select',
      default: 'right',
      options: [
        { value: 'right', label: '向右下' },
        { value: 'left', label: '向左下' },
      ],
    },
  ],

  presets: [
    {
      id: 'sandstone',
      label: '砂岩',
      elements: {
        tread: { paint: { type: 'solid', color: '#efe2cf' } },
        riser: { paint: { type: 'solid', color: '#d8b898' } },
        side: { paint: { type: 'solid', color: '#b58c70' } },
        nosing: { paint: { type: 'solid', color: '#fbf5ec' } },
        shadow: { paint: { type: 'solid', color: '#6e4f3e' }, opacity: 0.22 },
      },
    },
    {
      id: 'rose-valley',
      label: '玫瑰谷',
      elements: {
        tread: { paint: { type: 'solid', color: '#f2dcd4' } },
        riser: { paint: { type: 'solid', color: '#dfa79a' } },
        side: { paint: { type: 'solid', color: '#9e7a96' } },
        nosing: { paint: { type: 'solid', color: '#fbeee8' } },
        shadow: { paint: { type: 'solid', color: '#4f3550' }, opacity: 0.2 },
      },
      params: { flight: 3, band: 2.25, stagger: 0.6, rise: 0.7 },
    },
    {
      id: 'concrete',
      label: '清水混凝土',
      elements: {
        tread: { paint: { type: 'solid', color: '#cfd1cc' } },
        riser: { paint: { type: 'solid', color: '#a3a8a5' } },
        side: { paint: { type: 'solid', color: '#717a7a' } },
        nosing: { paint: { type: 'solid', color: '#e4e5e0' } },
        shadow: { paint: { type: 'solid', color: '#283031' }, opacity: 0.25 },
      },
      params: { flight: 6, band: 4.5, stagger: 0.3, size: 0.8 },
    },
    {
      id: 'night-steps',
      label: '夜阶',
      elements: {
        tread: { paint: { type: 'solid', color: '#3a4560' } },
        riser: { paint: { type: 'solid', color: '#2a3248' } },
        side: { paint: { type: 'solid', color: '#1b2133' } },
        nosing: { paint: { type: 'solid', color: '#5d6c92' } },
        shadow: { paint: { type: 'solid', color: '#080b14' }, opacity: 0.35 },
        glow: {
          paint: {
            type: 'radial',
            cx: 0.8,
            cy: 0.1,
            r: 0.9,
            stops: [
              { offset: 0, color: '#a9bde6', opacity: 1 },
              { offset: 1, color: '#a9bde6', opacity: 0 },
            ],
          },
          opacity: 0.3,
        },
      },
      params: { direction: 'left', size: 1.2 },
    },
  ],

  paletteSlots: {
    bg: ['tread'],
    primary: ['riser'],
    secondary: ['side'],
    accent: ['nosing'],
    detail: ['shadow', 'glow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements } = cfg;
    const size = clamp(params.size, 0.5, 2, 1);
    const riseK = clamp(params.rise, 0.35, 1, 0.55);
    const F = Math.round(clamp(params.flight, 2, 8, 4));
    const bandK = clamp(params.band, 1.5, 6, 3);
    const stagger = clamp(params.stagger, 0, 1, 0.45);
    const mirror = params.direction === 'left';

    const tread = elements.get('tread')!;
    const riser = elements.get('riser')!;
    const side = elements.get('side')!;
    const nosing = elements.get('nosing')!;
    const shadow = elements.get('shadow')!;
    const glow = elements.get('glow')!;

    // ── 世界尺寸（屏幕像素）────────────────────────────────
    const r = Math.sqrt(W * H) * 0.045 * size; // 踏步进深
    const h = r * riseK; // 踏步高
    const land = r * 1.6; // 平台额外长度
    const Lx = F * r + land; // 一段梯段 + 平台
    const Wb = r * bandK; // 梯带宽
    const s = Lx * stagger; // 相邻梯带沿行进方向的错位
    const nose = r * 0.1;

    /** 梯带 0 的踏面高度（周期 Lx，每周期下降 F·h）。 */
    const z0 = (X: number): number => {
      const k = Math.floor(X / Lx);
      const x = X - k * Lx;
      const nn = Math.min(F - 1, Math.floor(x / r));
      return -(k * F + nn) * h;
    };
    /** z0 在 [a, b] 内的断点（踢面位置）。 */
    const breaks = (a: number, b: number, shift: number): number[] => {
      const out: number[] = [];
      const k0 = Math.floor((a - shift) / Lx) - 1;
      const k1 = Math.ceil((b - shift) / Lx) + 1;
      for (let k = k0; k <= k1; k++) {
        for (let nn = 0; nn < F; nn++) {
          const x = k * Lx + nn * r + shift;
          if (x > a + 1e-6 && x < b - 1e-6) out.push(x);
        }
      }
      return out.sort((p, q) => p - q);
    };

    // 下一梯带须处处更低：dz = 错位造成的最大高差 + 最小侧墙高
    let maxDiff = 0;
    for (let i = 0; i <= 400; i++) {
      const X = (Lx * i) / 400 + 1e-4;
      maxDiff = Math.max(maxDiff, z0(X - s) - z0(X));
    }
    const dz = maxDiff + Math.max(h * 1.1, r * 0.55);
    const zPrev = (X: number): number => z0(X + s) + dz; // 后方梯带（投影来源）
    const zNext = (X: number): number => z0(X - s) - dz; // 前方梯带（侧墙底边）

    // ── 投影：世界 → 屏幕 → 格坐标（0~100）─────────────────────
    const proj = (p: P3): P2 => [(p[0] - p[1]) * C30, (p[0] + p[1]) / 2 - p[2]];
    const V1 = proj([Lx, 0, -F * h]);
    const V2 = proj([s, Wb, -dz]);
    const det = V1[0] * V2[1] - V1[1] * V2[0];
    const toLat = (p: P3): P2 => {
      const [x, y] = proj(p);
      return [((x * V2[1] - y * V2[0]) / det) * 100, ((V1[0] * y - V1[1] * x) / det) * 100];
    };

    const faces: Record<'tread' | 'nosing' | 'riser' | 'side' | 'shadow', P2[][]> = {
      tread: [],
      nosing: [],
      riser: [],
      side: [],
      shadow: [],
    };
    const add = (kind: keyof typeof faces, pts: P3[]): void => {
      faces[kind].push(pts.map(toLat));
    };

    const SK = 0.85; // 投影长度 / 高差
    for (let nn = 0; nn < F; nn++) {
      const xa = nn * r;
      const xb = nn === F - 1 ? Lx : (nn + 1) * r;
      const z = -nn * h;
      add('tread', [[xa, 0, z], [xb - nose, 0, z], [xb - nose, Wb, z], [xa, Wb, z]]);
      add('nosing', [[xb - nose, 0, z], [xb, 0, z], [xb, Wb, z], [xb - nose, Wb, z]]);
      add('riser', [[xb, 0, z], [xb, Wb, z], [xb, Wb, z - h], [xb, 0, z - h]]);
      // 踏面上的投影：按后方梯带的断点切段，每段高差恒定
      const cuts = [xa, ...breaks(xa, xb, -s), xb];
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i];
        const b = cuts[i + 1];
        const dh = zPrev((a + b) / 2) - z;
        const sh = Math.min(Wb, dh * SK);
        if (sh > 0.5) add('shadow', [[a, 0, z], [b, 0, z], [b, sh, z], [a, sh, z]]);
      }
      // 踢面上的投影（梯形，越往下越长）
      const dhTop = zPrev(xb - 1e-4) - z;
      const t1 = Math.min(Wb, dhTop * SK);
      const t2 = Math.min(Wb, (dhTop + h) * SK);
      if (t2 > 0.5) add('shadow', [[xb, 0, z], [xb, t1, z], [xb, t2, z - h], [xb, 0, z - h]]);
    }
    // 侧墙：Y = Wb 平面，上缘 = 本梯带阶梯轮廓，下缘 = 前方梯带阶梯轮廓
    {
      const pts: P3[] = [];
      const topCuts = [0, ...breaks(0, Lx, 0), Lx];
      pts.push([0, Wb, z0(1e-4)]);
      for (let i = 1; i < topCuts.length; i++) {
        const x = topCuts[i];
        pts.push([x, Wb, z0(x - 1e-4)]);
        if (i < topCuts.length - 1) pts.push([x, Wb, z0(x + 1e-4)]);
      }
      const botCuts = [0, ...breaks(0, Lx, s), Lx].reverse();
      pts.push([Lx, Wb, zNext(Lx - 1e-4)]);
      for (let i = 1; i < botCuts.length; i++) {
        const x = botCuts[i];
        pts.push([x, Wb, zNext(x + 1e-4)]);
        if (i < botCuts.length - 1) pts.push([x, Wb, zNext(x - 1e-4)]);
      }
      add('side', pts);
    }

    // ── 复制到相邻格以盖满 [0,100]²，并拼 path（相对坐标）──────────
    const build = (list: P2[][]): string => {
      let d = '';
      for (const pts of list) {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const [x, y] of pts) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
        }
        for (let i = Math.floor(-maxX / 100); i <= Math.ceil((100 - minX) / 100); i++) {
          for (let j = Math.floor(-maxY / 100); j <= Math.ceil((100 - minY) / 100); j++) {
            const ox = i * 100;
            const oy = j * 100;
            if (maxX + ox <= 0 || minX + ox >= 100 || maxY + oy <= 0 || minY + oy >= 100) continue;
            let px = 0;
            let py = 0;
            pts.forEach(([x, y], k) => {
              const X = Math.round((x + ox) * 100) / 100;
              const Y = Math.round((y + oy) * 100) / 100;
              if (k === 0) d += `M${f(X)} ${f(Y)}`;
              else {
                const dx = f(X - px);
                const dy = f(Y - py);
                if (dx === '0') d += `v${dy}`;
                else if (dy === '0') d += `h${dx}`;
                else d += `l${dx}${dy.startsWith('-') ? '' : ' '}${dy}`;
              }
              px = X;
              py = Y;
            });
            d += 'z';
          }
        }
      }
      return d;
    };

    const fill = (kind: keyof typeof faces, e: { paintValue: string; opacity: number; visible: boolean }): string => {
      if (!e.visible || faces[kind].length === 0) return '';
      const o = op(e.opacity);
      return `<path d="${build(faces[kind])}" fill="${e.paintValue}"${o === undefined ? '' : ` fill-opacity="${o}"`}/>`;
    };

    const content =
      fill('tread', tread) + fill('nosing', nosing) + fill('riser', riser) + fill('side', side) + fill('shadow', shadow);

    const parts: string[] = [];
    // 底色兜底：任一面被隐藏时，以踢面色铺底（避免透出黑色）
    parts.push(rect(0, 0, W, H, { fill: riser.visible ? riser.paintValue : tread.paintValue }));
    if (content !== '') {
      const m = (v: number): string => (Math.round(v * 1e5) / 1e5).toString();
      const sx = mirror ? -1 : 1;
      const transform = `matrix(${m((sx * V1[0]) / 100)} ${m(V1[1] / 100)} ${m((sx * V2[0]) / 100)} ${m(V2[1] / 100)} ${f(W * 0.5)} ${f(H * 0.3)})`;
      const ref = api.tile({ key: `stair-${F}-${f(r)}-${f(riseK)}-${f(bandK)}-${f(stagger)}`, w: 100, h: 100, content, transform });
      parts.push(rect(0, 0, W, H, { fill: ref }));
    }
    if (glow.visible) parts.push(rect(0, 0, W, H, { fill: glow.paintValue, 'fill-opacity': op(glow.opacity) }));
    return { body: parts.join('') };
  },
};

export default def;
