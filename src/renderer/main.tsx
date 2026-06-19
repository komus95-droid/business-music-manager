import React from 'react';
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

/**
 * Видимый аварийный экран вместо «чёрного окна». Две линии защиты:
 *   1) ErrorBoundary ловит ошибки во время рендера React (например, если мост
 *      window.api недоступен) — иначе React молча сносит дерево и окно пустеет.
 *   2) глобальные обработчики ловят всё остальное (ошибки модулей, промисов).
 * В проде DevTools под рукой нет, поэтому ошибку показываем прямо в окне.
 */
function fatalMarkup(label: string, err: unknown): string {
  const msg = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  const safe = msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
  return `<div style="font-family:Segoe UI,system-ui,sans-serif;color:#e6ebf5;padding:28px;line-height:1.5">
      <h2 style="color:#ff8585;margin:0 0 10px">&#9888; ${label}</h2>
      <pre style="white-space:pre-wrap;font-size:12px;color:#8a94ad;background:#18203a;border:1px solid #2f80ed55;border-radius:10px;padding:14px;overflow:auto">${safe}</pre>
    </div>`;
}
function showFatal(label: string, err: unknown) {
  const root = document.getElementById('root');
  if (root) root.innerHTML = fatalMarkup(label, err);
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Render error:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return <div dangerouslySetInnerHTML={{ __html: fatalMarkup('Ошибка интерфейса', this.state.error) }} />;
    }
    return this.props.children;
  }
}

window.addEventListener('error', (e) => showFatal('Ошибка выполнения', e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatal('Необработанная ошибка (promise)', e.reason));

function mount() {
  try {
    const el = document.getElementById('root');
    if (!el) { showFatal('Контейнер #root не найден', new Error('root missing')); return; }
    createRoot(el).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
  } catch (err) {
    showFatal('Ошибка при запуске интерфейса', err);
  }
}

// Скрипт классический и стоит в <head>; запускаемся только когда DOM готов,
// иначе #root ещё не существует и createRoot падает (это и был чёрный экран).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount);
} else {
  mount();
}
