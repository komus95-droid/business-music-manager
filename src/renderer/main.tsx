import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

// ДИАГНОСТИКА (Чат 10): метка, что бандл вообще начал исполняться. Инлайновый
// диагностический скрипт в index.html прочитает её — так отличаем «скрипт не
// загрузился» от «загрузился, но рендер упал».
(window as { __APP_BUNDLE_RAN__?: boolean }).__APP_BUNDLE_RAN__ = true;

// Видимый аварийный экран вместо «чёрного окна»: если бандл/рендер упадёт,
// показываем текст ошибки прямо в окне (в проде DevTools под рукой нет).
function showFatal(label: string, err: unknown) {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  const root = document.getElementById('root');
  const html =
    `<div style="font-family:Segoe UI,system-ui,sans-serif;color:#e8eefc;padding:28px;line-height:1.5">
      <h2 style="color:#ff8585;margin:0 0 10px">⚠ ${label}</h2>
      <pre style="white-space:pre-wrap;font-size:12px;color:#8da2c9;background:#101d39;border:1px solid #25406f;border-radius:10px;padding:14px;overflow:auto">${
        msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))
      }</pre>
    </div>`;
  if (root) root.innerHTML = html;
}

window.addEventListener('error', (e) => showFatal('Ошибка выполнения', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatal('Необработанная ошибка (promise)', e.reason));

try {
  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (err) {
  showFatal('Ошибка при запуске интерфейса', err);
}
