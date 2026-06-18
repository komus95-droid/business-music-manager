import type { DayWindow, Playlist, PlaylistBlock, Id } from '@shared';
import { spanMinutes, offsetFromDayStart } from '@shared';

/**
 * Чистая математика воспроизведения окна (день / праздник / эфир), общая для
 * аудита дня (Чат 8) и автовещания (Чат 9). Часы выражены в СЕКУНДАХ от начала
 * окна; блоки разворачиваются в [startOff, endOff). Никакого React и движка —
 * только геометрия, чтобы предпрослушка и эфир вели звук одинаково.
 */

/** Плейлист-блок окна в секундах от начала, с резолвнутым плейлистом. */
export interface ResolvedBlock {
  id: Id;
  startOff: number;
  endOff: number;
  pl: Playlist | undefined;
}

/** Плейлист-блоки окна (объявления — точечные, здесь не участвуют). */
export function playlistBlocksSec(win: DayWindow, playlists: Playlist[]): ResolvedBlock[] {
  return win.blocks
    .filter((b): b is PlaylistBlock => b.kind === 'playlist')
    .map((b) => {
      const startOff = offsetFromDayStart(win.start, b.start) * 60;
      const lenSec = spanMinutes(b.start, b.end) * 60;
      return { id: b.id, startOff, endOff: startOff + lenSec, pl: playlists.find((p) => p.id === b.refId) };
    });
}

/** Блок под курсором: из покрывающих clock — с самым поздним стартом; конец эксклюзивен. */
export function blockAtSec(blocks: ResolvedBlock[], clockSec: number): ResolvedBlock | null {
  let best: ResolvedBlock | null = null;
  for (const b of blocks) {
    if (clockSec >= b.startOff && clockSec < b.endOff) {
      if (!best || b.startOff > best.startOff) best = b;
    }
  }
  return best;
}

/**
 * Вход в плейлист по смещению внутри блока → стартовый трек и сдвиг в нём.
 * Сырое кумулятивное суммирование (кроссфейд при входе игнорируется —
 * погрешность ≤ пары секунд, см. передачу Чата 8).
 */
export function entryAt(pl: Playlist, offsetSec: number): { startIndex: number; startOffsetSec: number } {
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
