import type { HHMM } from '@shared';
import { spanMinutes, offsetFromDayStart, addMinutes, hhmmToMin } from '@shared';

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

// ──────────────────────────────────────────────────────────────────────────
// v1.2.3 — магнитная привязка (перенос «фишек» центральной зоны из прототипа)
// ──────────────────────────────────────────────────────────────────────────

/** Доля 0..1 → смещение от начала окна в минутах (без привязки к шагу). */
export function fracToRawOffset(w: Window, frac: number): number {
  const span = windowSpan(w);
  return Math.max(0, Math.min(frac, 1)) * span;
}

/** Смещение в минутах → HHMM (с клампом по окну, овернайт-безопасно). */
export function offsetToHHMM(w: Window, off: number): HHMM {
  const span = windowSpan(w);
  return addMinutes(w.start, Math.max(0, Math.min(Math.round(off), span)));
}

export interface EdgeBlock {
  kind: 'playlist' | 'announcement';
  id: string;
  start: HHMM;
  end?: HHMM;
  at?: HHMM;
}

/**
 * «Магнитные» края внутри окна (смещения в минутах): границы дня + начала/концы
 * блоков плейлистов + точки объявлений. Перетаскиваемый блок исключается.
 */
export function windowEdges(w: Window, blocks: EdgeBlock[], excludeId?: string): number[] {
  const span = windowSpan(w);
  const edges = [0, span];
  for (const b of blocks) {
    if (b.id === excludeId) continue;
    if (b.kind === 'playlist' && b.end) {
      const s = offsetFromDayStart(w.start, b.start);
      edges.push(s, s + spanMinutes(b.start, b.end));
    } else if (b.kind === 'announcement' && b.at) {
      edges.push(offsetFromDayStart(w.start, b.at));
    }
  }
  return edges;
}

/** Порог «магнита» в минутах: max(шаг, ~12px в минутах) — resize-safe. */
export function magnetThresholdMin(w: Window, laneWidthPx: number, snap: number): number {
  const span = windowSpan(w);
  const minPerPx = laneWidthPx > 0 ? span / laneWidthPx : 1;
  return Math.max(snap, minPerPx * 12);
}

/**
 * Привязать смещение: сначала к шагу сетки, затем — к ближайшему «магнитному»
 * краю, если он ближе порога (край перекрывает сетку). Возвращает минуты.
 */
export function snapOffset(off: number, snap: number, edges: number[], thresholdMin: number): number {
  let best = Math.round(off / snap) * snap;
  let bd = thresholdMin;
  for (const e of edges) {
    const d = Math.abs(e - off);
    if (d < bd) { bd = d; best = e; }
  }
  return Math.round(best);
}

// ──────────────────────────────────────────────────────────────────────────
// v1.3.0 — масштаб/прокрутка ленты (таймлайн-редактор)
// ──────────────────────────────────────────────────────────────────────────

/** Уровень масштаба: 'fit' — весь день в ширину; число — пикселей на час. */
export type Zoom = 'fit' | number;

export interface ZoomPreset { key: Zoom; label: string; }
export const ZOOM_PRESETS: ZoomPreset[] = [
  { key: 'fit', label: 'Обзор' },
  { key: 90, label: '1×' },
  { key: 180, label: '2×' },
  { key: 360, label: '4×' },
  { key: 720, label: '8×' },
];

/** CSS-ширина внутренней ленты: '100%' для «Обзор», иначе фикс. пиксели. */
export function timelineWidthCss(zoom: Zoom, spanMin: number): string {
  if (zoom === 'fit') return '100%';
  return `${Math.max(1, Math.round((spanMin * zoom) / 60))}px`;
}

// ──────────────────────────────────────────────────────────────────────────
// v1.3.8 — детальная линейка (деления по зуму: 60/30/15/5 мин)
// ──────────────────────────────────────────────────────────────────────────
export interface RulerTick { t: HHMM; frac: number; major: boolean; }

/** Отметки линейки с шагом intervalMin; major — отметка, попавшая на целый час. */
export function rulerTicks(w: Window, intervalMin: number): RulerTick[] {
  const span = windowSpan(w);
  const startMin = hhmmToMin(w.start);
  const first = (intervalMin - (startMin % intervalMin)) % intervalMin;
  const out: RulerTick[] = [];
  for (let off = first; off <= span; off += intervalMin) {
    const abs = startMin + off;
    out.push({ t: addMinutes(w.start, off), frac: span > 0 ? off / span : 0, major: abs % 60 === 0 });
  }
  return out;
}
