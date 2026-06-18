import { useMemo } from 'react';
import type { PlaybackState } from '../audio';
import { useAudio } from '../audio/AudioProvider';
import type { OnAirInfo } from './useOnAir';

/**
 * Статус-карточка эфира в шапке (Чат 9). Слева — индикатор LIVE и подпись
 * «сегодня» (день недели или праздник) + что сейчас играет (из реального
 * PlaybackState движка). Справа — живые часы/дата. В Студии карточка
 * приглушена и показывает «остановлено», в эфире пульсирует и анимирует волну,
 * пока звучит музыка/объявление.
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
  if (!info.live) return '— остановлено —';
  switch (info.phase) {
    case 'off': return info.isHoliday ? '— праздник · закрыто —' : '— выходной —';
    case 'before': return `до открытия · ${info.windowStart}`;
    case 'after': return '— эфир завершён —';
    default: return '— тишина по расписанию —';
  }
}

function badge(info: OnAirInfo): { text: string; cls: string } {
  if (!info.live) return { text: 'СТУДИЯ', cls: 'studio' };
  switch (info.phase) {
    case 'live': return { text: 'В ЭФИРЕ', cls: 'on' };
    case 'off': return { text: info.isHoliday ? 'ЗАКРЫТО' : 'ВЫХОДНОЙ', cls: 'off' };
    case 'before': return { text: 'СКОРО', cls: 'wait' };
    default: return { text: 'ЗАВЕРШЁН', cls: 'wait' };
  }
}

// статичный профиль высот волны (анимируется через CSS, когда играет звук)
const WAVE = Array.from({ length: 16 }, (_, i) => 4 + Math.abs(Math.sin(i * 0.7)) * 13);

export function OnAirCard({ info }: Props) {
  const { playback } = useAudio();

  const live = info.live && info.phase === 'live';
  const playing = playback.status === 'playing';
  const b = badge(info);
  const now = info.now;

  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = `${pad(now.getDate())}.${pad(now.getMonth() + 1)}.${now.getFullYear()}`;
  const label = `${info.isHoliday ? '🎉 ' : ''}${info.label}`;
  const line = useMemo(() => nowLine(info, playback), [info, playback]);

  return (
    <div className={`onair-card${live ? ' live' : ''}`} role="status" aria-label="Статус эфира">
      <span className="oa-dot" aria-hidden="true" />
      <div className="oa-main">
        <div className="oa-top">
          <span className="oa-label" title={label}>{label}</span>
          <span className={`oa-badge ${b.cls}`}>{b.text}</span>
        </div>
        <div className="oa-now" title={line}>{line}</div>
      </div>
      <div className={`oa-wave${playing ? ' on' : ''}`} aria-hidden="true">
        {WAVE.map((h, i) => (
          <span key={i} style={{ height: `${h}px`, animationDelay: `${i * 0.045}s` }} />
        ))}
      </div>
      <div className="oa-clock">
        <div className="oa-time">{clock}</div>
        <div className="oa-date">{date}</div>
      </div>
    </div>
  );
}
