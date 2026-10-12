/**
 * 爪印 —— N 动物形象。
 *
 * 两种布局：
 *  - trails 行走轨迹：几串猫 / 狗爪印沿蜿蜒的路线左右交替穿过画面，
 *    每串旁边可跟一行更小的「小伙伴」爪印（强调色），像大猫带着小猫散步；
 *  - tile   平铺：一步一对的爪印按错位格子平铺，朝向随 seed 轻微摆动。
 * 底层另有一张很淡的小爪印平铺纹理（远处的爪印），让画面不空。
 *
 * 爪印 = 主掌垫（继承 `<use>` 所在组的填色）+ 4 个趾垫（固定趾垫色）→ 两色可独立改。
 * ⭐ 体积：爪印只在 `<defs>` 里定义一次，每个实例一个 `<use>`（≈ 50B），总数封顶 MAX_PRINTS。
 * 动画（仅预览，「边走边印」打开）：每串爪印按行走顺序依次浮现、再从头淡去，循环。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { f1, frame, hid, i0, num, op, placeT, subRng, wrapOffsets } from './_helpers';

/** 爪印实例总数上限（含小伙伴）。 */
const MAX_PRINTS = 180;

/** 猫爪：主掌垫三瓣圆润、趾垫圆。单位坐标，前进方向 = -y，高约 20。 */
const CAT_PAD =
  'M0 1C3 1 6.6 4.4 6.6 7.3C6.6 9.6 4.7 10.5 3.1 10.1C1.7 9.8 1 9.3 0 9.3S-1.7 9.8-3.1 10.1C-4.7 10.5-6.6 9.6-6.6 7.3C-6.6 4.4-3 1 0 1Z';
const CAT_TOES: Array<[number, number, number, number, number]> = [
  [-7.6, -0.9, 2.45, 3.05, -26],
  [-2.8, -5.4, 2.65, 3.35, -8],
  [2.8, -5.4, 2.65, 3.35, 8],
  [7.6, -0.9, 2.45, 3.05, 26],
];
/** 狗爪：主掌垫更宽更尖、趾垫椭圆分得更开，前端带爪尖。 */
const DOG_PAD =
  'M0 0.2C2.8 0.2 7.6 4.3 7.6 8C7.6 10.5 5.6 11.2 4 10.8C2.4 10.4 1.4 9.8 0 9.8S-2.4 10.4-4 10.8C-5.6 11.2-7.6 10.5-7.6 8C-7.6 4.3-2.8 0.2 0 0.2Z';
const DOG_TOES: Array<[number, number, number, number, number]> = [
  [-8, -2, 2.3, 3.4, -22],
  [-2.9, -6.6, 2.4, 3.6, -6],
  [2.9, -6.6, 2.4, 3.6, 6],
  [8, -2, 2.3, 3.4, 22],
];
const DOG_CLAWS = 'M-9.9-6.6l-.5-1.5M-3.6-11.4l-.2-1.6M3.6-11.4l.2-1.6M9.9-6.6l.5-1.5';

