import { useEffect, useState } from 'react';
import type { PersistedStore } from '@shared';
import { DAY_ORDER } from '@shared';

/**
 * Временный плейсхолдер (Чат 3). Проверяет, что мост window.api работает:
 * грузит store.json и показывает сводку. Полноценный UI собирается в чатах
 * по дизайну (левая колонка / шкала / библиотека / плеер).
 */
export function App() {
  const [store, setStore] = useState<PersistedStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.api
      .loadStore()
      .then(setStore)
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <div className="card error">Ошибка загрузки: {error}</div>;
  if (!store) return <div className="card">Загрузка store.json…</div>;

  return (
    <div className="card">
      <h1>Commercial Player by RunBizAi</h1>
      <p className="muted">Чат 3 — main process + IPC. Мост работает, store загружен.</p>
      <dl>
        <div><dt>schemaVersion</dt><dd>{store.schemaVersion}</dd></div>
        <div><dt>дней в неделе</dt><dd>{DAY_ORDER.length}</dd></div>
        <div><dt>плейлистов</dt><dd>{store.playlists.length}</dd></div>
        <div><dt>объявлений</dt><dd>{store.announcements.length}</dd></div>
        <div><dt>праздников</dt><dd>{store.holidays.length}</dd></div>
        <div><dt>mediaPath</dt><dd className="path">{store.settings.mediaPath || '—'}</dd></div>
      </dl>
    </div>
  );
}
