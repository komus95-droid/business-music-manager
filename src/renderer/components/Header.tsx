import type { ReactNode } from 'react';
import type { AppMode, ThemeMode } from '@shared';

interface Props {
  mode: AppMode;
  onMode(mode: AppMode): void;
  theme: ThemeMode;
  onToggleTheme(): void;
  snap: number;
  onSnap(snap: number): void;
  onClear(): void;
  canClear: boolean;
  canEdit: boolean;
  /** правый слот шапки — статус-карточка эфира (Чат 9) */
  extra?: ReactNode;
}

const SNAP_OPTIONS = [1, 5, 15];

/** Шапка: логотип, переключатель Студия/В эфире, шаг привязки, тема, статус эфира. */
export function Header({ mode, onMode, theme, onToggleTheme, snap, onSnap, onClear, canClear, canEdit, extra }: Props) {
  return (
    <header className="appbar">
      <span className="logo">RunBiz <b>Ai</b><span className="logo-sep">|</span><span className="logo-sub">COMMERCIAL PLAYER</span></span>

      <div className="seg" role="tablist" aria-label="Режим">
        <button
          type="button" role="tab" aria-selected={mode === 'studio'}
          className={mode === 'studio' ? 'on' : ''} onClick={() => onMode('studio')}
        >Студия</button>
        <button
          type="button" role="tab" aria-selected={mode === 'onair'}
          className={mode === 'onair' ? 'on' : ''} onClick={() => onMode('onair')}
        >В эфире</button>
      </div>

      <div className="appbar-tools">
        <label className="tool">
          шаг
          <select
            value={snap} disabled={!canEdit}
            onChange={(e) => onSnap(Number(e.target.value))}
          >
            {SNAP_OPTIONS.map((m) => <option key={m} value={m}>{m} мин</option>)}
          </select>
        </label>
        <button type="button" className="btn" disabled={!canClear} onClick={onClear}>
          Очистить
        </button>
        <button
          type="button" className="btn icon" onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
          title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>

      {extra}
    </header>
  );
}
