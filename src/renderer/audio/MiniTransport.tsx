import type { ReactNode } from 'react';
import { fmtDuration } from '@shared';

/**
 * Презентационный транспорт предпрослушки (Чат 8): кнопка play/pause,
 * опциональный stop, дорожка-скраб и тайминги. Никакой логики движка —
 * родитель передаёт значения и колбэки. Используется в редакторе плейлиста
 * и в предпрослушке дня на шкале.
 */
interface Props {
  playing: boolean;
  /** весь транспорт недоступен (эфир / нет контента) */
  disabled?: boolean;
  positionSec: number;
  durationSec: number;
  /** можно ли тянуть скраб (в неактивном плейлисте — нет) */
  seekable?: boolean;
  onPlayPause(): void;
  onStop?(): void;
  onSeek?(sec: number): void;
  /** что сейчас под курсором: имя трека/блока/«тишина» */
  label?: ReactNode;
  /** правая подсказка (например про эфир) */
  hint?: ReactNode;
}

export function MiniTransport({
  playing, disabled = false, positionSec, durationSec,
  seekable = true, onPlayPause, onStop, onSeek, label, hint,
}: Props) {
  const dur = Math.max(durationSec, 0);
  const pos = Math.max(0, Math.min(positionSec, dur || positionSec));

  return (
    <div className={`mt${disabled ? ' off' : ''}`} role="group" aria-label="Предпрослушивание">
      <button
        type="button" className="mt-pp" disabled={disabled}
        aria-label={playing ? 'Пауза' : 'Воспроизвести'} title={playing ? 'Пауза' : 'Воспроизвести'}
        onClick={onPlayPause}
      >{playing ? '❚❚' : '►'}</button>

      {onStop && (
        <button
          type="button" className="mt-stop" disabled={disabled}
          aria-label="Стоп" title="Стоп" onClick={onStop}
        >■</button>
      )}

      <span className="mt-time">{fmtDuration(pos)}</span>
      <input
        type="range" className="mt-scrub"
        min={0} max={Math.max(dur, 1)} step={1} value={pos}
        disabled={disabled || !seekable}
        aria-label="Перемотка"
        onChange={(e) => onSeek?.(Number(e.target.value))}
      />
      <span className="mt-time">{fmtDuration(dur)}</span>

      {label != null && <span className="mt-label">{label}</span>}
      {hint != null && <span className="mt-hint">{hint}</span>}
    </div>
  );
}
