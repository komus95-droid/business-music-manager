import type { PersistedStore, Playlist, Announcement } from '@shared';
import {
  PLAYLIST_PALETTE, ANNOUNCEMENT_PALETTE,
  playlistEffectiveSec, isAssetLocked, fmtDuration,
} from '@shared';
import { setDrag } from '../schedule/dnd';

interface Props {
  store: PersistedStore;
  canDrag: boolean;
}

/**
 * Правая панель «Библиотека». В Чате 5 — только ИСТОЧНИК перетаскивания на
 * шкалу (импорт/правка ассетов появится в Чате 7). Имя/цвет/длительность
 * берутся из самого ассета — единый источник истины.
 */
export function LibraryPanel({ store, canDrag }: Props) {
  return (
    <aside className="library" aria-label="Библиотека">
      <h4>Плейлисты</h4>
      {store.playlists.length === 0 && (
        <p className="lib-empty">Пусто. Импорт плейлистов — в Чате 7.</p>
      )}
      {store.playlists.map((pl) => (
        <PlaylistItem
          key={pl.id} pl={pl} canDrag={canDrag}
          durationSec={playlistEffectiveSec(pl, store.audio)}
          locked={isAssetLocked(store, pl.id)}
        />
      ))}

      <h4>Объявления</h4>
      {store.announcements.length === 0 && (
        <p className="lib-empty">Пусто. Импорт объявлений — в Чате 7.</p>
      )}
      {store.announcements.map((an) => (
        <AnnouncementItem
          key={an.id} an={an} canDrag={canDrag}
          locked={isAssetLocked(store, an.id)}
        />
      ))}
    </aside>
  );
}

function PlaylistItem({ pl, durationSec, locked, canDrag }: {
  pl: Playlist; durationSec: number; locked: boolean; canDrag: boolean;
}) {
  return (
    <div
      className="lib-item" draggable={canDrag}
      onDragStart={(e) => setDrag(e, { op: 'add', kind: 'playlist', refId: pl.id })}
      title={pl.name}
    >
      <span className="sw" style={{ background: PLAYLIST_PALETTE[pl.color] }} />
      <span className="nm">{pl.name}</span>
      {locked && <span className="lock" title="Используется в расписании">●</span>}
      <span className="du">{fmtDuration(durationSec)}</span>
    </div>
  );
}

function AnnouncementItem({ an, locked, canDrag }: {
  an: Announcement; locked: boolean; canDrag: boolean;
}) {
  return (
    <div
      className="lib-item" draggable={canDrag}
      onDragStart={(e) => setDrag(e, { op: 'add', kind: 'announcement', refId: an.id })}
      title={an.name}
    >
      <span className="sw" style={{ background: ANNOUNCEMENT_PALETTE[an.color] }} />
      <span className="nm">{an.name}</span>
      {locked && <span className="lock" title="Используется в расписании">●</span>}
      <span className="du">{fmtDuration(an.durationSec)}</span>
    </div>
  );
}
