/**
 * 瑞士网格 —— M 设计流派（国际主义平面风格）。
 *
 * 与 `bauhaus-blocks`（等大模块里随机放基本形、平铺）完全不同：
 *   - **单张非对称构图**：整幅画面先立一套 N 栏模块网格（页边距 + 栏 + 方形模块行），
 *     所有块面、细线、圆都**咬合在网格线上**；
 *   - 一块大色块（常出血到画边）定重心，一条窄色带做对位，一个大圆压在色块边缘制造张力，
 *     细线（栏线 / 基线）与「无字排版块」（长短不一的细横条，模拟文字栏的灰度）组织留白；
 *   - 不用任何文字（铁律禁止文字元素），文字的「灰度」由细条抽象。
 *
 * 体积：几十个 rect/line，与分辨率无关（虚拟坐标短边 = 1000，外层 scale）。
 */
import { rect } from '../../engine/svg';
import type { PatternDef, RenderApi, RenderResult, ResolvedConfig } from '../types';
import { clampNum, op, ri } from './_helpers';

const V = 1000;

const def: PatternDef = {
  id: 'swiss-grid',
  name: '瑞士网格',
  category: 'M-movement',
  description: '国际主义平面风格：咬合在模块网格上的大色块、窄色带、大圆与细线，非对称留白，不着一字。',
  seedable: true,
  animatable: false,

  elements: [
    { id: 'bg', label: '纸色', role: 'bg', paint: { type: 'solid', color: '#efece5' }, opacity: 1, visible: true, configurable: true },
    { id: 'block_a', label: '主色块', role: 'primary', paint: { type: 'solid', color: '#c4473a' }, opacity: 1, visible: true, configurable: true },
    { id: 'block_b', label: '色带', role: 'secondary', paint: { type: 'solid', color: '#23262b' }, opacity: 1, visible: true, configurable: true },
    { id: 'circle', label: '圆', role: 'accent', paint: { type: 'solid', color: '#e2b04a' }, opacity: 1, visible: true, configurable: true },
    { id: 'rule', label: '细线 / 字块', role: 'detail', paint: { type: 'solid', color: '#23262b' }, opacity: 0.85, visible: true, configurable: true },
    { id: 'grid', label: '网格线', role: 'detail', paint: { type: 'solid', color: '#23262b' }, opacity: 0.08, visible: true, configurable: true },
  ],

  controls: [
    { key: 'cols', label: '栏数', type: 'range', min: 6, max: 16, step: 1, default: 12, heavy: true },
    {
      key: 'layout',
      label: '构图',
      type: 'select',
      default: 'offset',
      options: [
        { value: 'offset', label: '偏置' },
        { value: 'band', label: '横带' },
        { value: 'column', label: '竖栏' },
      ],
    },
    { key: 'circleSize', label: '圆的大小', type: 'range', min: 0.5, max: 1.6, step: 0.05, default: 1 },
    { key: 'textBars', label: '字块密度', type: 'range', min: 0, max: 1, step: 0.05, default: 0.4 },
    { key: 'showGrid', label: '显示网格', type: 'toggle', default: true },
  ],

  presets: [
    {
      id: 'zurich',
      label: '苏黎世',
      elements: {
        bg: { paint: { type: 'solid', color: '#efece5' } },
        block_a: { paint: { type: 'solid', color: '#c4473a' } },
        block_b: { paint: { type: 'solid', color: '#23262b' } },
        circle: { paint: { type: 'solid', color: '#e2b04a' } },
        rule: { paint: { type: 'solid', color: '#23262b' }, opacity: 0.85 },
        grid: { paint: { type: 'solid', color: '#23262b' }, opacity: 0.08 },
      },
    },
    {
      id: 'basel',
      label: '巴塞尔',
      elements: {
        bg: { paint: { type: 'solid', color: '#e9ebea' } },
        block_a: { paint: { type: 'solid', color: '#2f5d8a' } },
        block_b: { paint: { type: 'solid', color: '#b9c4cc' } },
        circle: { paint: { type: 'solid', color: '#d9694f' } },
        rule: { paint: { type: 'solid', color: '#1f2a36' }, opacity: 0.8 },
        grid: { paint: { type: 'solid', color: '#1f2a36' }, opacity: 0.07 },
      },
      params: { layout: 'band' },
    },
    {
      id: 'night-press',
      label: '夜印',
      elements: {
        bg: { paint: { type: 'solid', color: '#1c1e22' } },
        block_a: { paint: { type: 'solid', color: '#b9503f' } },
        block_b: { paint: { type: 'solid', color: '#e6e0d3' } },
        circle: { paint: { type: 'solid', color: '#6d8fa8' } },
        rule: { paint: { type: 'solid', color: '#e6e0d3' }, opacity: 0.7 },
        grid: { paint: { type: 'solid', color: '#e6e0d3' }, opacity: 0.07 },
      },
      params: { layout: 'column' },
    },
    {
      id: 'graphite',
      label: '石墨',
      elements: {
        bg: { paint: { type: 'solid', color: '#e4e2dd' } },
        block_a: { paint: { type: 'solid', color: '#3b3d40' } },
        block_b: { paint: { type: 'solid', color: '#9a9893' } },
        circle: { paint: { type: 'solid', color: '#c9c4ba' } },
        rule: { paint: { type: 'solid', color: '#2b2c2e' }, opacity: 0.8 },
        grid: { paint: { type: 'solid', color: '#2b2c2e' }, opacity: 0.06 },
      },
      params: { circleSize: 1.3 },
    },
  ],

  paletteSlots: {
    bg: ['bg'],
    primary: ['block_a'],
    secondary: ['block_b'],
    accent: ['circle'],
    detail: ['rule', 'grid'],
  },

  render(_def, cfg: ResolvedConfig, _api: RenderApi): RenderResult {
    const { width: W, height: H, params, elements, rng } = cfg;
    const C = Math.round(clampNum(params.cols, 4, 20));
    const circleK = clampNum(params.circleSize, 0.3, 2);
    const textAmt = clampNum(params.textBars, 0, 1);
    const showGrid = params.showGrid === true;
    const layout = String(params.layout);

    const q = Math.round((Math.min(W, H) / V) * 1e4) / 1e4;
    const Wv = W / q;
    const Hv = H / q;

    // ── 网格：页边距 + C 栏 + 方形模块行（行高 = 栏宽 + 栏距，行数取整后余量并入下边距）──
    const mg = Math.min(Wv, Hv) * 0.07;
    const gut = (Wv - 2 * mg) / C / 6; // 栏距 = 栏宽的约 1/5
    const cw = (Wv - 2 * mg - gut * (C - 1)) / C;
    const pitch = cw + gut;
    const R = Math.max(4, Math.floor((Hv - 2 * mg + gut) / pitch));
    const top = (Hv - (R * pitch - gut)) / 2;
    const colX = (c: number): number => mg + c * pitch; // 第 c 栏左缘（c 可等于 C → 右边距线）
    const rowY = (r: number): number => top + r * pitch;
    const spanW = (n: number): number => n * pitch - gut;

    const E = (id: string) => elements.get(id)!;
    const bg = E('bg');
    const A = E('block_a');
    const B = E('block_b');
    const O = E('circle');
    const rule = E('rule');
    const grid = E('grid');

    const rnd = (lo: number, hi: number): number => lo + Math.floor(rng() * (Math.max(lo, hi) - lo + 1));
    const rf = (lo: number, hi: number): number => lo + rng() * (hi - lo);
    // 水平镜像只作用于块面 / 圆 / 线的位置；字块始终左对齐（齐左右不齐是国际主义排版的本分）
    const flipX = rng() < 0.5;
    const portrait = Hv > Wv;

    interface Box {
      x: number;
      y: number;
      w: number;
      h: number;
    }
    /** 字区：以栏 / 行为单位；cols = 每栏字块占几栏，maxCols = 最多可分几栏排。 */
    interface TextArea {
      c: number;
      r0: number;
      r1: number;
      cols: number;
      maxCols: number;
    }
    let a: Box;
    let b: Box;
    let circ: { cx: number; cy: number; r: number };
    let ta: TextArea;
    let hairV: { x: number; y0: number; y1: number };
    let heavyY: number;
    let square: { c: number; r: number };

    if (layout === 'band') {
      // 横带：主块是一条出血到左右的宽横带；窄竖色带从横带下沿落到底边；圆压在横带上沿
      const rh = Math.max(2, Math.round(R * rf(portrait ? 0.16 : 0.24, portrait ? 0.24 : 0.34)));
      const r0 = rnd(Math.max(1, Math.floor(R * 0.12)), Math.max(1, Math.floor(R * 0.3)));
      a = { x: 0, y: rowY(r0), w: Wv, h: spanW(rh) };
      const tCols = Math.max(2, Math.round(C * (portrait ? 0.4 : 0.22)));
      const bc = Math.min(C - 1, rnd(Math.floor(C * 0.55), C - 2));
      b = { x: colX(bc), y: rowY(r0 + rh), w: cw * 0.6, h: Hv - rowY(r0 + rh) };
      const cc = rnd(Math.max(1, Math.floor(C * 0.12)), Math.floor(C * 0.45));
      const onTop = rng() < 0.6;
      circ = { cx: colX(cc), cy: onTop ? rowY(r0) : rowY(r0 + rh) - gut, r: pitch * rf(1.4, 1.9) * circleK };
      ta = { c: 0, r0: r0 + rh + 1, r1: R - 1, cols: tCols, maxCols: Math.max(1, Math.floor((bc - 1) / (tCols + 1))) };
      hairV = { x: colX(bc + 1) + cw / 2, y0: rowY(r0 + rh + 1), y1: rowY(R) };
      heavyY = rowY(Math.max(0, r0 - 1)) + pitch * 0.4;
      square = { c: C - 1, r: Math.max(0, r0 - 2) };
    } else if (layout === 'column') {
      // 竖栏：主块是出血到上下的宽竖栏；横向细色带从竖栏右缘伸出到画边；圆咬在竖栏右缘
      const span = Math.max(2, Math.round(C * rf(portrait ? 0.38 : 0.24, portrait ? 0.5 : 0.34)));
      const c0 = rnd(0, Math.max(0, Math.floor(C * 0.18)));
      a = { x: colX(c0), y: 0, w: spanW(span), h: Hv };
      const br = rnd(Math.floor(R * 0.5), Math.floor(R * 0.72));
      const ax = colX(c0 + span) - gut;
      b = { x: ax, y: rowY(br), w: Wv - ax, h: pitch * 0.32 };
      const cr = rnd(1, Math.max(1, Math.floor(R * 0.35)));
      circ = { cx: ax, cy: rowY(cr) + pitch * 0.5, r: pitch * rf(1.3, 1.8) * circleK };
      const tc = c0 + span + 2;
      const tCols = Math.max(2, Math.round(C * (portrait ? 0.3 : 0.18)));
      ta = { c: tc, r0: br + 1, r1: R - 1, cols: tCols, maxCols: Math.max(1, Math.floor((C - tc + 1) / (tCols + 1))) };
      hairV = { x: colX(C - 1) - gut / 2, y0: rowY(0), y1: rowY(br) - gut };
      heavyY = rowY(br) - gut - pitch * 0.25;
      square = { c: C - 1, r: R - 1 };
    } else {
      // 偏置：主块出血到左上角；圆咬在主块的一角或一边；窄竖色带出血到底边；字块排在主块右侧
      const span = Math.max(2, Math.round(C * rf(portrait ? 0.5 : 0.34, portrait ? 0.66 : 0.46)));
      const rows = Math.max(2, Math.round(R * rf(portrait ? 0.32 : 0.5, portrait ? 0.42 : 0.66)));
      a = { x: 0, y: 0, w: colX(span) - gut, h: rowY(rows) - gut };
      const spot = Math.floor(rng() * 3); // 0 右下角 / 1 右缘中段 / 2 下缘中段
      const cxs = [a.w, a.w, colX(Math.max(1, Math.round(span * 0.55)))];
      const cys = [a.h, rowY(Math.max(1, Math.round(rows * 0.45))), a.h];
      circ = { cx: cxs[spot], cy: cys[spot], r: pitch * rf(1.4, 1.9) * circleK };
      const tCols = Math.max(2, Math.round(C * (portrait ? 0.3 : 0.17)));
      // 字区起点让开圆的外凸部分（圆在右缘时）
      const over = spot === 2 ? 0 : Math.max(0, circ.cx + circ.r - a.w);
      const tc = Math.min(C - tCols, span + 1 + Math.ceil(over / pitch));
      const room = C - tc;
      const maxCols = Math.max(1, Math.floor((room - 1) / (tCols + 1)));
      const bc = Math.min(C - 1, tc + Math.min(maxCols, 2) * (tCols + 1));
      b = { x: colX(bc), y: rowY(Math.max(1, rows - rnd(1, 3))), w: cw * 0.5, h: Hv };
      b.h = Hv - b.y;
      // 竖屏：右侧过窄，字块改排到主块下方
      ta = portrait
        ? { c: 0, r0: rows + 3, r1: R - 1, cols: Math.max(2, Math.round(C * 0.42)), maxCols: 2 }
        : { c: tc, r0: 1, r1: Math.min(R - 1, rows + 2), cols: tCols, maxCols: Math.max(1, Math.min(maxCols, Math.floor((bc - tc) / (tCols + 1)))) };
      hairV = { x: colX(bc) - gut / 2 - cw * 0.25, y0: rowY(Math.max(1, rows + 2)), y1: rowY(R) };
      heavyY = rowY(0) + pitch * 0.15;
      square = { c: portrait ? C - 1 : C - 1, r: R - 1 };
    }

    // ── 绘制 ────────────────────────────────────────────────
    const parts: string[] = [rect(0, 0, W, H, { fill: bg.paintValue, 'fill-opacity': bg.opacity })];
    let inner = '';
    const fx = (x: number, w = 0): number => (flipX ? Wv - x - w : x);

    // 网格线：每栏左右缘（细竖线）+ 行线，单条 path（对称，无需镜像）
    if (showGrid && grid.visible) {
      let d = '';
      for (let c = 0; c <= C; c++) {
        const x = colX(c);
        d += `M${ri(x)} 0V${ri(Hv)}`;
        if (c < C) d += `M${ri(x + cw)} 0V${ri(Hv)}`;
      }
      for (let r = 0; r <= R; r++) d += `M0 ${ri(rowY(r))}H${ri(Wv)}`;
      inner += `<path d="${d}" fill="none" stroke="${grid.paintValue}" stroke-opacity="${op(grid.opacity)}" stroke-width="1.2"/>`;
    }

    const box = (bx: Box, e: typeof A): string =>
      e.visible ? `<rect x="${ri(fx(bx.x, bx.w))}" y="${ri(bx.y)}" width="${ri(bx.w)}" height="${ri(bx.h)}" fill="${e.paintValue}" fill-opacity="${op(e.opacity)}"/>` : '';
    inner += box(a, A);
    inner += box(b, B);
    if (O.visible) {
      inner += `<g fill="${O.paintValue}" fill-opacity="${op(O.opacity)}"><circle cx="${ri(fx(circ.cx))}" cy="${ri(circ.cy)}" r="${ri(circ.r)}"/>` +
        `<rect x="${ri(fx(colX(square.c), cw))}" y="${ri(rowY(square.r))}" width="${ri(cw)}" height="${ri(cw)}"/></g>`;
    }

    // 细线 + 无字排版块（先抽随机再决定画不画）
    let d = `M${ri(fx(hairV.x))} ${ri(hairV.y0)}V${ri(hairV.y1)}`;
    let thick = `M${ri(colX(0))} ${ri(heavyY)}H${ri(colX(C) - gut)}`;
    const tLine = pitch / 4;
    // 密度同时决定组数与每组行数（字区窄时组数受限，行数仍随密度变化）
    const groupsN = textAmt <= 0 ? 0 : 1 + Math.round(textAmt * 5);
    const wFull = spanW(ta.cols);
    let tcol = 0;
    let yCur = rowY(ta.r0);
    const yEnd = rowY(ta.r1 + 1) - gut;
    for (let gI = 0; gI < groupsN; gI++) {
      const lines = 2 + Math.round(textAmt * 4) + Math.floor(rng() * 2);
      const need = tLine * (1.6 + lines);
      if (yCur + need > yEnd) {
        // 本栏排满 → 换到下一栏字区（栏距 1 栏）
        tcol++;
        yCur = rowY(ta.r0);
        if (tcol >= ta.maxCols || yCur + need > yEnd) break;
      }
      const cx0 = colX(ta.c + tcol * (ta.cols + 1));
      const x0 = flipX ? Wv - cx0 - wFull : cx0;
      thick += `M${ri(x0)} ${ri(yCur)}H${ri(x0 + wFull * rf(0.35, 0.6))}`;
      yCur += tLine * 1.6;
      for (let l = 0; l < lines; l++) {
        const wl = l === lines - 1 ? wFull * rf(0.3, 0.7) : wFull * rf(0.82, 1);
        d += `M${ri(x0)} ${ri(yCur)}H${ri(x0 + wl)}`;
        yCur += tLine;
      }
      yCur += tLine * 1.8;
    }
    if (rule.visible) {
      const ro = op(rule.opacity);
      inner += `<g fill="none" stroke="${rule.paintValue}" stroke-opacity="${ro}"><path d="${d}" stroke-width="${ri(Math.max(2, pitch * 0.045))}"/>` +
        `<path d="${thick}" stroke-width="${ri(Math.max(4, pitch * 0.11))}"/></g>`;
    }

    parts.push(`<g transform="scale(${q})">${inner}</g>`);
    return { body: parts.join('') };
  },
};

export default def;
