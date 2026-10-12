/**
 * PatternLab —— 本期的可视化验证载体。
 *
 * 定位：**开发期工具**，用于「先看到真实效果」。
 * T4 的正式工作台会在 `src/ui/` 下重建；本页刻意不引入状态层与 MUI，
 * 只用最小的 React state + Tailwind 布局，把以下几件事做到位：
 *  1. 左侧全部 pattern 的离屏渲染缩略图
 *  2. 右侧大画布实时预览（等比缩放，改元件颜色/ 参数立刻反映）
 *  3. 侧边元件配色面板（逐元件显隐 / 锁定 / 取色 / HEX / 不透明度）
 *  4. 顶部工具条：尺寸预设、seed、换一版、取色策略、PNG @3x 尺寸检查、下载 SVG、查看源码
 *  5. 预置合集一键套用（PRD Q7）
 *
 * 关键点：缩略图与预览**共用同一个 renderSVG**，因此不存在
 * 「缩略图好看但实际渲染不同」的偏差 —— 这正是 PRD P0-2 要消除的那类不一致。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { registry } from '../patterns';
import type { ElementRole, PatternDef, PatternPreset } from '../patterns/types';
import { CURATED_SETS, type SetItem } from '../patterns/sets';
import { PALETTES } from '../patterns/palettes';
import { createDefaultConfig, renderSVG } from '../engine/render';
import { recolorByRole, roleColors } from '../engine/elementStyle';
import { generateColors, type ColorStrategy } from '../engine/colors';
import { mulberry32 } from '../engine/rng';
import { LIMITS, SIZE_PRESETS } from '../shared/constants';
import { downloadText, exportFilename } from '../shared/download';
import { detectPlatform, guardCanvasSize, isHexColor, IOS_PNG_UNSUPPORTED_HINT } from '../shared/guards';
import type { ElementConfig, PatternConfig } from '../engine/types';

const THUMB_W = 240;
const THUMB_H = 135;

/** PRD Q5 决策：默认首屏 pattern = polka-dots（最轻、加载最快）。 */
const DEFAULT_PATTERN_ID = 'polka-dots';

/** 把 SVG 文本安全地注入 DOM：用 data URI 交给 <img>，天然隔离脚本。 */
function svgToDataUri(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)
    .replace(/'/g, '%27')
    .replace(/"/g, '%22')}`;
}

/** 离屏渲染缩略图。同一 def 的渲染结果被 useMemo 缓存，切pattern 不重复计算。 */
function useThumb(def: PatternDef): string {
  return useMemo(() => {
    const cfg = createDefaultConfig(def, { width: THUMB_W, height: THUMB_H, seed: 0 });
    return svgToDataUri(renderSVG(def, cfg, { animate: false }).svg);
  }, [def]);
}

function Thumb({ def, active, onSelect }: { def: PatternDef; active: boolean; onSelect: () => void }) {
  const uri = useThumb(def);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`选择 ${def.name}`}
      aria-pressed={active}
      className={[
        'group w-full rounded-lg border p-2 text-left transition-colors',
        active ? 'border-[var(--vw-brand)] bg-[var(--vw-panel-2)]' : 'border-[var(--vw-border)] hover:bg-[var(--vw-panel-2)]',
      ].join(' ')}
    >
      <img
        src={uri}
        alt={`${def.name} 预览`}
        width={THUMB_W}
        height={THUMB_H}
        className="w-full rounded"
        style={{ aspectRatio: `${THUMB_W} / ${THUMB_H}` }}
      />
      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-medium">{def.name}</span>
        <code className="shrink-0 text-[10px] text-[var(--vw-text-soft)]">{def.id}</code>
      </div>
    </button>
  );
}

