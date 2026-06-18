import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { WeekDay, PersistedStore, Id } from '@shared';
import {
  findPlaylistOverlaps, findSilenceGaps, isHHMM, hhmm,
} from '@shared';
import type { StoreApi } from '../state/useStore';
import { PlaylistLane } from './PlaylistLane';
import { AnnouncementLane } from './AnnouncementLane';
import { hourTicks } from './timeline';

interface Props {
  day: WeekDay;
  store: PersistedStore;
  api: StoreApi;
  snap: number;
  canEdit: boolean;
}

const pct = (frac: number) => `${frac * 100}%`;

export function DayEditor({ day, store, api, snap, canEdit }: Props) {
  const [selected, setSelected] = useState<Id | null>(null);
  useEffect(() => setSelected(null), [day.id]);

  function onHour(field: 'start' | 'end') {
    return (e: ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      if (isHHMM(v)) api.setDayHours(day.id, { [field]: hhmm(v) });
    };
  }

  const conflictIds = new Set<Id>();
  if (!day.off) {
    for (const ov of findPlaylistOverlaps(day.blocks, store.audio)) {
      if (!ov.isCrossfade) { conflictIds.add(ov.aId); conflictIds.add(ov.bId); }
    }
  }
  const silence = day.off ? [] : findSilenceGaps(day);
  const ticks = hourTicks(day);

  return (
    <section className="editor" aria-label={`Расписание: ${day.name}`}>
      <div className="editor-head">
        <span className="editor-title">{day.name}</span>
        <label className="hour">с
          <input type="time" value={day.start} disabled={day.off || !canEdit} onChange={onHour('start')} />
        </label>
        <label className="hour">до
          <input type="time" value={day.end} disabled={day.off || !canEdit} onChange={onHour('end')} />
        </label>
        <label className="offbox">
          <input
            type="checkbox" checked={day.off} disabled={!canEdit}
            onChange={(e) => api.setDayHours(day.id, { off: e.target.checked })}
          />
          Выходной
        </label>
      </div>

      {day.off ? (
        <div className="closed">Заведение закрыто — вещания в этот день нет</div>
      ) : (
        <>
          <div className="ruler">
            {ticks.map((t, i) => (
              <span key={i} className="tick" style={{ left: pct(t.frac) }}>{t.t}</span>
            ))}
          </div>

          <PlaylistLane
            day={day} playlists={store.playlists}
            conflictIds={conflictIds} silence={silence}
            snap={snap} canEdit={canEdit}
            selectedId={selected} onSelect={setSelected}
            onAdd={(refId, t) => api.addPlaylistBlock(day.id, refId, t)}
            onMove={(id, t) => api.movePlaylistBlock(day.id, id, t)}
            onRemove={(id) => { api.removeBlock(day.id, id); setSelected(null); }}
          />

          <AnnouncementLane
            day={day} announcements={store.announcements}
            snap={snap} canEdit={canEdit}
            selectedId={selected} onSelect={setSelected}
            onAdd={(refId, t) => api.addAnnouncementBlock(day.id, refId, t)}
            onMove={(id, t) => api.moveAnnouncementBlock(day.id, id, t)}
            onRemove={(id) => { api.removeBlock(day.id, id); setSelected(null); }}
          />

          {conflictIds.size > 0 && (
            <p className="warn" role="alert">
              <b>Конфликт:</b> блоки плейлистов наложились. Конец блока фиксирован его
              длительностью — раздвиньте начала или уберите лишний блок.
            </p>
          )}
        </>
      )}
    </section>
  );
}
