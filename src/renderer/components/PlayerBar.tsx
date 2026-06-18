import type { AppMode } from '@shared';
import { fmtDuration } from '@shared';
import { useAudio } from '../audio/AudioProvider';

/**
 * Нижняя полоса плеера (Чат 8). Живёт от PlaybackState единственного движка:
 * транспорт предпрослушки, что сейчас играет, прогресс и мастер-громкость.
 *
 * В Студии транспорт управляет текущей предпрослушкой (плейлист/день/объявление).
 * В эфире автовещание ведёт планировщик (Чат 9) — здесь транспорт отключён,
 * а громкость остаётся доступной как общий уровень вещания.
 */
interface Props {
  mode: AppMode;
  /** мастер-громкость из store.audio.volume (0..100) */
  volume: number;
  onVolume(v: number): void;
}

export function PlayerBar({ mode, volume, onVolume }: Props) {
  const { engine, playback } = useAudio();
  const onAir = mode === 'onair';

  const playing = playback.status === 'playing';
  const idle = playback.status === 'idle';
  const transportOff = onAir || idle;

  const dur = playback.durationSec;
  const pos = Math.min(playback.positionSec, dur || playback.positionSec);
  const frac = dur > 0 ? Math.max(0, Math.min(pos / dur, 1)) : 0;

  // что показываем в строке «сейчас играет»
  let now: string;
  if (playback.ducked && playback.announcementName) {
    now = `📢 ${playback.announcementName}`;
  } else if (playback.playlistName) {
    const track = playback.trackName ? ` · ${playback.trackName}` : '';
    const counter = playback.trackCount > 1 ? ` (${playback.trackIndex + 1}/${playback.trackCount})` : '';
    now = `${playback.playlistName}${track}${counter}`;
  } else {
    now = onAir ? 'эфир остановлен' : '— тишина —';
  }

  function playPause() {
    if (transportOff) return;
    if (playing) engine.pause();
    else engine.resume();
  }

  return (
    <footer className={`player${onAir ? ' onair' : ''}`} aria-label="Плеер">
      <div className="player-ctrls">
        <button
          type="button" className="pbtn live" disabled={transportOff}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'} title={playing ? 'Пауза' : 'Воспроизвести'}
          onClick={playPause}
        >{playing ? '❚❚' : '►'}</button>
        <button
          type="button" className="pbtn live" disabled={onAir || idle}
          aria-label="Стоп" title="Стоп" onClick={() => engine.stop()}
        >■</button>
      </div>

      <span className="player-now" title={now}>{now}</span>

      <span className="player-t">{fmtDuration(pos)}</span>
      <div className="player-track">
        <div className="player-bar"><span style={{ width: `${frac * 100}%` }} /></div>
      </div>
      <span className="player-t">{fmtDuration(dur)}</span>

      <label className="player-vol" title="Громкость вещания">
        <span aria-hidden="true">🔊</span>
        <input
          type="range" min={0} max={100} step={1} value={volume}
          aria-label="Громкость вещания"
          onChange={(e) => onVolume(Number(e.target.value))}
        />
        <b>{volume}%</b>
      </label>

      {onAir && <span className="player-hint">автовещание по расписанию</span>}
    </footer>
  );
}
