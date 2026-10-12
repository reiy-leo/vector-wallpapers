/**
 * 内置预设色板（PRD Q4 决策：只内置，不做用户自建/导入导出）。
 *
 * 每套色板按**语义槽位**组织，而非按 pattern 组织：
 * `bg` / `primary` / `secondary` / `accent` / `detail`。
 * 套用到某个 pattern 时，由该 pattern 的 `paletteSlots` 把槽位映射到具体元件 id，
 * 这样一套色板可以复用到全部 pattern 上，无需为每个 pattern 各写一套。
 */
import type { ElementRole } from './types';

export interface Palette {
  id: string;
  label: string;
  /** 按 role 语义槽位给出颜色；套用时按 pattern 的 paletteSlots 落到元件上。 */
  slots: Record<ElementRole, string>;
  description: string;
}

/** PRD P0-2 点名的 10 套色板，全部内置。 */
export const PALETTES: readonly Palette[] = [
  {
    id: 'polar',
    label: '极地',
    description: '冷白与冰蓝，清爽干净',
    slots: { bg: '#f8fafc', primary: '#0f172a', secondary: '#64748b', accent: '#0ea5e9', detail: '#94a3b8' },
  },
  {
    id: 'grayscale',
    label: '灰调',
    description: '纯灰阶，安全到不会错',
    slots: { bg: '#fafafa', primary: '#171717', secondary: '#737373', accent: '#404040', detail: '#a3a3a3' },
  },
  {
    id: 'morandi',
    label: '莫兰地',
    description: '灰调低饱和，安静而不 boring',
    slots: { bg: '#ece7e1', primary: '#7d8b85', secondary: '#a4918c', accent: '#b5a899', detail: '#cfc5bd' },
  },
  {
    id: 'sunset',
    label: '落日',
    description: '暖橙与深紫，永远的公路片',
    slots: { bg: '#1e1b4b', primary: '#fb923c', secondary: '#be185d', accent: '#fbbf24', detail: '#fde047' },
  },
  {
    id: 'tundra',
    label: '苔原',
    description: '深绿与米白，自然不刺眼',
    slots: { bg: '#f5f3e7', primary: '#3f6212', secondary: '#65a30d', accent: '#b45309', detail: '#a3b18a' },
  },
  {
    id: 'neon',
    label: '霓虹',
    description: '深底高饱和，赛博朋克',
    slots: { bg: '#05010f', primary: '#ff2d95', secondary: '#00f0ff', accent: '#ffb800', detail: '#8b5cf6' },
  },
  {
    id: 'memphis',
    label: '孟菲斯',
    description: '80 年代高饱和几何',
    slots: { bg: '#fff8e7', primary: '#00b4d8', secondary: '#f15bb5', accent: '#fee440', detail: '#6a4c93' },
  },
  {
    id: 'retro-print',
    label: '复古印刷',
    description: '做旧纸感与褪色油墨',
    slots: { bg: '#f2e8dc', primary: '#9a3412', secondary: '#c2410c', accent: '#166534', detail: '#7c2d12' },
  },
  {
    id: 'night-flight',
    label: '夜航',
    description: '深蓝夜色与极光',
    slots: { bg: '#020617', primary: '#22d3ee', secondary: '#a78bfa', accent: '#5eead4', detail: '#e2e8f0' },
  },
  {
    id: 'mono',
    label: '单色',
    description: '一色到底，靠明度分层',
    slots: { bg: '#111111', primary: '#fafafa', secondary: '#a3a3a3', accent: '#525252', detail: '#737373' },
  },
];

export function getPalette(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}

export function defaultPalette(): Palette {
  return PALETTES[0];
}