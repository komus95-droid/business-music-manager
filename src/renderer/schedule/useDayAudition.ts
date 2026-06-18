import { useCallback, useEffect, useRef, useState } from 'react';
import type { PersistedStore, DayWindow, PlaylistBlock, Playlist, Id } from '@shared';
import { spanMinutes, offsetFromDayStart } from '@shared';
import type { AudioEngine } from '../audio';
import { buildPlaylistRequest } from '../audio';

/**
 * Аудит-плейхед предпрослушки дня/праздника (Чат 8).
 *
 * Часы предпрослушки (clockSec) — это смещение от начала окна дня. Плейхед —
 * указатель этих часов на шкале. При воспроизведении clock идёт в реальном
 * времени; движок играет ПЛЕЙЛИСТ-БЛОК под курсором, входя в него на нужном
 * месте, и переключается на следующий блок на границе. В «тишине» (между
 * блоками) звука нет, но плейхед продолжает идти. Объявления здесь НЕ
 * запускаются — их слушают отдельно; оркестровка эфира (дакинг по расписанию,
 * затухание конца дня) остаётся режиму «В эфире» (Чат 9).
 */

const TICK_MS = 50;

interface DayBlock {
  id: Id;
  startOff: number; // сек от начала окна
  endOff: number;
  pl: Playlist | undefined;
}

export interface DayAudition {
  playing: boolean;
  clockSec: number;
  spanSec: number;
  /** доля 0..1 для плейхеда */
  frac: number;
  /** имя плейлиста под курсором или null (тишина) */
  nowLabel: string | null;
  playPause(): void;
  stop(): void;
  seek(sec: number): void;
}

/** Вход в плейлист по смещению внутри блока → стартовый трек и сдвиг в нём. */
function entryAt(pl: Playlist, offsetSec: number): { startIndex: number; startOffsetSec: number } {
  let acc = 0;
  for (let k = 0; k < pl.tracks.length; k++) {
    const d = pl.tracks[k].durationSec;
    if (offsetSec < acc + d || k === pl.tracks.length - 1) {
      return { startIndex: k, startOffsetSec: Math.max(0, Math.min(offsetSec - acc, d)) };
    }
    acc += d;
  }
  return { startIndex: 0, startOffsetSec: 0 };
}

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
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastRef = useRef(0);
  // свежие данные окна/стора для тикера (минуя замыкание)
  const winRef = useRef(win); winRef.current = win;
  const storeRef = useRef(store); storeRef.current = store;
  const spanRef = useRef(spanSec); spanRef.current = spanSec;

  /** Плейлист-блоки окна в секундах от начала, с резолвом плейлистов. */
  const dayBlocks = useCallback((): DayBlock[] => {
    const w = winRef.current; const s = storeRef.current;
    return w.blocks
      .filter((b): b is PlaylistBlock => b.kind === 'playlist')
      .map((b) => {
        const startOff = offsetFromDayStart(w.start, b.start) * 60;
        const lenSec = spanMinutes(b.start, b.end) * 60;
        return { id: b.id, startOff, endOff: startOff + lenSec, pl: s.playlists.find((p) => p.id === b.refId) };
      });
  }, []);

  /** Блок под курсором: из покрывающих — с самым поздним стартом. */
  const blockAt = useCallback((clock: number): DayBlock | null => {
    let best: DayBlock | null = null;
    for (const b of dayBlocks()) {
      if (clock >= b.startOff && clock < b.endOff) {
        if (!best || b.startOff > best.startOff) best = b;
      }
    }
    return best;
  }, [dayBlocks]);

  /** Привести движок в соответствие позиции часов. force — перезайти даже в тот же блок. */
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
      // тишина или пустой плейлист — звука нет
      if (activeBlockRef.current !== null) engine.stop();
      activeBlockRef.current = null;
    }
  }, [blockAt, engine]);

  const stopTicker = useCallback(() => {
    if (timerRef.current !== null) { clearInterval(timerRef.current); timerRef.current = null; }
  }, []);

  const tick = useCallback(() => {
    const now = performance.now();
    const dt = now - lastRef.current; lastRef.current = now;
    let c = clockRef.current + dt / 1000;
    if (c >= spanRef.current) {
      c = spanRef.current;
      clockRef.current = c; setClockSec(c);
      stopTicker(); setPlaying(false);
      engine.stop(); activeBlockRef.current = null;
      return;
    }
    clockRef.current = c; setClockSec(c);
    syncToClock(c, false);
  }, [engine, stopTicker, syncToClock]);

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
      setPlaying(true);
      syncToClock(clockRef.current, true); // перезайти точно под плейхед
      startTicker();
    }
  }, [enabled, playing, engine, stopTicker, startTicker, syncToClock]);

  const stop = useCallback(() => {
    stopTicker(); setPlaying(false);
    engine.stop(); activeBlockRef.current = null;
    clockRef.current = 0; setClockSec(0);
  }, [engine, stopTicker]);

  const seek = useCallback((sec: number) => {
    const c = Math.max(0, Math.min(sec, spanRef.current));
    clockRef.current = c; setClockSec(c);
    if (playing) syncToClock(c, true);
  }, [playing, syncToClock]);

  // Смена дня/праздника или выход из Студии — оборвать предпрослушку и сбросить.
  useEffect(() => {
    stopTicker(); setPlaying(false);
    clockRef.current = 0; setClockSec(0);
    if (activeBlockRef.current !== null) { engine.stop(); activeBlockRef.current = null; }
  }, [ownerKey, enabled, engine, stopTicker]);

  // Размонтаж — заглушить, если звук вели мы.
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
    nowLabel: cur && cur.pl ? cur.pl.name : null,
    playPause, stop, seek,
  };
}
