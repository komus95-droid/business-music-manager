import type { DayId, WeekDay, Playlist } from '@shared';
import { DAY_ORDER, PLAYLIST_PALETTE, spanMinutes, offsetFromDayStart } from '@shared';

interface Props {
  week: Record<DayId, WeekDay>;
  playlists: Playlist[];
  currentDayId: DayId | null;
  onSelect(id: DayId): void;
}

interface Seg { left: number; width: number; color: string; }

/** Сегменты музыки внутри окна дня — для цветной полоски в карточке. */
function musicSegments(d: WeekDay, playlists: Playlist[]): Seg[] {
  if (d.off) return [];
  const span = spanMinutes(d.start, d.end);
  if (span <= 0) return [];
  const segs: Seg[] = [];
  for (const b of d.blocks) {
    if (b.kind !== 'playlist') continue;
    const pl = playlists.find((p) => p.id === b.refId);
    if (!pl) continue;
    const off = offsetFromDayStart(d.start, b.start);
    const w = spanMinutes(b.start, b.end);
    segs.push({
      left: Math.max(0, Math.min(1, off / span)),
      width: Math.max(0.012, Math.min(1, w / span)),
      color: PLAYLIST_PALETTE[pl.color],
    });
  }
  return segs;
}

function blockCounts(d: WeekDay): { pl: number; an: number } {
  let pl = 0; let an = 0;
  for (const b of d.blocks) (b.kind === 'playlist' ? pl++ : an++);
  return { pl, an };
}

/** Левая колонка: рабочая неделя — карточка на каждый день с полоской и счётчиками. */
export function DayList({ week, playlists, currentDayId, onSelect }: Props) {
  return (
    <nav className="daylist" aria-label="Дни недели">
      <div className="daylist-title">РАБОЧАЯ НЕДЕЛЯ</div>
      {DAY_ORDER.map((id) => {
        const d = week[id];
        const active = id === currentDayId;
        const c = blockCounts(d);
        const segs = musicSegments(d, playlists);
        return (
          <button
            key={id}
            type="button"
            className={`day${active ? ' sel' : ''}${d.off ? ' off' : ''}`}
            aria-current={active ? 'true' : undefined}
            onClick={() => onSelect(id)}
          >
            <span className="day-top">
              <span className="day-name">{d.name}</span>
              <span className="day-time">{d.off ? 'Выходной' : `${d.start}–${d.end}`}</span>
            </span>

            <span className="day-strip" aria-hidden="true">
              {!d.off && segs.map((s, i) => (
                <span
                  key={i} className="day-seg"
                  style={{ left: `${s.left * 100}%`, width: `${s.width * 100}%`, background: s.color }}
                />
              ))}
            </span>

            <span className="day-counts">
              <span className="dc-pl">♪ {c.pl}</span>
              <span className="dc-sep">·</span>
              <span className="dc-an">📢 {c.an}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
