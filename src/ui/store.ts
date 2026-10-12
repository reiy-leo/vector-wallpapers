/**
 * 工作台状态容器 —— 零依赖 external store。
 *
 * 为什么不引Zustand / Redux：本项目首屏 JS gzip 预算 300KB，
 * 一个状态库就是 1~3KB gzip，加上它的 selector 缓存逻辑反而比自己写更重。
 * React 19 自带的 `useSyncExternalStore` 已经能正确处理
 * 并发渲染下的 tearing 问题 —— 这正是 Redux 曾经自研出来的部分。
 *
 * 两条设计纪律：
 *  1. **renderSVG 的产物不进 store**。SVG 字符串体积大、变更频繁，
 *     放进 state 会让所有订阅者一起重渲染。改为由组件自己
 *     `useMemo(cfg)` 派生，store 只存「用户意图」。
 *  2. **所有 mutator 返回新对象**，不做原地修改 —— 这样 `useSyncExternalStore`
 *     的引用比较才有意义。
 */
import { useSyncExternalStore } from 'react';
import {
  DEFAULT_PATTERN_ID,
  DEFAULT_SEED,
  DEFAULT_SIZE,
  LIMITS,
  STORAGE_KEY,
  URL_WRITE_DEBOUNCE_MS,
} from '../shared/constants';
import { clamp } from '../shared/guards';
import { createDefaultConfig, structuredCloneConfig } from '../engine/render';
import { registry } from '../patterns';
import { decodeConfig, encodeConfig, type DecodedState } from './share';
import { sanitizeDoc, type RatingsDoc } from '../shared/ratings-api';
import { sanitizeSyncLast, type RatingSyncLast } from './rating-sync';
import type { PatternConfig, UIState } from '../engine/types';
import type { PatternDef, ParamValue } from '../patterns/types';

export interface WorkbenchState {
  cfg: PatternConfig;
  ui: UIState;
  /** 当前高亮的分类；'all' 表示显示全部。 */
  category: string;
  search: string;
  /** 收藏的母题 id（由 saved 派生，去重保序 —— 左栏星标用）。 */
  favorites: string[];
  /** 收藏的具体壁纸（Rei 2026-10-12：收藏「这一张」，含配色 / 参数 / seed）。 */
  saved: SavedWallpaper[];
}

/** 一张收藏的壁纸。q 是 share.encodeConfig 的产物，天然就是去重键。 */
export interface SavedWallpaper {
  q: string;
  patternId: string;
  savedAt: number;
}

/** 读取 URL / localStorage 得到首屏状态 —— 无 window 时退回默认值。 */
function initialState(): WorkbenchState {
  const base: WorkbenchState = {
    cfg: createDefaultConfig(registry.get(DEFAULT_PATTERN_ID)!, {
      width: DEFAULT_SIZE.w,
      height: DEFAULT_SIZE.h,
      seed: DEFAULT_SEED,
    }),
    ui: { theme: readStoredTheme(), panel: 'right', focus: false, grid: false },
    category: 'all',
    search: '',
    favorites: [],
    saved: [],
  };
  base.saved = readSaved();
  base.favorites = favoriteIds(base.saved);

  /**
   * ⭐ URL 解析仍在**模块初始化时同步完成**，但**不直接套用**。
   *
   * 访问分享链接需要 Google 登录（Rei 2026-10-12）：解析结果先暂存为「待套用的分享」，
   * 首屏照常显示默认壁纸；/api/me 确认已登录后由 Workbench 调 `applyPendingShare()` 套用，
   * 未登录则弹出登录门禁。暂存期间地址栏不被改写（见 `scheduleUrlSync`），
   * 这样登录跳转的 returnTo 仍带着分享参数，回来后照样能套用。
   */
  if (typeof window !== 'undefined') {
    const decoded = decodeConfig(window.location.search);
    if (decoded.cfg) {
      pendingShare = decoded;
      pendingBaseCfg = base.cfg;
    }
  }
  return base;
}

/**
 * 待套用的分享链接状态。⚠️ 必须声明在 `initialState()` 调用之前（let 的暂时性死区）。
 * `pendingBaseCfg` 记住暂存时的默认配置引用：用户一旦动了画布（引用变了），
 * 就视为放弃这条分享，地址栏恢复同步。
 */
