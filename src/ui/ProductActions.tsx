/**
 * 产物动作（分享 / 导出 / 源码）—— 挂在画布工具条末端。
 *
 * ⭐ 为什么独立成文件：这三个动作的**触发按钮**在画布栏（与参数、换一版同一条），
 * 而它们的**对话框**需要被渲染在顶层（fixed定位，不受工具条 overflow 影响）。
 * 抽出来既让 TopBar 与 CanvasStage 都能挂载它，也避免两份实现漂移。
 *
 * ⭐ Kumo `dialog-rendering`：两个 Dialog 都**永不条件渲染**，
 * 始终挂载、由 `open` 决定显隐 —— 否则开合动画每次都是「突然出现」。
 */
import { useEffect, useState } from 'react';
import { registry } from '../patterns';
import { detectPlatform, guardCanvasSize, type ExportScale } from '../shared/guards';
import { copySVGSource, exportPNG, exportSVG } from './exporters';
import { getConfig, usePatternDef, useWorkbenchSelector } from './store';
import { shareUrl } from './share';
import { Button, Dialog, Segmented } from './primitives';
import { IconCode } from './icons';
import type { NoticeFn } from './TopBar';

/**
 * 触发按钮组。
 *
 * 顺序 = 意图强度递增：查看源码（最轻）→ 分享（给他人）→ 导出（拿走产物）。
 * 导出是唯一的主操作（primary），其余降为 secondary。
 */
