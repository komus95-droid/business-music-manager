import type { HHMM } from '@shared';
import { spanMinutes, offsetFromDayStart, addMinutes } from '@shared';

/**
 * Геометрия шкалы дня. Всё считается в долях (0..1) от ОКНА дня [start, end],
 * чтобы раскладка не зависела от пикселей (resize-safe) и корректно работала
 * для овернайта. Конвертация доли в пиксели/проценты — в самих компонентах.
 */

/** Шаг привязки по умолчанию (Чат 5: 5 минут). */
export const SNAP_DEFAULT = 5;

export interface Window {
  start: HHMM;
  end: HHMM;
}

/** Длина окна дня в минутах (овернайт поддержан). */
export function windowSpan(w: Window): number {
  return spanMinutes(w.start, w.end);
}

/** Время → доля 0..1 от начала окна (может быть >1, если время за концом дня). */
export function timeToFrac(w: Window, t: HHMM): number {
  const span = windowSpan(w);
  return span > 0 ? offsetFromDayStart(w.start, t) / span : 0;
}

/** Доля 0..1 позиции X в дорожке → HHMM с привязкой к шагу snap (минуты). */
export function fracToTime(w: Window, frac: number, snap: number): HHMM {
  const span = windowSpan(w);
  const clamped = Math.max(0, Math.min(frac, 1));
  const off = Math.round((clamped * span) / snap) * snap;
  return addMinutes(w.start, Math.max(0, Math.min(off, span)));
}

/** Ширина (в долях окна) интервала из `sec` секунд; может быть >1. */
export function secToFrac(w: Window, sec: number): number {
  const span = windowSpan(w);
  return span > 0 ? sec / 60 / span : 0;
}

/** Ширина (в долях окна) блока [from, to]; может быть >1 (выход за конец дня). */
export function spanToFrac(w: Window, from: HHMM, to: HHMM): number {
  const span = windowSpan(w);
  return span > 0 ? spanMinutes(from, to) / span : 0;
}

export interface HourTick {
  t: HHMM;
  frac: number;
}

/** Часовые отметки внутри окна дня для линейки/сетки. */
export function hourTicks(w: Window): HourTick[] {
  const span = windowSpan(w);
  const ticks: HourTick[] = [];
  // первая «круглая» отметка ≥ start, далее каждый час, пока не вышли за окно
  for (let off = (60 - (minOf(w.start) % 60)) % 60; off <= span; off += 60) {
    ticks.push({ t: addMinutes(w.start, off), frac: span > 0 ? off / span : 0 });
  }
  return ticks;
}

function minOf(t: HHMM): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}
