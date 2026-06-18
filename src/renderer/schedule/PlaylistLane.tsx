import { useRef } from 'react';
import type { DragEvent } from 'react';
import type { WeekDay, Playlist, Id, SilenceGap } from '@shared';
import { PLAYLIST_PALETTE, spanMinutes, offsetFromDayStart } from '@shared';
import { timeToFrac, spanToFrac, fracToTime } from './timeline';
import { getDrag, dropFrac, setDrag } from './dnd';

interface Props {
  day: WeekDay;
  playlists: Playlist[];
  conflictIds: Set<Id>;
  silence: SilenceGap[];
  snap: number;
  canEdit: boolean;
  selectedId: Id | null;
  onSelect(id: Id | null): void;
  onAdd(refId: Id, time: ReturnType<typeof fracToTime>): void;
  onMove(blockId: Id, time: ReturnType<typeof fracToTime>): void;
  onRemove(blockId: Id): void;
}

const pct = (frac: number) => `${frac * 100}%`;

export function PlaylistLane(props: Props) {
  const { day, playlists, conflictIds, silence, snap, canEdit, selectedId } = props;
  const laneRef = useRef<HTMLDivElement>(null);
  const span = spanMinutes(day.start, day.end);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    laneRef.current?.classList.remove('drop');
    if (!canEdit || !laneRef.current) return;
    const p = getDrag(e);
    if (!p || p.kind !== 'playlist') return;
    const t = fracToTime(day, dropFrac(e, laneRef.current), snap);
    if (p.op === 'add') props.onAdd(p.refId, t);
    else props.onMove(p.blockId, t);
  }

  return (
    <div
      ref={laneRef}
      className="lane lane-pl"
      onDragOver={(e) => { if (canEdit) { e.preventDefault(); laneRef.current?.classList.add('drop'); } }}
      onDragLeave={() => laneRef.current?.classList.remove('drop')}
      onDrop={handleDrop}
      onClick={(e) => { if (e.target === laneRef.current) props.onSelect(null); }}
    >
      <span className="lane-label">Плейлисты</span>

      {silence.map((g, i) => {
        const left = timeToFrac(day, g.from);
        const width = spanToFrac(day, g.from, g.to);
        return (
          <div key={`s${i}`} className="silence" style={{ left: pct(left), width: pct(width) }}>
            {spanMinutes(g.from, g.to) >= 30 && <span>тишина</span>}
          </div>
        );
      })}

      {day.blocks.filter((b) => b.kind === 'playlist').map((b) => {
        if (b.kind !== 'playlist') return null;
        const pl = playlists.find((p) => p.id === b.refId);
        if (!pl) return null;
        const left = timeToFrac(day, b.start);
        const width = spanToFrac(day, b.start, b.end);
        const over = offsetFromDayStart(day.start, b.start) + spanMinutes(b.start, b.end) > span;
        const sel = selectedId === b.id;
        const conflict = conflictIds.has(b.id);
        return (
          <div
            key={b.id}
            className={`block${sel ? ' sel' : ''}${conflict ? ' conflict' : ''}${over ? ' over' : ''}`}
            style={{ left: pct(left), width: pct(width), background: PLAYLIST_PALETTE[pl.color] }}
            draggable={canEdit}
            onDragStart={(e) => setDrag(e, { op: 'move', kind: 'playlist', blockId: b.id })}
            onClick={(e) => { e.stopPropagation(); props.onSelect(b.id); }}
            title={`${pl.name} · ${b.start}–${b.end}`}
          >
            <span className="bn">{pl.name}</span>
            <span className="bt">{b.start}–{b.end}</span>
            {sel && canEdit && (
              <button
                type="button" className="bx" aria-label="Удалить блок"
                onClick={(e) => { e.stopPropagation(); props.onRemove(b.id); }}
              >×</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
