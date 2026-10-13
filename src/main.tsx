// ⚠️ 必须最先执行：在工作台同步 URL 之前接住 giscus 登录回跳的 ?giscus= 参数
import './ui/giscusBoot';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/theme.css';

const container = document.getElementById('root');
if (!container) throw new Error('#root 容器缺失，index.html 与 main.tsx 不一致');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);