let pendingShare: DecodedState | null = null;
let pendingBaseCfg: PatternConfig | null = null;

let state: WorkbenchState = initialState();

/** 地址栏里有一条尚未套用的分享链接。 */
export function hasPendingShare(): boolean {
  return pendingShare !== null;
}

/** 套用暂存的分享（登录确认后调用）。返回是否真的套用了。 */
export function applyPendingShare(): boolean {
  const decoded = pendingShare;
  pendingShare = null;
  pendingBaseCfg = null;
  if (!decoded?.cfg) return false;
  const ui = { ...state.ui };
  if (decoded.ui.theme) ui.theme = decoded.ui.theme;
  if (decoded.ui.panel) ui.panel = decoded.ui.panel;
  if (decoded.ui.grid !== undefined) ui.grid = decoded.ui.grid;
  set({ cfg: decoded.cfg, ui });
  return true;
}
const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

function set(patch: Partial<WorkbenchState>): void {
  state = { ...state, ...patch };
  emit();
}

/* ── 配置 mutator（全部返回新对象） ────────────────────────────── */

function patchCfg(patch: Partial<PatternConfig>): void {
  set({ cfg: { ...state.cfg, ...patch } });
}

/** 替换单个元件的字段。 */
export function patchElement(id: string, patch: Partial<PatternConfig['elements'][number]>): void {
  set({
    cfg: {
      ...state.cfg,
      elements: state.cfg.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    },
  });
}

/** 批量替换元件列表（引擎的 recolorByRole / applyPaletteSlots 返回整体新配置）。 */
export function setConfig(next: PatternConfig): void {
  set({ cfg: next });
}

export function setParam(key: string, value: ParamValue): void {
  set({ cfg: { ...state.cfg, params: { ...state.cfg.params, [key]: value } } });
}

export function setSize(width: number, height: number): void {
  patchCfg({
    width: clamp(Math.round(width), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION),
    height: clamp(Math.round(height), LIMITS.MIN_DIMENSION, LIMITS.MAX_DIMENSION),
  });
}

export function setSeed(seed: number): void {
  patchCfg({ seed: clamp(Math.round(seed), 0, 999_999) });
}

/**
 * 切换母题。
 *
 * ⚠️ 不做「保留当前配色」：不同母题的元件集合完全不同，
 * 强行按 id 套用会留下大量无意义的状态。切母题即回到该母题的默认态，
 * 这也是用户预期的心智模型。
 */
export function selectPattern(id: string, keepSize = true): void {
  const def = registry.get(id);
  if (!def) return;
  const next = createDefaultConfig(def, {
    width: keepSize ? state.cfg.width : DEFAULT_SIZE.w,
    height: keepSize ? state.cfg.height : DEFAULT_SIZE.h,
    seed: state.cfg.seed,
  });
  set({ cfg: next, search: '' });
}

/** 恢复当前母题的默认配置（保留尺寸与 seed）。 */
export function resetConfig(): void {
  const def = registry.get(state.cfg.patternId);
  if (!def) return;
  set({
    cfg: createDefaultConfig(def, {
      width: state.cfg.width,
      height: state.cfg.height,
      seed: state.cfg.seed,
    }),
  });
}

/* ── UI mutator ───────────────────────────────────────────────── */

export function setUI(patch: Partial<UIState>): void {
  set({ ui: { ...state.ui, ...patch } });
}

export function setSearch(search: string): void {
  set({ search });
}

export function setCategory(category: string): void {
  set({ category });
}

/* ── 收藏（具体壁纸） ─────────────────────────────────────────── */

function favoriteIds(saved: readonly SavedWallpaper[]): string[] {
  return [...new Set(saved.map((x) => x.patternId))];
}

function setSaved(next: SavedWallpaper[]): void {
  const capped = next.slice(0, LIMITS.MAX_FAVORITES);
  writeSaved(capped);
  set({ saved: capped, favorites: favoriteIds(capped) });
}

/** 当前配置的收藏键（不含 UI 偏好）。 */
export function savedKey(cfg: PatternConfig): string {
  return encodeConfig(cfg);
}

/** 收藏 / 取消收藏当前这张壁纸。返回切换后是否已收藏。 */
export function toggleSaved(cfg: PatternConfig): boolean {
  const q = savedKey(cfg);
  if (state.saved.some((x) => x.q === q)) {
    removeSaved(q);
    return false;
  }
  setSaved([{ q, patternId: cfg.patternId, savedAt: Date.now() }, ...state.saved]);
  return true;
}

