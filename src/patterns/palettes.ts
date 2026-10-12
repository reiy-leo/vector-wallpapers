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
  /** 色板面板里的分组标题；缺省归入「基础」。 */
  group?: PaletteGroup;
}

/** 色板面板的分组，按此顺序展示。 */
export const PALETTE_GROUPS = ['基础', '流行配色', '编辑器主题', '韦斯·安德森', '名画', '设计流派'] as const;
export type PaletteGroup = (typeof PALETTE_GROUPS)[number];

/** 内置色板：PRD P0-2 点名的 10 套（基础）+ 按来源分组的扩充色板。 */
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
  // ── 以下为扩充色板（2026-10）：流行配色取自 Coolors 热门、编辑器主题取官方色值、
  //    韦斯·安德森取自 wesanderson R 包、名画取自 MetBrewer；只取 5 色映射到槽位。
  { id: 'coolors-coast', label: '海岸', group: '流行配色', description: 'Coolors 经典：墨绿、沙黄、珊瑚',
    slots: { bg: '#264653', primary: '#e9c46a', secondary: '#2a9d8f', accent: '#e76f51', detail: '#f4a261' } },
  { id: 'coolors-flag', label: '旗帜', group: '流行配色', description: 'Coolors 经典：海军蓝、正红、橙黄',
    slots: { bg: '#eae2b7', primary: '#003049', secondary: '#d62828', accent: '#f77f00', detail: '#fcbf49' } },
  { id: 'coolors-pool', label: '泳池', group: '流行配色', description: 'Coolors 经典：深海蓝、天蓝、橙',
    slots: { bg: '#023047', primary: '#ffb703', secondary: '#219ebc', accent: '#fb8500', detail: '#8ecae6' } },
  { id: 'coolors-olive', label: '橄榄', group: '流行配色', description: 'Coolors 经典：橄榄、奶油、焦糖',
    slots: { bg: '#fefae0', primary: '#283618', secondary: '#606c38', accent: '#bc6c25', detail: '#dda15e' } },
  { id: 'coolors-dusk', label: '暮霭', group: '流行配色', description: 'Coolors 经典：靛灰、藕荷、米粉',
    slots: { bg: '#f2e9e4', primary: '#22223b', secondary: '#4a4e69', accent: '#9a8c98', detail: '#c9ada7' } },
  { id: 'coolors-electric', label: '电光', group: '流行配色', description: 'Coolors 经典：品红、电紫、天青',
    slots: { bg: '#3a0ca3', primary: '#4cc9f0', secondary: '#f72585', accent: '#4361ee', detail: '#7209b7' } },
  { id: 'pastel-pop', label: '糖果', group: '流行配色', description: 'Coolors 经典粉彩：桃、天蓝、柠檬、薄荷',
    slots: { bg: '#fff7f0', primary: '#ffadad', secondary: '#a0c4ff', accent: '#fdffb6', detail: '#caffbf' } },
  { id: 'nord', label: 'Nord', group: '编辑器主题', description: '北极蓝灰与霜色',
    slots: { bg: '#2e3440', primary: '#88c0d0', secondary: '#81a1c1', accent: '#ebcb8b', detail: '#bf616a' } },
  { id: 'solarized-light', label: 'Solarized 亮', group: '编辑器主题', description: '米黄纸底上的蓝绿橙',
    slots: { bg: '#fdf6e3', primary: '#268bd2', secondary: '#2aa198', accent: '#cb4b16', detail: '#b58900' } },
  { id: 'solarized-dark', label: 'Solarized 暗', group: '编辑器主题', description: '深青底，蓝绿金品红',
    slots: { bg: '#002b36', primary: '#268bd2', secondary: '#2aa198', accent: '#b58900', detail: '#d33682' } },
  { id: 'dracula', label: 'Dracula', group: '编辑器主题', description: '暗紫底，紫粉绿青',
    slots: { bg: '#282a36', primary: '#bd93f9', secondary: '#ff79c6', accent: '#50fa7b', detail: '#8be9fd' } },
  { id: 'gruvbox', label: 'Gruvbox', group: '编辑器主题', description: '复古暖褐底，红绿黄',
    slots: { bg: '#282828', primary: '#fb4934', secondary: '#b8bb26', accent: '#fabd2f', detail: '#83a598' } },
  { id: 'catppuccin-mocha', label: 'Catppuccin 摩卡', group: '编辑器主题', description: '奶油感粉彩配深底',
    slots: { bg: '#1e1e2e', primary: '#cba6f7', secondary: '#89b4fa', accent: '#f9e2af', detail: '#f38ba8' } },
  { id: 'catppuccin-latte', label: 'Catppuccin 拿铁', group: '编辑器主题', description: '奶白底，紫蓝橙绿',
    slots: { bg: '#eff1f5', primary: '#8839ef', secondary: '#1e66f5', accent: '#fe640b', detail: '#40a02b' } },
  { id: 'tokyo-night', label: '东京夜', group: '编辑器主题', description: '午夜蓝与霓虹紫',
    slots: { bg: '#1a1b26', primary: '#7aa2f7', secondary: '#bb9af7', accent: '#e0af68', detail: '#7dcfff' } },
  { id: 'rose-pine', label: '玫瑰松', group: '编辑器主题', description: '暗紫底上的玫瑰与金',
    slots: { bg: '#191724', primary: '#ebbcba', secondary: '#c4a7e7', accent: '#f6c177', detail: '#31748f' } },
  { id: 'rose-pine-dawn', label: '玫瑰松·晨', group: '编辑器主题', description: '晨光米底，玫瑰与松绿',
    slots: { bg: '#faf4ed', primary: '#d7827e', secondary: '#907aa9', accent: '#ea9d34', detail: '#286983' } },
  { id: 'monokai', label: 'Monokai', group: '编辑器主题', description: '橄榄黑底，洋红酸绿',
    slots: { bg: '#272822', primary: '#f92672', secondary: '#a6e22e', accent: '#e6db74', detail: '#66d9ef' } },
  { id: 'everforest', label: '常青林', group: '编辑器主题', description: '雾绿底，苔绿与暖黄',
    slots: { bg: '#2d353b', primary: '#a7c080', secondary: '#83c092', accent: '#dbbc7f', detail: '#e67e80' } },
  { id: 'grand-budapest', label: '布达佩斯大饭店', group: '韦斯·安德森', description: '糖果粉、酒红、薰衣草蓝',
    slots: { bg: '#e6a0c4', primary: '#5b1a18', secondary: '#7294d4', accent: '#fd6467', detail: '#f1bb7b' } },
  { id: 'moonrise-kingdom', label: '月升王国', group: '韦斯·安德森', description: '芥末黄、天蓝、橄榄',
    slots: { bg: '#fad77b', primary: '#24281a', secondary: '#85d4e3', accent: '#f4b5bd', detail: '#9c964a' } },
  { id: 'darjeeling', label: '大吉岭', group: '韦斯·安德森', description: '杏色底，孔雀蓝与橙',
    slots: { bg: '#eccbae', primary: '#046c9a', secondary: '#00a08a', accent: '#f98400', detail: '#f2ad00' } },
  { id: 'royal-tenenbaums', label: '天才一族', group: '韦斯·安德森', description: '奶油底，铁锈红与灰蓝',
    slots: { bg: '#faefd1', primary: '#c93312', secondary: '#899da4', accent: '#dc863b', detail: '#74a089' } },
  { id: 'life-aquatic', label: '水底生活', group: '韦斯·安德森', description: '泽苏蓝、明黄、红帽',
    slots: { bg: '#3b9ab2', primary: '#ebcc2a', secondary: '#f21a00', accent: '#e1af00', detail: '#78b7c5' } },
  { id: 'fantastic-fox', label: '了不起的狐狸爸爸', group: '韦斯·安德森', description: '秋橙、芥末、狐红',
    slots: { bg: '#dd8d29', primary: '#b40f20', secondary: '#46acc8', accent: '#e2d200', detail: '#e58601' } },
  { id: 'asteroid-city', label: '小行星城', group: '韦斯·安德森', description: '沙漠沙、蒂芙尼绿、橙',
    slots: { bg: '#ceb175', primary: '#e54e21', secondary: '#0a9f9d', accent: '#6c8645', detail: '#c18748' } },
  { id: 'isle-of-dogs', label: '犬之岛', group: '韦斯·安德森', description: '米灰、焦糖、炭黑',
    slots: { bg: '#ead3bf', primary: '#1c1718', secondary: '#aa9486', accent: '#b6854d', detail: '#39312f' } },
  { id: 'bottle-rocket', label: '瓶装火箭', group: '韦斯·安德森', description: '藏青底，明黄与正红',
    slots: { bg: '#273046', primary: '#fad510', secondary: '#cb2314', accent: '#e1bd6d', detail: '#354823' } },
  { id: 'hokusai-wave', label: '神奈川冲浪', group: '名画', description: '北斋的普鲁士蓝',
    slots: { bg: '#0a3351', primary: '#abc9c8', secondary: '#4692b0', accent: '#72aeb6', detail: '#2f70a1' } },
  { id: 'hokusai-red', label: '北斋赤富士', group: '名画', description: '暖黄底，靛蓝与赭红',
    slots: { bg: '#edc775', primary: '#224b5e', secondary: '#b75347', accent: '#df7e66', detail: '#94b594' } },
  { id: 'hiroshige', label: '广重', group: '名画', description: '浮世绘的晚霞与海蓝',
    slots: { bg: '#ffe6b7', primary: '#1e466e', secondary: '#e76254', accent: '#f7aa58', detail: '#72bcd5' } },
  { id: 'starry-night', label: '星月夜', group: '名画', description: '梵高的深蓝与星黄',
    slots: { bg: '#2c2d54', primary: '#eebe04', secondary: '#89a6bb', accent: '#e9a00e', detail: '#87bcbd' } },
  { id: 'olive-grove', label: '橄榄园', group: '名画', description: '梵高的苍绿层次',
    slots: { bg: '#e7e5cc', primary: '#1f5b25', secondary: '#669d62', accent: '#9cc184', detail: '#3c7c3d' } },
  { id: 'klimt', label: '克里姆特', group: '名画', description: '金底上的宝石色',
    slots: { bg: '#eacc62', primary: '#3c4b99', secondary: '#c93f55', accent: '#469d76', detail: '#924099' } },
  { id: 'monet', label: '莫奈睡莲', group: '名画', description: '藕粉、水绿、暮蓝',
    slots: { bg: '#e3cacf', primary: '#41507b', secondary: '#749e89', accent: '#c399a2', detail: '#abccbe' } },
  { id: 'renoir', label: '雷诺阿', group: '名画', description: '夜蓝底，暖金与玫瑰',
    slots: { bg: '#17154f', primary: '#f5bb50', secondary: '#e48171', accent: '#9d9cd5', detail: '#ada43b' } },
  { id: 'okeeffe', label: '欧姬芙', group: '名画', description: '象牙白，钴蓝与陶橙',
    slots: { bg: '#f6f2ee', primary: '#133e7e', secondary: '#da6c42', accent: '#7db0ea', detail: '#fbc2a9' } },
  { id: 'signac', label: '西涅克', group: '名画', description: '点彩的明黄、紫、翠绿',
    slots: { bg: '#fbe183', primary: '#633372', secondary: '#d8443c', accent: '#2b9b81', detail: '#1f6e9c' } },
  { id: 'egypt', label: '古埃及', group: '名画', description: '赭黄底，青金石与朱红',
    slots: { bg: '#fab255', primary: '#0f7ba2', secondary: '#dd5129', accent: '#43b284', detail: '#fff1d6' } },
  { id: 'isfahan', label: '伊斯法罕', group: '名画', description: '孔雀石底，鎏金与青瓷',
    slots: { bg: '#054544', primary: '#e3c28b', secondary: '#4fb6ca', accent: '#ae8548', detail: '#178f92' } },
  { id: 'navajo', label: '纳瓦霍', group: '名画', description: '驼色底，酒红与靛蓝',
    slots: { bg: '#e1c59a', primary: '#660d20', secondary: '#094568', accent: '#e59a52', detail: '#edce79' } },
  { id: 'tam', label: '塔姆', group: '名画', description: '茄紫底，日落渐变',
    slots: { bg: '#341648', primary: '#ffd353', secondary: '#ef8737', accent: '#de4f33', detail: '#9f2d55' } },
  { id: 'mondrian', label: '蒙德里安', group: '设计流派', description: '白底黑线，红黄蓝',
    slots: { bg: '#f2f2f2', primary: '#dd0100', secondary: '#225095', accent: '#fac901', detail: '#111111' } },
  { id: 'scandi', label: '北欧', group: '设计流派', description: '米白、石板灰、鼠尾草',
    slots: { bg: '#f4f1ec', primary: '#2f3e46', secondary: '#84a98c', accent: '#e9c46a', detail: '#cad2c5' } },
  { id: 'terracotta', label: '陶土', group: '设计流派', description: '赤陶、焦糖、橄榄',
    slots: { bg: '#f3e9dc', primary: '#c0603a', secondary: '#8a5a44', accent: '#d9a066', detail: '#5e7a5b' } },
  { id: 'swiss', label: '瑞士风格', group: '设计流派', description: '国际主义的红黑白',
    slots: { bg: '#ffffff', primary: '#e30613', secondary: '#111111', accent: '#555555', detail: '#9a9a9a' } },
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