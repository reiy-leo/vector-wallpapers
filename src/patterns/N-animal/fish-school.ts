/**
 * 鱼群 —— N 动物形象。
 *
 * 构图：水色底上几道很淡的水流线；1~4 群小鱼沿各自的正弦流带游动，
 * 鱼身朝向 = 流线切线方向，流带宽窄随位置起伏 → 鱼群有聚有散。
 * 鱼分两种身色（主 / 次随机混排），每群里混着一两条「小红鱼」（强调色）。
 *
 * ⭐ 体积：鱼形只在 `<defs>` 定义一次（身体继承填色 + 眼睛 / 鳃线固定用底色），每条鱼一个 `<use>`（≈ 52B）。
 * 流带的正弦周期 = 画宽的整数分之一 → 横向平移一整屏正好首尾相接。
 * 动画（仅预览，「游动」打开）：每群沿 x 方向匀速平移一屏并补一份副本无缝循环，另加轻微上下浮动。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { f1, frame, gauss, hid, i0, num, op, placeT } from './_helpers';

/** 单位小鱼：朝 +x，体长约 20（x -9.6 ~ 10.4）。 */
const FISH_BODY =
  'M10.4 0C9 -3.9 4.4 -5.6 0.2 -4.6C-2.4 -4 -4.2 -2.2 -5.6 -0.9L-9.4 -4.6C-10 -5.1 -10.6 -4.7 -10.3 -4L-8.5 0L-10.3 4C-10.6 4.7 -10 5.1 -9.4 4.6L-5.6 0.9C-4.2 2.2 -2.4 4 0.2 4.6C4.4 5.6 9 3.9 10.4 0Z'.replace(/ -/g, '-');
/** 背鳍（与身体同色，稍微出挑一点轮廓）。 */
const FISH_FIN = 'M-0.6-4.4C0.6-6.8 3.4-7.4 5.2-6.6C4.2-5.6 3.6-4.8 3.4-3.9Z';

interface Fish {
  x: number;
  y: number;
  a: number;
  s: number;
  c: 0 | 1 | 2;
}

