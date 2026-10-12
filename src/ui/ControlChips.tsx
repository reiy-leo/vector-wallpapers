/**
 * 形态参数 chip 组 —— 工具条专用的形态参数行。
 *
 * ⭐ 与 `ParamPanel` 共用同一份 `ControlDef` 契约（架构铁律 10）：
 * 本文件不含任何母题 id 或参数 key 字面量，新增母题无需改动。
 *
 * 为什么从右栏搬到工具条：
 * 母题的形态参数（线宽、密度、起伏…）是**「看着画面调」**的行为 ——
 * 用户必须一边看预览一边拧参数，放在右栏等于让眼睛在 360px 外反复横跳。
 * 搬到画布正下方后，参数与被它改变的那张图处于同一视觉带内。
 *
 * 但右栏的「参数」Tab 不能因此空掉：那里保留 `随机种子`
 * （它服务于「复现/分享」，属配置而非形态）与全部参数的长说明。
 */
import { useMemo } from 'react';
import { Popover } from '@cloudflare/kumo/components/popover';
import { Switch } from '@cloudflare/kumo/components/switch';
import { IconSliders } from './icons';
import { setParam, usePatternDef, useWorkbenchSelector } from './store';
import { Button, SliderChip, inputClass } from './primitives';
import type { ControlDef, ParamValue } from '../patterns/types';
import type { PatternConfig } from '../engine/types';

/**
 * 工具条上的紧凑控件组。
 *
 * 控件数量不定（各母题 2~6 个），因此：
 *  - range → `SliderChip`（标签+条+值 横向一行）
 *  - select / toggle / angle → 退化为 chip 或原生 select，
 *    塞进工具条时**统一降级为单行紧凑形态**，绝不撑高整条工具栏。
 */
/**
 * 形态参数「上拉列表」：工具条里只留一个按钮，点开后向上弹出 kumo Popover，
 * 滑块在里面竖排对齐。工具条因此恒为一行，不再随母题参数个数忽高忽低。
 */
export function ControlsPopover() {
  const def = usePatternDef();
  const count = useMemo(() => visibleControls(def.controls).length, [def.controls]);
  if (count === 0) return null;
  return (
    <Popover>
      <Popover.Trigger
        render={
          <Button variant="secondary" size="sm" aria-label="形态参数">
            <IconSliders size={15} />
            参数
            <span className="font-mono text-[0.9em] text-fg-mute">{count}</span>
          </Button>
        }
      />
      <Popover.Content side="top" sideOffset={8}>
        <ControlChips />
      </Popover.Content>
    </Popover>
  );
}

export function ControlChips() {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);

  const controls = useMemo(() => visibleControls(def.controls), [def.controls]);

  if (controls.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="形态参数"
      className="grid w-72 gap-y-3"
    >
      {controls.map((c) => (
        <ControlChip key={c.key} control={c} cfg={cfg} />
      ))}
    </div>
  );
}

/**
 * 上拉列表里展示 range / angle 滑块，以及 toggle 开关（kumo Switch）。
 * toggle 收进这里，工具条不再出现「隔条换色」这类外置按钮（Rei 2026-10-12）。
 * 滑块在前、开关在后，保持「连续调节 → 开关」的阅读顺序。
 */
function visibleControls(controls: readonly ControlDef[]): readonly ControlDef[] {
  const sliders = controls.filter((c) => c.type === 'range' || c.type === 'angle');
  const switches = controls.filter((c) => c.type === 'toggle');
  return [...sliders, ...switches];
}

function ControlChip({ control, cfg }: { control: ControlDef; cfg: PatternConfig }) {
  const value = cfg.params[control.key];

  if (control.type === 'angle') {
    return (
      <SliderChip
        label={control.label}
        value={Number(value)}
        min={0}
        max={359}
        step={1}
        format={(v) => `${v}°`}
        showValue={false}
        onChange={(v) => setParam(control.key, v)}
      />
    );
  }

  if (control.type === 'toggle') {
    return (
      // 与滑块同一套「标签左 / 控件右」对齐：标签样式同滑块，开关贴右
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="truncate text-base text-fg-soft">{control.label}</span>
        <Switch
          aria-label={control.label}
          size="sm"
          checked={value === true}
          onCheckedChange={(v) => setParam(control.key, v)}
        />
      </div>
    );
  }

  if (control.type !== 'range') return null;

  return (
    <SliderChip
      label={control.label}
      value={Number(value)}
      min={control.min}
      max={control.max}
      step={control.step}
      format={(v) => (control.unit ? `${v}${control.unit}` : String(v))}
      showValue={false}
      onChange={(v) => setParam(control.key, v)}
    />
  );
}

/**
 * 离散形态选项（select / toggle）—— 与滑块分开一行。
 *
 * 之所以不塞进滑块行：离散项的数量不固定，若与滑块混排，
 * 工具条会在换行时把「连续调节」与「模式切换」搅在一起，
 * 用户难以形成「这一段是调形状、这一段是选模式」的分段认知。
 */
export function DiscreteChips() {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);

  const controls = useMemo(
    () => def.controls.filter((c) => c.type === 'select'),
    [def.controls],
  );

  if (controls.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="形态选项"
      className="flex min-w-0 flex-wrap items-center gap-2"
    >
      {controls.map((c) => (
        <DiscreteChip key={c.key} control={c} cfg={cfg} />
      ))}
    </div>
  );
}

function DiscreteChip({ control, cfg }: { control: ControlDef; cfg: PatternConfig }) {
  const value = cfg.params[control.key];
  const set = (v: ParamValue) => setParam(control.key, v);

  if (control.type !== 'select') return null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <label htmlFor={`chip-${control.key}`} className="text-base text-fg-soft">
        {control.label}
      </label>
      <select
        id={`chip-${control.key}`}
        value={String(value)}
        onChange={(e) => set(e.target.value)}
        className={inputClass('shrink-0')}
      >
        {control.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}