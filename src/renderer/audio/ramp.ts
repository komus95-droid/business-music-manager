/**
 * Плавные изменения громкости по времени (Чат 4).
 *
 * Почему свой раннер, а не Howler `.fade()`: дакинг и кроссфейд оба меняют
 * громкость музыки одновременно. Howler-фейд «захватывает» gain инстанса и
 * конфликтует. Поэтому эффективная громкость считается как произведение
 * независимых огибающих (envelope × duck × endFade), а каждая огибающая —
 * это Ramp, который двигатель тикает с реальным dt (устойчиво к джиттеру
 * setInterval и к паузам — на паузе движок просто не вызывает tick).
 */

export type Easing = (t: number) => number;

export const linear: Easing = (t) => t;

export const easeInOut: Easing = (t) =>
  t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

/**
 * Равномощный кроссфейд (constant-power). Для входящего трека value = sin,
 * для исходящего value = cos: sin² + cos² = 1 — нет провала громкости в
 * середине перехода (в отличие от линейного, где −6 дБ на стыке).
 */
export const eqPowerIn: Easing = (t) => Math.sin((t * Math.PI) / 2);
export const eqPowerOut: Easing = (t) => 1 - Math.cos((t * Math.PI) / 2);

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

export class Ramp {
  private _value: number;
  private from: number;
  private target: number;
  private durMs = 0;
  private elapsedMs = 0;
  private running = false;
  private ease: Easing;

  constructor(initial: number, ease: Easing = easeInOut) {
    this._value = initial;
    this.from = initial;
    this.target = initial;
    this.ease = ease;
  }

  get value(): number {
    return this._value;
  }

  /** Закончилась ли анимация (или её и не было). */
  get done(): boolean {
    return !this.running;
  }

  setEase(ease: Easing): void {
    this.ease = ease;
  }

  /** Мгновенно установить значение, отменив анимацию. */
  jump(v: number): void {
    this._value = v;
    this.from = v;
    this.target = v;
    this.running = false;
    this.elapsedMs = 0;
    this.durMs = 0;
  }

  /** Запустить анимацию от текущего значения к target за sec секунд. */
  rampTo(target: number, sec: number): void {
    this.from = this._value;
    this.target = target;
    this.durMs = Math.max(0, sec * 1000);
    this.elapsedMs = 0;
    if (this.durMs <= 0 || this.from === target) {
      this.jump(target);
      return;
    }
    this.running = true;
  }

  /** Продвинуть на dtMs миллисекунд. Возвращает текущее значение. */
  tick(dtMs: number): number {
    if (!this.running) return this._value;
    this.elapsedMs += Math.max(0, dtMs);
    const t = this.durMs <= 0 ? 1 : Math.min(this.elapsedMs / this.durMs, 1);
    this._value = this.from + (this.target - this.from) * this.ease(t);
    if (t >= 1) {
      this._value = this.target;
      this.running = false;
    }
    return this._value;
  }
}
