import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

import type { PersistedStore } from '../shared/store';
import { createDefaultStore, migrateStore } from '../shared/store';
import type { ScheduleBlock, WeekDay, Holiday, DayId } from '../shared/domain';
import { DAY_ORDER } from '../shared/domain';
import { hhmm, ddmm } from '../shared/time';
import { IPC } from '../shared/ipc';
import type { ImportTarget, DeleteTarget, ImportedMedia } from '../shared/ipc';

const isDev = !app.isPackaged;

// ──────────────────────────────────────────────────────────────────────────
// Пути AppData и создание папок
// ──────────────────────────────────────────────────────────────────────────

function ensureDir(dir: string): string {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function dataDir(): string {
  return ensureDir(path.join(app.getPath('userData'), 'bmm-data'));
}
function mediaDir(): string {
  return ensureDir(path.join(dataDir(), 'media'));
}
function playlistsRoot(): string {
  return ensureDir(path.join(mediaDir(), 'playlists'));
}
function playlistDir(id: string): string {
  return ensureDir(path.join(playlistsRoot(), id));
}
function announcementsDir(): string {
  return ensureDir(path.join(mediaDir(), 'announcements'));
}
function storePath(): string {
  return path.join(dataDir(), 'store.json');
}

// ──────────────────────────────────────────────────────────────────────────
// Валидация и брендинг строк времени/дат на границе загрузки
// (осознанно отложено из Чата 2 сюда). hhmm()/ddmm() бросают при кривом формате —
// любая ошибка трактуется как повреждение файла в loadStore().
// ──────────────────────────────────────────────────────────────────────────

function brandBlocks(blocks: unknown): ScheduleBlock[] {
  if (!Array.isArray(blocks)) throw new Error('blocks: ожидался массив');
  return blocks.map((b: any): ScheduleBlock => {
    if (b?.kind === 'playlist') {
      return { id: String(b.id), kind: 'playlist', refId: String(b.refId), start: hhmm(b.start), end: hhmm(b.end) };
    }
    if (b?.kind === 'announcement') {
      return { id: String(b.id), kind: 'announcement', refId: String(b.refId), at: hhmm(b.at) };
    }
    throw new Error(`неизвестный тип блока: ${b?.kind}`);
  });
}

function brandWeekDay(d: any): WeekDay {
  return {
    id: d.id as DayId,
    name: String(d.name),
    short: String(d.short),
    start: hhmm(d.start),
    end: hhmm(d.end),
    off: Boolean(d.off),
    blocks: brandBlocks(d.blocks),
  };
}

function brandHoliday(h: any): Holiday {
  return {
    id: String(h.id),
    name: String(h.name),
    from: ddmm(h.from),
    to: h.to == null ? null : ddmm(h.to),
    ...(h.year != null ? { year: Number(h.year) } : {}),
    start: hhmm(h.start),
    end: hhmm(h.end),
    off: Boolean(h.off),
    blocks: brandBlocks(h.blocks),
  };
}

/** Валидирует структуру и брендирует все строки времени/дат. Бросает при повреждении. */
function validateAndBrandStore(raw: any): PersistedStore {
  if (!raw || typeof raw !== 'object') throw new Error('store: не объект');
  const migrated = migrateStore(raw as PersistedStore) as any;

  if (!migrated.week || typeof migrated.week !== 'object') throw new Error('store.week отсутствует');
  const week = {} as Record<DayId, WeekDay>;
  for (const id of DAY_ORDER) {
    if (!migrated.week[id]) throw new Error(`store.week.${id} отсутствует`);
    week[id] = brandWeekDay(migrated.week[id]);
  }

  if (!Array.isArray(migrated.holidays)) throw new Error('store.holidays не массив');
  if (!Array.isArray(migrated.playlists)) throw new Error('store.playlists не массив');
  if (!Array.isArray(migrated.announcements)) throw new Error('store.announcements не массив');
  if (!migrated.audio || !migrated.settings) throw new Error('store.audio/settings отсутствуют');

  return {
    schemaVersion: migrated.schemaVersion,
    week,
    holidays: migrated.holidays.map(brandHoliday),
    playlists: migrated.playlists,
    announcements: migrated.announcements,
    audio: migrated.audio,
    settings: migrated.settings,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Чтение / атомарная запись store.json
// ──────────────────────────────────────────────────────────────────────────

function writeStoreAtomic(store: PersistedStore): void {
  ensureDir(dataDir());
  const target = storePath();
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmp, target); // атомарная замена
}

function loadStore(): PersistedStore {
  const target = storePath();

  // первый запуск — нет файла
  if (!fs.existsSync(target)) {
    const fresh = createDefaultStore();
    fresh.settings.mediaPath = mediaDir();
    writeStoreAtomic(fresh);
    return fresh;
  }

  try {
    const raw = JSON.parse(fs.readFileSync(target, 'utf-8'));
    const store = validateAndBrandStore(raw);
    store.settings.mediaPath = mediaDir(); // main владеет путём
    return store;
  } catch (err) {
    // файл повреждён — не перетираем молча: отводим в сторону и стартуем с дефолта
    const backup = path.join(dataDir(), `store.corrupt-${Date.now()}.json`);
    try { fs.renameSync(target, backup); } catch { /* ignore */ }
    console.error('store.json повреждён, создан дефолт. Бэкап:', backup, err);
    const fresh = createDefaultStore();
    fresh.settings.mediaPath = mediaDir();
    writeStoreAtomic(fresh);
    return fresh;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Работа с медиафайлами
// ──────────────────────────────────────────────────────────────────────────

/** Уникальное имя файла в папке (при коллизии добавляет _2, _3 …). */
function uniqueFileName(dir: string, original: string): string {
  const ext = path.extname(original);
  const base = path.basename(original, ext);
  let candidate = base + ext;
  let i = 2;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${base}_${i}${ext}`;
    i++;
  }
  return candidate;
}

/** Длительность MP3 из метаданных. music-metadata — ESM-only, грузим динамически. */
async function readDurationSec(file: string): Promise<number> {
  try {
    const mm = await import('music-metadata');
    const meta = await mm.parseFile(file);
    return Math.round(meta.format.duration ?? 0);
  } catch (err) {
    console.error('Не удалось прочитать длительность:', file, err);
    return 0;
  }
}

async function importMp3(target: ImportTarget, sourcePath: string): Promise<ImportedMedia> {
  const destDir = target.kind === 'playlist' ? playlistDir(target.playlistId) : announcementsDir();
  const file = uniqueFileName(destDir, path.basename(sourcePath));
  const dest = path.join(destDir, file);
  fs.copyFileSync(sourcePath, dest);
  const durationSec = await readDurationSec(dest);
  return { file, name: path.basename(sourcePath, path.extname(sourcePath)), durationSec };
}

function deleteMedia(target: DeleteTarget): void {
  if (target.kind === 'track') {
    const p = path.join(playlistsRoot(), target.playlistId, target.file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } else if (target.kind === 'playlistFolder') {
    const dir = path.join(playlistsRoot(), target.playlistId);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  } else {
    const p = path.join(announcementsDir(), target.file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Окно
// ──────────────────────────────────────────────────────────────────────────

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1380, height: 880, minWidth: 1100, minHeight: 700,
    title: 'Commercial Player by RunBizAi',
    backgroundColor: '#0F1525',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Electron 28 включает песочницу рендерера по умолчанию, а в песочнице
      // preload не может require() локальные модули (наш preload импортирует
      // ../shared/ipc) — из-за этого мост window.api не появлялся и интерфейс
      // не рисовался. Отключаем песочницу; contextIsolation остаётся включён.
      sandbox: false,
      webSecurity: false, // разрешить file:// для локального аудио
      // Не тормозить таймеры/аудио-фейды, когда окно свёрнуто (фоновый плеер
      // работает свёрнутым почти всегда). Нужно для плавных переходов движка.
      backgroundThrottling: false,
    },
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // ── ДИАГНОСТИКА (Чат 10, v1.0.5): показываем точную ошибку нативным окном.
  // Всё на стороне main — не зависит ни от preload, ни от рендерера.
  const BUILD = 'v1.0.6';
  const consoleErr: string[] = [];
  win.webContents.on('console-message', (_e, level, message, line, source) => {
    if (level >= 2) consoleErr.push(`[${level === 3 ? 'ERR' : 'WARN'}] ${message}` + (source ? ` (${source}:${line})` : ''));
  });
  win.webContents.on('preload-error', (_e, preloadPath, error) => {
    dialog.showErrorBox('Commercial Player — ошибка preload', `${preloadPath}\n\n${error.stack || String(error)}`);
  });
  win.webContents.on('did-finish-load', () => {
    setTimeout(() => {
      void (async () => {
        try {
          const kids = await win.webContents.executeJavaScript(
            'document.getElementById("root") ? document.getElementById("root").childElementCount : -1',
          );
          if (kids === 0 || kids === -1) {
            const apiType = await win.webContents.executeJavaScript('typeof window.api');
            dialog.showErrorBox(
              `Commercial Player ${BUILD} — интерфейс не отрисовался`,
              `window.api (мост preload): ${apiType}\n#root детей: ${kids}\n\n` +
              `Ошибки/предупреждения консоли:\n${consoleErr.join('\n') || '(пусто)'}`,
            );
          }
        } catch (e) {
          dialog.showErrorBox('Commercial Player — ошибка самодиагностики', String(e));
        }
      })();
    }, 3000);
  });

  win.once('ready-to-show', () => {
    win.setTitle(`Commercial Player ${BUILD}`); // версия видна в заголовке окна
    win.show();
  });
  return win;
}

// ──────────────────────────────────────────────────────────────────────────
// IPC
// ──────────────────────────────────────────────────────────────────────────

function registerIpc(): void {
  ipcMain.handle(IPC.loadStore, () => loadStore());
  ipcMain.handle(IPC.saveStore, (_e, store: PersistedStore) => { writeStoreAtomic(store); });

  ipcMain.handle(IPC.pickMp3, async (_e, opts?: { multi?: boolean }) => {
    const properties: Array<'openFile' | 'multiSelections'> = ['openFile'];
    if (opts?.multi) properties.push('multiSelections');
    const r = await dialog.showOpenDialog({
      properties,
      filters: [{ name: 'MP3', extensions: ['mp3'] }],
    });
    return r.canceled ? null : r.filePaths;
  });

  ipcMain.handle(IPC.importMp3, (_e, target: ImportTarget, sourcePath: string) => importMp3(target, sourcePath));
  ipcMain.handle(IPC.deleteMedia, (_e, target: DeleteTarget) => { deleteMedia(target); });
  ipcMain.handle(IPC.setAutostart, (_e, enabled: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enabled });
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Жизненный цикл
// ──────────────────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