const def: PatternDef = {
  id: 'paw-prints',
  name: '爪印',
  category: 'N-animal',
  description: '猫狗爪印沿蜿蜒的路线左右交替走过画面，旁边跟着一行小爪印；也可切换成一步一对的平铺。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '地面', role: 'bg', paint: { type: 'solid', color: '#efe7dc' }, opacity: 1, visible: true, configurable: true },
    { id: 'far_paw', label: '远处爪印', role: 'detail', paint: { type: 'solid', color: '#e2d6c6' }, opacity: 0.8, visible: true, configurable: true },
    { id: 'pad', label: '掌垫', role: 'primary', paint: { type: 'solid', color: '#8a6f5c' }, opacity: 1, visible: true, configurable: true },
    { id: 'toe', label: '趾垫', role: 'secondary', paint: { type: 'solid', color: '#b48f76' }, opacity: 1, visible: true, configurable: true },
    { id: 'kitten', label: '小爪印', role: 'accent', paint: { type: 'solid', color: '#d9a08a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'layout',
      label: '布局',
      type: 'select',
      options: [
        { value: 'trails', label: '行走轨迹' },
        { value: 'tile', label: '平铺' },
      ],
      default: 'trails',
    },
    {
      key: 'animal',
      label: '爪型',
      type: 'select',
      options: [
        { value: 'cat', label: '猫' },
        { value: 'dog', label: '狗' },
      ],
      default: 'cat',
    },
    { key: 'trails', label: '轨迹数', type: 'range', min: 1, max: 4, step: 1, default: 2 },
    { key: 'size', label: '爪印大小', type: 'range', min: 0.6, max: 1.5, step: 0.05, default: 1 },
    { key: 'stride', label: '步距', type: 'range', min: 0.8, max: 1.8, step: 0.05, default: 1.25 },
    { key: 'companion', label: '小伙伴', type: 'toggle', default: true },
    { key: 'walk', label: '边走边印', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'sand',
      label: '沙地',
      elements: {
        bg: { paint: { type: 'solid', color: '#efe7dc' } },
        far_paw: { paint: { type: 'solid', color: '#e2d6c6' }, opacity: 0.8 },
        pad: { paint: { type: 'solid', color: '#8a6f5c' } },
        toe: { paint: { type: 'solid', color: '#b48f76' } },
        kitten: { paint: { type: 'solid', color: '#d9a08a' } },
      },
    },
    {
      id: 'snow',
      label: '雪夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#2b3442' } },
        far_paw: { paint: { type: 'solid', color: '#36414f' }, opacity: 0.9 },
        pad: { paint: { type: 'solid', color: '#dfe6ee' } },
        toe: { paint: { type: 'solid', color: '#a9b8c9' } },
        kitten: { paint: { type: 'solid', color: '#e9c7b5' } },
      },
      params: { animal: 'cat', trails: 3, size: 0.85 },
    },
    {
      id: 'meadow',
      label: '草地',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe5d3' } },
        far_paw: { paint: { type: 'solid', color: '#d0d8c2' }, opacity: 0.85 },
        pad: { paint: { type: 'solid', color: '#4f5f48' } },
        toe: { paint: { type: 'solid', color: '#7f8f6e' } },
        kitten: { paint: { type: 'solid', color: '#c98f6b' } },
      },
      params: { animal: 'dog', trails: 1, size: 1.25 },
    },
    {
      id: 'blush-tile',
      label: '奶糖平铺',
      elements: {
        bg: { paint: { type: 'solid', color: '#f6e9e4' } },
        far_paw: { paint: { type: 'solid', color: '#efdcd5' }, opacity: 0.7 },
        pad: { paint: { type: 'solid', color: '#c98b86' } },
        toe: { paint: { type: 'solid', color: '#e2aea6' } },
        kitten: { paint: { type: 'solid', color: '#9b7a8f' } },
      },
      params: { layout: 'tile', size: 0.9 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['pad'],
    secondary: ['toe'],
    accent: ['kitten'],
    detail: ['far_paw'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate, seed } = cfg;
    const { q, Wv, Hv } = frame(W, H);
    const dog = params.animal === 'dog';
    const tileMode = params.layout === 'tile';
    const nTrails = Math.round(num(params, 'trails', 1, 5));
    const size = num(params, 'size', 0.4, 3);
    const stride = num(params, 'stride', 0.5, 3);
    const companion = params.companion === true;
    const walking = animate && params.walk === true && !tileMode;

    const bg = elements.get('bg')!;
    const farPaw = elements.get('far_paw')!;
    const pad = elements.get('pad')!;
    const toe = elements.get('toe')!;
    const kitten = elements.get('kitten')!;

    // ── 爪印定义：主掌垫继承填色，趾垫固定为趾垫色 ─────────────
    const toes = (dog ? DOG_TOES : CAT_TOES)
      .map(([x, y, rx, ry, a]) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" transform="rotate(${a} ${x} ${y})"/>`)
      .join('');
    const claws = dog
      ? `<path d="${DOG_CLAWS}" fill="none" stroke="${toe.paintValue}" stroke-opacity="${op(toe.opacity)}" stroke-width="1.4" stroke-linecap="round"/>`
      : '';
    const sc = 3.1 * size; // 单位爪印 → 虚拟坐标（短边 1000 时高约 63）
    const pawInner = `<path d="${dog ? DOG_PAD : CAT_PAD}"/><g fill="${toe.paintValue}" fill-opacity="${op(toe.opacity)}">${toes}</g>${claws}`;
    const pid = hid('pw', pawInner + sc);
    const kid = `${pid}k`;
    const gid = `${pid}g`;
    const scs = String(Math.round(sc * 100) / 100);
    // 底纹用单色版（趾垫也继承填色）：<pattern> 内容不继承引用处样式，填色在 tile 内容里再包一层
    const defsMk =
      `<defs><g id="${pid}" transform="scale(${scs})">${pawInner}</g><use id="${kid}" href="#${pid}" transform="scale(.58)"/>` +
      `<g id="${gid}" transform="scale(${scs})"><path d="${dog ? DOG_PAD : CAT_PAD}"/>${toes}</g></defs>`;

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = defsMk;

    // ── 底纹：很淡的小爪印平铺（远处的爪印）─────────────────
    if (farPaw.visible) {
      const gr = subRng(seed, 'far_paw');
      const cell = 150 * Math.max(0.8, size);
      const tw = cell * 3;
      const th = cell * 3;
      const gs = 0.42;
      let gm = '';
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          const x = (i + 0.5 + (j % 2) * 0.5 + (gr() - 0.5) * 0.35) * cell;
          const y = (j + 0.5 + (gr() - 0.5) * 0.35) * cell;
          const a = gr() * 360;
          for (const [cx, cy] of wrapOffsets(x, y, 12 * sc * gs, tw, th)) gm += `<use href="#${gid}" transform="${placeT(cx, cy, a, gs)}"/>`;
        }
      }
      const tref = api.tile({
        key: `paw-farPaw-${gid}-${seed}`,
        w: tw,
        h: th,
        content: `<g fill="${farPaw.paintValue}" fill-opacity="${op(farPaw.opacity)}">${gm}</g>`,
      });
      inner += `<rect width="${i0(Wv)}" height="${i0(Hv)}" fill="${tref}"/>`;
    }

    // ── 主体 ──────────────────────────────────────────────
    interface Print {
      x: number;
      y: number;
      a: number;
    }
    const big: Print[][] = [];
    const small: Print[][] = [];

    if (!tileMode) {
      // 路线沿长边方向前进；每串预先抽取全部随机参数，行走过程只用独立派生的抖动源。
      const vertical = Hv > Wv;
      const L = vertical ? Hv : Wv; // 前进方向长度
      const S = vertical ? Wv : Hv; // 横向长度
      const trailsP = Array.from({ length: nTrails }, (_, t) => ({
        lane: (t + 0.5 + (rng() - 0.5) * 0.3) / nTrails,
        dir: rng() < 0.5 ? 1 : -1,
        amp: (0.18 + rng() * 0.22) * Math.min(S / nTrails, S * 0.4) * 0.5,
        wl: L * (0.55 + rng() * 0.5),
        ph: rng() * Math.PI * 2,
        amp2: rng() * 0.3,
        start: rng() * 80,
        side: rng() < 0.5 ? 1 : -1,
      }));
      const pawLen = 21 * sc;
      let step = pawLen * 1.35 * stride;
      const est = (trailsP.length * (L + pawLen * 4)) / step * (companion ? 2.4 : 1);
      if (est > MAX_PRINTS) step *= est / MAX_PRINTS;
      const gait = pawLen * 0.5;

      trailsP.forEach((p) => {
        // 有界中心线：v(u) = lane·S + amp·[sin(2πu/wl+ph) + amp2·sin(4.3πu/wl)]，heading = atan(dv/du)
        const pts: Array<{ u: number; v: number; h: number; s: number }> = [];
        const k1 = (2 * Math.PI) / p.wl;
        const k2 = (4.3 * Math.PI) / p.wl;
        let s = 0;
        let prev: { u: number; v: number } | null = null;
        for (let u = -pawLen * 2 - p.start; u < L + pawLen * 2; u += 5) {
          const v = p.lane * S + p.amp * (Math.sin(k1 * u + p.ph) + p.amp2 * Math.sin(k2 * u));
          const dv = p.amp * (k1 * Math.cos(k1 * u + p.ph) + p.amp2 * k2 * Math.cos(k2 * u));
          if (prev) s += Math.hypot(u - prev.u, v - prev.v);
          pts.push({ u, v, h: Math.atan(dv), s });
          prev = { u, v };
        }
        const toXY = (uu: number, vv: number): [number, number] => {
          const fu = p.dir > 0 ? uu : L - uu;
          return vertical ? [vv, fu] : [fu, vv];
        };
        const headDeg = (h: number): number => {
          // 前进方向（屏幕坐标）；爪印本身朝 -y → +90°
          const dx = vertical ? Math.sin(h) : p.dir * Math.cos(h);
          const dy = vertical ? p.dir * Math.cos(h) : Math.sin(h);
          return (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        };
        const walk = (spacing: number, lat: number, g: number, wob: number): Print[] => {
          const out: Print[] = [];
          let next = 0;
          let k = 0;
          const jr = subRng(seed, `w${p.lane}${lat}`);
          for (const pt of pts) {
            if (pt.s < next) continue;
            const side = k % 2 === 0 ? 1 : -1;
            const off = lat + side * g + Math.sin(pt.s / 131) * wob + (jr() - 0.5) * g * 0.12;
            const nu = pt.u - Math.sin(pt.h) * off;
            const nv = pt.v + Math.cos(pt.h) * off;
            const [x, y] = toXY(nu, nv);
            out.push({ x, y, a: headDeg(pt.h) + side * 8 + (jr() - 0.5) * 6 });
            next = pt.s + spacing;
            k++;
          }
          return out;
        };
        big.push(walk(step, 0, gait, 0));
        if (companion) small.push(walk(step * 0.66, p.side * pawLen * 1.75, gait * 0.6, pawLen * 0.3));
      });

      // 画面外的爪印不输出
      const inView = (pr: Print): boolean => pr.x > -40 && pr.x < Wv + 40 && pr.y > -40 && pr.y < Hv + 40;
      for (let i = 0; i < big.length; i++) big[i] = big[i].filter(inView);
      for (let i = 0; i < small.length; i++) small[i] = small[i].filter(inView);
      // 总量封顶：按比例均匀抽稀
      const total = [...big, ...small].reduce((a, l) => a + l.length, 0);
      if (total > MAX_PRINTS) {
        const keep = MAX_PRINTS / total;
        const thin = (l: Print[]): Print[] => {
          const out: Print[] = [];
          let acc = 1;
          for (const pr of l) {
            acc += keep;
            if (acc >= 1) {
              out.push(pr);
              acc -= 1;
            }
          }
          return out;
        };
        for (let i = 0; i < big.length; i++) big[i] = thin(big[i]);
        for (let i = 0; i < small.length; i++) small[i] = thin(small[i]);
      }
    }

    const useMk = (pr: Print, href: string, idx: number, dur: number, stepT: number): string => {
      const st = walking ? ` style="animation:vw-pawwalk ${dur}s linear ${f1(idx * stepT)}s infinite backwards"` : '';
      return `<use href="#${href}" transform="${placeT(pr.x, pr.y, pr.a)}"${st}/>`;
    };

    if (walking) api.keyframes('vw-pawwalk', '0%{opacity:0}3%{opacity:1}62%{opacity:1}78%,100%{opacity:0}');

    if (!tileMode) {
      const stepT = 0.42;
      let bm = '';
      big.forEach((l) => {
        const dur = Math.max(4, Math.round((l.length * stepT) / 0.62));
        bm += l.map((pr, i) => useMk(pr, pid, i, dur, stepT)).join('');
      });
      let sm = '';
      small.forEach((l, t) => {
        const st2 = (stepT * (big[t]?.length ?? l.length)) / Math.max(1, l.length);
        const dur = Math.max(4, Math.round(((big[t]?.length ?? l.length) * stepT) / 0.62));
        sm += l.map((pr, i) => useMk(pr, kid, i, dur, st2)).join('');
      });
      if (kitten.visible && sm !== '') inner += `<g fill="${kitten.paintValue}" fill-opacity="${op(kitten.opacity)}">${sm}</g>`;
      if (pad.visible || toe.visible) inner += `<g fill="${pad.paintValue}" fill-opacity="${op(pad.opacity)}">${bm}</g>`;
    } else {
      // 平铺：3×2 错位格，每格一步一对（左前 + 右后），第 6 格换成两只小爪印
      const tr = subRng(seed, 'tile');
      const cw = 80 * sc * stride * 0.8;
      const ch = 64 * sc * stride * 0.8;
      const tw = cw * 3;
      const th = ch * 2;
      const base = tr() * 360;
      let bmk = '';
      let kmk = '';
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 3; i++) {
          const cx = (i + 0.5 + (j % 2) * 0.5) * cw;
          const cy = (j + 0.5) * ch;
          const a = base + (tr() - 0.5) * 50 + (i + j) * 23;
          const rad = ((a - 90) * Math.PI) / 180;
          const isKit = (i + j * 3) % 6 === 4;
          const s0 = isKit ? 0.58 : 1;
          const g2 = 9 * sc * s0;
          const fw = 11 * sc * s0;
          const feet: Array<[number, number]> = [
            [cx + Math.cos(rad) * fw - Math.sin(rad) * g2, cy + Math.sin(rad) * fw + Math.cos(rad) * g2],
            [cx - Math.cos(rad) * fw + Math.sin(rad) * g2, cy - Math.sin(rad) * fw - Math.cos(rad) * g2],
          ];
          feet.forEach(([x, y], k) => {
            for (const [ox, oy] of wrapOffsets(x, y, 12 * sc * s0, tw, th)) {
              const m = `<use href="#${isKit ? kid : pid}" transform="${placeT(ox, oy, a + (k === 0 ? 6 : -6))}"/>`;
              if (isKit) kmk += m;
              else bmk += m;
            }
          });
        }
      }
      const content =
        (pad.visible || toe.visible ? `<g fill="${pad.paintValue}" fill-opacity="${op(pad.opacity)}">${bmk}</g>` : '') +
        (kitten.visible ? `<g fill="${kitten.paintValue}" fill-opacity="${op(kitten.opacity)}">${kmk}</g>` : '');
      if (content !== '') {
        const tref = api.tile({ key: `paw-main-${pid}-${seed}`, w: tw, h: th, content, transform: `rotate(${i0(base % 30 - 15)})` });
        inner += `<rect width="${i0(Wv)}" height="${i0(Hv)}" fill="${tref}"/>`;
      }
    }

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
