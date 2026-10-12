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
import { setParam, usePatternDef, useWorkbenchSelector } from './store';
import { Chip, SliderChip, inputClass } from './primitives';
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
export function ControlChips() {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);

  const controls = useMemo(() => visibleControls(def.controls), [def.controls]);

  if (controls.length === 0) return null;

  return (
    <div
      role="group"
      aria-label="形态参数"
      className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-x-8 gap-y-2"
    >
      {controls.map((c) => (
        <ControlChip key={c.key} control={c} cfg={cfg} />
      ))}
    </div>
  );
}

/** 只展示 range / angle：它们是工具条唯一「拧一下就有反馈」的形态。 */
function visibleControls(controls: readonly ControlDef[]): readonly ControlDef[] {
  return controls.filter((c) => c.type === 'range' || c.type === 'angle');
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
        onChange={(v) => setParam(control.key, v)}
      />
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
    () => def.controls.filter((c) => c.type === 'toggle' || c.type === 'select'),
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

  if (control.type === 'toggle') {
    return (
      <Chip active={value === true} onClick={() => set(value !== true)}>
        {control.label}
      </Chip>
    );
  }

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