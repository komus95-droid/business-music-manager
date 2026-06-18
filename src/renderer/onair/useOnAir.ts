import { useEffect, useRef, useState } from 'react';
import type { PersistedStore, HHMM, Id, AnnouncementBlock } from '@shared';
import {
  resolveActiveWindow, spanMinutes, offsetFromDayStart, dateToHHMM,
  hhmmToMin, isOvernight,
} from '@shared';
import type { AudioEngine } from '../audio';
import { buildPlaylistRequest, buildAnnouncementRequest } from '../audio';
import { playlistBlocksSec, blockAtSec, entryAt } from '../schedule/auditionCore';

/**
 * Автовещание режима «В эфире» (Чат 9).
 *
 * Тот же единственный движок (из useAudio), что ведёт предпрослушку в Студии,
 * здесь ведёт планировщик по РЕАЛЬНЫМ дате/времени. По сути это аудит-плейхед
 * из Чата 8, но:
 *   • активное окно резолвится из стены-часов (праздник перекрывает день
 *     недели; учитывается овернайт-хвост предыдущих суток) — resolveActiveWindow;
 *   • плейлист-блок под текущим временем запускается «по середине» (entryAt);
 *   • объявления играются по их `at` (engine.playAnnouncement, дакинг сам
 *     вернётся); пропущенные при входе в эфир посреди окна НЕ отыгрываются;
 *   • в конце рабочего окна — engine.fadeOutAndStop() (затухание endOfDayFadeSec);
 *   • «тишина строго по расписанию»: промежутки между блоками — без звука
 *     (решение Чата 9), плейлист один проход (loop:false), onPlaylistEnd → тишина
 *     до конца блока (тик-ресинк не перезапускает тот же блок).
 *
 * «Эфир нельзя на паузу; после остановки продолжает по ТЕКУЩЕМУ времени» —
 * получается само собой: окно и позиция пересчитываются из часов каждый тик,
 * поэтому состояние не запоминается между остановками.
 *
 * Один тик в секунду: расписание имеет минутную гранулярность (start/at = HH:MM),
 * поэтому 1 Гц с запасом точен и не грузит свёрнутое окно.
 */

const TICK_MS = 1000;
/** Объявление, чьё время прошло более чем на столько секунд к моменту входа в окно, считается пропущенным. */
const MISS_GRACE_SEC = 2;

export type OnAirPhase = 'live' | 'before' | 'after' | 'off';

export interface OnAirInfo {
  /** режим «В эфире» активен */
  live: boolean;
  /** имя активного дня недели или праздника */
  label: string;
  isHoliday: boolean;
  /** заведение сегодня закрыто (выходной / отключённый праздник) */
  off: boolean;
  /** сейчас внутри рабочего окна (идёт вещание) */
  withinWindow: boolean;
  phase: OnAirPhase;
  windowStart: HHMM;
  windowEnd: HHMM;
  /** окно — овернайт-хвост предыдущих суток */
  carriedOver: boolean;
  /** момент тика — для живых часов карточки */
  now: Date;
}

function makeInfo(live: boolean, now: Date, store: PersistedStore): OnAirInfo {
  const aw = resolveActiveWindow(store, now);
  const { win, off } = aw;
  const spanSec = Math.max(spanMinutes(win.start, win.end) * 60, 1);
  const clockSec = offsetFromDayStart(win.start, dateToHHMM(now)) * 60 + now.getSeconds();
  const within = !off && clockSec < spanSec;

  let phase: OnAirPhase;
  if (off) {
    phase = 'off';
  } else if (within) {
    phase = 'live';
  } else {
    const nowMin = hhmmToMin(dateToHHMM(now));
    const startMin = hhmmToMin(win.start);
    phase = (!isOvernight(win.start, win.end) && nowMin < startMin) ? 'before' : 'after';
  }

  return {
    live, label: aw.label, isHoliday: aw.kind === 'holiday', off,
    withinWindow: within, phase,
    windowStart: win.start, windowEnd: win.end,
    carriedOver: aw.carriedOver, now,
  };
}

