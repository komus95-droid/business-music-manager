import type { ImportTarget } from '@shared';
import type { ImportedTrack } from '../state/useStore';

/**
 * Импорт MP3 в библиотеку (Чат 7). Само копирование файла в media/ и чтение
 * длительности из метаданных делает main-процесс (window.api.importMp3,
 * Чат 3) — renderer лишь передаёт абсолютный путь и получает {file,name,dur}.
 *
 * Два источника пути:
 *   • диалог выбора файлов  → pickAndImport
 *   • перетаскивание файлов → importDroppedFiles (Electron кладёт абсолютный
 *     путь в File.path)
 * Сбойный файл молча пропускается — остальные импортируются.
 */

async function importPath(target: ImportTarget, path: string): Promise<ImportedTrack | null> {
  try {
    const m = await window.api.importMp3(target, path);
    return { name: m.name, durationSec: m.durationSec, file: m.file };
  } catch {
    return null;
  }
}

/** Открыть системный диалог выбора MP3 и импортировать выбранное. */
export async function pickAndImport(target: ImportTarget, multi: boolean): Promise<ImportedTrack[]> {
  const paths = await window.api.pickMp3({ multi });
  if (!paths || paths.length === 0) return [];
  const out: ImportedTrack[] = [];
  for (const p of paths) {
    const t = await importPath(target, p);
    if (t) out.push(t);
  }
  return out;
}

/** Импортировать перетащенные в зону файлы (только .mp3). */
export async function importDroppedFiles(target: ImportTarget, files: FileList): Promise<ImportedTrack[]> {
  const out: ImportedTrack[] = [];
  for (const f of Array.from(files)) {
    const path = (f as unknown as { path?: string }).path;
    if (!path || !/\.mp3$/i.test(f.name)) continue;
    const t = await importPath(target, path);
    if (t) out.push(t);
  }
  return out;
}