export function removeSaved(q: string): void {
  setSaved(state.saved.filter((x) => x.q !== q));
}

/** 收藏 → 配置；母题已下线 / 编码损坏时返回 null。 */
export function savedToConfig(item: SavedWallpaper): PatternConfig | null {
  return decodeConfig(item.q).cfg;
}

/** 把一张收藏套到画布上。 */
export function applySaved(item: SavedWallpaper): boolean {
  const cfg = savedToConfig(item);
  if (!cfg) return false;
  set({ cfg });
  return true;
}

/* ── 主题持久化 ───────────────────────────────────────────────── */

/**
 * 应用主题到 <html>。
 *
 * ⚠️ `'system'` 时必须**移除** data-theme 属性而不是写 `data-theme="system"`——
 * CSS 里是 `[data-theme='dark']` 精确匹配，写上 system 会让深色规则失效。
 */
export function applyTheme(theme: UIState['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

function readStoredTheme(): UIState['theme'] {
  try {
    const v = localStorage.getItem(STORAGE_KEY.theme);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function persistTheme(theme: UIState['theme']): void {
  try {
    localStorage.setItem(STORAGE_KEY.theme, theme);
  } catch {
    /* 隐私模式下 localStorage 会抛错，主题偏好丢失可接受，不影响功能 */
  }
}

/** 首屏挂载时调用：把持久化的主题落回 store 与 DOM。 */
export function initTheme(): void {
  const theme = readStoredTheme();
  applyTheme(theme);
  if (theme !== state.ui.theme) setUI({ theme });
}

/* ── URL 同步 ─────────────────────────────────────────────────── */

let urlTimer = 0;

/**
 * 把配置写入地址栏。
 *
 * 用 `replaceState` 而非 `pushState`：拖动滑块会连续触发，
 * pushState 会让浏览器后退键需要按几十次才能离开页面。
 * 300ms 防抖保证高频操作不会每帧都碰历史记录（PRD P0-6）。
 */
export function scheduleUrlSync(getConfig: () => PatternConfig, ui: UIState): void {
  if (typeof window === 'undefined') return;
  window.clearTimeout(urlTimer);
  if (pendingShare) {
    // 分享尚未套用（等登录）且画布没动过 → 保留地址栏里的分享参数，不覆盖
    if (getConfig() === pendingBaseCfg) return;
    // 用户已在默认画布上改动 → 放弃这条分享，恢复正常同步
    pendingShare = null;
    pendingBaseCfg = null;
  }
  urlTimer = window.setTimeout(() => {
    const qs = encodeConfig(getConfig(), ui);
    const url = window.location.pathname + (qs ? `?${qs}` : '');
    window.history.replaceState(null, '', url);
  }, URL_WRITE_DEBOUNCE_MS);
}

/* ── React 绑定 ───────────────────────────────────────────────── */

const subscribe = (cb: () => void): (() => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const getSnapshot = (): WorkbenchState => state;

/**
 * SSR / 预渲染快照。
 *
 * ⚠️ 必须是**同一个对象**，不能每次调用 `initialState()` ——
 * `useSyncExternalStore` 依赖引用相等判断是否变化，每次新建会让
 * React 认为状态一直在变，在预渲染阶段触发无限循环。
 */
const serverSnapshot: WorkbenchState = {
  cfg: createDefaultConfig(registry.get(DEFAULT_PATTERN_ID)!, {
    width: DEFAULT_SIZE.w,
    height: DEFAULT_SIZE.h,
    seed: DEFAULT_SEED,
  }),
  ui: { theme: 'system', panel: 'right', focus: false, grid: false },
  category: 'all',
  search: '',
  favorites: [],
  saved: [],
};

/** 订阅整个 store —— 适合读多个字段的面板。 */
export function useWorkbench(): WorkbenchState {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}

/**
 * 订阅单个字段 —— 适合只关心一件事的组件。
 *
 * ⚠️ selector 必须返回**原始值或稳定引用**。
 * 返回 `new Set(...)` / 对象字面量会让每次渲染都判定为「变了」，
 * 触发无限重渲染 —— 这是 useSyncExternalStore 最常见的误用。
 */
export function useWorkbenchSelector<T>(selector: (s: WorkbenchState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(serverSnapshot));
}

/** 当前母题定义。 */
export function usePatternDef(): PatternDef {
  const id = useWorkbenchSelector((s) => s.cfg.patternId);
  return registry.get(id) ?? registry.first()!;
}

/** 就地读取当前配置（给命令式调用点用，避免订阅）。 */
export function getConfig(): PatternConfig {
  return state.cfg;
}

export function getState(): WorkbenchState {
  return state;
}

export function subscribeToStore(cb: () => void): () => void {
  return subscribe(cb);
}

/**
 * 读收藏 v2；首次读取时把 v1（只存母题 id）迁移成「该母题默认配置」的收藏。
 */
export function readSaved(): SavedWallpaper[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.saved);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (x): x is SavedWallpaper =>
          !!x && typeof x === 'object' && typeof (x as SavedWallpaper).q === 'string' &&
          typeof (x as SavedWallpaper).patternId === 'string',
      );
    }
    const legacy = readFavorites();
    const migrated: SavedWallpaper[] = [];
    for (const id of legacy) {
      const def = registry.get(id);
      if (!def) continue;
      const cfg = createDefaultConfig(def, { width: DEFAULT_SIZE.w, height: DEFAULT_SIZE.h, seed: DEFAULT_SEED });
      migrated.push({ q: encodeConfig(cfg), patternId: id, savedAt: Date.now() });
    }
    if (migrated.length > 0) writeSaved(migrated);
    return migrated;
  } catch {
    return [];
  }
}

export function writeSaved(items: SavedWallpaper[]): void {
  try {
    localStorage.setItem(STORAGE_KEY.saved, JSON.stringify(items.slice(0, LIMITS.MAX_FAVORITES)));
  } catch {
    /* 写入失败仅丢失收藏，不阻断主流程 */
  }
}

/** 收藏 v1（PRD P0-7）：存 pattern id 列表 —— 仅供迁移读取。 */
export function readFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.favorites);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFavorites(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY.favorites, JSON.stringify(ids.slice(0, LIMITS.MAX_FAVORITES)));
  } catch {
    /* 同上：写入失败仅丢失收藏，不阻断主流程 */
  }
}

