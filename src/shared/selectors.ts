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
  offsetFromDayStart,
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

/** Структурный минимум окна (день недели или праздник): часы + блоки. */
export interface DayWindow {
  start: HHMM;
  end: HHMM;
  blocks: ScheduleBlock[];
}

/**
 * Промежутки рабочего дня [start, end], НЕ покрытые ни одним блоком плейлиста
 * (объявления — точечные, покрытием не считаются). Считается в кадре «смещение
 * от start», поэтому корректно для овернайта. Блоки, выходящие за конец дня,
 * клипуются окном. Подходит и для WeekDay, и для Holiday (структурный тип).
 */
export function findSilenceGaps(day: DayWindow): SilenceGap[] {
  const span = spanMinutes(day.start, day.end);
  if (span <= 0) return [];

  const covered = day.blocks
    .filter((b): b is PlaylistBlock => b.kind === 'playlist')
    .map((b): [number, number] => {
      const s = offsetFromDayStart(day.start, b.start);
      return [Math.max(0, s), Math.min(span, s + spanMinutes(b.start, b.end))];
    })
    .filter(([s, e]) => e > s)
    .sort((a, b) => a[0] - b[0]);

  const gaps: SilenceGap[] = [];
  let cursor = 0;
  for (const [s, e] of covered) {
    if (s > cursor) {
      gaps.push({ from: addMinutes(day.start, cursor), to: addMinutes(day.start, s) });
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < span) {
    gaps.push({ from: addMinutes(day.start, cursor), to: addMinutes(day.start, span) });
  }
  return gaps;
}

// ──────────────────────────────────────────────────────────────────────────
// Авто-сдвиг блока плейлиста к ближайшему свободному старту
// ──────────────────────────────────────────────────────────────────────────

/**
 * Подобрать старт блока плейлиста как можно ближе к `desired`, чтобы он не
 * конфликтовал с уже стоящими блоками (наезд > fadeOverlap = конфликт; наезд
 * ≤ fadeOverlap трактуется как кроссфейд и допускается).
 *
 * Решение Чата 5: блок МОЖЕТ выходить за конец рабочего дня (правый край не
 * клампится) — затухание конца дня в эфире само обрежет хвост. Слева старт не
 * раньше начала дня. При перемещении существующего блока передайте его id в
 * `exceptId`, чтобы он не «конфликтовал сам с собой».
 */
export function resolvePlaylistStart(
  day: DayWindow,
  desired: HHMM,
  pl: Playlist,
  audio: AudioSettings,
  exceptId?: Id,
): HHMM {
  const len = Math.round(playlistEffectiveSec(pl, audio) / 60);
  const fade = audio.fadeOverlap / 60; // допустимый нахлёст в минутах

  const occ = day.blocks
    .filter((b): b is PlaylistBlock => b.kind === 'playlist' && b.id !== exceptId)
    .map((b) => {
      const s = offsetFromDayStart(day.start, b.start);
      return { s, e: s + spanMinutes(b.start, b.end) };
    });

  const isFree = (off: number): boolean =>
    off >= 0 && occ.every((o) => off + len <= o.s + fade || off >= o.e - fade);

  const desiredOff = offsetFromDayStart(day.start, desired);
  if (isFree(desiredOff)) return desired;

  // кандидаты: вплотную после каждого блока (o.e) и вплотную перед ним (o.s − len)
  const candidates: number[] = [];
  for (const o of occ) {
    candidates.push(o.e);
    candidates.push(o.s - len);
  }
  const free = candidates.filter((c) => c >= 0 && isFree(c));
  if (free.length === 0) return desired; // запас прочности (после последнего блока всегда свободно)

  free.sort((a, b) => Math.abs(a - desiredOff) - Math.abs(b - desiredOff));
  return addMinutes(day.start, free[0]);
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

/** Множество id всех праздников, чьи даты с кем-то пересекаются (для значка ⚠). */
export function conflictingHolidayIds(holidays: Holiday[]): Set<Id> {
  const ids = new Set<Id>();
  for (const [a, b] of findHolidayConflicts(holidays)) {
    ids.add(a);
    ids.add(b);
  }
  return ids;
}

/** Праздники, чьи даты пересекаются с праздником `id` (без него самого). */
export function holidaysConflictingWith(holidays: Holiday[], id: Id): Holiday[] {
  const self = holidays.find((h) => h.id === id);
  if (!self) return [];
  return holidays.filter((o) => o.id !== id && holidaysOverlap(self, o));
}

// ──────────────────────────────────────────────────────────────────────────
// Владелец блоков расписания (день недели ИЛИ праздник)
// ──────────────────────────────────────────────────────────────────────────

/**
 * Адрес «куда положить/откуда взять блоки». Чат 6 обобщает мутаторы стора и
 * редактор с `DayId` на этого владельца, чтобы один и тот же редактор шкалы
 * работал и для дня недели, и для праздника.
 */
export type BlockOwner = BlockLocation['owner'];
