/**
 * 工作台 —— 三栏布局的组合根。
 *
 * 断点策略（PRD §4.3）：
 *   ≥1280px  三栏：母题库 280px │ 画布 flex-1 │ 面板 360px
 *   768~1279 两栏：母题库折叠，画布 + 面板并排（面板移到画布下方）
 *   <768px   单栏：画布占主视野，控制项收进底部抽屉
 *
 * ⭐ 布局**不用 JS 测量宽度**，全部交给 CSS 断点。
 * JS 断点会带来「首次渲染宽度未知 → 先闪一下再重排」，
 * 而 CSS 断点在首帧就是最终布局。
 */
import { useCallback, useEffect, useState } from 'react';
import type { ColorStrategy } from '../engine/colors';
import { detectPlatform } from '../shared/guards';
import { CanvasStage } from './CanvasStage';
import { ElementPanel } from './ElementPanel';
import { CuratedSetsPanel, PalettePanel, ParamPanel } from './Panels';
import { PatternRail } from './PatternRail';
import { TopBar, type NoticeTone } from './TopBar';
import { Toast } from './primitives';
import {
  applyTheme,
  getConfig,
  pushRecent,
  scheduleUrlSync,
  useWorkbench,
  useWorkbenchSelector,
} from './store';

type PanelTab = 'colors' | 'params' | 'palettes' | 'sets';

/**
 * Tab 顺序 = 使用频率顺序。
 * 「配色」排第一并非因为最好看，而是因为它承载本产品的核心差异化
 * （PRD P0-2 元件级配色）—— 新用户最可能先碰的就是它。
 */
const TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  { id: 'colors', label: '配色' },
  { id: 'params', label: '参数' },
  { id: 'palettes', label: '色板' },
  { id: 'sets', label: '合集' },
];

export function Workbench() {
  const state = useWorkbench();
  const [strategy, setStrategy] = useState<ColorStrategy>('analogous');
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'desktop'>('desktop');
  const [tab, setTab] = useState<PanelTab>('colors');

  const onNotice = useCallback((message: string, tone: NoticeTone = 'info') => {
    setNotice(message === '' ? null : { message, tone });
  }, []);

  /**
   * 平台能力放在 state 而非模块常量。
   *
   * 模块级 `const isIOS = detectPlatform() === 'ios'` 会在**模块求值时**读
   * navigator，预渲染环境下只能得到 desktop，注水后不更新 ——
   * 表现为「iPad 上导出按钮没灰掉」。放进 state 并在挂载时读才拿得到真值。
   */
  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  // 主题落 DOM（store 初始化时已从 URL / localStorage 水合过主题）
  useEffect(() => {
    applyTheme(state.ui.theme);
  }, [state.ui.theme]);

  // 配置/主题变化 → 防抖写回地址栏（PRD P0-6）
  useEffect(() => {
    scheduleUrlSync(getConfig, state.ui);
  }, [state.cfg, state.ui]);

  // 切母题 → 记入「最近使用」（PRD P0-7）
  const patternId = useWorkbenchSelector((s) => s.cfg.patternId);
  useEffect(() => {
    pushRecent(patternId);
  }, [patternId]);

  // 提示条自动消失：降级提示必须被看到，但不该一直挡着界面
  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const { focus } = state.ui;
  const onIOS = platform === 'ios';

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas text-fg">
      <a href="#vw-stage" className="vw-skip-link">
        跳到预览画布
      </a>

      {!focus && <TopBar onNotice={onNotice} />}

      <main className="min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        <div
          className={[
            'grid min-h-full lg:h-full',
            // ≥1280 三栏；768~1279 两栏（母题库隐藏，画布 + 面板）
            'grid-cols-1',
            'xl:grid-cols-[280px_minmax(0,1fr)_360px]',
          ].join(' ')}
        >
          {/* ① 母题库 —— xl 以上与面板同屏；窄屏由底部抽屉承担 */}
          {!focus && (
            <aside
              className="hidden min-h-0 border-r border-line bg-surface xl:flex xl:flex-col"
              aria-label="母题库"
            >
              <PatternRail favorites={state.favorites} />
            </aside>
          )}

          {/* ② 画布 —— flex-1，任何断点下都是视觉主角 */}
          <section id="vw-stage" aria-label="预览画布" className="flex min-h-0 flex-col bg-canvas">
            <CanvasStage strategy={strategy} onNotice={onNotice} />
          </section>

          {/* ③ 参数与配色 */}
          {!focus && (
            <aside
              className={[
                'border-line bg-surface',
                // xl：独立右栏；lg 以下：画布下方的整宽区块
                'border-t xl:border-t-0 xl:border-l',
                'max-xl:px-5 max-xl:py-6 xl:p-5',
                'xl:min-h-0 xl:overflow-y-auto',
              ].join(' ')}
              aria-label="参数与配色"
            >
              <PanelBody
                tab={tab}
                onTab={setTab}
                strategy={strategy}
                onStrategy={setStrategy}
                onIOS={onIOS}
              />
            </aside>
          )}
        </div>
      </main>

      {/*
       * 提示条：⭐ 永不条件渲染（Kumo dialog-rendering 的同源要求）——
       * 常驻 DOM，用内部 data-show 控制显隐，入场动画才不会在首次显示时丢失。
       */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div className="pointer-events-auto">
          <Toast
            message={notice?.message ?? null}
            tone={notice?.tone ?? 'info'}
            onDismiss={() => setNotice(null)}
          />
        </div>
      </div>
    </div>
  );
}

/** 右栏内容：Tab 切换 + 对应面板。 */
function PanelBody({
  tab,
  onTab,
  strategy,
  onStrategy,
  onIOS,
}: {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  strategy: ColorStrategy;
  onStrategy: (s: ColorStrategy) => void;
  onIOS: boolean;
}) {
  return (
    <div className="grid gap-5">
      <TabBar tab={tab} onTab={onTab} />

      {tab === 'colors' && <ElementPanel />}
      {tab === 'params' && <ParamPanel />}
      {tab === 'palettes' && <PalettePanel strategy={strategy} onStrategyChange={onStrategy} />}
      {tab === 'sets' && <CuratedSetsPanel />}

      {onIOS && (
        <p className="rounded-md bg-warning-tint px-3 py-2 text-sm text-warning">
          检测到 iOS 设备：PNG 导出不可用，请使用 SVG（矢量、体积更小）。
        </p>
      )}

      <p className="border-t border-line pt-3 text-2xs leading-relaxed text-fg-mute">
        元件列表与参数控件均由母题定义自动生成 —— 新增母题无需改动界面代码。
      </p>
    </div>
  );
}

function TabBar({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  return (
    /*
     * ⭐ Kumo `sticky-borders`：粘性 Tab 栏用 border 与内容分隔。
     * 4 个中文标签在 360px 栏里约 240px，加上 4×24px 内边距仍在预算内，
     * 因此不需要横向滚动 —— 滚动会把「合集」藏起来，得不偿失。
     */
    <nav
      aria-label="面板分组"
      className="-mb-1 flex gap-1 border-b border-line"
    >
      {TABS.map((t) => {
        const active = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            aria-current={active ? 'page' : undefined}
            onClick={() => onTab(t.id)}
            className={[
              '-mb-px shrink-0 border-b-2 px-2.5 py-2 text-base',
              active
                ? 'border-brand font-medium text-fg'
                : 'border-transparent text-fg-soft hover:text-fg',
            ].join(' ')}
          >
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