export function useOnAir(store: PersistedStore, engine: AudioEngine, enabled: boolean): OnAirInfo {
  const [info, setInfo] = useState<OnAirInfo>(() => makeInfo(enabled, new Date(), store));

  // свежие зависимости для тикера (минуя замыкание)
  const storeRef = useRef(store); storeRef.current = store;
  const enabledRef = useRef(enabled); enabledRef.current = enabled;

  // состояние планировщика
  const sigRef = useRef<string | null>(null);       // подпись активного окна
  const activeBlockRef = useRef<Id | null>(null);    // блок, который сейчас ведёт движок
  const drivingRef = useRef(false);                  // движок СЕЙЧАС играет музыку под нашим управлением
  const firedRef = useRef<Set<Id>>(new Set());       // объявления, уже сыгранные/подавленные в этом окне
  const withinRef = useRef(false);                   // были ли мы внутри окна на прошлом тике
  const endedRef = useRef(false);                    // затухание конца дня уже выполнено в этом окне

  /** Заглушить наш звук и сбросить состояние ведения (при выходе из эфира/окна). */
  const releaseEngine = (): void => {
    if (drivingRef.current || activeBlockRef.current !== null) engine.stop();
    activeBlockRef.current = null;
    drivingRef.current = false;
  };

  const resetWindow = (): void => {
    sigRef.current = null;
    firedRef.current = new Set();
    withinRef.current = false;
    endedRef.current = false;
  };

  const tick = (): void => {
    const now = new Date();
    const s = storeRef.current;
    const on = enabledRef.current;

    // Карточка живёт всегда (и в Студии): показываем сегодняшний день и часы.
    setInfo(makeInfo(on, now, s));

    if (!on) return; // оркестровку звука ведём только в эфире

    const aw = resolveActiveWindow(s, now);
    const { win, off } = aw;
    const spanSec = Math.max(spanMinutes(win.start, win.end) * 60, 1);
    const clockSec = offsetFromDayStart(win.start, dateToHHMM(now)) * 60 + now.getSeconds();
    const within = !off && clockSec < spanSec;

    // Подпись окна: тип+id+off+календарная дата владельца. Меняется при ролловере
    // суток и при входе/выходе из праздника/овернайт-хвоста — повод сбросить окно.
    const ownerDate = aw.carriedOver ? new Date(now.getTime() - 86_400_000) : now;
    const dayKey = `${ownerDate.getFullYear()}-${ownerDate.getMonth() + 1}-${ownerDate.getDate()}`;
    const sig = `${aw.kind}:${aw.id}:${off}:${aw.carriedOver}:${dayKey}`;
    if (sig !== sigRef.current) {
      releaseEngine();          // окно сменилось — обрываем прошлый звук без фейда
      firedRef.current = new Set();
      withinRef.current = false;
      endedRef.current = false;
      sigRef.current = sig;
    }

    // Выходной / отключённый праздник — тишина.
    if (off) {
      releaseEngine();
      withinRef.current = false;
      return;
    }

    // Вне рабочего окна (до открытия / после закрытия).
    if (!within) {
      // Только что закрылись и вели музыку → плавное затухание конца дня.
      if (withinRef.current && drivingRef.current && !endedRef.current) {
        engine.fadeOutAndStop();
        activeBlockRef.current = null;
        drivingRef.current = false;
        endedRef.current = true;
      } else {
        releaseEngine(); // запас прочности: не должны вести звук вне окна
      }
      withinRef.current = false;
      return;
    }

    // ── Внутри рабочего окна ────────────────────────────────────────────────

    // Вход в окно (старт эфира посреди дня / открытие): пропущенные объявления
    // не отыгрываем — помечаем их сыгранными.
    if (!withinRef.current) {
      endedRef.current = false;
      for (const b of win.blocks) {
        if (b.kind !== 'announcement') continue;
        const aOff = offsetFromDayStart(win.start, b.at) * 60;
        if (aOff <= clockSec - MISS_GRACE_SEC) firedRef.current.add(b.id);
      }
    }

    // Плейлист-блок под текущим временем (строгая тишина в промежутках).
    const blocks = playlistBlocksSec(win, s.playlists);
    const cur = blockAtSec(blocks, clockSec);
    if (cur && cur.pl && cur.pl.tracks.length > 0) {
      if (activeBlockRef.current !== cur.id) {
        const { startIndex, startOffsetSec } = entryAt(cur.pl, clockSec - cur.startOff);
        engine.playPlaylist(buildPlaylistRequest(s.settings.mediaPath, cur.pl, {
          startIndex, startOffsetSec, loop: false,
        }));
        activeBlockRef.current = cur.id;
        drivingRef.current = true;
      }
    } else {
      // промежуток между блоками или пустой плейлист — молчим
      if (activeBlockRef.current !== null) engine.stop();
      activeBlockRef.current = null;
      drivingRef.current = false;
    }

    // Объявления по их времени (один раз за окно; дакинг вернётся сам).
    for (const b of win.blocks) {
      if (b.kind !== 'announcement') continue;
      const ab = b as AnnouncementBlock;
      if (firedRef.current.has(ab.id)) continue;
      const aOff = offsetFromDayStart(win.start, ab.at) * 60;
      if (clockSec >= aOff) {
        const a = s.announcements.find((x) => x.id === ab.refId);
        if (a && a.file) {
          engine.playAnnouncement(buildAnnouncementRequest(s.settings.mediaPath, a));
        }
        firedRef.current.add(ab.id); // даже без файла помечаем, чтобы не дёргать каждый тик
      }
    }

    withinRef.current = true;
  };

  // Свежий tick для интервала/эффектов (без пересоздания таймера).
  const tickRef = useRef(tick);
  tickRef.current = tick;

  // Таймер живёт всё время монтирования; на размонтаже — заглушаем свой звук.
  useEffect(() => {
    const id = setInterval(() => tickRef.current(), TICK_MS);
    return () => {
      clearInterval(id);
      if (enabledRef.current) releaseEngine();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Переключение Студия ↔ Эфир.
  useEffect(() => {
    if (enabled) {
      resetWindow();          // войдём в окно как в свежее
      tickRef.current();      // мгновенный старт без секундной паузы
    } else {
      releaseEngine();        // отдаём движок Студии
      resetWindow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return info;
}
