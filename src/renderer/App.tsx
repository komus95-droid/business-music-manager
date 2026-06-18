import { useEffect, useState } from 'react';
import type { AppMode, ThemeMode, View, DayId } from '@shared';
import { useStore } from './state/useStore';
import { Header } from './components/Header';
import { DayList } from './components/DayList';
import { PlayerBar } from './components/PlayerBar';
import { LibraryPanel } from './library/LibraryPanel';
import { DayEditor } from './schedule/DayEditor';
import { SNAP_DEFAULT } from './schedule/timeline';

/**
 * Шелл приложения (Чат 5). Раскладка из утверждённого референса:
 * шапка / [дни | редактор дня | библиотека] / плеер.
 *
 * Редактор расписания активен в Студии. В режиме «В эфире» правка заблокирована
 * (автовещание собирается в Чате 9) — пока это визуальная блокировка.
 */
export function App() {
  const api = useStore();
  const [mode, setMode] = useState<AppMode>('studio');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [view, setView] = useState<View>({ type: 'day', id: 'mon' });
  const [snap, setSnap] = useState<number>(SNAP_DEFAULT);

  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  if (api.error) return <div className="boot error">Ошибка загрузки: {api.error}</div>;
  if (!api.store) return <div className="boot">Загрузка…</div>;

  const store = api.store;
  const dayId: DayId = view.type === 'day' ? view.id : 'mon';
  const canEdit = mode === 'studio';

  return (
    <div className="app">
      <Header
        mode={mode} onMode={setMode}
        theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        snap={snap} onSnap={setSnap}
        onClearDay={() => api.clearDay(dayId)}
        canEdit={canEdit}
      />

      <div className="app-body">
        <DayList week={store.week} currentDayId={dayId} onSelect={(id) => setView({ type: 'day', id })} />

        <main className="app-center">
          {!canEdit && (
            <p className="onair-note" role="status">
              Идёт эфир — редактирование расписания недоступно (автовещание — Чат 9).
            </p>
          )}
          <DayEditor day={store.week[dayId]} store={store} api={api} snap={snap} canEdit={canEdit} />
        </main>

        <LibraryPanel store={store} canDrag={canEdit} />
      </div>

      <PlayerBar />
    </div>
  );
}
