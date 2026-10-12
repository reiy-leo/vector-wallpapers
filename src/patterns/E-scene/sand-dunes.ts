/**
 * 沙丘 —— E 风景 / 单幅构图。
 *
 * 构图要点：低悬的太阳与天际暖光；四层沙丘由远及近（远层淡而扁、近层大而浓），
 * 每座沙丘迎风坡缓、背风坡陡、丘脊尖锐；丘脊线从峰顶弯曲下行，把沙丘分成受光面与背光面；
 * 受光面上铺满顺着地形起伏的细密风纹（背光面不画，保持干净）。
 * 太阳在右侧时整组沙丘水平镜像，光影方向始终正确。
 *
 * ⭐ 体积/节点策略：
 *   - 虚拟坐标「短边 = 1000」，整体 `scale(q)`；轮廓整数相对坐标，风纹用二次贝塞尔中点法。
 *   - 每层：受光面 1 条 path + 背光面 1 条 path + 风纹 1 条 path。
 *   - 风纹字节超限时按「行」等比抽稀（RIPPLE_CAP）；轮廓步长按 DUNE_CAP 放疏。
 * 动画（仅预览，cfg.animate && windSand）：风纹缓慢顺风漂移（近快远慢），丘脊上扬起细沙流。
 */
import { g, path, rect } from '../../engine/svg';
import { encLine, encSmooth, f1, mix, noise1D, num, virt } from './_scene';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';

const V = 1000;
const DUNE_CAP = 7000;
const RIPPLE_CAP = 7200;

interface Peak {
  x: number;
  h: number;
  /** 迎风坡（左）宽、背风坡（右）宽 */
  wl: number;
  wr: number;
  /** 丘脊线下行时的弯曲 */
  bend: number;
}

