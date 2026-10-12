/**
 * 飞鸟群 —— N 动物形象 / 单幅构图。
 *
 * 构图：天色底 + 一轮半落在远山后的大日轮 + 一道低矮的山脊剪影；
 * 鸟群以「M」形海鸥剪影组成，三种翼姿（上扬 / 平展 / 下压）随机混用，
 * 分远近两层：远处小而淡（次色），近处大而实（主色）。
 * 队形可选：群飞（沿一条弧线聚散的鸟浪）/ 雁阵（两组人字形 + 零散掉队者）/ 散飞。
 *
 * ⭐ 体积：三种翼姿各在 `<defs>` 定义一次（`<path id>`，填色继承），每只鸟一个 `<use>`（≈ 50B），总数受 count 上限约束。
 * 动画（仅预览，「振翅飞行」打开）：三种翼姿各自以不同相位上下扇动（scaleY），
 * 远近两层以不同速度横向飞越画面（视差），组外补一份副本 → 无缝循环。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { f1, frame, gauss, hid, i0, num, op, placeT } from './_helpers';

/** 单位海鸥：翼展 24（x ±12），L = 翼尖抬升高度。 */
function birdD(L: number): string {
  const half = (sx: number): string[] => {
    const X = (v: number): string => f1(v * sx);
    return [
      `C${X(1)} -1.6 ${X(1.25)} -0.9 ${X(1.6)} -0.8`,
      `C${X(4.2)} ${f1(-L - 1.6)} ${X(8.4)} ${f1(-L - 0.5)} ${X(12)} ${f1(-L)}`,
      `C${X(8.2)} ${f1(-L + 1.5)} ${X(4.6)} ${f1(-L * 0.25 + 1.3)} ${X(1.3)} 1.3`,
    ];
  };
  const l = half(-1);
  // 左半：头顶 → 左肩 → 左翼尖 → 左后缘 → 尾尖；右半逆序走回头顶
  return (
    `M0 -1.7${l.join('')}L0 2.9L1.3 1.3` +
    `C${f1(4.6)} ${f1(-L * 0.25 + 1.3)} ${f1(8.2)} ${f1(-L + 1.5)} 12 ${f1(-L)}` +
    `C${f1(8.4)} ${f1(-L - 0.5)} ${f1(4.2)} ${f1(-L - 1.6)} 1.6 -0.8C1.25 -0.9 1 -1.6 0 -1.7Z`
  ).replace(/ -/g, '-');
}
const POSES = [4.6, 1.4, -2.1];

interface Bird {
  x: number;
  y: number;
  z: number;
  a: number;
  pose: number;
}

