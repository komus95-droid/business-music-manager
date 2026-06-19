import { useMemo } from 'react';
import type { PlaybackState } from '../audio';
import { useAudio } from '../audio/AudioProvider';
import type { OnAirInfo } from './useOnAir';

/**
 * Статус-карточка эфира в шапке (Чат 9), разметка по прототипу
 * (.onair-card / .live-dot / .oc-main / .wave / .status / .oc-clock).
 * Слева — индикатор LIVE и подпись «сегодня» (день недели или праздник) +
 * что сейчас играет (из реального PlaybackState движка). Справа — живые
 * часы/дата. В Студии карточка приглушена и показывает «остановлено»; в эфире
 * пульсирует и анимирует волну.
 */

interface Props {
  info: OnAirInfo;
}

const pad = (n: number) => String(n).padStart(2, '0');

function nowLine(info: OnAirInfo, pb: PlaybackState): string {
  if (pb.ducked && pb.announcementName) return `📢 ${pb.announcementName}`;
  if (pb.playlistName) {
    const tr = pb.trackName ? ` · ${pb.trackName}` : '';
    return `${pb.playlistName}${tr}`;
  }
  if (!info.live) return '— тишина —';
  switch (info.phase) {
    case 'off': return info.isHoliday ? '— праздник · закрыто —' : '— выходной —';
    case 'before': return `до открытия · ${info.windowStart}`;
    case 'after': return '— эфир завершён —';
    default: return '— тишина по расписанию —';
  }
}

/** Нижняя строка статуса: «Студия · …» или «Эфир · …». */
function statusLine(info: OnAirInfo): { prefix: string; detail: string } {
  if (!info.live) return { prefix: 'Студия', detail: 'вещание остановлено' };
  switch (info.phase) {
    case 'live': return { prefix: 'Эфир', detail: info.isHoliday ? 'праздник' : 'рабочий день' };
    case 'off': return { prefix: 'Сегодня', detail: info.isHoliday ? 'праздник · закрыто' : 'выходной' };
    case 'before': return { prefix: 'Эфир', detail: 'скоро' };
    default: return { prefix: 'Эфир', detail: 'завершён' };
  }
}

// статичный профиль высот волны (анимируется через CSS, когда карточка .live)
const WAVE = Array.from({ length: 28 }, (_, i) => 4 + Math.abs(Math.sin(i * 0.6)) * 16);

export function OnAirCard({ info }: Props) {
  const { playback } = useAudio();

  const live = info.live && info.phase === 'live';
  const now = info.now;
  const s = statusLine(info);

  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const label = `${info.isHoliday ? '🎉 ' : ''}${info.label}`;
  const line = useMemo(() => nowLine(info, playback), [info, playback]);

  return (
    <div className={`onair-card${live ? ' live' : ''}`} role="status" aria-label="Статус эфира">
      <span className="live-dot" aria-hidden="true" />
      <div className="oc-main">
        <div className="oc-top">
          <span className="name">RunBiz <span className="ai">Ai</span></span>
          <span className="oc-day" title={label}>{label}</span>
        </div>
        <div className="wave" aria-hidden="true">
          {WAVE.map((h, i) => (
            <span key={i} style={{ height: `${h}px`, animationDelay: `${i * 0.04}s` }} />
          ))}
        </div>
        <div className="oc-now" title={line}>{line}</div>
        <div className="status">{s.prefix} · <b>{s.detail}</b></div>
      </div>
      <div className="oc-clock">
        <div className="oc-time">{clock}</div>
        <div className="oc-date">{date}</div>
      </div>
    </div>
  );
}
