import type { DayId, Id } from './domain';

/**
 * Состояние ВРЕМЕНИ ВЫПОЛНЕНИЯ (не пишется в store.json).
 * Тема при запуске всегда тёмная и не запоминается между сессиями.
 */

export type AppMode = 'studio' | 'onair';
export type ThemeMode = 'dark' | 'light';

/**
 * Что показано в центральной рабочей зоне. Контекстный экран:
 * день недели / праздник / редактор плейлиста / редактор объявления.
 */
export type View =
  | { type: 'day'; id: DayId }
  | { type: 'holiday'; id: Id }
  | { type: 'playlist'; id: Id }
  | { type: 'announcement'; id: Id };

export type ViewType = View['type'];

/**
 * Отслеживание несохранённых правок через снапшот.
 * При открытии редактора берём глубокую копию редактируемой сущности;
 * при закрытии сравниваем — если отличается, показываем диалог
 * «Сохранить / Не сохранять / Отмена».
 */
export interface DirtyState {
  dirty: boolean;
  /** глубокая копия сущности на момент открытия; null когда правок нет */
  snapshot: unknown | null;
}

/** Полное рантайм-состояние приложения (вне persisted store). */
export interface AppRuntimeState {
  mode: AppMode;
  view: View;
  /** всегда стартует с 'dark' */
  theme: ThemeMode;
  dirty: DirtyState;
}

/** Стартовое рантайм-состояние при запуске приложения. */
export function createInitialRuntimeState(): AppRuntimeState {
  return {
    mode: 'studio',
    view: { type: 'day', id: 'mon' },
    theme: 'dark',
    dirty: { dirty: false, snapshot: null },
  };
}
