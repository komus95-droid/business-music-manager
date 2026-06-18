import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PersistedStore, Id, HHMM, WeekDay, Holiday, BlockOwner,
  PlaylistBlock, AnnouncementBlock, ScheduleBlock,
  Playlist, Announcement,
} from '@shared';
import {
  newId, playlistBlockEnd, resolvePlaylistStart,
  spanMinutes, offsetFromDayStart, addMinutes,
  MAX_HOLIDAYS, ddmm, hhmm,
} from '@shared';

/**
 * Единый источник persisted-состояния в renderer. Загружает store.json через
 * мост window.api, отдаёт срез + мутаторы. Сохранение — дебаунсом (атомарная
 * запись на стороне main). Доменная логика блоков (фикс конца, авто-сдвиг,
 * кламп объявления) спрятана здесь, чтобы UI оставался тонким.
 *
 * Чат 6: мутаторы блоков обобщены с `DayId` на владельца `BlockOwner`
 * (день недели ИЛИ праздник) — один и тот же редактор шкалы правит и то, и то.
 */

/** Часы/выходной — общий патч и для дня недели, и для праздника. */
export type HoursPatch = Partial<Pick<WeekDay, 'start' | 'end' | 'off'>>;

export interface StoreApi {
  store: PersistedStore | null;
  error: string | null;

  // расписание (день недели или праздник)
  setHours(owner: BlockOwner, patch: HoursPatch): void;
  addPlaylistBlock(owner: BlockOwner, refId: Id, desired: HHMM): void;
  addAnnouncementBlock(owner: BlockOwner, refId: Id, at: HHMM): void;
  movePlaylistBlock(owner: BlockOwner, blockId: Id, desired: HHMM): void;
  moveAnnouncementBlock(owner: BlockOwner, blockId: Id, at: HHMM): void;
  removeBlock(owner: BlockOwner, blockId: Id): void;
  clearBlocks(owner: BlockOwner): void;

  // праздники
  addHoliday(): Id | null;
  removeHoliday(id: Id): void;
  setHolidayMeta(id: Id, patch: Partial<Pick<Holiday, 'name' | 'from' | 'to' | 'year'>>): void;

  // библиотека — плейлисты (Чат 7)
  addPlaylist(): Id;
  removePlaylist(id: Id): void;
  setPlaylistMeta(id: Id, patch: Partial<Pick<Playlist, 'name' | 'color' | 'crossfade'>>): void;
  addTrack(playlistId: Id, media: ImportedTrack): void;
  removeTrack(playlistId: Id, trackId: Id): void;
  moveTrack(playlistId: Id, trackId: Id, dir: -1 | 1): void;

  // библиотека — объявления (Чат 7)
  addAnnouncement(): Id;
  removeAnnouncement(id: Id): void;
  setAnnouncementMeta(id: Id, patch: Partial<Pick<Announcement, 'name' | 'color' | 'volume'>>): void;
  setAnnouncementFile(id: Id, media: ImportedTrack): void;
}

/** Импортированный MP3 (результат window.api.importMp3): файл уже в media/. */
export interface ImportedTrack {
  name: string;
  durationSec: number;
  file: string;
}

const SAVE_DEBOUNCE_MS = 400;

/** Окно владельца (день недели или праздник) по адресу. */
function ownerWindow(s: PersistedStore, owner: BlockOwner): WeekDay | Holiday | undefined {
  return owner.kind === 'day'
    ? s.week[owner.id]
    : s.holidays.find((h) => h.id === owner.id);
}

/** Заменить блоки у владельца, сохранив все остальные поля сущности. */
function setOwnerBlocks(s: PersistedStore, owner: BlockOwner, blocks: ScheduleBlock[]): PersistedStore {
  if (owner.kind === 'day') {
    return { ...s, week: { ...s.week, [owner.id]: { ...s.week[owner.id], blocks } } };
  }
  return { ...s, holidays: s.holidays.map((h) => (h.id === owner.id ? { ...h, blocks } : h)) };
}

/** Пропатчить часы/выходной у владельца. */
function patchOwnerHours(s: PersistedStore, owner: BlockOwner, patch: HoursPatch): PersistedStore {
  if (owner.kind === 'day') {
    return { ...s, week: { ...s.week, [owner.id]: { ...s.week[owner.id], ...patch } } };
  }
  return { ...s, holidays: s.holidays.map((h) => (h.id === owner.id ? { ...h, ...patch } : h)) };
}

/** Зажать момент в окне [start, end] (для точечных объявлений). */
function clampToWindow(win: { start: HHMM; end: HHMM }, t: HHMM): HHMM {
  const span = spanMinutes(win.start, win.end);
  const off = Math.max(0, Math.min(offsetFromDayStart(win.start, t), span));
  return addMinutes(win.start, off);
}

/** Заготовка нового праздника (ежегодный: year не указан). */
function defaultHoliday(id: Id): Holiday {
  return {
    id,
    name: 'Новый праздник',
    from: ddmm('01.01'),
    to: null,
    start: hhmm('10:00'),
    end: hhmm('20:00'),
    off: false,
    blocks: [],
  };
}

