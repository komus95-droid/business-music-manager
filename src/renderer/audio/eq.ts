/**
 * 10-полосный эквалайзер на WebAudio BiquadFilter (Чат 4).
 *
 * Вставляется ОДИН раз в мастер-шину Howler:
 *   Howler.masterGain → f0 → f1 → … → f9 → ctx.destination
 * Так EQ действует на весь выход (музыка + объявления = «эквализация зала»).
 * Если WebAudio недоступен (Howler ушёл в HTML5-фолбэк) — EQ отключён,
 * остальной движок работает (громкость через Howl.volume).
 *
 * Карта значения полосы → усиление: 0..100, центр 50 = 0 дБ,
 *   gainDb = (v − 50) / 50 × EQ_MAX_GAIN_DB   (диапазон ±12 дБ).
 */

import { Howler } from 'howler';
import type { EqBands } from '@shared';
import { clamp } from './ramp';

/** Центральные частоты полос (Гц) — соответствуют EQ_BAND_LABELS из @shared. */
const EQ_FREQS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;
const EQ_MAX_GAIN_DB = 12;
const PEAK_Q = 1.0;

export function bandToDb(v: number): number {
  return ((clamp(v, 0, 100) - 50) / 50) * EQ_MAX_GAIN_DB;
}

export class EqChain {
  private filters: BiquadFilterNode[] = [];
  private inserted = false;

  /** true — цепочка вставлена и готова принимать apply(). */
  get ready(): boolean {
    return this.inserted;
  }

  /**
   * Гарантирует вставку цепочки. Безопасно вызывать многократно: при
   * отсутствии WebAudio/контекста вернёт false и попробует снова позже.
   */
  ensure(): boolean {
    if (this.inserted) return true;
    if (!Howler.usingWebAudio) return false;

    const ctx = Howler.ctx;
    const master = Howler.masterGain;
    if (!ctx || !master) return false;

    this.filters = EQ_FREQS.map((freq, i) => {
      const node = ctx.createBiquadFilter();
      if (i === 0) node.type = 'lowshelf';
      else if (i === EQ_FREQS.length - 1) node.type = 'highshelf';
      else {
        node.type = 'peaking';
        node.Q.value = PEAK_Q;
      }
      node.frequency.value = freq;
      node.gain.value = 0;
      return node;
    });

    // master → f0 → … → f9 → destination
    master.disconnect();
    let prev: AudioNode = master;
    for (const f of this.filters) {
      prev.connect(f);
      prev = f;
    }
    prev.connect(ctx.destination);

    this.inserted = true;
    return true;
  }

  /** Применить значения полос (0..100 каждая). */
  apply(bands: EqBands): void {
    if (!this.inserted && !this.ensure()) return;
    for (let i = 0; i < this.filters.length; i++) {
      const f = this.filters[i];
      const v = bands[i];
      if (f && typeof v === 'number') f.gain.value = bandToDb(v);
    }
  }
}
