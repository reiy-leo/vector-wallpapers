/**
 * 预设色板 / 预置合集 / 形态参数（右栏面板）。
 *
 * 分工：
 *  - 色板 = **成套**的配色方案，一键获得有整体调性的成品。
 *  - 合集 = 母题 + 配色 + 种子打包好的「成品壁纸」，连母题都替用户选了。
 *  - 参数 = 母题自己的形态调节（密度、线宽、褶皱…），由 `PatternDef.controls` 自动生成。
 *
 * 三者刻意分开而不是混进一个「样式」列表：它们是三种不同的心智模式 ——
 * 「选一套色」/「拿一个成品」/「微调一处」。
 */
import { useMemo } from 'react';
import { PALETTES } from '../patterns/palettes';
import { CURATED_SETS, type SetItem } from '../patterns/sets';
import { registry } from '../patterns';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import { svgToDataUri } from '../shared/download';
import { applyPaletteSlots, nextSeed, randomizeColors } from './coloring';
import {
  getConfig,
  setConfig,
  setParam,
  setSeed,
  usePatternDef,
  useWorkbenchSelector,
} from './store';
import { Button, CountBadge, Section, Segmented, SliderField } from './primitives';
import { IconDice } from './icons';
import type { ColorStrategy } from '../engine/colors';
import type { ControlDef, ElementRole, ParamValue, PatternDef } from '../patterns/types';
import type { PatternConfig } from '../engine/types';

/* ─────────────────────────────────────────────────────────────────
 * 配色方案
 * ───────────────────────────────────────────────────────────────── */

export function PalettePanel({
  strategy,
  onStrategyChange,
}: {
  strategy: ColorStrategy;
  onStrategyChange: (s: ColorStrategy) => void;
}) {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);

  return (
    <Section
      title="配色方案"
      hint="内置预设，一键套用到全部元件"
      action={<CountBadge>{PALETTES.length}</CountBadge>}
    >
      <ul className="grid gap-1.5">
        {PALETTES.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => setConfig(applyPaletteSlots(cfg, def, p.slots))}
              title={p.description}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left ring-1 ring-line hover:bg-surface-2"
            >
              {/* ⭐ 同心圆角：外层 rounded-md(8px)，内部色条 rounded-xs(4px)，
                  左右 padding 2px + 视觉间距使圆角关系成立，不出现「内外同半径」的歪斜感 */}
              <span className="flex shrink-0 overflow-hidden rounded-xs ring-1 ring-line-input">
                {ROLE_ORDER.map((slot) => (
                  <span key={slot} className="h-6 w-4" style={{ background: p.slots[slot] }} />
                ))}
              </span>
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span className="truncate text-base text-fg">{p.label}</span>
                <span className="truncate text-2xs text-fg-mute">{p.description}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="grid gap-2 border-t border-line pt-3">
        <span className="text-sm font-medium text-fg-soft">随机换色策略</span>
        <Segmented
          label="随机换色策略"
          size="sm"
          value={strategy}
          onChange={onStrategyChange}
          options={STRATEGY_OPTIONS}
        />
        <p className="text-2xs text-fg-mute">
          决定「换一版」的取色范围。已锁定的元件不会被改动。
        </p>
      </div>
    </Section>
  );
}

const ROLE_ORDER: readonly ElementRole[] = ['bg', 'primary', 'secondary', 'accent', 'detail'];

const STRATEGY_OPTIONS = [
  { value: 'analogous', label: '邻近色', title: '以当前底色推导一组和谐色（默认）' },
  { value: 'palette', label: '当前色板', title: '只在内置色板内重新分配，整体调性不漂移' },
  { value: 'full', label: '全色域', title: '完全随机，可能跳脱也可能惊喜' },
] as const satisfies ReadonlyArray<{ value: ColorStrategy; label: string; title: string }>;

/* ─────────────────────────────────────────────────────────────────
 * 预置合集
 * ───────────────────────────────────────────────────────────────── */

/**
 * 预置合集（PRD Q7：6~8 套）。
 *
 * 每张缩略图都由该合集项的**真实配置**离屏渲染，而不是用一个代表色方块糊弄 ——
 * 用户看到的必须就是点进去会得到的样子，否则这个入口会持续制造失望。
 */
