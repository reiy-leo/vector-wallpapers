/**
 * ③ 元件级配色面板 —— 本产品的核心差异化（PRD P0-2）。
 *
 * 设计取舍：
 *  1. **默认折叠**。19 个母题有 4~12 个元件，全展开会让右栏变成一面墙，
 *     用户找不到起点。折叠态是一个 44px 的色块行，一屏能扫到 8~10 个元件 ——
 *     「看得全」比「一次改完」更重要，因为多数时候用户只想改一两个。
 *  2. **色块是主角**。元件的颜色是这个产品里唯一「有内容」的控件，
 *     所以给它最大的点击面积与最高的对比度，其余控件退为灰度。
 *  3. **锁定用中性色表达**。锁定是「保护用户的选择」，
 *     用品牌蓝会暗示「这是一个被激活的特性」，反而制造噪音。
 *
 * ⭐ 铁律：**元件列表 100% 由 `PatternDef.elements` 生成**，UI 层零硬编码。
 * 新增母题不需要改动本文件任何一行（`purity.guard.test.ts` 对此有门禁）。
 */
import { useState } from 'react';
import { isHexColor } from '../shared/guards';
import { isGradient, paintColors } from '../engine/colors';
import { usePatternDef, useWorkbenchSelector, patchElement } from './store';
import { CountBadge, IconButton, Section, SliderField, Tooltip } from './primitives';
import { IconEye, IconLock } from './icons';
import type { ElementConfig } from '../engine/types';
import type { ElementRole, PaintSpec } from '../patterns/types';

/** role 的中文显示名 —— 顺序与 CATEGORY_META 一致的语义分层。 */
const ROLE_LABEL: Record<ElementRole, string> = {
  bg: '底色',
  primary: '主色',
  secondary: '辅色',
  accent: '强调',
  detail: '细节',
};

export function ElementPanel() {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Section
      title="元件配色"
      hint="每个元件独立设色，这是本产品的核心能力"
      action={<CountBadge>{cfg.elements.length}</CountBadge>}
    >
      <ul className="grid gap-1">
        {cfg.elements.map((el) => {
          const spec = def.elements.find((d) => d.id === el.id);
          return (
            <ElementRow
              key={el.id}
              cfgEl={el}
              label={spec?.label ?? el.id}
              role={spec?.role ?? 'detail'}
              configurable={spec?.configurable !== false}
              expanded={expanded === el.id}
              onToggle={() => setExpanded((cur) => (cur === el.id ? null : el.id))}
            />
          );
        })}
      </ul>

    </Section>
  );
}

