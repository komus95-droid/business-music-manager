import type { ReactNode } from 'react';
import type { AppMode, ThemeMode } from '@shared';

interface Props {
  mode: AppMode;
  onMode(mode: AppMode): void;
  theme: ThemeMode;
  onToggleTheme(): void;
  onOpenSettings(): void;
  /** правый слот шапки — статус-карточка эфира (Чат 9) */
  extra?: ReactNode;
}

/**
 * Шапка по прототипу: логотип слева, переключатель «Студия / В эфире» по центру,
 * справа — иконки темы, мини-виджета (пока неактивна) и настроек, затем
 * статус-карточка эфира. Шаг привязки и «Очистить» переехали в панель дня.
 */
export function Header({ mode, onMode, theme, onToggleTheme, onOpenSettings, extra }: Props) {
  return (
    <header>
      <div className="logo">
        RunBiz <span className="ai">Ai</span><span className="sep">|</span>COMMERCIAL PLAYER
      </div>

      <div className="mode-switch" role="tablist" aria-label="Режим">
        <button
          type="button" role="tab" aria-selected={mode === 'studio'}
          className={mode === 'studio' ? 'active' : ''} onClick={() => onMode('studio')}
        >Студия</button>
        <button
          type="button" role="tab" aria-selected={mode === 'onair'}
          className={`onair${mode === 'onair' ? ' active' : ''}`} onClick={() => onMode('onair')}
        >В эфире</button>
      </div>

      <div className="head-right">
        <button
          type="button" className="icon-btn" onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >{theme === 'dark' ? '🌙' : '☀️'}</button>
        <button
          type="button" className="icon-btn" disabled
          aria-label="Свернуть в мини-виджет" title="Мини-виджет — скоро"
        >⎯</button>
        <button
          type="button" className="icon-btn" onClick={onOpenSettings}
          aria-label="Настройки" title="Настройки"
        >⚙</button>
        {extra}
      </div>
    </header>
  );
}
