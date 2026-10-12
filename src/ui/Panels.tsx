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
  setSeed,
  usePatternDef,
  useWorkbenchSelector,
} from './store';
import { Button, Collapsible, CountBadge, Section, Segmented, inputClass } from './primitives';
import { IconDice } from './icons';
import type { ColorStrategy } from '../engine/colors';
import type { ElementRole, PatternDef } from '../patterns/types';
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
        <span className="text-base font-medium text-fg-soft">随机换色策略</span>
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
  { value: 'analogous', label: '邻近色', title: '沿用作者配色的明暗层次，整体换一组色相（默认）' },
  { value: 'palette', label: '当前色板', title: '随机套用一套内置色板' },
  { value: 'full', label: '全色域', title: '每个元件各自换色相，明暗层次不变' },
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
 * 参数面板 —— **只剩随机种子**。
 *
 * ⭐ 形态参数（线宽、密度、起伏…）已迁到画布工具条（见 ControlChips）：
 * 调形状是「边看边拧」的行为，甩到 360px 外的右栏会让眼睛反复横跳。
 *
 * 种子之所以**留在右栏**而不是跟着搬走：它服务的是「复现 / 分享」
 * （相同种子 + 相同配色 = 同一张壁纸），属于配置而非形态 ——
 * 混进工具条的形态滑块里，用户会误以为拧它会改变形状。
 */
export function ParamPanel() {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);

  return (
    <Section title="随机种子" hint="决定图案的随机细节分布">
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
          className={inputClass('vw-number w-28 font-mono text-[0.9em] tabular-nums')}
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

      {/* 形态参数的完整说明留在右栏：工具条上一排滑块没有空间解释每个参数，
          而「参数是这个母题自己定义的」这条信息对用户理解产品很关键。 */}
      <Collapsible title="当前母题可调项" count={def.controls.length}>
        <ul className="grid gap-1">
          {def.controls.map((c) => (
            <li key={c.key} className="flex items-baseline justify-between gap-3">
              <span className="text-base text-fg-soft">{c.label}</span>
              <code className="shrink-0 font-mono text-[0.9em] text-fg-mute">
                {String(cfg.params[c.key])}
              </code>
            </li>
          ))}
        </ul>
        <p className="text-2xs text-fg-mute">
          这些调节项由母题自身定义，已放在画布下方的工具条上。
        </p>
      </Collapsible>
    </Section>
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
