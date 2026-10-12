/**
 * UI 原语 —— 无样式框架依赖的最小组件集。
 *
 * 每条 Kumo 规则的落点都在下方逐条标注，评审时可直接对照。
 */
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { IconCheck, IconChevron, IconClose } from './icons';

/* ─────────────────────────────────────────────────────────────────
 * 面板容器
 * ───────────────────────────────────────────────────────────────── */

/**
 * 区块容器。
 *
 * ⭐ Kumo `layer-card-nesting`：**绝不** LayerCard 套 LayerCard。
 * 因此这里刻意不含标题 —— 有标题的区块用 `<Section>`（纯文本 + 内容），
 * 无标题的用本组件（只有一圈 ring）。两者混用会导致卡片套卡片。
 *
 * ⭐ Kumo `shadow-borders`：用 ring 而非 border，保持边缘锐利。
 * 阴影只留给浮层（Dialog / Popover），不与描边同时出现。
 *
 * ⭐ Kumo `text-spacing`：px-5 py-4 而非 p-5 —— 垂直方向视觉更紧，
 * 因为行高留白会让 20px 看起来像 28px。
 */
export function LayerCard({
  children,
  className = '',
  ...rest
}: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`rounded-lg bg-surface px-5 py-4 ring-1 ring-line ${className}`} {...rest}>
      {children}
    </div>
  );
}

/**
 * 带标题的区块。标题与内容的间距**小于**区块与外界的间距
 * （Kumo `related-text-spacing`：相关内容靠得更近）。
 */
