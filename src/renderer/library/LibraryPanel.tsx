import { useState } from 'react';
import type { DragEvent } from 'react';
import type { PersistedStore, Id, BlockKind } from '@shared';
import {
  PLAYLIST_PALETTE, ANNOUNCEMENT_PALETTE,
  playlistEffectiveSec, isAssetLocked, fmtDuration,
} from '@shared';
import { setDrag } from '../schedule/dnd';

/**
 * Правая панель «Библиотека» (Чат 7). Полноценная: поиск, сортировка,
 * сворачиваемые секции, «+ новый», открытие редактора по клику и ИСТОЧНИК
 * drag&drop на шкалу. Имя/цвет/длительность берутся из самого ассета —
 * единый источник истины (блоки на шкале ссылаются только по refId).
 *
 * Перетаскивать можно лишь готовый ассет: плейлист с треками / объявление
 * с файлом — пустой создал бы блок без звука.
 */
interface Props {
  store: PersistedStore;
  canDrag: boolean;
  selectedPlaylistId: Id | null;
  selectedAnnouncementId: Id | null;
  onOpenPlaylist(id: Id): void;
  onOpenAnnouncement(id: Id): void;
  onNewPlaylist(): void;
  onNewAnnouncement(): void;
}

type SortKey = 'name' | 'dur' | 'use';

interface RowVM {
  id: Id;
  name: string;
  colorCss: string;
  durSec: number;
  durLabel: string;
  used: boolean;
  draggable: boolean;
}

function playlistRows(store: PersistedStore): RowVM[] {
  return store.playlists.map((p) => {
    const durSec = playlistEffectiveSec(p, store.audio);
    return {
      id: p.id, name: p.name, colorCss: PLAYLIST_PALETTE[p.color],
      durSec, durLabel: p.tracks.length ? fmtDuration(durSec) : 'пусто',
      used: isAssetLocked(store, p.id), draggable: p.tracks.length > 0,
    };
  });
}

function announcementRows(store: PersistedStore): RowVM[] {
  return store.announcements.map((a) => ({
    id: a.id, name: a.name, colorCss: ANNOUNCEMENT_PALETTE[a.color],
    durSec: a.durationSec, durLabel: a.file ? fmtDuration(a.durationSec) : 'нет файла',
    used: isAssetLocked(store, a.id), draggable: !!a.file,
  }));
}

function process(rows: RowVM[], search: string, sort: SortKey): RowVM[] {
  const q = search.trim().toLowerCase();
  const arr = (q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows).slice();
  if (sort === 'dur') arr.sort((a, b) => b.durSec - a.durSec);
  else if (sort === 'use') arr.sort((a, b) => Number(b.used) - Number(a.used));
  else arr.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return arr;
}

export function LibraryPanel({
  store, canDrag, selectedPlaylistId, selectedAnnouncementId,
  onOpenPlaylist, onOpenAnnouncement, onNewPlaylist, onNewAnnouncement,
}: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (key: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });

  return (
    <aside className="library" aria-label="Библиотека">
      <div className="lib-title">БИБЛИОТЕКА</div>
      <div className="lib-toolbar">
        <input
          className="lib-search" type="search" placeholder="🔍 Поиск…"
          value={search} aria-label="Поиск в библиотеке"
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="lib-sort" value={sort} aria-label="Сортировка"
          onChange={(e) => setSort(e.target.value as SortKey)}
        >
          <option value="name">А–Я</option>
          <option value="dur">по длине</option>
          <option value="use">в расписании</option>
        </select>
      </div>

      <Section
        title="Музыкальные плейлисты" kind="playlist"
        rows={process(playlistRows(store), search, sort)}
        collapsed={collapsed.has('pl')} onToggle={() => toggle('pl')}
        canDrag={canDrag} selectedId={selectedPlaylistId}
        onOpen={onOpenPlaylist} onNew={onNewPlaylist}
        newLabel="+ новый плейлист"
        emptyHint={search ? 'Ничего не найдено.' : 'Пусто — создайте плейлист.'}
      />

      <Section
        title="Объявления" kind="announcement"
        rows={process(announcementRows(store), search, sort)}
        collapsed={collapsed.has('ad')} onToggle={() => toggle('ad')}
        canDrag={canDrag} selectedId={selectedAnnouncementId}
        onOpen={onOpenAnnouncement} onNew={onNewAnnouncement}
        newLabel="+ новое объявление"
        emptyHint={search ? 'Ничего не найдено.' : 'Пусто — создайте объявление.'}
      />
    </aside>
  );
}

function Section({
  title, kind, rows, collapsed, onToggle, canDrag, selectedId, onOpen, onNew, newLabel, emptyHint,
}: {
  title: string;
  kind: BlockKind;
  rows: RowVM[];
  collapsed: boolean;
  onToggle(): void;
  canDrag: boolean;
  selectedId: Id | null;
  onOpen(id: Id): void;
  onNew(): void;
  newLabel: string;
  emptyHint: string;
}) {
  return (
    <div className={`asec${collapsed ? ' collapsed' : ''}`}>
      <button type="button" className="asec-head" aria-expanded={!collapsed} onClick={onToggle}>
        <span className="asec-t">{title}</span>
        <span className="asec-n">{rows.length}</span>
        <span className="asec-chev" aria-hidden="true">▾</span>
      </button>

      {!collapsed && (
        <div className="asec-body">
          {rows.length === 0 && <p className="lib-empty">{emptyHint}</p>}
          {rows.map((r) => {
            const drag = canDrag && r.draggable;
            return (
              <div
                key={r.id}
                className={`lib-item${r.id === selectedId ? ' sel' : ''}`}
                draggable={drag}
                onDragStart={drag
                  ? (e: DragEvent) => setDrag(e, { op: 'add', kind, refId: r.id })
                  : undefined}
                onClick={() => onOpen(r.id)}
                title={r.name}
                role="button" tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r.id); } }}
              >
                <span className="sw" style={{ background: r.colorCss }} />
                <span className="nm">{r.name}</span>
                {r.used && <span className="lock" title="Установлен в расписании">📌</span>}
                <span className="du">{r.durLabel}</span>
              </div>
            );
          })}
          <button type="button" className="lib-new" disabled={!canDrag} onClick={onNew}>{newLabel}</button>
        </div>
      )}
    </div>
  );
}
