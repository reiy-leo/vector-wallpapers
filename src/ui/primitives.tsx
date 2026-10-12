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

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 rounded-sm font-medium ' +
  // ⭐ Kumo `hover-color-transitions`：绝不加 transition-colors。
  // 快速交互上的颜色渐变会让界面显「黏」，颜色必须瞬时切换。
  // 只保留一个极短的 transform 过渡（按下反馈），不影响颜色。
  'transition-transform duration-75 active:translate-y-px ' +
  'disabled:pointer-events-none disabled:opacity-45';

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand hover:bg-brand-hover',
  secondary: 'bg-surface-2 text-fg ring-1 ring-line-input hover:bg-surface-3',
  ghost: 'text-fg-soft hover:bg-surface-2 hover:text-fg',
  danger: 'bg-danger text-on-brand hover:brightness-110',
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  // ⭐ Kumo `content-text-size`：按钮文字 14px，不用 13px
  sm: 'h-8 px-3 text-sm',
  md: 'h-9 px-4 text-base',
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
  size = 'md',
  className = '',
  children,
  ...rest
}: { label: string; size?: ButtonSize; className?: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9';
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
 * ⭐ Kumo `concentric-border-radius`：外圈 rounded-sm(6px) + p-0.5(2px)
 * → 内圈必须是 4px（6 − 2）。若内外都写 rounded-sm，圆角不同心，
 * 视觉上会出现左上贴齐、右下脱开的「歪」感。
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
      className="inline-flex rounded-sm bg-surface-3 p-0.5 ring-1 ring-line"
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
              'inline-flex items-center justify-center gap-1.5 rounded-xs font-medium',
              size === 'sm' ? 'h-7 px-2.5 text-sm' : 'h-8 px-3 text-base',
              active
                ? 'bg-surface text-fg shadow-sm'
                : 'text-fg-soft hover:bg-surface-2 hover:text-fg',
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
 * 表单控件
 * ───────────────────────────────────────────────────────────────── */

export function TextInput({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={[
        'h-9 w-full rounded-sm bg-surface-2 px-2.5 text-base text-fg',
        'ring-1 ring-line-input placeholder:text-fg-mute',
        'hover:ring-line-strong',
        className,
      ].join(' ')}
      {...rest}
    />
  );
}

/**
 * 带前置图标的搜索框。
 *
 * ⭐ Kumo `icon-alignment`：图标包在 `h-lh` 里与文字**首行**对齐，
 * 而不是用 items-center（多行文本时后者会把图标居中到整块，视觉错位）。
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
          'h-9 w-full rounded-sm bg-surface-2 pl-8 pr-8 text-base text-fg',
          'ring-1 ring-line-input placeholder:text-fg-mute hover:ring-line-strong',
          // 去掉 Safari search 域自带的清除按钮，我们自己放一个
          '[&::-webkit-search-cancel-button]:appearance-none',
        ].join(' ')}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label="清空搜索"
          onClick={() => onChange('')}
          className="absolute inset-y-0 right-1 flex items-center px-1.5 text-fg-mute hover:text-fg"
        >
          <IconClose size={14} />
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
        <label htmlFor={id} className="text-sm text-fg-soft">
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
 */
export function Collapsible({
  title,
  open,
  onToggle,
  count,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  count?: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-center gap-1.5 rounded-sm py-1 text-left text-fg-mute hover:text-fg"
      >
        <IconChevron dir={open ? 'down' : 'right'} size={14} />
        <span className="text-sm font-medium text-fg-soft">{title}</span>
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
