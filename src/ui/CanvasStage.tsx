/**
 * ② 预览画布（中栏）—— 工作台的视觉主角。
 *
 * 三条关键设计：
 *  1. **画布优先于控件**。用户第一眼看到的是作品本身，而不是一堆参数 ——
 *     这是「壁纸生成器」而不是「图形编辑器」的区别。
 *  2. **预览与导出共用同一份 `renderStandaloneSVG` 产物**。
 *     缩略图、大图、下载、PNG 全部走这一条路径，不可能出现不一致。
 *  3. **形态参数紧贴画布**。调线宽/密度这类操作必须「边看边拧」，
 *     所以参数行贴在画布正下方（见ControlChips），而不是甩到右栏。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { LIMITS, SIZE_PRESETS } from '../shared/constants';
import { clamp } from '../shared/guards';
import { renderStandaloneSVG, createDefaultConfig } from '../engine/render';
import { svgToDataUri } from '../shared/download';
import { setConfig, setSize, setUI, usePatternDef, useWorkbenchSelector } from './store';
import { shuffleCurrent } from './Panels';
import { applyTone, bgTone, type BgTone } from './coloring';
import { Button, IconButton, Segmented, Tooltip, inputClass } from './primitives';
import { ControlsPopover, DiscreteChips } from './ControlChips';
import { ProductActions } from './ProductActions';
import {
  IconClose,
  IconFocus,
  IconGrid,
  IconInfo,
  IconMoon,
  IconReset,
  IconShuffle,
  IconSun,
} from './icons';
import type { ColorStrategy } from '../engine/colors';
import type { PatternConfig } from '../engine/types';
import type { NoticeFn } from './TopBar';

export function CanvasStage({
  strategy,
  onNotice,
}: {
  strategy: ColorStrategy;
  onNotice: NoticeFn;
}) {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);
  const focus = useWorkbenchSelector((s) => s.ui.focus);
  const grid = useWorkbenchSelector((s) => s.ui.grid);

  /**
   * rAF 节流渲染（PRD P0-5：改动 < 100ms 反映到画布）。
   *
   * 拖动滑块时 `change` 事件每帧触发多次，若每次都同步渲染 SVG，
   * 主线程会被字符串拼接占满，反而拖慢反馈。
   * 用 rAF 合并同帧内的多次变更 —— 一帧最多渲染一次。
   */
  const [svg, setSvg] = useState('');
  const [metrics, setMetrics] = useState({ bytes: 0, nodes: 0 });
  const frame = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const out = renderStandaloneSVG(def, cfg, { skipBudget: true });
      setSvg(out);
      setMetrics({ bytes: measureBytes(out), nodes: countNodes(out) });
    });
    return () => cancelAnimationFrame(frame.current);
  }, [def, cfg]);

  const uri = useMemo(() => (svg ? svgToDataUri(svg) : ''), [svg]);

  const overBudget = metrics.bytes > LIMITS.MAX_SVG_BYTES;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 标题条：左边母题名 + 描述，右边「对这张图做什么」的产物动作。
          换一版 / 分享 / 导出 与当前画面绑定，放在名称行右上角，紧贴画面且一眼可见。 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
        <div className="grid min-w-0 gap-1">
          {/* ⭐ Kumo heading-case：sentence case */}
          <h1 className="text-lg font-semibold text-fg">{def.name}</h1>
          <p className="text-sm text-fg-soft">
            {def.description}
            <code className="ml-2 font-mono text-[0.9em] text-fg-mute">{def.id}</code>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip content="换 seed + 按当前策略重排配色">
            <Button variant="secondary" size="sm" onClick={() => shuffleCurrent(strategy)}>
              <IconShuffle size={15} />
              换一版
            </Button>
          </Tooltip>
          <ProductActions onNotice={onNotice} />
        </div>
      </div>

      {/* 画布区 */}
      <div ref={stageRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5">
        {uri === '' ? (
          <p className="text-base text-fg-mute">渲染中…</p>
        ) : (
          <img
            ref={imgRef}
            src={uri}
            alt={`${def.name} 预览`}
            // 用 aspect-ratio 而非固定宽高：容器尺寸变化时图片自动跟随，
            // 且 ratio 来自配置，切换 16:10 / 16:9 无需改 DOM
            className="vw-stage max-h-full max-w-full rounded-md shadow-canvas"
            style={{ aspectRatio: `${cfg.width} / ${cfg.height}` }}
          />
        )}

        {/* 栅格叠加：精确贴合图片盒子（而非整块舞台），
            否则用户看到的参考线会与壁纸边缘错位，失去参考价值 */}
        {grid && uri !== '' && <GridOverlay target={imgRef} />}

        {/* 主题切换：贴在**图片**右上角而非容器右上角 —— 主题改变的是
            「这张图看起来多亮」，把它放在舞台角上会让用户把作用域
            误读成「整个应用」。容器角在图片未铺满时离图很远。 */}
        {!focus && uri !== '' && <ThemeSwitchOverlay target={imgRef} />}

        {/* 聚焦模式：整张 SVG 按窗口尺寸重新渲染并撑满视口，右上角关闭 */}
        {focus && <FocusOverlay onClose={() => setUI({ focus: false })} />}
      </div>

      {/* ───────────────────────────────────────────────────────────
          工具条：单行。
            左：画布（尺寸）｜ 参数上拉列表（kumo Popover）+ 模式（离散选项）
            右：诊断（体积/节点）+ 视图动作
          ─────────────────────────────────────────────────────────── */}
      <div className="grid shrink-0 gap-3 border-t border-line px-5 py-3">
        {/* 行① */}
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <SizeSelect cfg={cfg} onChange={setSize} />

          {/* 竖分隔线：尺寸是「画布」，右边是「内容」的模式选项 */}
          <div aria-hidden="true" className="hidden h-6 w-px shrink-0 bg-line sm:block" />

          <ControlsPopover />
          <DiscreteChips />

          <div className="ml-auto flex items-center gap-3">
            {/* 体积/节点：纯诊断信息，与可点物用分隔线隔开 */}
            <p
              className={`flex items-center gap-1 whitespace-nowrap font-mono text-[0.9em] ${
                overBudget ? 'text-danger' : 'text-fg-mute'
              }`}
            >
              <IconInfo size={13} />
              {(metrics.bytes / 1024).toFixed(1)} KB / {(LIMITS.MAX_SVG_BYTES / 1024).toFixed(0)} KB
              <span>· {metrics.nodes} 节点</span>
            </p>
            <div aria-hidden="true" className="h-6 w-px shrink-0 bg-line" />
            <div className="flex items-center gap-1">
            <Tooltip content={grid ? '隐藏栅格' : '显示栅格'}>
                <IconButton
                  label={grid ? '隐藏栅格' : '显示栅格'}
                  aria-pressed={grid}
                  className={grid ? 'bg-brand-tint text-brand' : ''}
                  onClick={() => setUI({ grid: !grid })}
                >
                  <IconGrid size={16} />
                </IconButton>
              </Tooltip>

              <Tooltip content={focus ? '退出聚焦' : '聚焦预览'}>
                <IconButton
                  label={focus ? '退出聚焦' : '聚焦预览'}
                  aria-pressed={focus}
                  className={focus ? 'bg-brand-tint text-brand' : ''}
                  onClick={() => setUI({ focus: !focus })}
                >
                  <IconFocus size={16} />
                </IconButton>
              </Tooltip>

              <Tooltip content="恢复当前母题的默认配置">
                <IconButton
                  label="恢复默认"
                  onClick={() => {
                    const base = createDefaultConfig(def, {
                      width: cfg.width,
                      height: cfg.height,
                      seed: cfg.seed,
                    });
                    setConfig(base);
                    onNotice('已恢复默认配置', 'info');
                  }}
                >
                  <IconReset size={16} />
                </IconButton>
              </Tooltip>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 聚焦预览 —— 全视口浮层。
 *
 * ⭐ 不是把画布图片放大（那会裁切或留黑边），而是**按当前窗口宽高重新渲染整张 SVG**：
 * 母题的所有尺寸都按 W/H 比例计算，所以得到的就是「这张壁纸铺在这块屏幕上」的真实样子，
 * 无裁切、无留边。只影响预览，不改动用户选的导出尺寸（cfg 不变）。
 * Esc 或右上角按钮关闭。
 */
function FocusOverlay({ onClose }: { onClose: () => void }) {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);
  const [view, setView] = useState(() => viewportSize());

  useEffect(() => {
    const onResize = () => setView(viewportSize());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const uri = useMemo(() => {
    const svg = renderStandaloneSVG(def, { ...cfg, width: view.w, height: view.h }, { skipBudget: true });
    return svgToDataUri(svg);
  }, [def, cfg, view]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${def.name} 聚焦预览`}
      className="fixed inset-0 z-[100] bg-canvas"
    >
      <img src={uri} alt={`${def.name} 全屏预览`} className="block h-full w-full" />
      <IconButton
        autoFocus
        label="关闭聚焦预览（Esc）"
        className="absolute right-4 top-4 rounded-full bg-surface/80 text-fg shadow-pop backdrop-blur hover:bg-surface"
        onClick={onClose}
      >
        <IconClose size={18} />
      </IconButton>
    </div>
  );
}

function viewportSize() {
  return {
    w: clamp(Math.round(window.innerWidth), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION),
    h: clamp(Math.round(window.innerHeight), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION),
  };
}

/**
 * 主题切换浮层 —— 贴图片右上角内侧。
 *
 * ⭐ 必须**跟随图片盒子**而非舞台容器：容器 `items-center` + 图片
 * `max-h-full` 意味着图片常常不铺满容器（比例不同时尤其明显），
 * 挂在容器右上角会飘在图片外面，用户看不出它管的是哪张图。
 *
 * 与栅格叠加共用同一套 ResizeObserver 定位逻辑 —— 两者的锚点必须一致，
 * 否则会出现「栅格对得上、按钮对不上」的错位。
 */
function ThemeSwitchOverlay({ target }: { target: React.RefObject<HTMLImageElement | null> }) {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);
  const box = useImageBox(target);

  if (box.w === 0 || !def) return null;
  const tone = bgTone(cfg, def);

  return (
    // 与栅格同一套定位：先做一个与图片盒子等大的居中框，再贴它的右上角
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="false">
      <div className="relative" style={{ width: box.w, height: box.h }}>
      <div className="pointer-events-auto absolute right-3 top-3 shadow-pop">
        <Segmented
          label="壁纸底色"
          size="sm"
          value={tone}
          onChange={(t) => setConfig(applyTone(cfg, def, t as BgTone))}
          options={[
            { value: 'light', label: '', icon: <IconSun size={14} />, title: '浅底' },
            { value: 'dark', label: '', icon: <IconMoon size={14} />, title: '深底' },
          ]}
        />
      </div>
      </div>
    </div>
  );
}

/** 跟踪图片盒子尺寸 —— 栅格与主题浮层共用，保证两者锚点一致。 */
function useImageBox(target: React.RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = target.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const r = entry.contentRect;
      setBox({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [target]);

  return box;
}

/**
 * 尺寸选择。
 *
 * 用原生 `<select>` 而非自绘下拉：原生控件在移动端会调起系统选择器，
 * 在桌面端支持键盘导航与读屏，且零体积。项目已有 MUI 但为这一个控件
 * 引入整套 Select 的成本高于收益。
 */
function SizeSelect({
  cfg,
  onChange,
}: {
  cfg: PatternConfig;
  onChange: (w: number, h: number) => void;
}) {
  const current = `${cfg.width}x${cfg.height}`;
  const known = SIZE_PRESETS.some((p) => `${p.w}x${p.h}` === current);

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor="vw-size" className="shrink-0 whitespace-nowrap text-base text-fg-soft">
        尺寸
      </label>
      <select
        id="vw-size"
        value={known ? current : 'custom'}
        onChange={(e) => {
          if (e.target.value === 'custom') return;
          const [w, h] = e.target.value.split('x').map(Number);
          onChange(w, h);
        }}
        className={inputClass('shrink-0')}
      >
        {!known && <option value="custom">自定义 {cfg.width}×{cfg.height}</option>}
        {groupByDevice(SIZE_PRESETS).map(([group, list]) => (
          <optgroup key={group} label={group}>
            {list.map((p) => (
              <option key={p.label} value={`${p.w}x${p.h}`}>
                {p.label} · {p.ratio}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <CustomSizeInput cfg={cfg} onChange={onChange} />
    </div>
  );
}

/** 自定义宽高 —— PRD P0-4 要求 64~7680 任意整数。 */
function CustomSizeInput({
  cfg,
  onChange,
}: {
  cfg: PatternConfig;
  onChange: (w: number, h: number) => void;
}) {
  return (
    <>
      <input
        type="number"
        value={cfg.width}
        min={LIMITS.MIN_DIMENSION}
        max={LIMITS.MAX_DIMENSION}
        aria-label="宽度（像素）"
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v > 0) {
            onChange(clamp(Math.round(v), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION), cfg.height);
          }
        }}
        className={inputClass('vw-number w-[4.5rem] shrink-0 tabular-nums')}
      />
      <span className="text-sm text-fg-mute" aria-hidden="true">
        ×
      </span>
      <input
        type="number"
        value={cfg.height}
        min={LIMITS.MIN_DIMENSION}
        max={LIMITS.MAX_DIMENSION}
        aria-label="高度（像素）"
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v) && v > 0) {
            onChange(cfg.width, clamp(Math.round(v), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION));
          }
        }}
        className={inputClass('vw-number w-[4.5rem] shrink-0 tabular-nums')}
      />
    </>
  );
}

/** 按设备分组，让下拉列表符合用户「先按设备想、再按比例选」的习惯。 */
function groupByDevice(
  presets: readonly (typeof SIZE_PRESETS)[number][],
): Array<[string, typeof SIZE_PRESETS[number][]]> {
  const order = ['mac', 'desktop', 'tablet', 'mobile'];
  const labels: Record<string, string> = {
    mac: 'Mac',
    desktop: '桌面',
    tablet: '平板',
    mobile: '手机',
  };
  return order
    .map((g) => [labels[g] ?? g, presets.filter((p) => p.group === g)] as [string, typeof SIZE_PRESETS[number][]])
    .filter(([, list]) => list.length > 0);
}

/**
 * 规则网格（九宫格 + 中心十字），精确覆盖图片盒子。
 *
 * 用 ResizeObserver 跟踪图片尺寸而不是把栅格和图片塞进同一个 flex 容器 ——
 * 后者会让栅格的 33.333% 基于**容器**而非**图片**计算，
 * 一旦图片因比例不同而没有铺满容器，参考线就会明显偏位。
 */
function GridOverlay({ target }: { target: React.RefObject<HTMLImageElement | null> }) {
  const box = useImageBox(target);

  if (box.w === 0 || box.h === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden="true">
      <div className="relative rounded-md" style={{ width: box.w, height: box.h }}>
        {/* 三分线 */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(to right, rgba(250,250,250,0.22) 1px, transparent 1px),' +
              'linear-gradient(to bottom, rgba(250,250,250,0.22) 1px, transparent 1px)',
            backgroundSize: '33.3333% 33.3333%',
          }}
        />
        {/* 中心十字（视觉重心） */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-[rgba(250,250,250,0.34)]" />
        <div className="absolute inset-y-0 left-1/2 w-px bg-[rgba(250,250,250,0.34)]" />
      </div>
    </div>
  );
}

/**
 * 与引擎 `measure()` 同口径的字节统计。
 *
 * ⚠️ 必须用 TextEncoder：`String.length` 是 UTF-16 码元数，
 * 而 SVG 里含中文 aria-label，两者算出的字节数不同 ——
 * 用 .length 会让体积显示偏小，用户据此判断「有没有超红线」时就不可信了。
 */
function measureBytes(svg: string): number {
  return new TextEncoder().encode(svg).length;
}

/** body 下的图形节点数 —— 复杂度的心跳指标。 */
function countNodes(svg: string): number {
  return (svg.match(/<(rect|circle|path|line|polygon|ellipse|g)\b/g) ?? []).length;
}
