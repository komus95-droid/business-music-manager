/**
 * Контракт IPC между main- и renderer-процессами (Чат 3).
 *
 * В renderer этот интерфейс доступен как типизированный `window.api`
 * (проброшен через contextBridge в preload). Имена каналов собраны в одной
 * константе IPC — единственный источник истины для main и preload.
 */

import type { PersistedStore } from './store';
import type { Id } from './domain';

// ──────────────────────────────────────────────────────────────────────────
// Импорт медиа
// ──────────────────────────────────────────────────────────────────────────

/** Результат импорта одного MP3: имя файла в media + прочитанные метаданные. */
export interface ImportedMedia {
  /** имя файла внутри целевой папки (media/playlists/{id}/ или media/announcements/) */
  file: string;
  /** предложенное имя без расширения — пользователь сможет переименовать в UI */
  name: string;
  /** длительность из метаданных (секунды, округлено) */
  durationSec: number;
}

/** Куда копировать MP3 при импорте. */
export type ImportTarget =
  | { kind: 'playlist'; playlistId: Id }
  | { kind: 'announcement' };

/** Что удалять из media. */
export type DeleteTarget =
  | { kind: 'track'; playlistId: Id; file: string }
  | { kind: 'playlistFolder'; playlistId: Id }
  | { kind: 'announcement'; file: string };

// ──────────────────────────────────────────────────────────────────────────
// API, доступный в renderer как window.api
// ──────────────────────────────────────────────────────────────────────────

export interface IpcApi {
  /**
   * Прочитать store.json: миграция (migrateStore) + валидация/брендинг строк
   * времени и дат на границе main. Первый запуск или битый файл → дефолт.
   * Поле settings.mediaPath всегда проставляется фактическим путём AppData.
   */
  loadStore(): Promise<PersistedStore>;

  /** Атомарно записать store.json (temp → rename). */
  saveStore(store: PersistedStore): Promise<void>;

  /** Открыть диалог выбора MP3. Возвращает абсолютные пути либо null при отмене. */
  pickMp3(opts?: { multi?: boolean }): Promise<string[] | null>;

  /** Скопировать MP3 в media и прочитать длительность из метаданных. */
  importMp3(target: ImportTarget, sourcePath: string): Promise<ImportedMedia>;

  /** Удалить файл трека/объявления или целую папку плейлиста из media. */
  deleteMedia(target: DeleteTarget): Promise<void>;

  /** Включить/выключить автозапуск приложения вместе с Windows. */
  setAutostart(enabled: boolean): Promise<void>;
}

// ──────────────────────────────────────────────────────────────────────────
// Имена каналов IPC (один источник истины для main + preload)
// ──────────────────────────────────────────────────────────────────────────

export const IPC = {
  loadStore: 'store:load',
  saveStore: 'store:save',
  pickMp3: 'media:pick',
  importMp3: 'media:import',
  deleteMedia: 'media:delete',
  setAutostart: 'app:setAutostart',
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
