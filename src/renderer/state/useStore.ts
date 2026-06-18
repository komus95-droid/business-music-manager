import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PersistedStore, DayId, Id, HHMM, WeekDay,
  PlaylistBlock, AnnouncementBlock,
} from '@shared';
import {
  newId, playlistBlockEnd, resolvePlaylistStart,
  spanMinutes, offsetFromDayStart, addMinutes,
} from '@shared';

/**
 * Единый источник persisted-состояния в renderer. Загружает store.json через
 * мост window.api, отдаёт срез + мутаторы расписания. Сохранение — дебаунсом
 * (атомарная запись на стороне main). Доменная логика блоков (фикс конца,
 * авто-сдвиг) спрятана здесь, чтобы UI оставался тонким.
 */

export interface StoreApi {
  store: PersistedStore | null;
  error: string | null;
  setDayHours(dayId: DayId, patch: Partial<Pick<WeekDay, 'start' | 'end' | 'off'>>): void;
  addPlaylistBlock(dayId: DayId, refId: Id, desired: HHMM): void;
  addAnnouncementBlock(dayId: DayId, refId: Id, at: HHMM): void;
  movePlaylistBlock(dayId: DayId, blockId: Id, desired: HHMM): void;
  moveAnnouncementBlock(dayId: DayId, blockId: Id, at: HHMM): void;
  removeBlock(dayId: DayId, blockId: Id): void;
  clearDay(dayId: DayId): void;
}

const SAVE_DEBOUNCE_MS = 400;

/** Зажать момент в окне рабочего дня [start, end] (для точечных объявлений). */
function clampToDay(day: WeekDay, t: HHMM): HHMM {
  const span = spanMinutes(day.start, day.end);
  const off = Math.max(0, Math.min(offsetFromDayStart(day.start, t), span));
  return addMinutes(day.start, off);
}

function withDay(s: PersistedStore, dayId: DayId, f: (d: WeekDay) => WeekDay): PersistedStore {
  return { ...s, week: { ...s.week, [dayId]: f(s.week[dayId]) } };
}

export function useStore(): StoreApi {
  const [store, setStore] = useState<PersistedStore | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const setDayHours: StoreApi['setDayHours'] = useCallback((dayId, patch) => {
    mutate((s) => withDay(s, dayId, (d) => ({ ...d, ...patch })));
  }, [mutate]);

  const addPlaylistBlock: StoreApi['addPlaylistBlock'] = useCallback((dayId, refId, desired) => {
    mutate((s) => {
      const pl = s.playlists.find((p) => p.id === refId);
      if (!pl) return s;
      return withDay(s, dayId, (d) => {
        const start = resolvePlaylistStart(d, desired, pl, s.audio);
        const end = playlistBlockEnd(start, pl, s.audio);
        const block: PlaylistBlock = { id: newId(), kind: 'playlist', refId, start, end };
        return { ...d, blocks: [...d.blocks, block] };
      });
    });
  }, [mutate]);

  const addAnnouncementBlock: StoreApi['addAnnouncementBlock'] = useCallback((dayId, refId, at) => {
    mutate((s) => {
      if (!s.announcements.some((a) => a.id === refId)) return s;
      return withDay(s, dayId, (d) => {
        const block: AnnouncementBlock = { id: newId(), kind: 'announcement', refId, at: clampToDay(d, at) };
        return { ...d, blocks: [...d.blocks, block] };
      });
    });
  }, [mutate]);

  const movePlaylistBlock: StoreApi['movePlaylistBlock'] = useCallback((dayId, blockId, desired) => {
    mutate((s) => withDay(s, dayId, (d) => {
      const b = d.blocks.find((x) => x.id === blockId);
      if (!b || b.kind !== 'playlist') return d;
      const pl = s.playlists.find((p) => p.id === b.refId);
      if (!pl) return d;
      const start = resolvePlaylistStart(d, desired, pl, s.audio, b.id);
      const end = playlistBlockEnd(start, pl, s.audio);
      return {
        ...d,
        blocks: d.blocks.map((x) => (x.id === blockId ? { ...x, start, end } as PlaylistBlock : x)),
      };
    }));
  }, [mutate]);

  const moveAnnouncementBlock: StoreApi['moveAnnouncementBlock'] = useCallback((dayId, blockId, at) => {
    mutate((s) => withDay(s, dayId, (d) => {
      const b = d.blocks.find((x) => x.id === blockId);
      if (!b || b.kind !== 'announcement') return d;
      return {
        ...d,
        blocks: d.blocks.map((x) => (x.id === blockId ? { ...x, at: clampToDay(d, at) } as AnnouncementBlock : x)),
      };
    }));
  }, [mutate]);

  const removeBlock: StoreApi['removeBlock'] = useCallback((dayId, blockId) => {
    mutate((s) => withDay(s, dayId, (d) => ({ ...d, blocks: d.blocks.filter((b) => b.id !== blockId) })));
  }, [mutate]);

  const clearDay: StoreApi['clearDay'] = useCallback((dayId) => {
    mutate((s) => withDay(s, dayId, (d) => ({ ...d, blocks: [] })));
  }, [mutate]);

  return {
    store, error,
    setDayHours, addPlaylistBlock, addAnnouncementBlock,
    movePlaylistBlock, moveAnnouncementBlock, removeBlock, clearDay,
  };
}
