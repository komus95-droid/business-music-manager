/**
 * Короткий неблокирующий тост (как в утверждённом прототипе). Используется для
 * мягкого предупреждения о пересечении дат праздников. Императивно добавляет
 * элемент в body и убирает через таймаут — без плумбинга контекста.
 */
export function flash(message: string): void {
  const el = document.createElement('div');
  el.className = 'flash';
  el.setAttribute('role', 'status');
  el.textContent = message;
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 1900);
}