/** Заготовка нового плейлиста (пустой; бесшовный переход включён). */
function defaultPlaylist(id: Id): Playlist {
  return { id, name: 'Новый плейлист', color: 'blue', crossfade: true, tracks: [] };
}

/** Заготовка нового объявления (без файла; длительность появится при импорте). */
function defaultAnnouncement(id: Id): Announcement {
  return { id, name: 'Новое объявление', color: 'orange', durationSec: 0, file: '', volume: 100 };
}

export function useStore(): StoreApi {
  const [store, setStore] = useState<PersistedStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const storeRef = useRef<PersistedStore | null>(null);
  storeRef.current = store;

  useEffect(() => {
    window.api.loadStore().then(setStore).catch((e) => setError(String(e)));
  }, []);

  // дебаунс-сохранение после первой загрузки
  useEffect(() => {
    if (!store || !dirty.current) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      window.api.saveStore(store).catch((e) => setError(String(e)));
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [store]);

  const mutate = useCallback((f: (s: PersistedStore) => PersistedStore) => {
    setStore((prev) => {
      if (!prev) return prev;
      dirty.current = true;
      return f(prev);
    });
  }, []);

  const setHours: StoreApi['setHours'] = useCallback((owner, patch) => {
    mutate((s) => patchOwnerHours(s, owner, patch));
  }, [mutate]);

  const addPlaylistBlock: StoreApi['addPlaylistBlock'] = useCallback((owner, refId, desired) => {
    mutate((s) => {
      const pl = s.playlists.find((p) => p.id === refId);
      const win = ownerWindow(s, owner);
      if (!pl || !win) return s;
      const start = resolvePlaylistStart(win, desired, pl, s.audio);
      const end = playlistBlockEnd(start, pl, s.audio);
      const block: PlaylistBlock = { id: newId(), kind: 'playlist', refId, start, end };
      return setOwnerBlocks(s, owner, [...win.blocks, block]);
    });
  }, [mutate]);

  const addAnnouncementBlock: StoreApi['addAnnouncementBlock'] = useCallback((owner, refId, at) => {
    mutate((s) => {
      const win = ownerWindow(s, owner);
      if (!win || !s.announcements.some((a) => a.id === refId)) return s;
      const block: AnnouncementBlock = { id: newId(), kind: 'announcement', refId, at: clampToWindow(win, at) };
      return setOwnerBlocks(s, owner, [...win.blocks, block]);
    });
  }, [mutate]);

  const movePlaylistBlock: StoreApi['movePlaylistBlock'] = useCallback((owner, blockId, desired) => {
    mutate((s) => {
      const win = ownerWindow(s, owner);
      if (!win) return s;
      const b = win.blocks.find((x) => x.id === blockId);
      if (!b || b.kind !== 'playlist') return s;
      const pl = s.playlists.find((p) => p.id === b.refId);
      if (!pl) return s;
      const start = resolvePlaylistStart(win, desired, pl, s.audio, b.id);
      const end = playlistBlockEnd(start, pl, s.audio);
      const blocks = win.blocks.map((x) => (x.id === blockId ? { ...x, start, end } as PlaylistBlock : x));
      return setOwnerBlocks(s, owner, blocks);
    });
  }, [mutate]);

  const moveAnnouncementBlock: StoreApi['moveAnnouncementBlock'] = useCallback((owner, blockId, at) => {
    mutate((s) => {
      const win = ownerWindow(s, owner);
      if (!win) return s;
      const b = win.blocks.find((x) => x.id === blockId);
      if (!b || b.kind !== 'announcement') return s;
      const blocks = win.blocks.map((x) => (x.id === blockId ? { ...x, at: clampToWindow(win, at) } as AnnouncementBlock : x));
      return setOwnerBlocks(s, owner, blocks);
    });
  }, [mutate]);

  const removeBlock: StoreApi['removeBlock'] = useCallback((owner, blockId) => {
    mutate((s) => {
      const win = ownerWindow(s, owner);
      if (!win) return s;
      return setOwnerBlocks(s, owner, win.blocks.filter((b) => b.id !== blockId));
    });
  }, [mutate]);

  const clearBlocks: StoreApi['clearBlocks'] = useCallback((owner) => {
    mutate((s) => setOwnerBlocks(s, owner, []));
  }, [mutate]);

  const addHoliday: StoreApi['addHoliday'] = useCallback(() => {
    const cur = storeRef.current;
    if (cur && cur.holidays.length >= MAX_HOLIDAYS) return null;
    const id = newId();
    mutate((s) => (s.holidays.length >= MAX_HOLIDAYS ? s : { ...s, holidays: [...s.holidays, defaultHoliday(id)] }));
    return id;
  }, [mutate]);

  const removeHoliday: StoreApi['removeHoliday'] = useCallback((id) => {
    mutate((s) => ({ ...s, holidays: s.holidays.filter((h) => h.id !== id) }));
  }, [mutate]);

  const setHolidayMeta: StoreApi['setHolidayMeta'] = useCallback((id, patch) => {
    mutate((s) => ({ ...s, holidays: s.holidays.map((h) => (h.id === id ? { ...h, ...patch } : h)) }));
  }, [mutate]);

  // ── Библиотека: плейлисты ──────────────────────────────────────────────
  // Заметка: длительность блока ФИКСИРУЕТСЯ при добавлении на шкалу
  // (playlistBlockEnd). Поэтому правка состава/кроссфейда плейлиста, уже
  // стоящего в расписании, заблокирована в UI (isAssetLocked) — иначе блоки
  // разъехались бы с реальной длиной. Здесь мутаторы чистые, гейт — в редакторе.

  const addPlaylist: StoreApi['addPlaylist'] = useCallback(() => {
    const id = newId();
    mutate((s) => ({ ...s, playlists: [...s.playlists, defaultPlaylist(id)] }));
    return id;
  }, [mutate]);

  const removePlaylist: StoreApi['removePlaylist'] = useCallback((id) => {
    mutate((s) => ({ ...s, playlists: s.playlists.filter((p) => p.id !== id) }));
    void window.api.deleteMedia({ kind: 'playlistFolder', playlistId: id }).catch(() => {});
  }, [mutate]);

  const setPlaylistMeta: StoreApi['setPlaylistMeta'] = useCallback((id, patch) => {
    mutate((s) => ({ ...s, playlists: s.playlists.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  }, [mutate]);

  const addTrack: StoreApi['addTrack'] = useCallback((playlistId, media) => {
    mutate((s) => ({
      ...s,
      playlists: s.playlists.map((p) => (p.id === playlistId
        ? { ...p, tracks: [...p.tracks, { id: newId(), name: media.name, durationSec: media.durationSec, file: media.file }] }
        : p)),
    }));
  }, [mutate]);

  const removeTrack: StoreApi['removeTrack'] = useCallback((playlistId, trackId) => {
    const cur = storeRef.current;
    const file = cur?.playlists.find((p) => p.id === playlistId)?.tracks.find((t) => t.id === trackId)?.file;
    mutate((s) => ({
      ...s,
      playlists: s.playlists.map((p) => (p.id === playlistId
        ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) }
        : p)),
    }));
    if (file) void window.api.deleteMedia({ kind: 'track', playlistId, file }).catch(() => {});
  }, [mutate]);

  const moveTrack: StoreApi['moveTrack'] = useCallback((playlistId, trackId, dir) => {
    mutate((s) => ({
      ...s,
      playlists: s.playlists.map((p) => {
        if (p.id !== playlistId) return p;
        const i = p.tracks.findIndex((t) => t.id === trackId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= p.tracks.length) return p;
        const tracks = p.tracks.slice();
        [tracks[i], tracks[j]] = [tracks[j], tracks[i]];
        return { ...p, tracks };
      }),
    }));
  }, [mutate]);

  // ── Библиотека: объявления (1 объявление = 1 трек) ──────────────────────
  const addAnnouncement: StoreApi['addAnnouncement'] = useCallback(() => {
    const id = newId();
    mutate((s) => ({ ...s, announcements: [...s.announcements, defaultAnnouncement(id)] }));
    return id;
  }, [mutate]);

  const removeAnnouncement: StoreApi['removeAnnouncement'] = useCallback((id) => {
    const cur = storeRef.current;
    const file = cur?.announcements.find((a) => a.id === id)?.file;
    mutate((s) => ({ ...s, announcements: s.announcements.filter((a) => a.id !== id) }));
    if (file) void window.api.deleteMedia({ kind: 'announcement', file }).catch(() => {});
  }, [mutate]);

  const setAnnouncementMeta: StoreApi['setAnnouncementMeta'] = useCallback((id, patch) => {
    mutate((s) => ({ ...s, announcements: s.announcements.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
  }, [mutate]);

  const setAnnouncementFile: StoreApi['setAnnouncementFile'] = useCallback((id, media) => {
    const cur = storeRef.current;
    const old = cur?.announcements.find((a) => a.id === id)?.file;
    mutate((s) => ({
      ...s,
      announcements: s.announcements.map((a) => (a.id === id
        ? { ...a, file: media.file, durationSec: media.durationSec }
        : a)),
    }));
    if (old && old !== media.file) void window.api.deleteMedia({ kind: 'announcement', file: old }).catch(() => {});
  }, [mutate]);

  return {
    store, error,
    setHours, addPlaylistBlock, addAnnouncementBlock,
    movePlaylistBlock, moveAnnouncementBlock, removeBlock, clearBlocks,
    addHoliday, removeHoliday, setHolidayMeta,
    addPlaylist, removePlaylist, setPlaylistMeta, addTrack, removeTrack, moveTrack,
    addAnnouncement, removeAnnouncement, setAnnouncementMeta, setAnnouncementFile,
  };
}