export function Section({
  title,
  hint,
  action,
  children,
  className = '',
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`grid gap-2.5 ${className}`}>
      {/* gap-6（区块与外界）远大于内部 gap-2.5（标题与内容） */}
      <div className="flex items-baseline justify-between gap-3">
        <div className="grid gap-1">
          {/* ⭐ Kumo `heading-case`：sentence case，绝不 capitalize */}
          <h2 className="text-md font-semibold text-fg">{title}</h2>
          {hint ? <p className="text-sm text-fg-soft">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 按钮
 * ───────────────────────────────────────────────────────────────── */

/**
 * ⭐ 控件高度阶梯 —— 全站只有三档，写在token 层而不是散落在各组件。
 *
 * 背景：本项目一度同时存在 26 / 28 / 30 / 32 / 36 / 38px 六种控件高度
 * （Segmented sm=28、Button sm=32、Button md=36、CategoryTab≈26、
 * 色板按钮≈28、合集缩略图 40…），肉眼能看出「有的控件比旁边的重」。
 * Kumo 的 `shadow-borders` 讲描边，但**高度不一致造成的视觉重量差**
 * 同属一类问题，且规范里没有对应条目 —— 只能自己定死。
 *
 * 三档的语义边界：
 *  - `CONTROL_H` (32px)：**正文控件层**。工具条、面板、卡片内的一切可点物。
 *  - `CHIP_H`   (28px)：**标签层**。分类筛选 pill 这类「比按钮轻一档」的筛选器。
 *  - `CONTROL_H_LG` (36px)：**浮层内主动作**。对话框底部，横跨更宽的点击面。
 */
export const CONTROL_H = 'h-8';
export const CHIP_H = 'h-7';
export const CONTROL_H_LG = 'h-9';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-sm font-medium ' +
  // ⭐ Kumo `hover-color-transitions`：绝不加 transition-colors。
  // 快速交互上的颜色渐变会让界面显「黏」，颜色必须瞬时切换。
  // 只保留一个极短的 transform 过渡（按下反馈），不影响颜色。
  'transition-transform duration-75 active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-45';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover',
  // ⭐ secondary 用 `ring-line` 而非 `ring-line-input`：描边的深浅是**层级信号**，
  //   3:1 的 line-input 只留给表单输入框（WCAG 1.4.11 的对比度义务）。
  //   按钮的边界靠填充色差（surface-2 / surface）就足够，深描边会显脏。
  secondary: 'bg-surface-2 text-fg hover:bg-surface-3',
  ghost: 'text-fg-soft hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-on-brand hover:brightness-110',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  // ⭐ Kumo `content-text-size`：按钮文字一律 14px（text-base），
  // sm 与 md 的区别只在**高度与内边距**，不在字号。
  //
  // ⚠️ 此前 sm 写的是 text-sm(13px)，而它上方的注释恰好写着「按钮文字 14px，
  // 不用 13px」—— 注释与代码自相矛盾。而既有门禁只拦 ≥16px，
  // 13px 这一侧完全无人看守，于是错误长期存活。
  sm: `${CONTROL_H} px-3 text-base`,
  md: `${CONTROL_H_LG} px-4 text-base`,
};

/**
 * 图标按钮的方盒尺寸。
 *
 * ⭐ 用**正方形**而非「h-8 w-9」这类不等值：icon-alignment 要求图标与文字
 * 首行对齐，而方盒是「图标独占一行」的情况——此时两轴不等会让图标视觉重心偏移。
 */
const ICON_BOX: Record<ButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-9 w-9',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * 纯图标按钮。
 *
 * ⚠️ `label` 不是可选项：没有无障碍名称的图标按钮对读屏软件等于不存在。
 * 视觉上不显示 label，但 `aria-label` 与原生 `title` 都会带上（后者给鼠标 hover 提示）。
 */
export function IconButton({
  label,
  size = 'sm',
  className = '',
  children,
  ...rest
}: { label: string; size?: ButtonSize; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const box = ICON_BOX[size];
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`${BUTTON_BASE} ${BUTTON_VARIANT.ghost} ${box} shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * 开关式图标按钮（切换态）。
 *
 * ⭐ 选中态用 `bg-brand-tint + text-brand` 而非实心填充：
 * 母题库里同时可能有多个「开」的状态（收藏、分类、栅格），
 * 实心蓝块会让用户分不清「当前选中」和「已激活的筛选器」。
 */
export function ToggleIconButton({
  label,
  active,
  className = '',
  children,
  ...rest
}: { label: string; active: boolean; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <IconButton
      label={label}
      aria-pressed={active}
      className={[
        active ? 'bg-brand-tint text-brand' : 'text-fg-mute',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </IconButton>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 分段控件
 * ───────────────────────────────────────────────────────────────── */

/**
 * 分段控件（互斥选项，如主题、取色策略）。
 *
 * ⭐ 外观对齐 kumo `Tabs` 的 segmented 变体（同一视觉语言，保留 radiogroup 语义）：
 *   轨道 bg-surface-3 + 细 ring，选中段 = 白底 + shadow-sm + ring-line。
 * ⭐ Kumo `concentric-border-radius`：外圈 rounded-md(8px) + p-0.5(2px)
 * → 内圈必须是 6px（rounded-sm）。
 *
 * ⭐ 高度与 `CONTROL_H` 对齐（32px），此前 sm 档是 28px ——
 * 与旁边的 32px 按钮并排时，整组控件会显得「矮一截、显轻」。
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  size = 'md',
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon?: ReactNode; title?: string }>;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex shrink-0 rounded-md bg-surface-3 p-0.5 ring-1 ring-line"
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title ?? o.label}
            onClick={() => onChange(o.value)}
            className={[
              // 同Kumo `content-text-size`：sm 只缩高度，字号固定 14px
              'inline-flex items-center justify-center gap-1.5 rounded-sm font-medium',
              // 轨道含 p-0.5，内段高度 = 轨道档位 − 4px，整体仍落在 32 / 36 两档
              size === 'sm' ? 'h-7 px-2.5 text-base' : 'h-8 px-3 text-base',
              active
                ? 'bg-surface text-fg shadow-sm ring-1 ring-line'
                : 'text-fg-soft hover:text-fg',
            ].join(' ')}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 筛选 chip
 * ───────────────────────────────────────────────────────────────── */

/**
 * 筛选 chip（分类 tab 这类「二选一/多选一」的标签）。
 *
 * ⭐ 与 `Button` 的区别是**语义层级**而非外观：chip 表示「筛选当前列表」，
 * 不产生新内容也不离开当前位置，所以用 ghost 变体 + 圆角胶囊；
 * 而 Button 表示「执行动作」。两者并排时，chip 应当更轻。
 *
 * 高度用 `CHIP_H`(28px) 而非 `CONTROL_H`(32px)—— 与按钮并排时
 * 一档之差刚好表达层级，不必靠颜色区分。
 */
export function Chip({
  active,
  className = '',
  children,
  ...rest
}: { active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={[
        'shrink-0 whitespace-nowrap rounded-full px-2.5 font-medium',
        CHIP_H,
        'text-base',
        // ⭐ Kumo hover-color-transitions：颜色瞬时切换，绝不加 transition
        active ? 'bg-brand text-on-brand' : 'text-fg-soft hover:bg-surface-2 hover:text-fg',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 表单控件
 * ───────────────────────────────────────────────────────────────── */

/**
 * 输入框（通用）。
 *
 * ⭐ Kumo `kumo-input`：**白底 + 浅描边 + 聚焦内环**，三段式。
 * 本项目先前用的是「灰底 + 深描边」（bg-surface-2 + ring-line-input），
 * 那是为了满足 3:1 对比度而牺牲了 Kumo 的视觉语言 —— 结果输入框在界面里
 * 变成一个「挖下去的洞」，比按钮重得多。
 * 解法是**把对比度预算花在交互态而非静态态**：静态只留 ring-line（可分辨
 * 边界），聚焦时 ring-2 brand 给出 3:1 以上的可见焦点 —— 既满足 WCAG 1.4.11
 * 的「聚焦态可辨」，又不牺牲静态视觉。
 */
const INPUT_BASE =
  'w-full rounded-sm bg-surface text-sm text-fg ring-1 ring-line ' +
  'placeholder:text-fg-mute ' +
  // 聚焦：ring 变粗 + 品牌色（内环，不偏移，不与外层 outline 打架）
  'focus:ring-2 focus:ring-brand focus:outline-none';

/**
 * 供散落在各面板里的原生 `<select>` / `<input type=number>` 复用。
 *
 * ⚠️ 之所以导出而不是各自写：这些控件分散在CanvasStage / Panels 里，
 * 各写一遍必然出现「改了搜索框忘了改数字框」的漂移 —— 而输入框视觉
 * 一旦不统一，整屏就会同时出现两种控件语言。
 *
 * 调用方需自行覆盖宽度（如 `w-28`），因为 select / number 都按内容定宽。
 */
// ⚠️ 去掉 INPUT_BASE 里的 w-full：select / number 按内容定宽，w-full 会与调用方的 w-[4.5rem]
// 同为工具类、谁赢取决于产物顺序 —— 实测 number 框被 flex 压成 16px、select 撑满整行。
export const inputClass = (extra = '') =>
  [INPUT_BASE.replace('w-full ', ''), 'h-8 px-2', extra].filter(Boolean).join(' ');

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`h-8 px-2.5 ${INPUT_BASE} ${className}`} {...rest} />;
}

/**
 * 搜索框。
 *
 * ⭐ Kumo `kumo-input`：白底浅描边、32px 高、14px 文字、6px 圆角；
 * 聚焦时 ring 加粗为品牌色（见 INPUT_BASE 的说明）。
 *
 * ⭐ Kumo `icon-alignment`：图标用 `h-lh` 与文字**首行**对齐。
 * 搜索框是单行控件，此处 h-lh 等于 21px，与 14px/1.5 的行高一致。
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex h-lh items-center text-fg-mute">
        <SearchGlyph />
      </span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={[
          INPUT_BASE,
          'h-8 pl-7.5 pr-7',
          // 去掉 Safari search 域自带的清除按钮，我们自己放一个
          '[&::-webkit-search-cancel-button]:appearance-none',
        ].join(' ')}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-1.5 flex h-lh items-center text-fg-mute hover:text-fg"
        >
          <IconClose size={13} />
        </button>
      )}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </svg>
  );
}

/**
 * 滑块行。
 *
 * ⭐ Kumo `related-text-spacing`：标签与滑块属于一组，用 gap-1.5；
 * 整行与其它控件之间由父级 gap-6 拉开。
 *
 * ⭐ Kumo `inline-monospace-size`：数值是等宽字体，混排时缩到 0.9em，
 * 否则比周围文字「重」一圈。
 */
export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
  disabled = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-base text-fg-soft">
          {label}
        </label>
        <code className="font-mono text-[0.9em] text-fg-mute">{format ? format(value) : String(value)}</code>
      </div>
      <input
        id={id}
        type="range"
        className="vw-slider"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/**
 * 横向滑块 chip —— 工具条专用的紧凑形态。
 *
 * 与 `SliderField`（竖排：标签在上、条在下）是**同一语义控件的两种摆放**，
 * 不是两个组件：竖排用于面板（有整列宽度），横排用于工具条（宽度紧张）。
 * 数值永远可见 —— 拖动时没有数字等于没在调。
 *
 * ⭐ Kumo `icon-alignment` / `inline-monospace-size`：数值用等宽并缩到 0.9em，
 * 否则滑块右端会随数字位数变化而抖动（1→10 时列宽跳动）。
 */
export function SliderChip({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  const text = format ? format(value) : String(value);
  // ⭐ tabular-nums：数字等宽，否则滑块拖动时右侧数值列会左右抖动
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="shrink-0 text-base text-fg-soft">
        {label}
      </label>
      <input
        id={id}
        type="range"
        className="vw-slider w-24 shrink-0"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <code className="w-11 shrink-0 text-right font-mono text-[0.9em] tabular-nums text-fg-mute">
        {text}
      </code>
    </div>
  );
}

/** 开关。原生 checkbox 视觉不可控，这里自绘但保留真实的 input 以维持可访问性。 */
export function Switch({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-base text-fg-soft">
        {label}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={[
          'relative h-5 w-9 shrink-0 rounded-full',
          checked ? 'bg-brand' : 'bg-surface-3 ring-1 ring-line-input',
          disabled ? 'opacity-45' : '',
        ].join(' ')}
      >
        {/* 只对位置做过渡；背景色瞬时切换（Kumo hover-color-transitions） */}
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-sm transition-transform duration-150 ${
            checked ? 'translate-x-4.5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 折叠区块
 * ───────────────────────────────────────────────────────────────── */

/**
 * ⭐ Kumo `collapse-content-size`：折叠时内层容器保持 `w-full`，
 * 让内容尺寸在动画过程中保持稳定，不会出现「收起时文字被压扁」的抖动。
 *
 * `defaultOpen` 而非 `open` + `onToggle`：折叠面板的开关状态是
 * **组件内部的事务**（每次展开都想从头看），不属于页面的全局状态 ——
 * 让调用方托管只会催生一堆 `const [x, setX] = useState(false)` 样板。
 */
export function Collapsible({
  title,
  defaultOpen = false,
  count,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  count?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 rounded-sm py-1 text-left text-fg-mute hover:text-fg"
      >
        <IconChevron dir={open ? 'down' : 'right'} size={14} />
        <span className="text-base font-medium text-fg-soft">{title}</span>
        {count !== undefined && <span className="text-2xs text-fg-mute">{count}</span>}
      </button>
      {open && (
        // w-full + min-w-0 是 Kumo 规则的核心：防止内容在宽度动画中变形
        <div id={id} className="grid w-full min-w-0 gap-2 pt-2">
          {children}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 浮层：Tooltip / Dialog
 * ───────────────────────────────────────────────────────────────── */

/**
 * 轻量 tooltip。
 *
 * ⭐ Kumo `dialog-rendering` 的同源要求：**不条件渲染**。
 * 这里刻意不用 `open &&`，而是始终挂载、用 CSS 控制显隐 ——
 * 否则无法做淡入动画，且每次显示都要重新测量定位。
 */
export function Tooltip({
  content,
  children,
  side = 'top',
}: {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom';
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={[
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap',
          'rounded-xs bg-fg px-2 py-1 text-xs text-fg-inverse opacity-0',
          'transition-opacity duration-100 group-hover/tt:opacity-100 group-focus-within/tt:opacity-100',
          side === 'top' ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
        ].join(' ')}
      >
        {content}
      </span>
    </span>
  );
}

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * 模态对话框。
 *
 * ⭐ Kumo `dialog-rendering`：**绝不条件渲染**。
 * `<Dialog.Root open={open}>` 始终挂载，动画才有意义；
 * 条件挂载会让开合动画失效（每次都是「突然出现」）。
 * 这里用 `hidden` 属性控制可见性 —— 元素一直在 DOM 里，
 * 但不可聚焦、不可被读屏软件读到，符合无障碍预期。
 */
export function Dialog({ open, onClose, title, description, children, footer }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Esc 关闭 —— 只在打开时绑定，避免污染全局快捷键
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // 打开时把焦点移入面板，关闭时归还给触发元素
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    return () => prev?.focus?.();
  }, [open]);

  return (
    <div
      hidden={!open}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="presentation"
    >
      {/* 遮罩点击关闭； stopPropagation 防止点遮罩时触发面板内的关闭 */}
      <div className="absolute inset-0 bg-overlay" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        // ⭐ shadow-pop 只用在浮层上，且**不与 ring 同时出现**（Kumo shadow-borders）
        className="relative w-full max-w-lg rounded-lg bg-surface p-5 shadow-pop focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="grid gap-1">
            <h2 className="text-md font-semibold text-fg">{title}</h2>
            {description ? <p className="text-sm text-fg-soft">{description}</p> : null}
          </div>
          <IconButton label="关闭" size="sm" onClick={onClose}>
            <IconClose size={15} />
          </IconButton>
        </div>
        <div className="mt-4 grid gap-4">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 状态提示
 * ───────────────────────────────────────────────────────────────── */

type ToastTone = 'info' | 'success' | 'warning' | 'danger';

const TOAST_TONE: Record<ToastTone, string> = {
  info: 'text-fg-soft',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export function Toast({
  message,
  tone = 'info',
  onDismiss,
}: {
  message: string | null;
  tone?: ToastTone;
  onDismiss: () => void;
}) {
  // ⭐ 永不条件渲染 —— 元素常驻，用 data-show 控制显隐，
  // 这样入场动画不会因为「首次渲染时已显示」而丢失。
  const shown = message !== null;
  return (
    <div
      role="status"
      aria-live="polite"
      data-show={shown}
      className={[
        'pointer-events-auto flex items-start gap-2 rounded-lg bg-surface px-3.5 py-2.5 shadow-pop',
        'ring-1 ring-line transition-opacity duration-200',
        shown ? 'opacity-100' : 'opacity-0',
      ].join(' ')}
    >
      {tone === 'success' && <IconCheck size={16} className={`mt-px shrink-0 ${TOAST_TONE[tone]}`} />}
      <p className={`text-sm ${TOAST_TONE[tone]}`}>{message ?? ''}</p>
      <button
        type="button"
        aria-label="关闭提示"
        onClick={onDismiss}
        className="ml-1 shrink-0 text-fg-mute hover:text-fg"
      >
        <IconClose size={14} />
      </button>
    </div>
  );
}

/** 可访问的隐藏说明，供 aria-describedby 引用。 */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="vw-sr-only">{children}</span>;
}

/** 计数徽标 —— 纯装饰性元信息，用 11px（Kumo 允许的非正文档位）。 */
export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-surface-3 px-1.5 py-px text-2xs tabular-nums text-fg-mute">
      {children}
    </span>
  );
}

/** 把回调绑定到 Enter / Space 的通用 hook（供自定义按钮复用）。 */
export function useEnterSpace(onActivate: () => void): (e: React.KeyboardEvent) => void {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onActivate();
      }
    },
    [onActivate],
  );
}
