/**
 * Kumo Slider —— 移植自 Kumo 官方组件（cloudflare/kumo main 分支
 * packages/kumo/src/components/slider/slider.tsx，文档 https://kumo-ui.com/components/slider）。
 *
 * 为什么是移植而不是 import：npm 上最新的 @cloudflare/kumo（2.14.0）还没有发布 Slider 组件，
 * 只有无样式的 primitives/slider。等 Kumo 发布后，直接换成
 * `import { Slider } from '@cloudflare/kumo/components/slider'` 并删掉本文件。
 *
 * 与官方实现的差异（Rei 2026-10-14）：不渲染 label、拇指下方的数值徽标和两端的 min/max 文字；
 * 只保留单拇指。样式（凹陷轨道 + 浮起的已填充段 + 带握把竖线的拇指）与官方一致，
 * 颜色全部走 kumo token（theme.css 已把 kumo token 桥接到 --vw-*）。
 */
import { Slider as BaseSlider } from '@cloudflare/kumo/primitives/slider';

export function KumoSlider({
  id,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  disabled = false,
  size = 'sm',
  ariaLabel,
  valueText,
  className = '',
}: {
  id?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  size?: 'sm' | 'base';
  ariaLabel?: string;
  valueText?: string;
  className?: string;
}) {
  const track = size === 'sm' ? 'h-6 rounded-md' : 'h-8 rounded-lg';
  // 比轨道圆角小一档，内嵌圆角保持同心
  const inner = size === 'sm' ? 'rounded' : 'rounded-md';
  return (
    <BaseSlider.Root
      value={value}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      thumbAlignment="edge"
      orientation="horizontal"
      onValueChange={(v) => onChange(Array.isArray(v) ? Number(v[0]) : Number(v))}
      className={`flex w-full min-w-0 flex-col data-disabled:opacity-50 ${className}`}
    >
      {/* padding 放在外层：Base UI 按 control 全宽百分比定位 edge 拇指，padding 放 control 上会让拇指越过两端 */}
      <div className={`bg-kumo-recessed p-[3px] ring ring-kumo-line ${track}`}>
        <BaseSlider.Control className="h-full">
          <BaseSlider.Track className="relative h-full">
            <BaseSlider.Indicator
              className={`box-content! bg-kumo-overlay pr-2 shadow-sm ring ring-kumo-line ${inner}`}
            />
            <BaseSlider.Thumb
              id={id}
              getAriaLabel={ariaLabel ? () => ariaLabel : undefined}
              getAriaValueText={valueText ? () => valueText : undefined}
              className={`group h-full w-4 cursor-grab outline-none has-focus-visible:ring-2 has-focus-visible:ring-kumo-focus data-disabled:cursor-not-allowed data-dragging:cursor-grabbing ${inner}`}
            >
              <span
                aria-hidden
                className="absolute top-1/2 left-1/2 h-1/2 w-0.5 -translate-1/2 rounded-full bg-kumo-contrast/25"
              />
            </BaseSlider.Thumb>
          </BaseSlider.Track>
        </BaseSlider.Control>
      </div>
    </BaseSlider.Root>
  );
}