const def: PatternDef = {
  id: 'fish-school',
  name: '鱼群',
  category: 'N-animal',
  description: '一群群小鱼沿正弦水流带游动，聚散有致，鱼群里藏着一两条颜色不同的小红鱼。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '水色', role: 'bg', paint: { type: 'solid', color: '#1f3a4a' }, opacity: 1, visible: true, configurable: true },
    { id: 'current', label: '水流线', role: 'detail', paint: { type: 'solid', color: '#2e5266' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'fish', label: '鱼 · 主', role: 'primary', paint: { type: 'solid', color: '#a9cbd0' }, opacity: 1, visible: true, configurable: true },
    { id: 'fish_alt', label: '鱼 · 次', role: 'secondary', paint: { type: 'solid', color: '#6f9cab' }, opacity: 1, visible: true, configurable: true },
    { id: 'odd_fish', label: '小红鱼', role: 'accent', paint: { type: 'solid', color: '#e59a7c' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'count', label: '鱼数', type: 'range', min: 30, max: 170, step: 5, default: 120 },
    { key: 'size', label: '鱼的大小', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'schools', label: '鱼群数', type: 'range', min: 1, max: 4, step: 1, default: 1 },
    { key: 'wave', label: '流线起伏', type: 'range', min: 0, max: 1, step: 0.05, default: 0.65 },
    {
      key: 'direction',
      label: '游向',
      type: 'select',
      options: [
        { value: 'right', label: '向右' },
        { value: 'left', label: '向左' },
        { value: 'mixed', label: '交错' },
      ],
      default: 'right',
    },
    { key: 'swim', label: '游动', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'deep',
      label: '深海',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f3a4a' } },
        current: { paint: { type: 'solid', color: '#2e5266' }, opacity: 0.9 },
        fish: { paint: { type: 'solid', color: '#a9cbd0' } },
        fish_alt: { paint: { type: 'solid', color: '#6f9cab' } },
        odd_fish: { paint: { type: 'solid', color: '#e59a7c' } },
      },
    },
    {
      id: 'lagoon',
      label: '浅湾',
      elements: {
        bg: { paint: { type: 'solid', color: '#d8ebe6' } },
        current: { paint: { type: 'solid', color: '#c2ded7' }, opacity: 0.9 },
        fish: { paint: { type: 'solid', color: '#3f7d84' } },
        fish_alt: { paint: { type: 'solid', color: '#6ea7a3' } },
        odd_fish: { paint: { type: 'solid', color: '#e08a5e' } },
      },
      params: { schools: 3, count: 150, wave: 0.5 },
    },
    {
      id: 'koi',
      label: '锦鲤池',
      elements: {
        bg: { paint: { type: 'solid', color: '#26302b' } },
        current: { paint: { type: 'solid', color: '#34423b' }, opacity: 0.9 },
        fish: { paint: { type: 'solid', color: '#ead9c0' } },
        fish_alt: { paint: { type: 'solid', color: '#d9895b' } },
        odd_fish: { paint: { type: 'solid', color: '#c4453a' } },
      },
      params: { count: 60, size: 1.45, schools: 2, direction: 'mixed' },
    },
    {
      id: 'paper',
      label: '纸鱼',
      elements: {
        bg: { paint: { type: 'solid', color: '#f3eee6' } },
        current: { paint: { type: 'solid', color: '#e4dccf' }, opacity: 1 },
        fish: { paint: { type: 'solid', color: '#3d4a5c' } },
        fish_alt: { paint: { type: 'solid', color: '#8a96a8' } },
        odd_fish: { paint: { type: 'solid', color: '#d27a5a' } },
      },
      params: { count: 130, wave: 0.8, direction: 'left' },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['fish'],
    secondary: ['fish_alt'],
    accent: ['odd_fish'],
    detail: ['current'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const { q, Wv, Hv } = frame(W, H);
    const count = Math.round(num(params, 'count', 10, 300));
    const size = num(params, 'size', 0.3, 3);
    // 竖屏按纵横比多给几群，避免中段空掉
    const nSch = Math.min(6, Math.round(Math.round(num(params, 'schools', 1, 4)) * Math.max(1, (Hv / Wv) * 0.7)));
    const wave = num(params, 'wave', 0, 1);
    const dirMode = params.direction === 'left' || params.direction === 'mixed' ? params.direction : 'right';
    const swimming = animate && params.swim === true;

    const bg = elements.get('bg')!;
    const cur = elements.get('current')!;
    const fishEl = [elements.get('fish')!, elements.get('fish_alt')!, elements.get('odd_fish')!];

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';

    // ── 流带 ─────────────────────────────────────────────
    const minor = Math.min(Wv, Hv);
    const bands = Array.from({ length: nSch }, (_, i) => {
      const m = 1 + Math.floor(rng() * 2); // 一屏内 1~2 个周期（整数 → 平移一屏无缝）
      return {
        yc: Hv * ((i + 0.5 + (rng() - 0.5) * (nSch === 1 ? 0.16 : 0.4)) / nSch),
        amp: minor * (0.03 + wave * 0.2) * (0.7 + rng() * 0.5) / Math.sqrt(nSch),
        k: (2 * Math.PI * m) / Wv,
        ph: rng() * Math.PI * 2,
        w: minor * (0.075 + rng() * 0.035) * (nSch > 2 ? 0.8 : 1),
        dir: dirMode === 'left' ? -1 : dirMode === 'mixed' ? (i % 2 === 0 ? 1 : -1) : 1,
      };
    });
    const yAt = (b: (typeof bands)[number], x: number): number => b.yc + b.amp * Math.sin(b.k * x + b.ph);
    const slope = (b: (typeof bands)[number], x: number): number => b.amp * b.k * Math.cos(b.k * x + b.ph);

    // ── 水流线：每带上下各 1 条平行细线（末带多 1 条），32 段折线 ─────
    if (cur.visible) {
      let d = '';
      const line = (b: (typeof bands)[number], off: number, ampK: number): void => {
        const N = 32;
        for (let i = 0; i <= N; i++) {
          const x = (Wv * i) / N;
          const y = b.yc + off + b.amp * ampK * Math.sin(b.k * x + b.ph);
          d += `${i === 0 ? 'M' : 'L'}${i0(x)} ${i0(y)}`;
        }
      };
      bands.forEach((b, i) => {
        line(b, -b.w * 1.9, 1);
        line(b, b.w * 1.9, 1);
        if (i === bands.length - 1) line(b, b.w * 3, 1);
      });
      inner += `<path d="${d.replace(/ -/g, '-')}" fill="none" stroke="${cur.paintValue}" stroke-opacity="${op(cur.opacity)}" stroke-width="${f1(2.2)}" stroke-linecap="round"/>`;
    }

    // ── 鱼 ────────────────────────────────────────────────
    const per = Math.max(6, Math.round(count / nSch));
    const minGap = 19 * 2.05 * size * 0.85;
    const schools: Fish[][] = bands.map((b) => {
      const list: Fish[] = [];
      // 聚散：沿 x 的密度调制（周期同样是整屏的整数分之一）
      const cl = 1 + Math.floor(rng() * 3);
      const cph = rng() * Math.PI * 2;
      let guard = 0;
      while (list.length < per && guard++ < per * 6) {
        const x = rng() * Wv;
        const dens = 0.55 + 0.45 * Math.sin((2 * Math.PI * cl * x) / Wv + cph);
        if (rng() > 0.25 + dens * 0.75) continue;
        const off = gauss(rng) * b.w * (0.55 + dens * 0.6);
        const y = yAt(b, x) + off;
        // 避免两条鱼叠在一起（只比较同群，n ≤ 几十）
        if (list.some((f) => Math.abs(f.x - x) < minGap && Math.abs(f.y - y) < minGap * 0.55)) continue;
        // 向左游的鱼用水平镜像（而非转 180°），背鳍始终朝上
        const a = (Math.atan(slope(b, x)) * 180) / Math.PI + gauss(rng) * 7;
        list.push({ x, y, a, s: 0.8 + rng() * 0.38, c: rng() < 0.36 ? 1 : 0 });
      }
      // 小红鱼：每群随机 1~2 条
      const nOdd = 1 + (rng() < 0.45 ? 1 : 0);
      for (let k = 0; k < nOdd && list.length > 0; k++) list[Math.floor(rng() * list.length)].c = 2;
      list.sort((p, q2) => p.y - q2.y);
      return list;
    });

    const sc = 2.05 * size;
    const eye = `<circle cx="5.6" cy="-1" r="1.15" fill="${bg.paintValue}" fill-opacity="${op(bg.opacity)}"/>`;
    const gill = `<path d="M2.4-3.1Q0.9 0 2.4 3.1" fill="none" stroke="${bg.paintValue}" stroke-opacity="${op(bg.opacity * 0.35)}" stroke-width=".9" stroke-linecap="round"/>`;
    const fishInner = `<path d="${FISH_BODY}${FISH_FIN}"/>${eye}${gill}`;
    const fid = hid('fs', fishInner + sc);
    inner += `<defs><g id="${fid}" transform="scale(${String(Math.round(sc * 100) / 100)})">${fishInner}</g></defs>`;

    if (swimming) api.keyframes('vw-fbob', 'from{transform:translateY(-6px)}to{transform:translateY(6px)}');
    schools.forEach((list, si) => {
      const b = bands[si];
      let mk = '';
      for (let c = 0; c < 3; c++) {
        const el = fishEl[c];
        const uses = list
          .filter((f) => f.c === c)
          .map((f) => {
            const t = b.dir < 0 ? `${placeT(f.x, f.y, f.a)}scale(-${String(Math.round(f.s * 100) / 100)} ${String(Math.round(f.s * 100) / 100)})` : placeT(f.x, f.y, f.a, f.s);
            return `<use href="#${fid}" transform="${t}"/>`;
          })
          .join('');
        if (el.visible && uses !== '') mk += `<g fill="${el.paintValue}" fill-opacity="${op(el.opacity)}">${uses}</g>`;
      }
      if (mk === '') return;
      if (!swimming) {
        inner += mk;
        return;
      }
      const dist = i0(Wv * b.dir);
      const name = api.keyframes(`vw-fswim${dist}`, `to{transform:translateX(${dist}px)}`);
      const gid = hid('fg', `${si}${mk}`);
      const dur = Math.round(48 + si * 9 + (si % 2) * 7);
      inner +=
        `<g style="animation:vw-fbob ${f1(3.2 + si * 0.7)}s ease-in-out -${f1(si * 1.1)}s infinite alternate">` +
        `<g style="animation:${name} ${dur}s linear infinite"><g id="${gid}">${mk}</g><use href="#${gid}" x="${i0(-Wv * b.dir)}"/></g></g>`;
    });

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
