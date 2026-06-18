/**
 * Настройки из меню-шестерёнки, которые СОХРАНЯЮТСЯ между запусками.
 * Тема сюда НЕ входит — она рантайм-only (всегда тёмная при старте).
 * Громкость и звук живут в AudioSettings (audio.ts).
 */

export type Language = 'ru' | 'en';

export interface AppSettings {
  language: Language;
  /** корневая папка медиа; по умолчанию AppData/bmm-data/media */
  mediaPath: string;
  /** автозапуск приложения вместе с Windows */
  autostartWithWindows: boolean;
  /** проверять обновления */
  checkUpdates: boolean;
}
