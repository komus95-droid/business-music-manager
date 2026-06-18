import type { HHMM, DDMM } from './time';

/** Идентификатор сущности (генерируется через nanoid при создании). */
export type Id = string;

// ──────────────────────────────────────────────────────────────────────────
// Цвета (палитра из утверждённого прототипа)
// ──────────────────────────────────────────────────────────────────────────

export type PlaylistColor =
  | 'green' | 'blue' | 'purple' | 'teal'
  | 'pink' | 'cyan' | 'indigo' | 'amber';

export type AnnouncementColor =
  | 'orange' | 'red' | 'magenta' | 'purple' | 'amber';

export const PLAYLIST_PALETTE: Record<PlaylistColor, string> = {
  green: '#27AE60', blue: '#2F80ED', purple: '#9B51E0', teal: '#16A0A0',
  pink: '#E84A8A', cyan: '#2BB7D9', indigo: '#6C5CE7', amber: '#E2A53B',
};

export const ANNOUNCEMENT_PALETTE: Record<AnnouncementColor, string> = {
  orange: '#E67E22', red: '#EB5757', magenta: '#E84A8A',
  purple: '#9B51E0', amber: '#E2A53B',
};

// ──────────────────────────────────────────────────────────────────────────
// Ассеты библиотеки
// ──────────────────────────────────────────────────────────────────────────

/** Трек внутри плейлиста. MP3 копируется в media/playlists/{playlistId}/. */
export interface Track {
  id: Id;
  name: string;
  durationSec: number;
  /** имя файла внутри папки плейлиста (длительность читается из метаданных при импорте) */
  file: string;
}

/** Плейлист — упорядоченный список треков с опциональным бесшовным переходом. */
export interface Playlist {
  id: Id;
  name: string;
  color: PlaylistColor;
  /** бесшовный переход (кроссфейд между треками); сила кроссфейда = AudioSettings.fadeOverlap */
  crossfade: boolean;
  tracks: Track[];
}

/** Объявление — ровно один трек. MP3 копируется в media/announcements/. */
export interface Announcement {
  id: Id;
  name: string;
  color: AnnouncementColor;
  durationSec: number;
  /** имя файла внутри media/announcements/ */
  file: string;
  /** громкость воспроизведения объявления, 0..100 */
  volume: number;
}

// ──────────────────────────────────────────────────────────────────────────
// Блоки расписания
// Решение Чата 2: блок хранит ТОЛЬКО ссылку (refId) + время.
// Имя и цвет всегда берутся из самого ассета (single source of truth) —
// при переименовании/перекраске плейлиста все блоки обновляются сами.
// ──────────────────────────────────────────────────────────────────────────

/** Блок плейлиста — крупный блок на шкале, занимает интервал времени. */
export interface PlaylistBlock {
  id: Id;
  kind: 'playlist';
  /** ссылка на Playlist.id */
  refId: Id;
  start: HHMM;
  /**
   * Конец блока, ФИКСИРУЕТСЯ при создании:
   *   end = start + (Σ длительностей треков − кроссфейды).
   * Овернайт, если end ≤ start (см. isOvernight). Пересчитывается helper'ом
   * playlistBlockEnd() при изменении состава плейлиста или fadeOverlap.
   */
  end: HHMM;
}

/** Блок объявления — компактная метка на ТОЧНОЕ время (не интервал). */
export interface AnnouncementBlock {
  id: Id;
  kind: 'announcement';
  /** ссылка на Announcement.id */
  refId: Id;
  /** точный момент запуска */
  at: HHMM;
}

export type ScheduleBlock = PlaylistBlock | AnnouncementBlock;
export type BlockKind = ScheduleBlock['kind'];

// ──────────────────────────────────────────────────────────────────────────
// Дни недели (шаблон на неделю)
// ──────────────────────────────────────────────────────────────────────────

export type DayId = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export const DAY_ORDER: readonly DayId[] = [
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
];

export interface WeekDay {
  id: DayId;
  /** полное имя: 'Понедельник' */
  name: string;
  /** короткое имя: 'Пн' */
  short: string;
  start: HHMM;
  /** конец рабочего дня; овернайт поддержан (end ≤ start) */
  end: HHMM;
  /** "Выходной" — день закрыт, вещания нет */
  off: boolean;
  blocks: ScheduleBlock[];
}

// ──────────────────────────────────────────────────────────────────────────
// Праздники (до 40 шт.) — всегда перекрывают день недели в свои даты
// ──────────────────────────────────────────────────────────────────────────

export interface Holiday {
  id: Id;
  name: string;
  /** дата начала 'DD.MM' */
  from: DDMM;
  /** дата конца 'DD.MM' для периода; null = одна дата */
  to: DDMM | null;
  /**
   * Опциональный год.
   *   absent → праздник повторяется КАЖДЫЙ год (напр. 8 Марта)
   *   указан → РАЗОВОЕ событие в конкретном году (напр. распродажа 15.03.2026)
   */
  year?: number;
  start: HHMM;
  /** овернайт поддержан */
  end: HHMM;
  /** "Отключён" — в этот праздник заведение закрыто, вещания нет */
  off: boolean;
  blocks: ScheduleBlock[];
}

/** Лимит на число праздников. */
export const MAX_HOLIDAYS = 40;