/** 单个元件的配色行。渐变元件额外展开全部色标。 */
function ElementRow({
  name,
  cfgEl,
  defEl,
  onChange,
}: {
  name: string;
  cfgEl: ElementConfig;
  defEl: { label: string; configurable: boolean } | undefined;
  onChange: (patch: Partial<ElementConfig>) => void;
}) {
  const paint = cfgEl.paint;
  const isGradient = paint.type === 'linear' || paint.type === 'radial';

  /** 替换某个色标的颜色，保留渐变的其它参数（角度 / 圆心 / 半径）。 */
  const setStop = (index: number, color: string) => {
    if (!isGradient) return;
    const next = paint.stops.map((s, i) => (i === index ? { ...s, color } : s));
    onChange({
      paint:
        paint.type === 'linear'
          ? { type: 'linear', angle: paint.angle, stops: next }
          : { type: 'radial', cx: paint.cx, cy: paint.cy, r: paint.r, stops: next },
    });
  };

  return (
    <div className="rounded-lg border border-[var(--vw-border)] bg-[var(--vw-panel)] p-2.5">
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-[var(--vw-text-soft)]">
          <input
            type="checkbox"
            checked={cfgEl.visible}
            onChange={(e) => onChange({ visible: e.target.checked })}
            aria-label={`${name} 显隐`}
          />
          显示
        </label>

        <span className="min-w-0 flex-1 truncate text-sm font-medium">{defEl?.label ?? name}</span>

        <label className="flex items-center gap-1 text-xs text-[var(--vw-text-soft)]">
          <input
            type="checkbox"
            checked={cfgEl.locked}
            onChange={(e) => onChange({ locked: e.target.checked })}
            aria-label={`${name} 锁定`}
          />
          锁
        </label>

        <span className="text-[10px] uppercase text-[var(--vw-text-soft)]">{paint.type}</span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        {isGradient ? (
          <div className="flex flex-wrap gap-1.5">
            {paint.stops.map((s, i) => (
              <span key={i} className="inline-flex items-center gap-1">
                <input
                  type="color"
                  value={isHexColor(s.color) ? s.color : '#000000'}
                  onChange={(e) => setStop(i, e.target.value)}
                  aria-label={`${name} 色标 ${i + 1}`}
                  className="h-6 w-8 cursor-pointer rounded border border-[var(--vw-border)] bg-transparent"
                />
                <code className="text-[10px] text-[var(--vw-text-soft)]">{s.color}</code>
              </span>
            ))}
          </div>
        ) : paint.type === 'none' ? (
          <span className="text-xs text-[var(--vw-text-soft)]">不绘制</span>
        ) : paint.type === 'solid' ? (
          <>
            <input
              type="color"
              value={isHexColor(paint.color) ? paint.color : '#000000'}
              onChange={(e) => onChange({ paint: { type: 'solid', color: e.target.value } })}
              aria-label={`${name} 颜色`}
              className="h-7 w-10 cursor-pointer rounded border border-[var(--vw-border)] bg-transparent"
            />
            <input
              type="text"
              value={paint.color}
              onChange={(e) => onChange({ paint: { type: 'solid', color: e.target.value } })}
              aria-label={`${name} HEX`}
              spellCheck={false}
              className="w-24 rounded border border-[var(--vw-border)] bg-[var(--vw-bg)] px-1.5 py-1 font-mono text-xs"
            />
          </>
        ) : null}

        <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--vw-text-soft)]">
          α
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={cfgEl.opacity}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            aria-label={`${name} 不透明度`}
            className="w-20"
          />
          <code className="w-8 text-right">{cfgEl.opacity.toFixed(2)}</code>
        </label>
      </div>
    </div>
  );
}