export function CuratedSetsPanel() {
  const { uriOf, apply } = useSetThumbs();

  return (
    <Section title="预置合集" hint="成套成品，连母题和种子都替你选好了">
      <ul className="grid gap-2">
        {CURATED_SETS.map((set) => (
          <li key={set.id} className="rounded-md px-2 py-2 ring-1 ring-line">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-base text-fg">{set.label}</span>
              <CountBadge>{set.items.length}</CountBadge>
            </div>
            <p className="mt-0.5 text-2xs text-fg-mute">{set.description}</p>
            <div className="mt-2 flex gap-1.5">
              {set.items.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  title={`${item.patternId} · seed ${item.seed}`}
                  aria-label={`套用「${set.label}」第 ${i + 1} 张`}
                  onClick={() => apply(set.id, i)}
                  className="overflow-hidden rounded-xs ring-1 ring-line-input hover:ring-brand"
                >
                  <img
                    src={uriOf(set.id, i)}
                    alt=""
                    width={64}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className="h-10 w-16 object-cover"
                  />
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/** 把合集项展开为可渲染的 PatternConfig —— 与引擎/UI 的默认来源保持一致。 */
function configForItem(def: PatternDef, item: SetItem, width: number, height: number): PatternConfig {
  const base = createDefaultConfig(def, { width, height, seed: item.seed });
  return {
    ...base,
    elements: base.elements.map((e) => {
      const paint = item.colors[e.id];
      return paint ? { ...e, paint } : e;
    }),
    params: { ...base.params, ...item.params },
  };
}

function useSetThumbs() {
  // 缩略图按固定小尺寸渲染一次；与画布共用 renderStandaloneSVG
  const uris = useMemo(() => {
    const map = new Map<string, string>();
    for (const set of CURATED_SETS) {
      for (let i = 0; i < set.items.length; i++) {
        const item = set.items[i];
        const def = registry.get(item.patternId);
        if (!def) continue;
        const svg = renderStandaloneSVG(def, configForItem(def, item, 128, 80), {
          skipBudget: true,
        });
        map.set(`${set.id}:${i}`, svgToDataUri(svg));
      }
    }
    return map;
  }, []);

  return {
    uriOf: (setId: string, i: number) => uris.get(`${setId}:${i}`) ?? '',
    apply: (setId: string, i: number) => {
      const set = CURATED_SETS.find((s) => s.id === setId);
      const item = set?.items[i];
      if (!set || !item) return;
      const def = registry.get(item.patternId);
      if (!def) return;
      // 保留用户当前的画布尺寸 —— 合集定义的是「长什么样」，
      // 不是「画布多大」；改变尺寸会让用户已有的尺寸选择被静默重置。
      const current = getConfig();
      setConfig(configForItem(def, item, current.width, current.height));
    },
  };
}

/* ─────────────────────────────────────────────────────────────────
 * 形态参数
 * ───────────────────────────────────────────────────────────────── */

/**
 * 参数控件 —— 100% 由 `PatternDef.controls` 生成（架构铁律 10）。
 *
 * 本文件里**没有**任何母题 id 或参数 key 字面量；
 * 新增母题或新增控件，这里不需要改动。
 */
export function ParamPanel() {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);
  const groups = useMemo(() => groupControls(def.controls), [def.controls]);

  return (
    <Section title="形态参数" hint="每个母题自定义，切母题时自动换成它自己的参数">
      {groups.map(([group, controls]) => (
        <fieldset key={group} className="grid gap-3">
          {group !== '' && (
            <legend className="text-sm font-medium text-fg-soft">{group}</legend>
          )}
          {controls.map((c) => (
            <ControlRow key={c.key} control={c} cfg={cfg} onChange={setParam} />
          ))}
        </fieldset>
      ))}

      <div className="grid gap-2 border-t border-line pt-3">
        <span className="text-sm font-medium text-fg-soft">随机种子</span>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={cfg.seed}
            min={0}
            max={999999}
            aria-label="随机种子"
            onChange={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0) setSeed(v);
            }}
            className={[
              'vw-number h-8 w-28 rounded-sm bg-surface-2 px-2 font-mono text-[0.9em] tabular-nums text-fg',
              'ring-1 ring-line-input hover:ring-line-strong',
            ].join(' ')}
          />
          <Button
            variant="secondary"
            size="sm"
            title="换一个随机种子（不改变当前配色）"
            onClick={() => setSeed(nextSeed(cfg.seed))}
          >
            <IconDice size={15} />
            换种子
          </Button>
        </div>
        <p className="text-2xs text-fg-mute">
          相同种子 + 相同配色 = 完全相同的壁纸，分享链接靠它复现画面。
        </p>
      </div>
    </Section>
  );
}

/** 按 `group` 字段分组；无 group 的控件归入首组。 */
function groupControls(controls: readonly ControlDef[]): Array<[string, ControlDef[]]> {
  const map = new Map<string, ControlDef[]>();
  for (const c of controls) {
    const key = c.group ?? '';
    const list = map.get(key);
    if (list) list.push(c);
    else map.set(key, [c]);
  }
  return [...map.entries()];
}

function ControlRow({
  control,
  cfg,
  onChange,
}: {
  control: ControlDef;
  cfg: PatternConfig;
  onChange: (key: string, value: ParamValue) => void;
}) {
  const value = cfg.params[control.key];

  if (control.type === 'range') {
    return (
      <SliderField
        label={control.label}
        value={Number(value)}
        min={control.min}
        max={control.max}
        step={control.step}
        format={(v) => (control.unit ? `${v}${control.unit}` : String(v))}
        onChange={(v) => onChange(control.key, v)}
      />
    );
  }

  if (control.type === 'angle') {
    return (
      <SliderField
        label={control.label}
        value={Number(value)}
        min={0}
        max={359}
        step={1}
        format={(v) => `${v}°`}
        onChange={(v) => onChange(control.key, v)}
      />
    );
  }

  if (control.type === 'toggle') {
    return (
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`c-${control.key}`} className="text-base text-fg-soft">
          {control.label}
        </label>
        <input
          id={`c-${control.key}`}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(control.key, e.target.checked)}
          className="h-4 w-4 shrink-0 accent-[var(--vw-brand)]"
        />
      </div>
    );
  }

  // select：原生控件在移动端会调起系统选择器，且天然支持键盘与读屏
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={`c-${control.key}`} className="text-base text-fg-soft">
        {control.label}
      </label>
      <select
        id={`c-${control.key}`}
        value={String(value)}
        onChange={(e) => onChange(control.key, e.target.value)}
        className="h-8 shrink-0 rounded-sm bg-surface-2 px-2 text-sm text-fg ring-1 ring-line-input hover:ring-line-strong"
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

/* ─────────────────────────────────────────────────────────────────
 * 供顶栏复用的动作（与画布栏共用同一实现，避免两处实现漂移）
 * ───────────────────────────────────────────────────────────────── */

/** 「换一版」：换 seed + 按当前策略重排配色（PRD Q3）。 */
export function shuffleCurrent(strategy: ColorStrategy): void {
  const cfg = getConfig();
  const def = registry.get(cfg.patternId);
  if (!def) return;
  setConfig(randomizeColors(cfg, def, strategy, nextSeed(cfg.seed)));
}
