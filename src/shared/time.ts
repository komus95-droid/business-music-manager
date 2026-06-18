/**
 * Время и даты в модели хранятся СТРОКАМИ (решение Чата 2):
 *   - время  → 'HH:MM'  (например '09:00')
 *   - дата   → 'DD.MM'   (например '01.05')
 *
 * Чтобы случайно не передать кривую строку ('25:99', '99.99') туда, где
 * ожидается время/дата, используются "branded"-типы: обычный string,
 * помеченный невидимым тегом. Получить такой тип можно только через
 * конструкторы hhmm()/ddmm() (с проверкой) либо через guard isHHMM/isDDMM.
 *
 * Это даёт надёжность для эфира: на границе загрузки данных мы валидируем
 * все строки один раз, а дальше TS не даст подсунуть непроверенную строку.
 */

// ──────────────────────────────────────────────────────────────────────────
// Branded-типы
// ──────────────────────────────────────────────────────────────────────────

declare const HHMM_BRAND: unique symbol;
declare const DDMM_BRAND: unique symbol;

/** Время суток в формате 'HH:MM' (00:00–23:59). */
export type HHMM = string & { readonly [HHMM_BRAND]: true };

/** Дата без года в формате 'DD.MM' (01.01–31.12). */
export type DDMM = string & { readonly [DDMM_BRAND]: true };

// ──────────────────────────────────────────────────────────────────────────
// Валидация формата
// ──────────────────────────────────────────────────────────────────────────

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DDMM_RE = /^(0[1-9]|[12]\d|3[01])\.(0[1-9]|1[0-2])$/;

/** Максимальное число дней в месяце (февраль = 29, чтобы допускать 29.02). */
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

/** Проверка формата 'HH:MM'. */
export function isHHMM(v: string): v is HHMM {
  return HHMM_RE.test(v);
}

/** Проверка формата 'DD.MM' (только синтаксис). */
export function isDDMM(v: string): v is DDMM {
  return DDMM_RE.test(v);
}

/** Проверка, что 'DD.MM' — реально существующая дата (напр. 31.04 невалидно). */
export function isValidCalendarDDMM(v: string): v is DDMM {
  if (!DDMM_RE.test(v)) return false;
  const [d, m] = v.split('.').map(Number);
  return d <= DAYS_IN_MONTH[m - 1];
}

// ──────────────────────────────────────────────────────────────────────────
// Конструкторы (с проверкой)
// ──────────────────────────────────────────────────────────────────────────

/** Создать HHMM из строки. Бросает ошибку при неверном формате. */
export function hhmm(v: string): HHMM {
  if (!isHHMM(v)) throw new Error(`Некорректное время HH:MM: "${v}"`);
  return v;
}

/** Создать DDMM из строки. Бросает ошибку при невалидной дате. */
export function ddmm(v: string): DDMM {
  if (!isValidCalendarDDMM(v)) throw new Error(`Некорректная дата DD.MM: "${v}"`);
  return v;
}

// ──────────────────────────────────────────────────────────────────────────
// Преобразования времени
// ──────────────────────────────────────────────────────────────────────────

/** 'HH:MM' → минуты от полуночи (0–1439). */
export function hhmmToMin(t: HHMM): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

/** Минуты → 'HH:MM' (нормализует выход за сутки по модулю 1440). */
export function minToHHMM(min: number): HHMM {
  const n = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = String(Math.floor(n / 60)).padStart(2, '0');
  const m = String(n % 60).padStart(2, '0');
  return `${h}:${m}` as HHMM;
}

/** Прибавить минуты ко времени (с переходом через полночь). */
export function addMinutes(t: HHMM, deltaMin: number): HHMM {
  return minToHHMM(hhmmToMin(t) + deltaMin);
}

/**
 * Овернайт: конец в тот же момент или раньше начала по часам
 * (например 10:00 → 02:00 — рабочий день уходит за полночь).
 */
export function isOvernight(start: HHMM, end: HHMM): boolean {
  return hhmmToMin(end) <= hhmmToMin(start);
}

/** Длительность интервала [start, end) в минутах с учётом овернайта. */
export function spanMinutes(start: HHMM, end: HHMM): number {
  const s = hhmmToMin(start);
  const e = hhmmToMin(end);
  return isOvernight(start, end) ? 1440 - s + e : e - s;
}

/**
 * Смещение времени t от начала дня dayStart, в минутах (0–1439), считая ВПЕРЁД
 * по кругу. Для овернайт-дней время «после полуночи» получает большое смещение
 * (т.е. правильно располагается позже в окне дня). Основа для раскладки шкалы.
 */
export function offsetFromDayStart(dayStart: HHMM, t: HHMM): number {
  return ((hhmmToMin(t) - hhmmToMin(dayStart)) % 1440 + 1440) % 1440;
}

// ──────────────────────────────────────────────────────────────────────────
// Преобразования дат
// ──────────────────────────────────────────────────────────────────────────

/**
 * 'DD.MM' → порядковый номер дня в году (1–366), считая по невисокосной
 * раскладке с февралём = 29 (для аннуальных праздников 29.02 допустим).
 * Используется для сравнения дат и проверки пересечений периодов.
 */
export function ddmmToOrdinal(date: DDMM): number {
  const [d, m] = date.split('.').map(Number);
  let acc = 0;
  for (let i = 0; i < m - 1; i++) acc += DAYS_IN_MONTH[i];
  return acc + d;
}

/**
 * Реальная дата (JS Date) → порядковый номер дня в году (1–366) по той же
 * невисокосной раскладке (февраль = 29), что и ddmmToOrdinal. Согласованность
 * с раскладкой праздников важнее астрономической точности: эфир сравнивает
 * «сегодня» с диапазонами праздников в одном кадре. Используется в
 * resolveActiveWindow (эфир, Чат 9).
 */
export function ordinalOfDate(date: Date): number {
  const m = date.getMonth(); // 0..11
  const d = date.getDate();
  let acc = 0;
  for (let i = 0; i < m; i++) acc += DAYS_IN_MONTH[i];
  return acc + d;
}

/** Реальная дата → 'HH:MM' текущего времени (секунды отбрасываются). */
export function dateToHHMM(date: Date): HHMM {
  return minToHHMM(date.getHours() * 60 + date.getMinutes());
}

/** Форматирование длительности в секундах → 'M:SS' (например 212 → '3:32'). */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
