/**
 * 应用外壳 —— 只做路由分流。
 *
 * `/`      → 工作台（用户面向的正式界面）
 * `/lab`   → PatternLab（开发期工具，保留用于引擎调试）
 *
 * 刻意不引入 react-router：只有两个路径，`location.pathname` 判断足够，
 * 省下的体积预算留给渲染引擎（架构 §1.6「刻意不引入路由」）。
 */
import PatternLab from './dev/PatternLab';
import { Workbench } from './ui/Workbench';

export default function App() {
  if (window.location.pathname === '/lab') return <PatternLab />;
  return <Workbench />;
}