function ElementRow({
  cfgEl,
  label,
  role,
  configurable,
  expanded,
  onToggle,
}: {
  cfgEl: ElementConfig;
  label: string;
  role: ElementRole;
  configurable: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const colors = paintColors(cfgEl.paint);
  const gradient = isGradient(cfgEl.paint);
  const hex = colors[0] ?? '#888888';

  return (
    <li
      className={[
        'rounded-md ring-1',
        // ⭐ Kumo concentric-border-radius：展开态外框 8px + p-2(8px)，
        //   内层元素保持原有圆角即可（同心关系自然成立）
        expanded ? 'bg-surface-2 ring-line-strong' : 'bg-surface ring-line hover:bg-surface-2',
        !cfgEl.visible && 'opacity-55',
      ].join(' ')}
    >
      <div className="flex items-center gap-1.5 p-1.5">
        {/* 显隐 —— 走 IconButton 统一规格（32px 方盒 + ghost 变体），
            不再手写 <button>：手写一次就漂移一次，这是本项目反复出现的问题。 */}
        <Tooltip content={cfgEl.visible ? '隐藏该元件' : '显示该元件'}>
          <IconButton
            label={`${cfgEl.visible ? '隐藏' : '显示'} ${label}`}
            aria-pressed={!cfgEl.visible}
            className={cfgEl.visible ? 'text-fg-mute' : 'text-fg-mute'}
            onClick={() => patchElement(cfgEl.id, { visible: !cfgEl.visible })}
          >
            <IconEye off={!cfgEl.visible} size={16} />
          </IconButton>
        </Tooltip>

        {/* 锁定：随机配色时跳过该元件
            ⭐ 刻意用中性色而非品牌色表达「锁定」——
              锁定是保护性状态，不是需要被强调的特性 */}
        <Tooltip content={cfgEl.locked ? '解锁（参与「换一版」）' : '锁定（「换一版」时保持不变）'}>
          <IconButton
            label={`${cfgEl.locked ? '解锁' : '锁定'} ${label}`}
            aria-pressed={cfgEl.locked}
            className={cfgEl.locked ? 'bg-surface-3 text-fg-soft' : 'text-fg-mute'}
            onClick={() => patchElement(cfgEl.id, { locked: !cfgEl.locked })}
          >
            <IconLock open={!cfgEl.locked} size={16} />
          </IconButton>
        </Tooltip>

        {/* 色块 —— 本面板视觉主角，44px 点击区满足 WCAG 2.5.5 目标尺寸 */}
        <ColorSwatch
          colors={colors}
          size={36}
          disabled={!configurable}
          onPick={(c) => patchElement(cfgEl.id, { paint: withColor(cfgEl.paint, c) })}
        />

        {/* 名称 + 角色 */}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm px-1 py-1 text-left hover:bg-surface-2"
        >
          <span className="grid min-w-0 gap-0.5">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-base text-fg">{label}</span>
              <span className="shrink-0 text-2xs text-fg-mute">{ROLE_LABEL[role]}</span>
            </span>
            {/* Kumo inline-monospace-size：id 与中文混排 → 0.9em */}
            <code className="truncate font-mono text-[0.9em] text-fg-mute">{cfgEl.id}</code>
          </span>
        </button>

        {/* 展开更多：HEX 输入 + 不透明度 + 渐变色标 */}
        <IconButton
          label={expanded ? `收起 ${label} 的详细设置` : `展开 ${label} 的详细设置`}
          size="sm"
          onClick={onToggle}
          className={expanded ? 'text-fg' : 'text-fg-mute'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={expanded ? 'm6 9.5 6 6 6-6' : 'm9.5 6 6 6-6 6'} />
          </svg>
        </IconButton>
      </div>

      {expanded && (
        <div className="grid gap-2.5 border-t border-line px-3 py-2.5">
          <HexField
            value={hex}
            disabled={!configurable}
            onCommit={(c) => patchElement(cfgEl.id, { paint: withColor(cfgEl.paint, c) })}
          />

          <SliderField
            label="不透明度"
            value={cfgEl.opacity}
            min={0}
            max={1}
            step={0.01}
            format={(v) => v.toFixed(2)}
            onChange={(v) => patchElement(cfgEl.id, { opacity: v })}
          />

          {gradient && (
            <GradientStops
              paint={cfgEl.paint}
              onChange={(p) => patchElement(cfgEl.id, { paint: p })}
            />
          )}

          {cfgEl.paint.type === 'none' && (
            <p className="text-sm text-fg-mute">该元件不绘制任何图形，只能调整不透明度。</p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * 色块。
 *
 * ⭐ 用 1px 透明的真实 `<input type="color">` 覆盖在视觉色块上：
 * 既保留系统取色器（含键盘操作与读屏支持），又让外观完全由我们控制。
 * 渐变元件显示为 CSS 渐变，与画布里的呈现一致。
 */
function ColorSwatch({
  colors,
  size,
  disabled,
  onPick,
}: {
  colors: readonly string[];
  size: number;
  disabled?: boolean;
  onPick: (hex: string) => void;
}) {
  const background =
    colors.length > 1
      ? `linear-gradient(135deg, ${colors.join(', ')})`
      : colors[0] ?? '#888888';

  return (
    <span
      className={[
        'relative shrink-0 rounded-sm ring-1 ring-line-input',
        disabled ? 'cursor-not-allowed opacity-45' : 'cursor-pointer hover:ring-line-strong',
      ].join(' ')}
      style={{ width: size, height: size, background, backgroundSize: 'cover' }}
    >
      <input
        type="color"
        className="vw-color-native"
        value={isHexColor(colors[0] ?? '') ? colors[0] : '#888888'}
        disabled={disabled}
        aria-label="选择颜色"
        onChange={(e) => onPick(e.target.value)}
      />
    </span>
  );
}

/** HEX 输入。失焦或回车才提交 —— 逐字符提交会在输入中间态报错。 */
function HexField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (hex: string) => void;
}) {
  const [draft, setDraft] = useState(value);

  return (
    <div className="flex items-center gap-2">
      <label className="text-base text-fg-soft">色值</label>
      <input
        type="text"
        value={draft}
        disabled={disabled}
        spellCheck={false}
        aria-label="十六进制色值"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = draft.trim();
          if (isHexColor(v)) {
            onCommit(v.toLowerCase());
          } else {
            setDraft(value); // 非法输入回滚，不弹错误 —— 打字中途的中间态是正常的
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
        }}
        className={[
          'w-24 rounded-sm bg-surface-3 px-2 py-1 font-mono text-[0.9em] text-fg',
          'ring-1 ring-line-input hover:ring-line-strong',
          isHexColor(draft.trim()) ? '' : 'ring-danger',
        ].join(' ')}
      />
    </div>
  );
}

/** 渐变色标逐站编辑 —— DoD 要求「可在单色/线性/径向间切换并编辑色标」。 */
function GradientStops({
  paint,
  onChange,
}: {
  paint: PaintSpec;
  onChange: (p: PaintSpec) => void;
}) {
  if (paint.type !== 'linear' && paint.type !== 'radial') return null;

  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base text-fg-soft">色标</span>
        <span className="text-2xs text-fg-mute">
          {paint.type === 'linear' ? '线性渐变' : '径向渐变'} · {paint.stops.length} 站
        </span>
      </div>
      <ul className="grid gap-2">
        {paint.stops.map((stop, i) => (
          <li
            key={i}
            className="grid grid-cols-[auto_1fr] items-center gap-x-2.5 gap-y-1 rounded-sm bg-surface-3/40 px-2 py-1.5"
          >
            <ColorSwatch
              colors={[stop.color]}
              size={28}
              onPick={(c) =>
                onChange({
                  ...paint,
                  stops: paint.stops.map((s, j) => (i === j ? { ...s, color: c } : s)),
                })
              }
            />
            <SliderField
              label={`色标 ${i + 1}`}
              value={stop.offset}
              min={0}
              max={1}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) =>
                onChange({
                  ...paint,
                  stops: paint.stops.map((s, j) => (i === j ? { ...s, offset: v } : s)),
                })
              }
            />
          </li>
        ))}
      </ul>

      {/* 渐变角度：只有线性渐变有 */}
      {paint.type === 'linear' && (
        <SliderField
          label="角度"
          value={paint.angle}
          min={0}
          max={359}
          step={1}
          format={(v) => `${v}°`}
          onChange={(v) => onChange({ ...paint, angle: v })}
        />
      )}
    </div>
  );
}

function withColor(paint: PaintSpec, color: string): PaintSpec {
  if (paint.type === 'solid') return { type: 'solid', color };
  if (paint.type === 'linear' || paint.type === 'radial') {
    return { ...paint, stops: paint.stops.map((s, i) => (i === 0 ? { ...s, color } : s)) };
  }
  return paint;
}