const def: PatternDef = {
  id: 'bird-flock',
  name: '飞鸟群',
  category: 'N-animal',
  description: '海鸥剪影成群掠过落日与远山，远小近大分两层；队形可选群飞鸟浪、人字雁阵或散飞。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天色', role: 'bg', paint: { type: 'solid', color: '#f1e3d3' }, opacity: 1, visible: true, configurable: true },
    { id: 'sun', label: '日轮', role: 'accent', paint: { type: 'solid', color: '#e9b48f' }, opacity: 0.9, visible: true, configurable: true },
    { id: 'hills', label: '远山', role: 'detail', paint: { type: 'solid', color: '#d7bfae' }, opacity: 1, visible: true, configurable: true },
    { id: 'bird_far', label: '飞鸟 · 远', role: 'secondary', paint: { type: 'solid', color: '#a08a86' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'bird_near', label: '飞鸟 · 近', role: 'primary', paint: { type: 'solid', color: '#4c3f45' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    {
      key: 'formation',
      label: '队形',
      type: 'select',
      options: [
        { value: 'murmur', label: '群飞' },
        { value: 'vee', label: '雁阵' },
        { value: 'scatter', label: '散飞' },
      ],
      default: 'murmur',
    },
    { key: 'count', label: '鸟数', type: 'range', min: 12, max: 150, step: 1, default: 80 },
    { key: 'size', label: '鸟的大小', type: 'range', min: 0.6, max: 1.6, step: 0.05, default: 1 },
    { key: 'spread', label: '松散度', type: 'range', min: 0.4, max: 1.6, step: 0.05, default: 1 },
    { key: 'fly', label: '振翅飞行', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'dusk',
      label: '暮归',
      elements: {
        bg: { paint: { type: 'solid', color: '#f1e3d3' } },
        sun: { paint: { type: 'solid', color: '#e9b48f' }, opacity: 0.9 },
        hills: { paint: { type: 'solid', color: '#d7bfae' } },
        bird_far: { paint: { type: 'solid', color: '#a08a86' }, opacity: 0.85 },
        bird_near: { paint: { type: 'solid', color: '#4c3f45' } },
      },
    },
    {
      id: 'mist-blue',
      label: '晨雾',
      elements: {
        bg: { paint: { type: 'solid', color: '#dfe6ea' } },
        sun: { paint: { type: 'solid', color: '#f6f2ea' }, opacity: 0.95 },
        hills: { paint: { type: 'solid', color: '#c3cfd6' } },
        bird_far: { paint: { type: 'solid', color: '#8d9ba6' }, opacity: 0.8 },
        bird_near: { paint: { type: 'solid', color: '#3c4a56' } },
      },
      params: { formation: 'vee', count: 40 },
    },
    {
      id: 'night',
      label: '月夜',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f2433' } },
        sun: { paint: { type: 'solid', color: '#e8dfc8' }, opacity: 0.92 },
        hills: { paint: { type: 'solid', color: '#151925' } },
        bird_far: { paint: { type: 'solid', color: '#4c5570' }, opacity: 0.9 },
        bird_near: { paint: { type: 'solid', color: '#0d1019' } },
      },
      params: { formation: 'scatter', count: 36, size: 1.15 },
    },
    {
      id: 'ink',
      label: '水墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#efece4' } },
        sun: { paint: { type: 'solid', color: '#c8553d' }, opacity: 0.85 },
        hills: { paint: { type: 'solid', color: '#dcd8cd' } },
        bird_far: { paint: { type: 'solid', color: '#9a978f' }, opacity: 0.8 },
        bird_near: { paint: { type: 'solid', color: '#2a2a2a' } },
      },
      params: { count: 90, spread: 1.25 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['bird_near'],
    secondary: ['bird_far'],
    accent: ['sun'],
    detail: ['hills'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng, animate } = cfg;
    const { q, Wv, Hv } = frame(W, H);
    const formation = params.formation === 'vee' || params.formation === 'scatter' ? params.formation : 'murmur';
    const count = Math.round(num(params, 'count', 4, 200));
    const size = num(params, 'size', 0.3, 3);
    const spread = num(params, 'spread', 0.2, 3);
    const flying = animate && params.fly === true;

    const bg = elements.get('bg')!;
    const sun = elements.get('sun')!;
    const hills = elements.get('hills')!;
    const far = elements.get('bird_far')!;
    const near = elements.get('bird_near')!;

    const dir = rng() < 0.5 ? 1 : -1; // 鸟群朝向
    const portrait = Hv > Wv;

    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';

    // ── 日轮：鸟群飞去方向的反侧，半落在山后 ─────────────────
    const sunX = Wv * (0.5 - dir * (portrait ? 0.12 : 0.24)) + (rng() - 0.5) * Wv * 0.08;
    const ridge = Hv * (portrait ? 0.84 : 0.8);
    const sunR = Math.min(Wv, Hv) * (0.15 + rng() * 0.04);
    const sunY = ridge - sunR * (0.35 + rng() * 0.3);
    if (sun.visible) inner += `<circle cx="${i0(sunX)}" cy="${i0(sunY)}" r="${i0(sunR)}" fill="${sun.paintValue}" fill-opacity="${op(sun.opacity)}"/>`;

    // ── 远山：两组正弦叠加的低矮山脊 ───────────────────────
    {
      const ph1 = rng() * 6.28;
      const ph2 = rng() * 6.28;
      const amp = Math.min(Wv, Hv) * 0.045;
      let d = `M0 ${i0(Hv)}`;
      const N = 24;
      for (let i = 0; i <= N; i++) {
        const x = (Wv * i) / N;
        const y = ridge + amp * (Math.sin((x / Wv) * 5.1 + ph1) + 0.55 * Math.sin((x / Wv) * 11.7 + ph2)) - amp * 0.4 * Math.cos((x / Wv) * 3.1);
        d += `L${i0(x)} ${i0(y)}`;
      }
      d += `L${i0(Wv)} ${i0(Hv)}Z`;
      if (hills.visible) inner += `<path d="${d}" fill="${hills.paintValue}" fill-opacity="${op(hills.opacity)}"/>`;
    }

    // ── 鸟位 ────────────────────────────────────────────
    const birds: Bird[] = [];
    const sky = ridge * 0.92;
    const top = Math.min(Wv, Hv) * 0.06;
    const mk = (x: number, y: number, z: number, tilt: number): Bird => ({
      x,
      y: y < top ? top + (top - y) * 0.5 : y, // 不贴顶
      z,
      a: tilt,
      pose: Math.floor(rng() * 3) % 3,
    });
    if (formation === 'murmur') {
      // 二次贝塞尔弧线，从一侧低处扬向另一侧高处
      const x0 = Wv * (0.5 - dir * 0.46);
      const y0 = sky * (0.62 + rng() * 0.2);
      const x2 = Wv * (0.5 + dir * 0.4);
      const y2 = sky * (0.14 + rng() * 0.14);
      const x1 = Wv * (0.5 + (rng() - 0.5) * 0.3);
      const y1 = sky * (0.15 + rng() * 0.5);
      const bw = Math.min(Wv, Hv) * 0.13 * spread;
      for (let i = 0; i < count; i++) {
        const t = Math.pow(rng(), 0.85);
        const u = 1 - t;
        const x = u * u * x0 + 2 * u * t * x1 + t * t * x2;
        const y = u * u * y0 + 2 * u * t * y1 + t * t * y2;
        const tx = 2 * u * (x1 - x0) + 2 * t * (x2 - x1);
        const ty = 2 * u * (y1 - y0) + 2 * t * (y2 - y1);
        const m = Math.hypot(tx, ty) || 1;
        const w = bw * (0.35 + Math.sin(Math.PI * Math.min(1, t * 1.15)) * 1.1);
        const off = gauss(rng) * w;
        const along = gauss(rng) * bw * 0.5;
        const z = Math.pow(rng(), 1.3) * (0.4 + 0.6 * t);
        birds.push(mk(x - (ty / m) * off + (tx / m) * along, y + (tx / m) * off + (ty / m) * along, z, (Math.atan2(ty, Math.abs(tx)) * 180) / Math.PI * 0.25 * dir + gauss(rng) * 10));
      }
    } else if (formation === 'vee') {
      const skeins = 2;
      const perSkein = Math.min(19, Math.max(5, Math.round(count * 0.32)));
      for (let k = 0; k < skeins; k++) {
        const lx = Wv * (0.5 + dir * (0.18 + k * 0.17) + (rng() - 0.5) * 0.08);
        const ly = sky * (0.3 + k * 0.3 + (rng() - 0.5) * 0.08);
        const z = k === 0 ? 0.85 : 0.35;
        const sp = 46 * size * (0.6 + z * 0.6) * spread;
        const ang = (32 * Math.PI) / 180;
        for (let j = 0; j < perSkein; j++) {
          const arm = j === 0 ? 0 : j % 2 === 0 ? 1 : -1;
          const idx = Math.ceil(j / 2);
          const x = lx - dir * Math.cos(ang) * sp * idx + gauss(rng) * sp * 0.08;
          const y = ly + arm * Math.sin(ang) * sp * idx * (arm < 0 ? 0.8 : 1.05) + gauss(rng) * sp * 0.08 - idx * sp * 0.12;
          birds.push(mk(x, y, z + (rng() - 0.5) * 0.1, gauss(rng) * 5 - dir * 4));
        }
      }
      const rest = Math.max(4, count - perSkein * skeins);
      for (let i = 0; i < rest; i++) {
        const z = Math.pow(rng(), 2) * 0.45;
        birds.push(mk(rng() * Wv, sky * (0.08 + rng() * 0.75), z, gauss(rng) * 12));
      }
    } else {
      for (let i = 0; i < count; i++) {
        const z = Math.pow(rng(), 1.4);
        birds.push(mk(Wv * (0.04 + rng() * 0.92), sky * (0.06 + rng() * 0.82), z, gauss(rng) * 14));
      }
    }
    // 远近两层都保证有鸟（元件改色必须可见）
    birds.sort((a, b) => a.z - b.z);
    const split = Math.min(birds.length - 1, Math.max(1, birds.findIndex((b) => b.z >= 0.5) === -1 ? birds.length - 1 : birds.findIndex((b) => b.z >= 0.5)));

    // ── 形状定义（三种翼姿）───────────────────────────────
    const ids = POSES.map((L, i) => hid('bd', `${i}${birdD(L)}${flying}`));
    let defs = '';
    POSES.forEach((L, i) => {
      const st = flying
        ? ` style="transform-box:fill-box;transform-origin:center;animation:vw-bflap ${f1(0.7 + i * 0.13)}s ease-in-out -${f1(i * 0.31)}s infinite alternate"`
        : '';
      defs += `<path id="${ids[i]}" d="${birdD(L)}"${st}/>`;
    });
    if (flying) api.keyframes('vw-bflap', 'to{transform:scaleY(.3)}');
    inner += `<defs>${defs}</defs>`;

    const layer = (list: Bird[]): string =>
      list
        .map((b) => `<use href="#${ids[b.pose]}" transform="${placeT(b.x, b.y, b.a, size * 2.8 * (0.42 + 0.9 * Math.pow(b.z, 1.2)))}"/>`)
        .join('');
    const farMk = layer(birds.slice(0, split));
    const nearMk = layer(birds.slice(split));
    const group = (el: typeof far, mk2: string, key: string, dur: number): string => {
      if (!el.visible || mk2 === '') return '';
      const open = `<g fill="${el.paintValue}" fill-opacity="${op(el.opacity)}">`;
      if (!flying) return `${open}${mk2}</g>`;
      const dist = i0(Wv * dir);
      const name = api.keyframes(`vw-bdrift${dist}`, `to{transform:translateX(${dist}px)}`);
      const gid = hid('bf', key + mk2);
      return `${open}<g style="animation:${name} ${dur}s linear infinite"><g id="${gid}">${mk2}</g><use href="#${gid}" x="${i0(-Wv * dir)}"/></g></g>`;
    };
    inner += group(far, farMk, 'far', 110) + group(near, nearMk, 'near', 70);

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
