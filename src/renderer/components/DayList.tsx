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

/** Левая колонка: рабочая неделя — карточка на каждый день (разметка прототипа). */
export function DayList({ week, playlists, currentDayId, onSelect }: Props) {
  return (
    <nav className="col" aria-label="Дни недели">
      <div className="col-title">РАБОЧАЯ НЕДЕЛЯ</div>
      <div className="week">
        {DAY_ORDER.map((id) => {
          const d = week[id];
          const active = id === currentDayId;
          const c = blockCounts(d);
          const segs = musicSegments(d, playlists);
          const dotCls = d.off ? 'off' : (d.blocks.length ? 'ok' : 'empty');
          return (
            <button
              key={id}
              type="button"
              className={`day${active ? ' active' : ''}${d.off ? ' off' : ''}`}
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(id)}
            >
              <div className="d-name">{d.name}</div>
              <div className="d-hours">{d.off ? 'выходной' : `[${d.start} – ${d.end}]`}</div>

              {!d.off && (
                <div className="d-strip" aria-hidden="true">
                  {segs.map((s, i) => (
                    <span
                      key={i} className="seg"
                      style={{ left: `${s.left * 100}%`, width: `${s.width * 100}%`, background: s.color }}
                    />
                  ))}
                </div>
              )}

              <div className="d-meta">
                <span className={`d-dot ${dotCls}`} />
                {d.off ? 'выходной' : `♪${c.pl} · 📢${c.an}`}
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
