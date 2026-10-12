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

/**
 * 「换一版」专用的高饱和色板池（不进 PRD 的 10 套展示色板，也不在色板面板里列出）。
 *
 * ⚠️ 这里的颜色只提供**色相 + 饱和度**：套用时由 `ui/coloring.ts` 的 vivid 配色
 * 按当前浅底/深底重新分配明度并保证与底色的对比度，所以同一套色板浅底、深底都能用。
 * `bg` 只取其色相作为底色的色倾（浅底 → 淡彩，深底 → 深饱和）。
 */
export const VIVID_PALETTES: readonly Palette[] = [
  { id: 'riso-pop', label: '孔版印刷', description: '荧光粉 + 群青 + 柠檬黄',
    slots: { bg: '#ffe3ee', primary: '#ff3d7f', secondary: '#0078ff', accent: '#ffd400', detail: '#00c48c' } },
  { id: 'miami', label: '迈阿密', description: '洋红与电光青',
    slots: { bg: '#2a0b5e', primary: '#ff2e88', secondary: '#00e5ff', accent: '#ffb800', detail: '#8a2be2' } },
  { id: 'citrus', label: '柑橘', description: '橙、黄、翠绿',
    slots: { bg: '#fff3b0', primary: '#ff6b00', secondary: '#00a86b', accent: '#ffd000', detail: '#ff2d55' } },
  { id: 'ultraviolet', label: '紫外', description: '电紫、品红、冰青',
    slots: { bg: '#3a0080', primary: '#a100ff', secondary: '#ff00c8', accent: '#00f0ff', detail: '#ffe600' } },
  { id: 'kyoto-sun', label: '朱印', description: '朱红、靛蓝、金',
    slots: { bg: '#ffe6d6', primary: '#e8002d', secondary: '#1b3fff', accent: '#ffb000', detail: '#00a3a3' } },
  { id: 'mint-coral', label: '薄荷珊瑚', description: '珊瑚红配薄荷绿',
    slots: { bg: '#c9fff0', primary: '#ff5a5f', secondary: '#00b8a9', accent: '#f8c80d', detail: '#3a3fff' } },
  { id: 'deep-sea', label: '深海', description: '荧光青、电光绿、珊瑚',
    slots: { bg: '#00305e', primary: '#00d1ff', secondary: '#00ff9c', accent: '#ff4f79', detail: '#ffd23f' } },
  { id: 'matisse', label: '马蒂斯', description: '剪纸般的钴蓝、朱红、明黄',
    slots: { bg: '#ffe9c2', primary: '#0047ff', secondary: '#ff3b1f', accent: '#ffb300', detail: '#00a35c' } },
  { id: 'acid', label: '酸性', description: '酸绿与霓虹粉',
    slots: { bg: '#2b4000', primary: '#c6ff00', secondary: '#ff00a8', accent: '#00e0ff', detail: '#ff7a00' } },
  { id: 'berry', label: '莓果', description: '玫红、葡萄紫、橘',
    slots: { bg: '#ffd6f0', primary: '#d6006f', secondary: '#6b00d6', accent: '#ff8a00', detail: '#00b3a4' } },
  { id: 'primary-bold', label: '三原色', description: '包豪斯式红、蓝、黄',
    slots: { bg: '#fff1cc', primary: '#e10600', secondary: '#0033cc', accent: '#ffcc00', detail: '#ff7a00' } },
  { id: 'jungle', label: '雨林', description: '翡翠绿、明黄、热粉',
    slots: { bg: '#004d36', primary: '#00e676', secondary: '#ffea00', accent: '#ff4081', detail: '#00b0ff' } },
  { id: 'sorbet', label: '雪葩', description: '西柚、紫罗兰、薄荷',
    slots: { bg: '#ffe0cc', primary: '#ff7a59', secondary: '#7b61ff', accent: '#00c2a8', detail: '#ffc233' } },
  { id: 'cobalt-flame', label: '钴焰', description: '钴蓝底上的火橙',
    slots: { bg: '#0a1f8f', primary: '#ff5a00', secondary: '#2e7dff', accent: '#ffd000', detail: '#ff2e63' } },
];

export function getPalette(id: string): Palette | undefined {
  return PALETTES.find((p) => p.id === id);
}

export function defaultPalette(): Palette {
  return PALETTES[0];
}