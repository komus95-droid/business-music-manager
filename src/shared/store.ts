import type {
  WeekDay, Holiday, Playlist, Announcement, DayId,
} from './domain';
import { DAY_ORDER } from './domain';
import type { AudioSettings } from './audio';
import { EQ_PRESETS } from './audio';
import type { AppSettings } from './settings';
import { hhmm } from './time';

/**
 * Всё persisted-состояние приложения. Хранится одним файлом
 * AppData/bmm-data/store.json (атомарная запись). Поле schemaVersion
 * позволяет мигрировать формат при выходе новых версий.
 */

export const SCHEMA_VERSION = 1;

export interface PersistedStore {
  schemaVersion: number;
  /** 7 дней недели, доступ по id */
  week: Record<DayId, WeekDay>;
  holidays: Holiday[];
  playlists: Playlist[];
  announcements: Announcement[];
  audio: AudioSettings;
  settings: AppSettings;
}

// ──────────────────────────────────────────────────────────────────────────
// Значения по умолчанию для чистой установки
// ──────────────────────────────────────────────────────────────────────────

const DAY_META: Record<DayId, { name: string; short: string }> = {
  mon: { name: 'Понедельник', short: 'Пн' },
  tue: { name: 'Вторник',     short: 'Вт' },
  wed: { name: 'Среда',       short: 'Ср' },
  thu: { name: 'Четверг',     short: 'Чт' },
  fri: { name: 'Пятница',     short: 'Пт' },
  sat: { name: 'Суббота',     short: 'Сб' },
  sun: { name: 'Воскресенье', short: 'Вс' },
};

const WEEKEND: ReadonlySet<DayId> = new Set<DayId>(['sat', 'sun']);

function createDefaultWeekDay(id: DayId): WeekDay {
  const weekend = WEEKEND.has(id);
  return {
    id,
    name: DAY_META[id].name,
    short: DAY_META[id].short,
    // будни 09:00–22:00, выходные 10:00–23:00
    start: hhmm(weekend ? '10:00' : '09:00'),
    end: hhmm(weekend ? '23:00' : '22:00'),
    off: false,
    blocks: [],
  };
}

export function createDefaultWeek(): Record<DayId, WeekDay> {
  const week = {} as Record<DayId, WeekDay>;
  for (const id of DAY_ORDER) week[id] = createDefaultWeekDay(id);
  return week;
}

export function createDefaultAudioSettings(): AudioSettings {
  return {
    volume: 80,
    ducking: 70,
    fadeOverlap: 5,
    smoothing: 40,
    eq: [...EQ_PRESETS.flat] as AudioSettings['eq'],
    eqPreset: 'flat',
    endOfDayFadeSec: 20,
  };
}

export function createDefaultSettings(): AppSettings {
  return {
    language: 'ru',
    mediaPath: '', // заполняется main-процессом фактическим путём AppData
    autostartWithWindows: false,
    checkUpdates: true,
  };
}

/** Свежий store для первого запуска (пустые библиотеки и расписание). */
export function createDefaultStore(): PersistedStore {
  return {
    schemaVersion: SCHEMA_VERSION,
    week: createDefaultWeek(),
    holidays: [],
    playlists: [],
    announcements: [],
    audio: createDefaultAudioSettings(),
    settings: createDefaultSettings(),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Миграции схемы
// ──────────────────────────────────────────────────────────────────────────

/**
 * Приведение прочитанного store к актуальной схеме.
 * Полная валидация/брендинг строк выполняется на границе main-процесса
 * при загрузке файла (Чат 3, IPC). Здесь — точка наращивания миграций
 * по schemaVersion при будущих изменениях формата.
 */
export function migrateStore(raw: PersistedStore): PersistedStore {
  let s = raw;
  // switch (s.schemaVersion) { case 1: s = v1_to_v2(s); /* fallthrough */ }
  s.schemaVersion = SCHEMA_VERSION;
  return s;
}
