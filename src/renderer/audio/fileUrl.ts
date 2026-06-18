/**
 * Резолв локальных путей в `file://`-URL для Howler (Чат 4).
 *
 * main-процесс отдаёт абсолютный `settings.mediaPath` (AppData/.../media),
 * renderer сам собирает путь к файлу. На Windows путь приходит с обратными
 * слешами и буквой диска — это нужно превратить в корректный `file:///C:/...`,
 * а пробелы/решётки/кириллицу — перкодировать.
 *
 * Модуль намеренно НЕ импортирует ничего из `@shared` и Howler — чистые
 * функции, которые легко покрыть тестом в Node.
 */

/** Соединить части пути через '/', срезая лишние разделители на стыках. */
export function joinMedia(...parts: string[]): string {
  return parts
    .map((p, i) => (i === 0 ? p.replace(/[\\/]+$/, '') : p.replace(/^[\\/]+|[\\/]+$/g, '')))
    .filter((p) => p.length > 0)
    .join('/');
}

/**
 * Абсолютный путь → `file://`-URL.
 *   Windows: 'C:\\Users\\u\\media\\a b.mp3' → 'file:///C:/Users/u/media/a%20b.mp3'
 *   POSIX:   '/home/u/media/a b.mp3'        → 'file:///home/u/media/a%20b.mp3'
 * Буква диска (C:) сохраняется как есть; остальные сегменты — encodeURIComponent
 * (кодирует пробел, '#', '?', кириллицу и т.п.).
 */
export function toFileUrl(absPath: string): string {
  const norm = absPath.replace(/\\/g, '/').replace(/^\/+/, '');

  const drive = /^([A-Za-z]:)\/(.*)$/.exec(norm);
  if (drive) {
    const rest = encodeSegments(drive[2]);
    return `file:///${drive[1]}/${rest}`;
  }

  return `file:///${encodeSegments(norm)}`;
}

function encodeSegments(p: string): string {
  return p
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}