/** 依据 ControlDef 自动生成参数控件 —— 与 T4 的 ParamControls 同一套元数据。 */
function ParamControls({ def, cfg, onParam }: {
  def: PatternDef;
  cfg: PatternConfig;
  onParam: (key: string, value: number | string | boolean) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {def.controls.map((c) => {
        const value = cfg.params[c.key];
        const label = (
          <span className="text-xs text-[var(--vw-text-soft)]">
            {c.label}
            {c.group ? <em className="ml-1 not-italic opacity-60">（{c.group}）</em> : null}
          </span>
        );
        if (c.type === 'range') {
          return (
            <label key={c.key} className="flex min-w-40 flex-1 flex-col gap-1">
              {label}
              <span className="flex items-center gap-2">
                <input
                  type="range"
                  min={c.min}
                  max={c.max}
                  step={c.step}
                  value={Number(value)}
                  onChange={(e) => onParam(c.key, Number(e.target.value))}
                  aria-label={c.label}
                  className="w-full"
                />
                <code className="w-14 shrink-0 text-right text-xs">{String(value)}</code>
              </span>
            </label>
          );
        }
        if (c.type === 'toggle') {
          return (
            <label key={c.key} className="flex items-center gap-1.5 pt-4 text-xs">
              <input
                type="checkbox"
                checked={value === true}
                onChange={(e) => onParam(c.key, e.target.checked)}
                aria-label={c.label}
              />
              {c.label}
            </label>
          );
        }
        if (c.type === 'select') {
          return (
            <label key={c.key} className="flex flex-col gap-1">
              {label}
              <select
                value={String(value)}
                onChange={(e) => onParam(c.key, e.target.value)}
                aria-label={c.label}
                className="rounded border border-[var(--vw-border)] bg-[var(--vw-bg)] px-1.5 py-1 text-xs"
              >
                {c.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={c.key} className="flex min-w-32 flex-col gap-1">
            {label}
            <span className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={359}
                step={1}
                value={Number(value)}
                onChange={(e) => onParam(c.key, Number(e.target.value))}
                aria-label={c.label}
                className="w-full"
              />
              <code className="w-10 shrink-0 text-right text-xs">{String(value)}°</code>
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default function PatternLab() {
  const defs = useMemo(() => registry.list(), []);
  const initial = registry.get(DEFAULT_PATTERN_ID) ?? defs[0];

  const [activeId, setActiveId] = useState<string>(initial.id);
  const def = registry.get(activeId)!;

  const [cfg, setCfg] = useState<PatternConfig>(() => createDefaultConfig(initial, { seed: 7 }));
  const [showSource, setShowSource] = useState(false);
  const [strategy, setStrategy] = useState<ColorStrategy>('analogous');
  const [toast, setToast] = useState<string | null>(null);
  const [focusRole, setFocusRole] = useState<string>('accent');
  /**
   * 平台能力：iOS 不支持 PNG 导出（PRD Q8，用户决策）。
   *
   * ⭐ 为什么不写成模块级常量 `const isIOS = detectPlatform() === 'ios'`：
   * 那会在**模块求值时**就读取 navigator，构建期预渲染/SSR 环境下
   * 只能得到 desktop，注水到客户端后不会更新 —— 表现为「iPad 上按钮没灰掉」。
   *放进 state 并在挂载时读，客户端重渲染才会拿到真实平台。
   * 初始值给 'desktop'（SSR 安全的乐观默认），挂载后再校正。
   */
  const [platform, setPlatform] = useState<'ios' | 'desktop'>('desktop');
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);
  const frame = useRef(0);

  /**
   * 切换 pattern 的**唯一**入口。
   *
   * 刻意放在事件处理器里而不是 useEffect([def])：后者会在 applySet 同时
   * 改activeId 与 cfg 时，用默认值把刚套用的合集配色冲掉。
   */
  const selectPattern = useCallback((id: string) => {
    const next = registry.get(id);
    if (!next) return;
    setActiveId(id);
    setCfg(createDefaultConfig(next, { seed: 7 }));
  }, []);

  // toast 自动消失 —— 降级提示必须能被看到，但不该一直挡着界面
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 渲染节流：高频改色/拖滑块时用 rAF 合并同帧多次变更（PRD P0-5：<100ms 反馈）
  const [svg, setSvg] = useState('');
  const [budget, setBudget] = useState({ bytes: 0, nodes: 0 });
  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const out = renderSVG(def, cfg, { animate: false });
      setSvg(out.svg);
      setBudget({ bytes: out.bytes, nodes: out.nodes });
    });
    return () => cancelAnimationFrame(frame.current);
  }, [def, cfg]);

  const patchElement = useCallback((id: string, patch: Partial<ElementConfig>) => {
    setCfg((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }, []);

  const setParam = useCallback((key: string, value: number | string | boolean) => {
    setCfg((prev) => ({ ...prev, params: { ...prev.params, [key]: value } }));
  }, []);

  const applyPreset = useCallback(
    (preset: PatternPreset) => {
      setCfg((prev) => {
        const next = cloneConfig(prev);
        for (const e of next.elements) {
          const p = preset.elements[e.id];
          if (!p) continue;
          if (p.paint) e.paint = p.paint;
          if (p.opacity !== undefined) e.opacity = p.opacity;
        }
        if (preset.params) next.params = { ...next.params, ...preset.params };
        return next;
      });
    },
    [],
  );

  const resetAll = useCallback(() => {
    setCfg(createDefaultConfig(def, { seed: 7 }));
  }, [def]);

  /**
   * role 批量改色（PRD P0-2「点强调色 ×2 一次改多个同 role 元件」）。
   * 引擎侧的 recolorByRole 是纯函数，这里只负责把状态接上。
   */
  const setRoleColor = useCallback(
    (role: string, color: string) => {
      setCfg((prev) => recolorByRole(def, prev, role as ElementRole, { type: 'solid', color }));
    },
    [def],
  );

  /** 当前各 role 的代表色，供 role 色块显示。 */
  const currentRoleColors = useMemo(() => roleColors(def, cfg), [def, cfg]);

  /** 「换一版」：换 seed + 按当前策略重排配色（PRD P0-3）。 */
  const shuffle = useCallback(() => {
    setCfg((prev) => {
      const seed = (prev.seed + 1 + Math.floor(mulberry32(prev.seed + 17)() * 999)) % 1_000_000;
      return randomizeColors({ ...prev, seed }, def, strategy, seed);
    });
  }, [def, strategy]);

  /** 套用合集（PRD Q7）：切到该壁纸的 pattern 并整套应用其配色/参数/seed。 */
  const applySet = useCallback(
    (setId: string, itemIndex: number) => {
      const set = CURATED_SETS.find((s) => s.id === setId);
      const item = set?.items[itemIndex];
      if (!set || !item) return;
      const next = configFromSetItem(item, cfg.width, cfg.height);
      if (!next) return;
      setActiveId(item.patternId);
      setCfg(next);
    },
    [cfg.width, cfg.height],
  );

  const overBudget = budget.bytes > LIMITS.MAX_SVG_BYTES;

  return (
    <div className="flex h-full min-h-screen flex-col bg-[var(--vw-bg)] text-[var(--vw-text)]">
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--vw-border)] px-4 py-2.5">
        <h1 className="text-sm font-semibold">
          PatternLab
          <span className="ml-2 text-xs font-normal text-[var(--vw-text-soft)]">
            开发预览 · 渲染引擎与 {defs.length} 个 pattern
          </span>
        </h1>

        <select
          value={`${cfg.width}x${cfg.height}`}
          onChange={(e) => {
            const [w, h] = e.target.value.split('x').map(Number);
            setCfg((p) => ({ ...p, width: w, height: h }));
          }}
          aria-label="画布尺寸"
          className="rounded border border-[var(--vw-border)] bg-[var(--vw-panel)] px-2 py-1 text-xs"
        >
          {SIZE_PRESETS.map((s) => (
            <option key={s.label} value={`${s.w}x${s.h}`}>
              {s.label}（{s.ratio}）
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs">
          seed
          <input
            type="number"
            value={cfg.seed}
            onChange={(e) => setCfg((p) => ({ ...p, seed: Number(e.target.value) || 0 }))}
            aria-label="随机种子"
            className="w-24 rounded border border-[var(--vw-border)] bg-[var(--vw-panel)] px-1.5 py-1 font-mono"
          />
        </label>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className={`font-mono text-xs ${overBudget ? 'text-[var(--vw-danger)]' : 'text-[var(--vw-text-soft)]'}`}>
            {budget.bytes}B / {LIMITS.MAX_SVG_BYTES}B · {budget.nodes} 节点
          </span>
          <button
            type="button"
            onClick={shuffle}
            className="rounded border border-[var(--vw-border)] px-2 py-1 text-xs hover:bg-[var(--vw-panel-2)]"
          >
            ⟳ 换一版
          </button>
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as ColorStrategy)}
            aria-label="随机配色策略"
            title="PRD Q3：三档取色模式"
            className="rounded border border-[var(--vw-border)] bg-[var(--vw-panel)] px-1.5 py-1 text-xs"
          >
            <option value="analogous">邻近色（默认）</option>
            <option value="palette">仅当前色板</option>
            <option value="full">全色域 HSL</option>
          </select>
          <button
            type="button"
            onClick={() => downloadText(exportFilename(def.id, cfg.width, cfg.height, 'svg'), svg, 'image/svg+xml;charset=utf-8')}
            className="rounded border border-[var(--vw-border)] px-2 py-1 text-xs hover:bg-[var(--vw-panel-2)]"
          >
            下载 SVG
          </button>
          {/*
            * iOS 上不可用，但刻意不用原生 `disabled`。
            * 原生 disabled 的按钮不会派发 click，点了毫无反应，用户会以为按钮坏了；
            * 因此用 aria-disabled 表达不可用语义（读屏软件同样能识别），
            * 视觉上照常灰化，点击则给出明确说明。
            */}
      <button
            type="button"
          aria-disabled={platform === 'ios'}
        title={
              platform === 'ios'
      ? 'iOS 设备暂不支持 PNG 导出，请改用 SVG 或在桌面浏览器导出'
            : 'PRD Q8：检查 @3x PNG 是否会超出浏览器 canvas 上限'
       }
   onClick={() => {
              if (platform === 'ios') {
       setToast(IOS_PNG_UNSUPPORTED_HINT);
     return;
              }
   // PRD Q8：先过尺寸守卫，降级必须 toast 明示而非静默
      const g = guardCanvasSize(cfg.width, cfg.height, 3);
              if (g.notice) setToast(g.notice);
       else setToast(null);
            }}
            className={[
     'rounded border px-2 py-1 text-xs',
   platform === 'ios'
            ? 'cursor-not-allowed border-[var(--vw-border)] opacity-45'
            : 'hover:bg-[var(--vw-panel-2)]',
            ].join(' ')}
    >
            PNG @3x 检查
            {platform === 'ios' ? '（iOS 不支持）' : ''}
          </button>
          <button
            type="button"
            onClick={() => setShowSource((v) => !v)}
            aria-pressed={showSource}
            className="rounded border border-[var(--vw-border)] px-2 py-1 text-xs hover:bg-[var(--vw-panel-2)]"
          >
            {showSource ? '隐藏源码' : '查看源码'}
          </button>
        </div>
      </header>

      {toast ? (
        <div
          role="status"
          className="border-b border-[var(--vw-danger)] bg-[var(--vw-panel-2)] px-4 py-2 text-xs text-[var(--vw-danger)]"
        >
          {toast}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* 左：pattern 列表 */}
        <aside className="w-full shrink-0 overflow-y-auto border-b border-[var(--vw-border)] p-3 lg:w-64 lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
            {defs.map((d) => (
              <Thumb key={d.id} def={d} active={d.id === activeId} onSelect={() => selectPattern(d.id)} />
            ))}
          </div>
        </aside>

        {/* 中：大画布 */}
        <main className="flex min-w-0 flex-1 flex-col gap-3 p-3">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">{def.name}</h2>
              <p className="text-xs text-[var(--vw-text-soft)]">{def.description}</p>
            </div>
            <code className="shrink-0 text-xs text-[var(--vw-text-soft)]">{def.id} · {def.category}</code>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-[var(--vw-border)] bg-[var(--vw-panel)] p-3"
          >
            {svg ? (
              <img
                src={svgToDataUri(svg)}
                alt={`${def.name} 大图预览`}
                className="max-h-full max-w-full rounded shadow-lg"
                style={{ aspectRatio: `${cfg.width} / ${cfg.height}` }}
              />
            ) : (
              <span className="text-xs text-[var(--vw-text-soft)]">渲染中…</span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[var(--vw-text-soft)]">preset</span>
            {def.presets.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded border border-[var(--vw-border)] px-2 py-1 text-xs hover:bg-[var(--vw-panel-2)]"
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={resetAll}
              className="ml-auto rounded border border-[var(--vw-border)] px-2 py-1 text-xs hover:bg-[var(--vw-panel-2)]"
            >
              恢复默认
            </button>
          </div>

          <ParamControls def={def} cfg={cfg} onParam={setParam} />

          {showSource ? (
            <pre className="max-h-56 overflow-auto rounded-lg border border-[var(--vw-border)] bg-[var(--vw-panel)] p-2.5 font-mono text-[11px] leading-relaxed">
              {svg}
            </pre>
          ) : null}
        </main>

        {/* 右：元件配色面板 */}
        <aside className="w-full shrink-0 overflow-y-auto border-t border-[var(--vw-border)] p-3 lg:w-80 lg:border-t-0 lg:border-l">
          <h3 className="mb-2 text-sm font-semibold">元件配色（{def.elements.length}）</h3>
          <div className="flex flex-col gap-2">
            {cfg.elements.map((e) => (
              <ElementRow
                key={e.id}
                name={e.id}
                cfgEl={e}
                defEl={def.elements.find((d) => d.id === e.id)}
                onChange={(patch) => patchElement(e.id, patch)}
              />
            ))}
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--vw-text-soft)]">
            元件列表 100% 由 <code>PatternDef.elements</code> 生成 —— UI 层零硬编码，
            新增 pattern 无需改动本页任何一行。
          </p>

          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--vw-border)] pt-3">
            <h3 className="text-xs font-semibold text-[var(--vw-text-soft)]">
              role 批量改色（PRD P0-2）
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(def.paletteSlots).map(([role, members]) => {
                const paint = currentRoleColors[role as ElementRole];
                const hex = paint && paint.type === 'solid' ? paint.color : '#888888';
                const selected = focusRole === role;
                return (
                  <label
                    key={role}
                    className={`flex items-center gap-1.5 rounded border px-1.5 py-1 text-[11px] ${
                      selected
                        ? 'border-[var(--vw-brand)]'
                        : 'border-[var(--vw-border)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="vw-role"
                      checked={selected}
                      onChange={() => setFocusRole(role)}
                      aria-label={`选择 ${role} 批量改色`}
                      className="accent-[var(--vw-brand)]"
                    />
                    <span className="w-14">{role}</span>
                    <span className="text-[10px] text-[var(--vw-text-soft)]">×{members.length}</span>
                    <input
                      type="color"
                      value={isHexColor(hex) ? hex : '#888888'}
                      onChange={(e) => setRoleColor(role, e.target.value)}
                      aria-label={`批量设置 ${role} 颜色`}
                      className="h-5 w-7 cursor-pointer rounded border border-[var(--vw-border)] bg-transparent"
                    />
                  </label>
                );
              })}
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--vw-text-soft)]">
              拖动色块会一次改掉该 role 下的全部元件（如 accent 一次改 3 个），
              由引擎的 <code>recolorByRole</code> 纯函数完成。
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2 border-t border-[var(--vw-border)] pt-3">
            <h3 className="text-xs font-semibold text-[var(--vw-text-soft)]">
              预置合集（{CURATED_SETS.length} 套 · PRD Q7）
            </h3>
            <div className="flex flex-wrap gap-2">
              {CURATED_SETS.map((set) => (
                <div key={set.id} className="rounded border border-[var(--vw-border)] p-1.5">
                  <div className="px-0.5 text-[10px] text-[var(--vw-text-soft)]">{set.label}</div>
                  <div className="flex gap-1">
                    {set.items.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        title={`${item.patternId} · seed ${item.seed}`}
                        aria-label={`${set.label} 第 ${i + 1} 张`}
                        onClick={() => applySet(set.id, i)}
                        className={`h-5 w-5 rounded-sm border ${
                          def.id === item.patternId
                            ? 'border-[var(--vw-brand)] ring-1 ring-[var(--vw-brand)]'
                            : 'border-[var(--vw-border)]'
                        }`}
                        style={{ background: swatchOf(item) }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** 本地深拷贝，避免为lab 引入 engine 的 clone 依赖方向。 */
function cloneConfig(cfg: PatternConfig): PatternConfig {
  return {
    ...cfg,
    elements: cfg.elements.map((e) => ({
      ...e,
      paint:
        e.paint.type === 'solid' || e.paint.type === 'none'
          ? { ...e.paint }
          : { ...e.paint, stops: e.paint.stops.map((s) => ({ ...s })) },
    })),
    params: { ...cfg.params },
  };
}

/**
 * 把合集项展开为完整配置（PRD Q7）。
 * 未在 colors 中出现的元件沿用 PatternDef 默认值 —— 合集只需描述「差异」。
 */
function configFromSetItem(item: SetItem, width: number, height: number): PatternConfig | null {
  const def = registry.get(item.patternId);
  if (!def) return null;
  const cfg = createDefaultConfig(def, { width, height, seed: item.seed });
  for (const e of cfg.elements) {
    const paint = item.colors[e.id];
    if (paint) e.paint = paint;
  }
  if (item.params) cfg.params = { ...cfg.params, ...item.params };
  return cfg;
}

/**
 * 随机配色（PRD Q3策略 C，默认邻近色）。
 * 跳过 `locked` 元件 —— 这是「锁定」这个功能的全部意义。
 * 渐变元件只重写第一个色标，保留渐变类型与其它参数，避免破坏结构。
 */
function randomizeColors(
  cfg: PatternConfig,
  def: PatternDef,
  strategy: ColorStrategy,
  seed: number,
): PatternConfig {
  const next = cloneConfig(cfg);
  const rng = mulberry32(seed);

  const targets = next.elements.filter((e) => {
    const spec = def.elements.find((d) => d.id === e.id);
    return !e.locked && spec?.configurable !== false;
  });
  if (targets.length === 0) return next;

  // 基准色取当前底色，保证生成的一组色与既有调性相容
  const baseEl = next.elements.find((e) => def.elements.find((d) => d.id === e.id)?.role === 'bg');
  const base = baseEl && baseEl.paint.type === 'solid' ? baseEl.paint.color : '#5b8cff';

  const palette = PALETTES.flatMap((p) => Object.values(p.slots));
  const colors = generateColors(strategy, { base, count: targets.length, palette, rng });

  targets.forEach((e, i) => {
    const color = colors[i];
    if (e.paint.type === 'solid') {
      e.paint = { type: 'solid', color };
    } else if (e.paint.type === 'linear') {
      e.paint = { ...e.paint, stops: e.paint.stops.map((s, j) => (j === 0 ? { ...s, color } : s)) };
    } else if (e.paint.type === 'radial') {
      e.paint = { ...e.paint, stops: e.paint.stops.map((s, j) => (j === 0 ? { ...s, color } : s)) };
    }
  });
  return next;
}

/** 合集色块按钮的代表色：取该壁纸的底色，缺失时回落到中性灰。 */
function swatchOf(item: SetItem): string {
  for (const paint of Object.values(item.colors)) {
    if (paint.type === 'solid') return paint.color;
  }
  return '#888';
}