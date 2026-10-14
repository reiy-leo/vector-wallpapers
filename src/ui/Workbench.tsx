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
import { Tabs } from '@cloudflare/kumo/components/tabs';
import type { ColorStrategy } from '../engine/colors';
import { detectPlatform } from '../shared/guards';
import { CanvasStage } from './CanvasStage';
import { ElementPanel } from './ElementPanel';
import { CuratedSetsPanel, PalettePanel, ParamPanel, ReshuffleButton } from './Panels';
import { PatternRail } from './PatternRail';
import { TopBar, type NoticeTone } from './TopBar';
import { Toast } from './primitives';
import { installReviewListeners, loadDefaults, setReviewOwner } from './admin-review';
import { LoginGateDialog } from './LoginGate';
import { isSignedIn, openLoginGate, useAuth } from './auth';
import {
  applyPendingShare,
  applyTheme,
  getConfig,
  hasPendingShare,
  pushRecent,
  scheduleUrlSync,
  useWorkbench,
  useWorkbenchSelector,
} from './store';

type PanelTab = 'params' | 'palettes' | 'sets';

/**
 * Tab 顺序 = 使用频率顺序。
 * 「配色」排第一并非因为最好看，而是因为它承载本产品的核心差异化
 * （PRD P0-2 元件级配色）—— 新用户最可能先碰的就是它。
 */
const TABS: ReadonlyArray<{ id: PanelTab; label: string }> = [
  // Rei 2026-10-14：「配色」并进「参数」（元件配色 + 重排图案 + 可调项说明）
  { id: 'params', label: '参数' },
  { id: 'palettes', label: '色板' },
  { id: 'sets', label: '合集' },
];

export function Workbench() {
  const state = useWorkbench();
  // 「换一版」只从色板列表取色（Rei 2026-10-12：色板最稳妥，去掉邻近色/全色域策略）
  const strategy: ColorStrategy = 'palette';
  const [notice, setNotice] = useState<{ message: string; tone: NoticeTone } | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'desktop'>('desktop');
  const [tab, setTab] = useState<PanelTab>('params');

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

  /**
   * 分享链接需要登录（Rei 2026-10-12）：store 首屏只暂存分享配置、画布显示默认壁纸。
   * /api/me 有结论后：已登录 → 套用分享；未登录（含无 Worker 的纯静态预览）→ 弹出登录门禁。
   */
  const auth = useAuth();
  useEffect(() => {
    if (auth.status === 'loading' || !hasPendingShare()) return;
    if (isSignedIn(auth)) {
      if (applyPendingShare()) onNotice('已载入分享的壁纸', 'success');
    } else {
      openLoginGate('share');
    }
  }, [auth, onNotice]);

  /**
   * 服务器默认值（批改模式上传的）：不阻塞首屏，到达后未动过的默认画布换成覆盖后的默认。
   * 批改模式只对管理员账号生效（/api/me 的 admin）。
   */
  useEffect(() => {
    installReviewListeners();
    void loadDefaults();
  }, []);
  const reviewEmail = auth.status === 'ready' ? (auth.me.user?.email ?? null) : null;
  const reviewAdmin = auth.status === 'ready' && auth.me.admin === true;
  useEffect(() => {
    if (auth.status === 'loading') return;
    setReviewOwner(reviewEmail, reviewAdmin);
  }, [auth.status, reviewEmail, reviewAdmin]);

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

  const { focus, panel } = state.ui;
  // 面板位置：left 时参数栏在最左、母题库在最右（顶栏「切换面板位置」）
  const panelLeft = panel === 'left';
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
            panelLeft ? 'xl:grid-cols-[360px_minmax(0,1fr)_280px]' : 'xl:grid-cols-[280px_minmax(0,1fr)_360px]',
          ].join(' ')}
        >
          {/* ① 母题库 —— xl 以上与面板同屏；窄屏由底部抽屉承担 */}
          {!focus && (
            <aside
              className={`hidden min-h-0 border-line bg-surface xl:flex xl:flex-col ${panelLeft ? 'xl:order-3 border-l' : 'border-r'}`}
              aria-label="母题库"
            >
              <PatternRail favorites={state.favorites} />
            </aside>
          )}

          {/* ② 画布 —— flex-1，任何断点下都是视觉主角 */}
          <section id="vw-stage" aria-label="预览画布" className="flex min-h-0 flex-col bg-canvas xl:order-2">
            <CanvasStage strategy={strategy} onNotice={onNotice} />
          </section>

          {/* ③ 参数与配色 */}
          {!focus && (
            <aside
              className={[
                'border-line bg-surface',
                // xl：独立右栏；lg 以下：画布下方的整宽区块
                panelLeft ? 'border-t xl:order-1 xl:border-t-0 xl:border-r' : 'border-t xl:order-3 xl:border-t-0 xl:border-l',
                'max-xl:px-5 max-xl:py-6 xl:p-5',
                'xl:min-h-0 xl:overflow-y-auto',
              ].join(' ')}
              aria-label="参数与配色"
            >
              <PanelBody
                tab={tab}
                onTab={setTab}
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
      {/* 登录门禁：收藏 / 导出 / 分享链接共用一个弹窗（永不条件渲染） */}
      <LoginGateDialog />

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
  onIOS,
}: {
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onIOS: boolean;
}) {
  return (
    <div className="grid gap-5">
      <TabBar tab={tab} onTab={onTab} />

      {tab === 'params' && (
        <>
          <div className="flex">
            <ReshuffleButton />
          </div>
          <ElementPanel />
          <ParamPanel />
        </>
      )}
      {tab === 'palettes' && <PalettePanel />}
      {tab === 'sets' && <CuratedSetsPanel />}

      {onIOS && (
        <p className="rounded-md bg-warning-tint px-3 py-2 text-sm text-warning">
          检测到 iOS 设备：PNG 导出不可用，请使用 SVG（矢量、体积更小）。
        </p>
      )}
    </div>
  );
}

function TabBar({ tab, onTab }: { tab: PanelTab; onTab: (t: PanelTab) => void }) {
  /*
   * kumo `Tabs`（underline）：自带 border-b 分隔（Kumo `sticky-borders`）、
   * 滑动指示器与 roving tabindex / 方向键导航（Base UI Tabs）。
   */
  return (
    <Tabs
      variant="underline"
      className="-mb-1"
      value={tab}
      onValueChange={(v) => onTab(v as PanelTab)}
      tabs={TABS.map((t) => ({ value: t.id, label: t.label }))}
    />
  );
}