const def: PatternDef = {
  id: 'sand-dunes',
  name: '沙丘',
  category: 'E-scene',
  description: '低悬的太阳下层层沙丘，尖锐丘脊分出受光面与背光面，受光坡铺满细密风纹。',
  seedable: true,
  animatable: true,

  elements: [
    { id: 'bg', label: '天空', role: 'bg', paint: { type: 'solid', color: '#f0dcc3' }, opacity: 1, visible: true, configurable: true },
    { id: 'sky_glow', label: '天际暖光', role: 'detail', paint: { type: 'solid', color: '#f5c39b' }, opacity: 1, visible: true, configurable: true },
    { id: 'sun', label: '太阳', role: 'accent', paint: { type: 'solid', color: '#fff4e2' }, opacity: 1, visible: true, configurable: true },
    { id: 'dune_far', label: '远丘', role: 'detail', paint: { type: 'solid', color: '#e3b68d' }, opacity: 1, visible: true, configurable: true },
    { id: 'dune_light', label: '受光面', role: 'primary', paint: { type: 'solid', color: '#d8975f' }, opacity: 1, visible: true, configurable: true },
    { id: 'dune_shadow', label: '背光面', role: 'secondary', paint: { type: 'solid', color: '#9a5a3c' }, opacity: 1, visible: true, configurable: true },
    { id: 'ripple', label: '风纹', role: 'secondary', paint: { type: 'solid', color: '#b5734a' }, opacity: 1, visible: true, configurable: true },
  ],

  controls: [
    { key: 'duneCount', label: '沙丘数量', type: 'range', min: 1, max: 5, step: 1, default: 3, heavy: true },
    { key: 'rippleDensity', label: '风纹密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.55 },
    { key: 'sunPos', label: '太阳位置', type: 'range', min: 0, max: 1, step: 0.01, default: 0.26 },
    { key: 'sunHeight', label: '太阳高度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'windSand', label: '风沙流动', type: 'toggle', default: false, group: '动画' },
  ],

  presets: [
    {
      id: 'golden-hour',
      label: '金色黄昏',
      elements: {
        bg: { paint: { type: 'solid', color: '#f0dcc3' } },
        sky_glow: { paint: { type: 'solid', color: '#f5c39b' } },
        sun: { paint: { type: 'solid', color: '#fff4e2' } },
        dune_far: { paint: { type: 'solid', color: '#e3b68d' } },
        dune_light: { paint: { type: 'solid', color: '#d8975f' } },
        dune_shadow: { paint: { type: 'solid', color: '#9a5a3c' } },
        ripple: { paint: { type: 'solid', color: '#b5734a' } },
      },
    },
    {
      id: 'pale-noon',
      label: '正午浅沙',
      elements: {
        bg: { paint: { type: 'solid', color: '#e6edf0' } },
        sky_glow: { paint: { type: 'solid', color: '#f3e9d6' } },
        sun: { paint: { type: 'solid', color: '#ffffff' } },
        dune_far: { paint: { type: 'solid', color: '#e6d4b6' } },
        dune_light: { paint: { type: 'solid', color: '#e0c398' } },
        dune_shadow: { paint: { type: 'solid', color: '#b48a62' } },
        ripple: { paint: { type: 'solid', color: '#c6a175' } },
      },
      params: { sunHeight: 0.85, sunPos: 0.7 },
    },
    {
      id: 'rose-dusk',
      label: '玫瑰暮色',
      elements: {
        bg: { paint: { type: 'solid', color: '#e7cac5' } },
        sky_glow: { paint: { type: 'solid', color: '#f0b7a0' } },
        sun: { paint: { type: 'solid', color: '#fff0e5' } },
        dune_far: { paint: { type: 'solid', color: '#d8a794' } },
        dune_light: { paint: { type: 'solid', color: '#cc8e78' } },
        dune_shadow: { paint: { type: 'solid', color: '#874e50' } },
        ripple: { paint: { type: 'solid', color: '#ad705f' } },
      },
      params: { sunHeight: 0.2 },
    },
    {
      id: 'moonlit',
      label: '月下沙海',
      elements: {
        bg: { paint: { type: 'solid', color: '#1f2542' } },
        sky_glow: { paint: { type: 'solid', color: '#4b4b6e' } },
        sun: { paint: { type: 'solid', color: '#f1ecdc' } },
        dune_far: { paint: { type: 'solid', color: '#4c4f72' } },
        dune_light: { paint: { type: 'solid', color: '#7d7892' } },
        dune_shadow: { paint: { type: 'solid', color: '#2b2a45' } },
        ripple: { paint: { type: 'solid', color: '#5d5975' } },
      },
      params: { sunHeight: 0.7, sunPos: 0.78 },
    },
    {
      id: 'sage-sand',
      label: '灰绿沙',
      elements: {
        bg: { paint: { type: 'solid', color: '#e3e6dc' } },
        sky_glow: { paint: { type: 'solid', color: '#eee5ce' } },
        sun: { paint: { type: 'solid', color: '#fffaf0' } },
        dune_far: { paint: { type: 'solid', color: '#d2ccb5' } },
        dune_light: { paint: { type: 'solid', color: '#c3b792' } },
        dune_shadow: { paint: { type: 'solid', color: '#878264' } },
        ripple: { paint: { type: 'solid', color: '#a59b76' } },
      },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['dune_light'],
    secondary: ['dune_shadow', 'ripple'],
    accent: ['sun'],
    detail: ['dune_far', 'sky_glow'],
  },

  render(_def, cfg: ResolvedConfig, api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const count = Math.round(num(params, 'duneCount', 1, 5));
    const rippleD = num(params, 'rippleDensity', 0, 1);
    const sunPos = num(params, 'sunPos', 0, 1);
    const sunH = num(params, 'sunHeight', 0, 1);
    const anim = cfg.animate && params.windSand === true;

    const { Wv, Hv, tf } = virt(W, H, V);
    const el = (id: string) => elements.get(id)!;
    const hex = (v: string): boolean => v.startsWith('#');
    const bg = el('bg');
    const out: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    const inner: string[] = [];
    const horizon = Hv * (Hv > Wv ? 0.5 : 0.46);
    const bottom = Math.ceil(Hv) + 4;
    const mirror = sunPos > 0.5;

    // ── 天空 + 太阳 ────────────────────────────────────────
    const sg = el('sky_glow');
    if (sg.visible) {
      const fill = hex(sg.paintValue)
        ? api.linear({ key: 'sd-sky', angle: 90, stops: [{ offset: 0, color: sg.paintValue, opacity: 0 }, { offset: 1, color: sg.paintValue, opacity: 0.95 }] })
        : sg.paintValue;
      inner.push(rect(0, Math.round(horizon * 0.2), Math.ceil(Wv), Math.round(horizon * 0.8 + V * 0.06), { fill, 'fill-opacity': sg.opacity }));
    }
    const sun = el('sun');
    const sx = Wv * (0.08 + sunPos * 0.84);
    const sy = horizon - V * (0.04 + sunH * 0.32);
    const sr = V * 0.052;
    if (sun.visible) {
      if (hex(sun.paintValue)) {
        const halo = api.radial({
          key: 'sd-halo',
          cx: 0.5,
          cy: 0.5,
          r: 0.5,
          stops: [
            { offset: 0, color: sun.paintValue, opacity: 0.55 * sun.opacity },
            { offset: 0.3, color: sun.paintValue, opacity: 0.18 * sun.opacity },
            { offset: 1, color: sun.paintValue, opacity: 0 },
          ],
        });
        inner.push(`<circle cx="${Math.round(sx)}" cy="${Math.round(sy)}" r="${Math.round(sr * 6)}" fill="${halo}"/>`);
      }
      inner.push(`<circle cx="${Math.round(sx)}" cy="${Math.round(sy)}" r="${Math.round(sr)}" fill="${sun.paintValue}" fill-opacity="${api.n(sun.opacity)}"/>`);
    }

    // ── 沙丘层（几何在「太阳在左」坐标里生成，必要时整体镜像）──────────
    const far = el('dune_far');
    const lightE = el('dune_light');
    const shadowE = el('dune_shadow');
    const rippleE = el('ripple');
    const seaH = Hv - horizon;
    const LAYERS = [
      { y: 0.06, a: 0.05, k: 1.6 },
      { y: 0.24, a: 0.09, k: 1.25 },
      { y: 0.5, a: 0.15, k: 1 },
      { y: 0.84, a: 0.24, k: 0.8 },
    ];
    const x0 = -V * 0.1;
    const x1 = Wv + V * 0.1;
    interface Layer {
      base: number;
      peaks: Peak[];
      wob: (t: number) => number;
      amp: number;
      ph: number[];
    }
    const layers: Layer[] = LAYERS.map((L) => {
      const base = horizon + seaH * L.y;
      const amp = V * L.a * (seaH / (V * 0.54));
      const n = Math.max(1, Math.round(((count * Wv) / (V * 1.78)) * L.k));
      const peaks: Peak[] = [];
      const span = (x1 - x0) / n;
      for (let i = 0; i < n + 1; i++) {
        const w = span * (0.95 + rng() * 0.5);
        peaks.push({
          x: x0 + span * (i + 0.2 + rng() * 0.6),
          h: amp * (0.55 + rng() * 0.45),
          wl: w * (0.85 + rng() * 0.3),
          wr: w * (0.55 + rng() * 0.25),
          bend: 0.4 + rng() * 0.6,
        });
      }
      const wob = noise1D(rng, Math.max(2, Math.round((3 * Wv) / V)), 2, 0.5);
      const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
      return { base, peaks, wob, amp, ph };
    });

    /** 某层在 x 处的高度（向上为正）与「属于哪座峰」。 */
    const heightAt = (Lr: Layer, x: number): [number, number] => {
      let best = Lr.amp * 0.06 * (Lr.wob((x - x0) / (x1 - x0)) + 1);
      let who = -1;
      Lr.peaks.forEach((p, i) => {
        const d = x - p.x;
        const w = d < 0 ? p.wl : p.wr;
        const u = Math.abs(d) / w;
        if (u >= 1) return;
        // 迎风坡：平滑的凸弧；背风坡：更陡、坡脚收得快
        const v = d < 0 ? p.h * Math.pow(1 - u * u, 1.6) : p.h * Math.pow(1 - u, 1.35);
        if (v > best) {
          best = v;
          who = i;
        }
      });
      return [best, who];
    };

    /** 丘脊线：峰顶 → 左下坡脚的 S 形下行（smoothstep），整体斜贯沙丘。 */
    const crestBottom = (p: Peak): number => p.x - p.wl * (0.3 + 0.3 * p.bend);
    const crestX = (p: Peak, xb: number, f: number): number => p.x + (xb - p.x) * (f * f * (3 - 2 * f));
    let step = 6;
    let geo: Array<{ fill: string; shade: string; samples: Array<[number, number]>; shadeSpans: Array<[number, number, number, number]>; polys: Array<Array<[number, number]>> }> = [];
    for (let guard = 0; guard < 10; guard++) {
      geo = layers.map((Lr) => {
        const samples: Array<[number, number]> = [];
        const owner: number[] = [];
        for (let x = x0; x <= x1 + step; x += step) {
          const [h, who] = heightAt(Lr, x);
          samples.push([x, Lr.base - h]);
          owner.push(who);
        }
        const fill = `${encLine(samples)}V${bottom}H${Math.round(x0)}z`;
        // 背光面：每座峰 → 峰顶向右沿轮廓到「轮廓归属换峰 / 回到底」处，再沿弯曲的丘脊线回到峰顶
        let shade = '';
        const spans: Array<[number, number, number, number]> = [];
        const polys: Array<Array<[number, number]>> = [];
        Lr.peaks.forEach((p, pi) => {
          const i0 = Math.round((p.x - x0) / step);
          if (i0 < 0 || i0 >= samples.length) return;
          if (owner[Math.min(samples.length - 1, i0 + 1)] !== pi) return; // 峰被邻峰盖住
          let j = i0 + 1;
          while (j < samples.length - 1 && owner[j + 1] === pi) j++;
          const pts: Array<[number, number]> = [];
          for (let t = i0; t <= j; t++) pts.push(samples[t]);
          const top = samples[i0][1];
          const yb = Math.min(bottom, Lr.base + Lr.amp * 1.2 + V * 0.05);
          const xb = crestBottom(p);
          const crest: Array<[number, number]> = [];
          const N = 10;
          // 自下而上
          for (let s = N; s >= 0; s--) {
            const f = s / N;
            const x = crestX(p, xb, f);
            crest.push([x, top + (yb - top) * f]);
          }
          // 山谷 → 丘脊线坡脚：下凹的弧（背风坡脚与下一座迎风坡的交界）
          const [vx, vy] = samples[j];
          for (let s = 1; s < 6; s++) {
            const f = s / 6;
            pts.push([vx + (xb - vx) * f, vy + (yb - vy) * Math.pow(f, 0.6)]);
          }
          pts.push(...crest);
          shade += `${encLine(pts)}z`;
          polys.push(pts);
          spans.push([p.x, xb, samples[j][0], top]);
        });
        return { fill, shade, samples, shadeSpans: spans, polys };
      });
      const sz = geo.reduce((s, g2) => s + g2.fill.length + g2.shade.length, 0);
      if (sz <= DUNE_CAP) break;
      step *= 1.2;
    }

    // ── 风纹：顺着轮廓下移的细波纹，只画在受光面 ─────────────────────
    const rippleRows = (li: number): number => Math.round((3 + rippleD * 16) * (0.4 + li * 0.35));
    let thin = 1;
    let ripD: string[] = [];
    for (let guard = 0; guard < 12; guard++) {
      ripD = layers.map((Lr, li) => {
        if (rippleD <= 0 || li === 0) return '';
        const rows = Math.max(1, Math.round(rippleRows(li) / thin));
        const G = geo[li];
        const depthBand = Lr.amp * 1.25 + V * 0.04;
        const lam = V * (0.05 + li * 0.03);
        let d = '';
        const st = Math.max(10, lam / 2.2);
        for (let r = 0; r < rows; r++) {
          const off = depthBand * Math.pow((r + 0.6) / rows, 1.15);
          let run: Array<[number, number]> = [];
          const flush = (): void => {
            if (run.length >= 3) d += encSmooth(run);
            run = [];
          };
          for (let x = x0; x <= x1; x += st) {
            const [h] = heightAt(Lr, x);
            const top = Lr.base - h;
            const y = top + off * (0.55 + 0.45 * (h / (Lr.amp + 1))) + Math.sin((x / lam) * 6.283 + Lr.ph[r % 3] + r * 1.7) * V * 0.0035 * (1 + li * 0.5);
            // 在背光面里？（峰与丘脊线之间、到山谷为止）
            let inShade = false;
            for (const poly of G.polys) {
              // 射线法点在多边形内判定
              let c = false;
              for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
                const [xi, yi] = poly[i];
                const [xj, yj] = poly[j];
                if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
              }
              if (c) {
                inShade = true;
                break;
              }
            }
            if (inShade || y < top + 1) flush();
            else run.push([x, y]);
          }
          flush();
        }
        return d;
      });
      if (ripD.reduce((s, d) => s + d.length, 0) <= RIPPLE_CAP) break;
      thin *= 1.2;
    }

    // ── 输出 ─────────────────────────────────────────────
    const dunes: string[] = [];
    const n = layers.length;
    layers.forEach((_layer, li) => {
      const t = li / (n - 1);
      const haze = 1 - t;
      const hazeC = sg.visible ? sg.paintValue : bg.paintValue;
      const lc = mix(mix(far.paintValue, lightE.paintValue, Math.pow(t, 0.8)), hazeC, haze * 0.18);
      const sc = mix(mix(far.paintValue, shadowE.paintValue, 0.35 + 0.65 * t), hazeC, haze * 0.15);
      const G = geo[li];
      if (lightE.visible || far.visible) dunes.push(path(G.fill, { fill: lc, 'fill-opacity': far.opacity + (lightE.opacity - far.opacity) * t }));
      if (shadowE.visible && G.shade !== '') dunes.push(path(G.shade, { fill: sc, 'fill-opacity': shadowE.opacity }));
      const rd = ripD[li];
      if (rippleE.visible && rd !== '') {
        const rc = mix(rippleE.paintValue, lc, 0.35 * haze);
        let p = `<path d="${rd}" fill="none" stroke="${rc}" stroke-width="${f1(0.9 + li * 0.55)}" stroke-linecap="round" stroke-opacity="${api.n(rippleE.opacity * (0.45 + 0.2 * t))}"/>`;
        if (anim) {
          const kf = api.keyframes(`vw-sd-r${li}`, `from{transform:translateX(0)}to{transform:translateX(${Math.round(4 + li * 4)}px)}`);
          p = `<g style="animation:${kf} ${f1(7 - li)}s ease-in-out infinite alternate">${p}</g>`;
        }
        dunes.push(p);
      }
      // 丘脊扬沙（仅动画）：近两层峰顶向下风处飘出的细线
      if (anim && li >= 2 && rippleE.visible) {
        let wisp = '';
        G.shadeSpans.forEach(([px, , , ty]) => {
          wisp += `M${Math.round(px)} ${Math.round(ty)}q${Math.round(V * 0.04)} ${-Math.round(V * 0.012)} ${Math.round(V * 0.1)} ${Math.round(V * 0.004)}`;
        });
        if (wisp !== '') {
          const kf = api.keyframes('vw-sd-w', '0%{transform:translateX(0);opacity:0}30%{opacity:.6}100%{transform:translateX(40px);opacity:0}');
          dunes.push(
            `<g style="animation:${kf} ${f1(3.2 + li * 0.7)}s ease-out -${f1(li * 0.9)}s infinite"><path d="${wisp}" fill="none" stroke="${mix(lightE.paintValue, '#ffffff', 0.35)}" stroke-width="${f1(1.4 + li * 0.4)}" stroke-linecap="round" stroke-opacity="0.5"/></g>`,
          );
        }
      }
    });
    inner.push(mirror ? `<g transform="matrix(-1 0 0 1 ${Math.round(Wv)} 0)">${dunes.join('')}</g>` : g({}, dunes.join('')));

    out.push(g({ transform: tf }, inner.join('')));
    return { body: out.join('') };
  },
};

export default def;