export function ProductActions({ onNotice }: { onNotice: NoticeFn }) {
  const [exportOpen, setExportOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const theme = useWorkbenchSelector((s) => s.ui.theme);
  const panel = useWorkbenchSelector((s) => s.ui.panel);

  const copyLink = async () => {
    const url = shareUrl(getConfig(), {
      theme: theme === 'system' ? 'system' : theme,
      panel,
    });
    try {
      await navigator.clipboard.writeText(url);
      onNotice('分享链接已复制', 'success');
    } catch {
      // 剪贴板在非 https / 无权限时不可用，退回展示让用户手动复制
      window.prompt('复制此链接分享当前壁纸：', url);
    }
  };

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => void copyLink()}>
        分享
      </Button>

      {/* 导出：单个主动作，对话框里再选格式 */}
      <Button variant="primary" size="sm" onClick={() => setExportOpen(true)}>
        导出
      </Button>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        onOpenSource={() => setSourceOpen(true)}
        onNotice={onNotice}
      />
      <SourceDialog open={sourceOpen} onClose={() => setSourceOpen(false)} onNotice={onNotice} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────
 * 导出对话框
 * ───────────────────────────────────────────────────────────────── */

function ExportDialog({
  open,
  onClose,
  onOpenSource,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  onOpenSource: () => void;
  onNotice: NoticeFn;
}) {
  const def = usePatternDef();
  const cfg = useWorkbenchSelector((s) => s.cfg);
  const [scale, setScale] = useState<ExportScale>(2);
  const [busy, setBusy] = useState(false);

  const platform = detectPlatform();
  const guard = guardCanvasSize(cfg.width, cfg.height, scale);
  const finalPixels = (guard.width * guard.height / 1_000_000).toFixed(1);

  const onSVG = () => {
    exportSVG(def, cfg);
    onNotice(`已导出 ${cfg.width}×${cfg.height} 的 SVG`, 'success');
    onClose();
  };

  const onPNG = async () => {
    setBusy(true);
    const result = await exportPNG(def, cfg, scale);
    setBusy(false);
    // 降级 / 不支持都要说出来 —— 静默降级会被当成 bug
    if (result.ok) onNotice(`已导出 ${guard.width}×${guard.height} 的 PNG`, 'success');
    else if (result.notice) onNotice(result.notice, 'warning');
    if (result.ok || !result.notice?.includes('iOS')) onClose();
  };

  /** 源码对话框叠在导出对话框之上：两个都是同一份产物的出口。 */
  const openSource = () => {
    onClose();
    onOpenSource();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="导出壁纸"
      description="导出为静态图像，动画只在预览中呈现。"
      footer={
        <>
          {/* 源码是同一份产物的第三个出口（SVG / PNG / 源码），
              因此放进导出对话框而不是单独占工具条一个图标位。 */}
          <Button variant="ghost" className="mr-auto" onClick={openSource}>
            <IconCode size={15} />
            查看源码
          </Button>
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="secondary" onClick={onSVG}>
            导出 SVG
          </Button>
          {platform === 'ios' ? (
            // ⭐ 刻意不用原生 disabled：disabled 的按钮不派发 click，
            //   点了毫无反应，用户会以为按钮坏了。用 aria-disabled 表达
            //   不可用语义，视觉照常灰化，点击给出明确替代路径。
            <Button
              variant="danger"
              aria-disabled={platform === 'ios'}
              className={platform === 'ios' ? 'cursor-not-allowed opacity-45' : ''}
              onClick={() =>
                onNotice(
                  'iOS 设备暂不支持 PNG 导出。SVG 是矢量、体积更小，建议直接用 SVG；' +
                    '若确实需要 PNG，可在桌面浏览器打开本站再导出。',
                  'warning',
                )
              }
            >
              导出 PNG（iOS 不支持）
            </Button>
          ) : (
            <Button variant="primary" disabled={busy} onClick={() => void onPNG()}>
              {busy ? '导出中…' : `导出 PNG @${scale}x`}
            </Button>
          )}
        </>
      }
    >
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-base text-fg-soft">输出尺寸</span>
          <code className="font-mono text-[0.9em] text-fg">
            {guard.width} × {guard.height}
          </code>
        </div>

        {platform !== 'ios' && (
          <div className="flex items-center justify-between gap-3">
            <span className="text-base text-fg-soft">倍率</span>
            <Segmented
              label="导出倍率"
              size="sm"
              value={String(scale) as '1' | '2' | '3'}
              onChange={(v) => setScale(Number(v) as ExportScale)}
              options={[
                { value: '1', label: '@1x' },
                { value: '2', label: '@2x' },
                { value: '3', label: '@3x' },
              ]}
            />
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="text-base text-fg-soft">像素总量</span>
          <span className="text-base text-fg-mute">{finalPixels} M px</span>
        </div>

        {/* 守卫提示：降级必须明示（PRD Q8：不可静默失败） */}
        {guard.notice && (
          <p className="rounded-md bg-warning-tint px-3 py-2 text-base text-warning">{guard.notice}</p>
        )}

        {platform === 'ios' && (
          <p className="rounded-md bg-warning-tint px-3 py-2 text-base text-warning">
            iOS 设备暂不支持 PNG 导出。SVG 是矢量、体积更小，建议直接用 SVG；
            若确实需要 PNG，可在桌面浏览器打开本站再导出。
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** 源码对话框 —— 供开发者查看与复制产物（PRD 验收项之一）。 */
function SourceDialog({
  open,
  onClose,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  onNotice: NoticeFn;
}) {
  const def = usePatternDef();
  const [copied, setCopied] = useState(false);

  // 只在打开时生成，避免每次父组件重渲染都重新渲染一遍 SVG
  const [svg, setSvg] = useState('');
  useEffect(() => {
    if (!open) return;
    void import('../engine/render').then(({ renderStandaloneSVG }) => {
      setSvg(renderStandaloneSVG(def, getConfig(), { skipBudget: true }));
    });
  }, [open, def]);

  const copy = async () => {
    const ok = await copySVGSource(def, getConfig());
    if (ok) {
      setCopied(true);
      onNotice('源码已复制到剪贴板', 'success');
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      onNotice('复制失败，请手动选择文本复制', 'warning');
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="SVG 源码"
      description="与预览、导出完全同一份产物，可直接粘贴到任意支持 SVG 的地方。"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" onClick={() => void copy()}>
            {copied ? '已复制' : '复制源码'}
          </Button>
        </>
      }
    >
      <pre className="vw-scroll max-h-80 overflow-auto rounded-md bg-surface-3 p-3 font-mono text-[0.9em] leading-relaxed text-fg-soft">
        {svg}
      </pre>
      <p className="text-2xs text-fg-mute">
        共 {(new TextEncoder().encode(svg).length / 1024).toFixed(1)} KB · 母题库共 {registry.size} 个
      </p>
    </Dialog>
  );
}