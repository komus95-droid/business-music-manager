import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersistedStore, DayWindow, Id, Announcement } from '@shared';
import { spanMinutes, offsetFromDayStart } from '@shared';
import type { AudioEngine } from '../audio';
import { buildPlaylistRequest, buildAnnouncementRequest } from '../audio';
import { playlistBlocksSec, blockAtSec, entryAt } from './auditionCore';
import type { ResolvedBlock } from './auditionCore';

/**
 * Аудит-плейхед предпрослушки дня/праздника (Чат 8, объявления добавлены в
 * v1.3.1). clockSec — смещение от начала окна; плейхед идёт в реальном времени,
 * движок играет ПЛЕЙЛИСТ-БЛОК под курсором (входя в нужном месте) и переключает
 * блоки на границах. Объявления теперь тоже звучат: при переходе плейхеда через
 * их время движок запускает объявление с приглушением музыки (как в эфире).
 * Затухание конца дня и оркестровка остаются режиму «В эфире» (Чат 9).
 */

const TICK_MS = 50;

export interface DayAudition {
  playing: boolean;
  clockSec: number;
  spanSec: number;
  frac: number;
  nowLabel: string | null;
  activeAnnId: Id | null;
  playPause(): void;
  stop(): void;
  seek(sec: number): void;
}

interface AnnEvent { id: Id; atSec: number; ann: Announcement; }

export function useDayAudition(
  win: DayWindow,
  store: PersistedStore,
  engine: AudioEngine,
  enabled: boolean,
  ownerKey: string,
): DayAudition {
  const spanSec = Math.max(spanMinutes(win.start, win.end) * 60, 1);

  const [playing, setPlaying] = useState(false);
  const [clockSec, setClockSec] = useState(0);

  const clockRef = useRef(0);
  const activeBlockRef = useRef<Id | null>(null);
  const firedRef = useRef<Set<Id>>(new Set()); // объявления, уже сыгранные в этом проходе
  const [firing, setFiring] = useState<{ id: Id; name: string } | null>(null); // объявление в эфире сейчас (индикатор)
  const annClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRef = useRef(0);
  const winRef = useRef(win); winRef.current = win;
  const storeRef = useRef(store); storeRef.current = store;
  const spanRef = useRef(spanSec); spanRef.current = spanSec;

  const dayBlocks = useCallback((): ResolvedBlock[] => {
    return playlistBlocksSec(winRef.current, storeRef.current.playlists);
  }, []);

  const blockAt = useCallback((clock: number): ResolvedBlock | null => {
    return blockAtSec(dayBlocks(), clock);
  }, [dayBlocks]);

  /** Объявления окна в секундах от начала (только с файлом). */
  const annEvents = useCallback((): AnnEvent[] => {
    const w = winRef.current; const s = storeRef.current;
    const out: AnnEvent[] = [];
    for (const b of w.blocks) {
      if (b.kind !== 'announcement') continue;
      const ann = s.announcements.find((a) => a.id === b.refId);
      if (ann && ann.file) out.push({ id: b.id, atSec: offsetFromDayStart(w.start, b.at) * 60, ann });
    }
    return out;
  }, []);

  const syncToClock = useCallback((clock: number, force: boolean) => {
    const b = blockAt(clock);
    if (b && b.pl && b.pl.tracks.length > 0) {
      if (force || activeBlockRef.current !== b.id) {
        const { startIndex, startOffsetSec } = entryAt(b.pl, clock - b.startOff);
        engine.playPlaylist(buildPlaylistRequest(storeRef.current.settings.mediaPath, b.pl, {
          startIndex, startOffsetSec, loop: false,
        }));
        activeBlockRef.current = b.id;
      }
    } else {
      if (activeBlockRef.current !== null) engine.stopMusic(); // глушим только музыку — объявление продолжает играть
      activeBlockRef.current = null;
    }
  }, [blockAt, engine]);

  /** Армировать объявления заново относительно позиции (играют те, что впереди). */
  const rearm = useCallback((clock: number) => {
    const fired = new Set<Id>();
    for (const e of annEvents()) if (e.atSec <= clock) fired.add(e.id);
    firedRef.current = fired;
  }, [annEvents]);

  const stopTicker = useCallback(() => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const dt = now - lastRef.current; lastRef.current = now;
    const prev = clockRef.current;
    let c = prev + dt / 1000;
    if (c >= spanRef.current) {
      c = spanRef.current;
      clockRef.current = c; setClockSec(c);
      stopTicker(); setPlaying(false);
      engine.stop(); activeBlockRef.current = null;
      return;
    }
    clockRef.current = c; setClockSec(c);
    syncToClock(c, false);
    // объявления: сыграть те, чьё время прошли в этом тике (с дакингом музыки)
    for (const e of annEvents()) {
      if (e.atSec > prev && e.atSec <= c && !firedRef.current.has(e.id)) {
        firedRef.current.add(e.id);
        engine.playAnnouncement(buildAnnouncementRequest(storeRef.current.settings.mediaPath, e.ann));
        setFiring({ id: e.id, name: e.ann.name });
        if (annClearRef.current) clearTimeout(annClearRef.current);
        annClearRef.current = setTimeout(() => setFiring(null), Math.max(1, e.ann.durationSec) * 1000);
      }
    }
  }, [engine, stopTicker, syncToClock, annEvents]);

  const startTicker = useCallback(() => {
    if (timerRef.current !== null) return;
    lastRef.current = performance.now();
    timerRef.current = setInterval(tick, TICK_MS);
  }, [tick]);

  const playPause = useCallback(() => {
    if (!enabled) return;
    if (playing) {
      stopTicker(); setPlaying(false); engine.pause();
    } else {
      if (clockRef.current >= spanRef.current) { clockRef.current = 0; setClockSec(0); }
      rearm(clockRef.current);
      setPlaying(true);
      syncToClock(clockRef.current, true);
      startTicker();
    }
  }, [enabled, playing, engine, stopTicker, startTicker, syncToClock, rearm]);

  const stop = useCallback(() => {
    stopTicker(); setPlaying(false);
    engine.stop(); activeBlockRef.current = null;
    clockRef.current = 0; setClockSec(0); firedRef.current = new Set();
    setFiring(null); if (annClearRef.current) clearTimeout(annClearRef.current);
  }, [engine, stopTicker]);

  const seek = useCallback((sec: number) => {
    const c = Math.max(0, Math.min(sec, spanRef.current));
    clockRef.current = c; setClockSec(c);
    rearm(c);
    if (playing) syncToClock(c, true);
  }, [playing, syncToClock, rearm]);

  useEffect(() => {
    stopTicker(); setPlaying(false);
    clockRef.current = 0; setClockSec(0); firedRef.current = new Set();
    setFiring(null); if (annClearRef.current) clearTimeout(annClearRef.current);
    if (activeBlockRef.current !== null) { engine.stop(); activeBlockRef.current = null; }
  }, [ownerKey, enabled, engine, stopTicker]);

  useEffect(() => () => {
    stopTicker();
    if (activeBlockRef.current !== null) engine.stop();
  }, [engine, stopTicker]);

  const cur = blockAt(clockSec);
  return {
    playing,
    clockSec,
    spanSec,
    frac: Math.max(0, Math.min(clockSec / spanSec, 1)),
    nowLabel: firing ? `\u{1F4E2} ${firing.name}` : (cur && cur.pl ? cur.pl.name : null),
    activeAnnId: firing ? firing.id : null,
    playPause, stop, seek,
  };
}
