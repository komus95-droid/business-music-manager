import type { Id } from './domain';

/**
 * Генератор идентификаторов сущностей и блоков расписания.
 * Используем нативный crypto.randomUUID() — доступен и в renderer (Chromium),
 * и в main (Node ≥ 16, Web Crypto в globalThis). Внешних зависимостей не тянем.
 */
export function newId(): Id {
  return crypto.randomUUID() as Id;
}
