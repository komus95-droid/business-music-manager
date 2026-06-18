import type {
  Playlist, ScheduleBlock, PlaylistBlock,
  Holiday, DayId, Id,
} from './domain';
import { DAY_ORDER } from './domain';
import type { PersistedStore } from './store';
import type { AudioSettings } from './audio';
import type { HHMM } from './time';
import {
  hhmmToMin, spanMinutes, addMinutes, isOvernight, ddmmToOrdinal,
} from './time';

/**
 * Производные данные — НЕ хранятся в store, а вычисляются на лету.
 * Сюда входит блокировка ассетов (нельзя править то, что в расписании),
 * пересчёт длины блока плейлиста, поиск конфликтов наложения и пересечения
 * дат праздников.
 */

// ──────────────────────────────────────────────────────────────────────────
// Длина блока плейлиста
// ──────────────────────────────────────────────────────────────────────────

/**
 * Эффективная длительность плейлиста (сек):
 *   Σ длительностей треков − кроссфейды (fadeOverlap × число стыков),
 * если включён бесшовный переход.
 */
export function playlistEffectiveSec(pl: Playlist, audio: AudioSettings): number {
  const total = pl.tracks.reduce((acc, t) => acc + t.durationSec, 0);
  const joins = Math.max(pl.tracks.length - 1, 0);
  const cut = pl.crossfade ? joins * audio.fadeOverlap : 0;
  return Math.max(total - cut, 0);
}

/** Время окончания блока плейлиста, посчитанное от start (с учётом овернайта). */
export function playlistBlockEnd(start: HHMM, pl: Playlist, audio: AudioSettings): HHMM {
  const sec = playlistEffectiveSec(pl, audio);
  return addMinutes(start, Math.round(sec / 60));
}

// ──────────────────────────────────────────────────────────────────────────
// Все блоки расписания
// ──────────────────────────────────────────────────────────────────────────

export interface BlockLocation {
  block: ScheduleBlock;
  /** где лежит блок — день недели или праздник */
  owner: { kind: 'day'; id: DayId } | { kind: 'holiday'; id: Id };
}

/** Все блоки из недели и всех праздников, с указанием владельца. */
export function allBlocks(store: PersistedStore): BlockLocation[] {
  const out: BlockLocation[] = [];
  for (const id of DAY_ORDER) {
    for (const block of store.week[id].blocks) {
      out.push({ block, owner: { kind: 'day', id } });
    }
  }
  for (const h of store.holidays) {
    for (const block of h.blocks) {
      out.push({ block, owner: { kind: 'holiday', id: h.id } });
    }
  }
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Блокировка ассета (usage-lock): нельзя править/удалять, если он в расписании
// ──────────────────────────────────────────────────────────────────────────

export interface AssetUsage {
  inUse: boolean;
  /** дни недели, где встречается ассет */
  dayIds: DayId[];
  /** праздники, где встречается ассет */
  holidayIds: Id[];
  /** общее число блоков, ссылающихся на ассет */
  count: number;
}

/** Где и сколько раз используется плейлист/объявление по его id. */
export function assetUsage(store: PersistedStore, refId: Id): AssetUsage {
  const dayIds = new Set<DayId>();
  const holidayIds = new Set<Id>();
  let count = 0;
  for (const { block, owner } of allBlocks(store)) {
    if (block.refId !== refId) continue;
    count++;
    if (owner.kind === 'day') dayIds.add(owner.id);
    else holidayIds.add(owner.id);
  }
  return {
    inUse: count > 0,
    dayIds: [...dayIds],
    holidayIds: [...holidayIds],
    count,
  };
}

/** Заблокирован ли ассет для редактирования/удаления. */
export function isAssetLocked(store: PersistedStore, refId: Id): boolean {
  return assetUsage(store, refId).inUse;
}

// ──────────────────────────────────────────────────────────────────────────
// Наложение блоков плейлистов на одной шкале
// ──────────────────────────────────────────────────────────────────────────

export interface BlockOverlap {
  aId: Id;
  bId: Id;
  /** длительность наложения, секунды */
  overlapSec: number;
  /**
   * true — нахлёст ≤ fadeOverlap, трактуется как кроссфейд (норма);
   * false — конфликт, подсвечивается.
   */
  isCrossfade: boolean;
}

/** Развернуть блок в абсолютные минуты [from, to]; овернайт → +1440 к концу. */
function blockRangeMin(start: HHMM, end: HHMM): [number, number] {
  const from = hhmmToMin(start);
  const len = spanMinutes(start, end);
  return [from, from + len];
}

/**
 * Найти наложения между блоками плейлистов в пределах одной дорожки
 * (объявления — точечные, в проверку не входят).
 */
export function findPlaylistOverlaps(
  blocks: ScheduleBlock[],
  audio: AudioSettings,
): BlockOverlap[] {
  const pls = blocks.filter((b): b is PlaylistBlock => b.kind === 'playlist');
  const ranges = pls.map((b) => ({ id: b.id, r: blockRangeMin(b.start, b.end) }));
  const result: BlockOverlap[] = [];

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const [aFrom, aTo] = ranges[i].r;
      const [bFrom, bTo] = ranges[j].r;
      const overlapMin = Math.min(aTo, bTo) - Math.max(aFrom, bFrom);
      if (overlapMin <= 0) continue;
      const overlapSec = overlapMin * 60;
      result.push({
        aId: ranges[i].id,
        bId: ranges[j].id,
        overlapSec,
        isCrossfade: overlapSec <= audio.fadeOverlap,
      });
    }
  }
  return result;
}

/** «Тишина»: интервалы рабочего дня без единого блока плейлиста (в минутах). */
export interface SilenceGap {
  from: HHMM;
  to: HHMM;
}

// ──────────────────────────────────────────────────────────────────────────
// Пересечение дат праздников (предупреждение)
// ──────────────────────────────────────────────────────────────────────────

/** Диапазон дней-в-году праздника; для периода через 31.12→01.01 вернёт два сегмента. */
function holidaySegments(h: Holiday): Array<[number, number]> {
  const from = ddmmToOrdinal(h.from);
  const to = h.to ? ddmmToOrdinal(h.to) : from;
  if (to >= from) return [[from, to]];
  // период перешёл через конец года (напр. 28.12 → 05.01)
  return [[from, 366], [1, to]];
}

function segmentsIntersect(a: Array<[number, number]>, b: Array<[number, number]>): boolean {
  for (const [a1, a2] of a) {
    for (const [b1, b2] of b) {
      if (a1 <= b2 && b1 <= a2) return true;
    }
  }
  return false;
}

/**
 * Пересекаются ли даты двух праздников.
 * Если у обоих указан год и годы разные — не пересекаются.
 * Если хотя бы у одного года нет (ежегодный) — сравниваем по дням года.
 */
export function holidaysOverlap(a: Holiday, b: Holiday): boolean {
  if (a.year != null && b.year != null && a.year !== b.year) return false;
  return segmentsIntersect(holidaySegments(a), holidaySegments(b));
}

/** Все пары конфликтующих праздников (для предупреждения при добавлении). */
export function findHolidayConflicts(holidays: Holiday[]): Array<[Id, Id]> {
  const out: Array<[Id, Id]> = [];
  for (let i = 0; i < holidays.length; i++) {
    for (let j = i + 1; j < holidays.length; j++) {
      if (holidaysOverlap(holidays[i], holidays[j])) {
        out.push([holidays[i].id, holidays[j].id]);
      }
    }
  }
  return out;
}
