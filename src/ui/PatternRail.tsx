/**
 * ① Pattern 库（左栏）
 *
 * 数据来源 100% 是 registry + CATEGORY_META，UI 层零硬编码 ——
 * 新增母题只需在 `patterns/index.ts` 加一行，这里无需改动。
 */
import { useMemo } from 'react';
import { CATEGORY_META } from '../shared/constants';
import { registry } from '../patterns';
import { createDefaultConfig, renderStandaloneSVG } from '../engine/render';
import { svgToDataUri } from '../shared/download';
import { useWorkbenchSelector, selectPattern, setCategory, setSearch } from './store';
import { Tabs } from '@cloudflare/kumo/components/tabs';
import { CountBadge, SearchInput } from './primitives';
import { IconStar } from './icons';
import type { PatternDef } from '../patterns/types';

const THUMB_W = 240;
const THUMB_H = 150;

interface ThumbData {
  def: PatternDef;
  uri: string;
}

/**
 * 缩略图渲染。
 *
 * ⭐ 与大预览**共用同一个 `renderStandaloneSVG`**，因此不存在
 * 「缩略图好看但实际渲染不同」的偏差 —— 这正是 PRD P0-2 要消除的那类不一致。
 *
 * `useMemo` 按 defs 缓存：19 张缩略图只在首次挂载时渲染一次，
 * 之后切母题 / 改参数都不会重算。
 *
 * ⚠️ `skipBudget: true` 只关掉「抛错 / warn」，**不关掉测量** ——
 * 缩略图按 8:5 渲染，与用户的目标尺寸不同，体积自然不同于正式导出，
 * 不应因此在渲染列表时抛错。
 */
function useThumbs(defs: readonly PatternDef[]): ThumbData[] {
  return useMemo(
    () =>
      defs.map((def) => {
        const cfg = createDefaultConfig(def, { width: THUMB_W, height: THUMB_H, seed: 7 });
        return { def, uri: svgToDataUri(renderStandaloneSVG(def, cfg, { skipBudget: true })) };
      }),
    [defs],
  );
}

const ALL = 'all';

export function PatternRail({ favorites }: { favorites: readonly string[] }) {
  const defs = useMemo(() => registry.list(), []);
  const activeId = useWorkbenchSelector((s) => s.cfg.patternId);
  const category = useWorkbenchSelector((s) => s.category);
  const search = useWorkbenchSelector((s) => s.search);

  const thumbs = useThumbs(defs);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return defs.filter((d) => {
      if (category !== ALL && d.category !== category) return false;
      if (needle === '') return true;
      return (
        d.name.toLowerCase().includes(needle) ||
        d.id.toLowerCase().includes(needle) ||
        d.description.toLowerCase().includes(needle)
      );
    });
  }, [defs, category, search]);

  /** 按当前筛选顺序输出 {def, uri} —— 缩略图与筛选结果必须同序，否则点错。 */
  const items = useMemo(() => {
    const byId = new Map(thumbs.map((t) => [t.def.id, t.uri]));
    return visible.map((def) => ({ def, uri: byId.get(def.id) ?? '' }));
  }, [thumbs, visible]);

  const favSet = useMemo(() => new Set(favorites), [favorites]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ⭐ Kumo `sticky-borders`：粘性元素用 border 与内容分隔，
          而不是靠背景色差 —— 后者在半透明背景下会失效 */}
      <div className="grid shrink-0 gap-2.5 border-b border-line px-3 py-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="搜索母题"
        />
        {/*
         * 分类筛选用 kumo `Tabs`（segmented）：与右栏面板 Tabs 同一套组件与动画指示器。
         * 标签用短名（线条/几何/流体/风景/像素），6 段在 256px 内一行放下 ——
         * 放不下时 kumo 会出横向滚动 + 渐隐箭头，但「像素」被藏起来的问题依旧，所以宁可用短名。
         */}
        <Tabs
          variant="segmented"
          className="w-full rounded-md"
          listClassName="rounded-md"
          indicatorClassName="rounded-sm"
          value={category}
          onValueChange={setCategory}
          tabs={[
            { value: ALL, label: '全部', className: 'flex-1 justify-center' },
            ...CATEGORY_META.map((c) => ({ value: c.id, label: c.short, className: 'flex-1 justify-center' })),
          ]}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {visible.length === 0 ? (
          <EmptyState search={search} />
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {items.map(({ def, uri }) => (
              <li key={def.id}>
                <ThumbCard
                  def={def}
                  uri={uri}
                  active={def.id === activeId}
                  favorite={favSet.has(def.id)}
                  onSelect={() => selectPattern(def.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ThumbCard({
  def,
  uri,
  active,
  favorite,
  onSelect,
}: {
  def: PatternDef;
  uri: string;
  active: boolean;
  favorite: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      aria-label={`${def.name}（${def.id}）`}
      className={[
        'group grid w-full gap-1.5 rounded-lg p-1.5 text-left',
        // ⭐ Kumo concentric-border-radius：外层 rounded-lg(8px) + p-1.5(6px)
        //   → 内层必须是 2px（8 − 6）。这里内层图用 rounded-xs(4px)，
        //   间距 4px 时才成立，故外层用 rounded-xl 视觉上更贴切。
        active ? 'bg-brand-tint ring-1 ring-brand' : 'ring-1 ring-line hover:bg-surface-2',
      ].join(' ')}
    >
      <span className="relative block overflow-hidden rounded-md bg-surface-3">
        <img
          src={uri}
          alt={`${def.name} 预览`}
          width={THUMB_W}
          height={THUMB_H}
          loading="lazy"
          decoding="async"
          className="aspect-[8/5] w-full object-cover"
        />
        {favorite && (
          <span className="absolute right-1 top-1 rounded-full bg-overlay p-0.5 text-star">
            <IconStar size={11} filled />
          </span>
        )}
      </span>
      <span className="grid gap-0.5 px-0.5">
        <span className="flex items-baseline gap-1">
          {/* Kumo inline-monospace-size：id 是等宽字体且与中文名混排 → 缩到 0.9em */}
          <span className="truncate text-base font-medium text-fg">{def.name}</span>
        </span>
        <code className="truncate font-mono text-[0.9em] text-fg-mute">{def.id}</code>
      </span>
    </button>
  );
}

function EmptyState({ search }: { search: string }) {
  return (
    <div className="grid place-items-center gap-1.5 px-4 py-12 text-center">
      <p className="text-base text-fg-soft">没有匹配的母题</p>
      <p className="text-sm text-fg-mute">
        {search.trim() !== '' ? `试试「${search.trim()}」之外的关键词` : '换一个分类看看'}
      </p>
    </div>
  );
}

/** 顶栏用的母题数量展示（避免各处重复 registry.size）。 */
export function PatternCount() {
  const n = registry.size;
  return <CountBadge>{n}</CountBadge>;
}
