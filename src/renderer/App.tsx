import { useEffect, useState } from 'react';
import type { AppMode, ThemeMode, View, BlockOwner } from '@shared';
import { conflictingHolidayIds, MAX_HOLIDAYS } from '@shared';
import { useStore } from './state/useStore';
import { Header } from './components/Header';
import { DayList } from './components/DayList';
import { HolidayBar } from './components/HolidayBar';
import { PlayerBar } from './components/PlayerBar';
import { LibraryPanel } from './library/LibraryPanel';
import { DayEditor } from './schedule/DayEditor';
import { HolidayEditor } from './schedule/HolidayEditor';
import { SNAP_DEFAULT } from './schedule/timeline';
import { flash } from './ui/flash';

/**
 * Шелл приложения. Раскладка референса: шапка / [дни | центр | библиотека] /
 * плеер. Центр сверху — лента праздников, ниже — редактор дня ИЛИ праздника.
 * В режиме «В эфире» правка заблокирована (автовещание — Чат 9).
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
  const canEdit = mode === 'studio';

  // праздник из view может быть удалён — тогда откатываемся на понедельник
  const holiday = view.type === 'holiday' ? store.holidays.find((h) => h.id === view.id) : undefined;
  const owner: BlockOwner | null =
    view.type === 'day' ? { kind: 'day', id: view.id }
      : (view.type === 'holiday' && holiday) ? { kind: 'holiday', id: holiday.id }
        : null;

  const holConflicts = conflictingHolidayIds(store.holidays);

  function addHoliday() {
    const id = api.addHoliday();
    if (id) setView({ type: 'holiday', id });
    else flash(`Достигнут лимит праздников (${MAX_HOLIDAYS})`);
  }

  return (
    <div className="app">
      <Header
        mode={mode} onMode={setMode}
        theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        snap={snap} onSnap={setSnap}
        onClear={() => { if (owner) api.clearBlocks(owner); }}
        canClear={canEdit && owner !== null}
        canEdit={canEdit}
      />

      <div className="app-body">
        <DayList
          week={store.week}
          currentDayId={view.type === 'day' ? view.id : null}
          onSelect={(id) => setView({ type: 'day', id })}
        />

        <main className="app-center">
          {!canEdit && (
            <p className="onair-note" role="status">
              Идёт эфир — редактирование расписания недоступно (автовещание — Чат 9).
            </p>
          )}

          <HolidayBar
            holidays={store.holidays}
            currentId={view.type === 'holiday' ? view.id : null}
            conflictIds={holConflicts}
            canAdd={canEdit && store.holidays.length < MAX_HOLIDAYS}
            onSelect={(id) => setView({ type: 'holiday', id })}
            onAdd={addHoliday}
          />

          {view.type === 'day' && (
            <DayEditor day={store.week[view.id]} store={store} api={api} snap={snap} canEdit={canEdit} />
          )}

          {view.type === 'holiday' && holiday && (
            <HolidayEditor
              holiday={holiday} store={store} api={api} snap={snap} canEdit={canEdit}
              onDeleted={() => setView({ type: 'day', id: 'mon' })}
            />
          )}

          {view.type === 'holiday' && !holiday && (
            <p className="onair-note" role="status">Праздник удалён. Выберите день или другой праздник.</p>
          )}

          {(view.type === 'playlist' || view.type === 'announcement') && (
            <p className="onair-note" role="status">Редактор библиотеки — Чат 7.</p>
          )}
        </main>

        <LibraryPanel store={store} canDrag={canEdit} />
      </div>

      <PlayerBar />
    </div>
  );
}
