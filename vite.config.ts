/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * 构建配置。
 *
 * 体积门禁（架构 §1.3）：react / mui / engine / patterns 拆成独立 chunk，
 * 既便于排查产物构成，也让 CI 的 gzip 总量核算有意义。
 */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    target: 'es2022',
    cssTarget: 'chrome111',
    sourcemap: false,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id: string): string | undefined {
          if (id.includes('node_modules')) {
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
            if (/node_modules[\\/](@mui|@emotion)[\\/]/.test(id)) return 'mui';
            return 'vendor';
          }
          if (id.includes('/src/patterns/')) return 'patterns';
          if (id.includes('/src/engine/')) return 'engine';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    // 引擎与 pattern 是纯函数层，Node 环境即可；DOM 相关测试会自行声明 @vitest-environment
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * 串行执行（不并行跑多个测试文件）。
     *
     * 为什么：vitest 的 worker 启动超时是**硬编码常量**（`START_TIMEOUT = 6e4`，
     * 不可通过配置调整），而每个 worker 都要重新加载整份 vitest 模块图。
     * 12 个文件并发启动时互相争抢 IO，冷缓存下单 worker 可能超过 60s 仍未就绪，
     * 报`Timeout waiting for worker to respond` —— 这是**环境性假失败**，不是用例失败。
     *
     * 本项目全部是纯函数单测、无跨文件状态共享，串行没有正确性代价；
     * 实测单次全量从「74s 且超时失败」降到「41s 全绿」。CI 上同样受益。
     * （注：vitest 4 已移除 `poolOptions.forks.singleFork`，对应写法是 `fileParallelism: false`）
     */
    fileParallelism: false,
    pool: 'forks',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      /**
       * 覆盖率范围 = 全部业务源码（不含测试自身）。
       *
       * 早先只统计 `src/engine`，会让数字虚高：patterns 里 12 个母题、
       * 以及 UI 状态逻辑都不在分母里。patterns 已纳入（有测试）；
       * `src/ui` / `src/dev` 暂未纳入 —— 它们是 .tsx，Phase 1 无 DOM 测试环境，
       * 强行计入只会把数字压成一个没有信息量的低值。
       */
      include: ['src/engine/**/*.ts', 'src/patterns/**/*.ts', 'src/shared/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.test.tsx', 'src/dev/**', 'src/App.tsx', 'src/main.tsx'],
      reporter: ['text-summary', 'json-summary'],
      reportsDirectory: './coverage',
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 75,
      },
    },
  },
});