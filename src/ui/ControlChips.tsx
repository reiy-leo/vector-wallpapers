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
import { Tabs } from '@cloudflare/kumo/components/tabs';
import { IconChevron, IconSliders } from './icons';
import { setParam, usePatternDef, useWorkbenchSelector } from './store';
import { Button, SliderChip } from './primitives';
import type { ControlDef } from '../patterns/types';
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
          // 子元素一律 pointer-events-none：点到图标/计数/箭头时事件目标仍是按钮本身，
          // 否则点右侧箭头区域弹层不响应（Rei 2026-10-12）
          <Button variant="secondary" size="sm" aria-label="形态参数" className="*:pointer-events-none">
            <IconSliders size={15} />
            参数
            <span className="font-mono text-[0.9em] text-fg-mute">{count}</span>
            <IconChevron dir="up" size={13} />
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
      className="grid w-80 gap-y-3"
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
  const selects = controls.filter((c) => c.type === 'select');
  const switches = controls.filter((c) => c.type === 'toggle');
  return [...sliders, ...selects, ...switches];
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

  if (control.type === 'select') {
    // 离散选项也收进弹层：标签在上、kumo segmented 分段单选在下（Rei 2026-10-12）
    return (
      <div className="grid min-w-0 gap-1.5">
        <span className="text-base text-fg-soft">{control.label}</span>
        <Tabs
          variant="segmented"
          className="w-full rounded-md"
          listClassName="rounded-md"
          indicatorClassName="rounded-sm"
          value={String(value)}
          onValueChange={(v) => setParam(control.key, String(v))}
          tabs={control.options.map((o) => ({
            value: o.value,
            label: o.label,
            className: 'flex-1 justify-center',
          }))}
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