/* ── 「色板 × 母题」评分的本地待提交队列（见 rating-queue.ts / ratings.ts） ── */

/** 按登录邮箱分 key：换账号登录时不会把上一个账号攒的评分提交到新账号名下。 */
const ratingQueueKey = (owner: string) => `${STORAGE_KEY.ratingQueue}:${owner.trim().toLowerCase()}`;

export function readRatingQueue(owner: string): RatingsDoc {
  try {
    const raw = localStorage.getItem(ratingQueueKey(owner));
    return raw ? sanitizeDoc(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export function writeRatingQueue(owner: string, queue: RatingsDoc): void {
  try {
    if (Object.keys(queue).length === 0) localStorage.removeItem(ratingQueueKey(owner));
    else localStorage.setItem(ratingQueueKey(owner), JSON.stringify(queue));
  } catch {
    /* 隐私模式 / 配额满：队列只在内存里，刷新即丢，可接受 */
  }
}

const ratingSyncKey = (owner: string) => `${STORAGE_KEY.ratingSync}:${owner.trim().toLowerCase()}`;

export function readRatingSync(owner: string): RatingSyncLast | null {
  try {
    const raw = localStorage.getItem(ratingSyncKey(owner));
    return raw ? sanitizeSyncLast(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function writeRatingSync(owner: string, last: RatingSyncLast): void {
  try {
    localStorage.setItem(ratingSyncKey(owner), JSON.stringify(last));
  } catch {
    /* 同上 */
  }
}

/** 最近使用（PRD P0-7：最多 8 个）。 */
export function pushRecent(id: string): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.recent);
    const list: unknown = raw ? JSON.parse(raw) : [];
    const prev = Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
    const next = [id, ...prev.filter((x) => x !== id)].slice(0, LIMITS.MAX_RECENT);
    localStorage.setItem(STORAGE_KEY.recent, JSON.stringify(next));
  } catch {
    /* 忽略 */
  }
}

export function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY.recent);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export { structuredCloneConfig };
export type { PatternConfig, UIState };
