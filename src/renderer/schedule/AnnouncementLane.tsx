import { useRef } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { Announcement, Id, DayWindow } from '@shared';
import { ANNOUNCEMENT_PALETTE } from '@shared';
import { timeToFrac, fracToTime } from './timeline';
import { getDrag, dropFrac, setDrag } from './dnd';

interface Props {
  win: DayWindow;
  announcements: Announcement[];
  snap: number;
  canEdit: boolean;
  selectedId: Id | null;
  onSelect(id: Id | null): void;
  onAdd(refId: Id, time: ReturnType<typeof fracToTime>): void;
  onMove(blockId: Id, time: ReturnType<typeof fracToTime>): void;
  onRemove(blockId: Id): void;
}

const pct = (frac: number) => `${frac * 100}%`;

export function AnnouncementLane(props: Props) {
  const { win, announcements, snap, canEdit, selectedId } = props;
  const laneRef = useRef<HTMLDivElement>(null);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    laneRef.current?.classList.remove('drop');
    if (!canEdit || !laneRef.current) return;
    const p = getDrag(e);
    if (!p || p.kind !== 'announcement') return;
    const t = fracToTime(win, dropFrac(e, laneRef.current), snap);
    if (p.op === 'add') props.onAdd(p.refId, t);
    else props.onMove(p.blockId, t);
  }

  return (
    <div
      ref={laneRef}
      className="lane lane-an"
      onDragOver={(e) => { if (canEdit) { e.preventDefault(); laneRef.current?.classList.add('drop'); } }}
      onDragLeave={() => laneRef.current?.classList.remove('drop')}
      onDrop={handleDrop}
      onClick={(e) => { if (e.target === laneRef.current) props.onSelect(null); }}
    >
      <span className="lane-label">📢 Объявления</span>

      {win.blocks.filter((b) => b.kind === 'announcement').map((b) => {
        if (b.kind !== 'announcement') return null;
        const an = announcements.find((a) => a.id === b.refId);
        if (!an) return null;
        const sel = selectedId === b.id;
        return (
          <div
            key={b.id}
            className={`plaque${sel ? ' sel' : ''}`}
            style={{ left: pct(timeToFrac(win, b.at)), '--c': ANNOUNCEMENT_PALETTE[an.color] } as CSSProperties}
            draggable={canEdit}
            onDragStart={(e) => setDrag(e, { op: 'move', kind: 'announcement', blockId: b.id })}
            onClick={(e) => { e.stopPropagation(); props.onSelect(b.id); }}
            title={`${an.name} · ${b.at}`}
          >
            <span className="pq-ic" aria-hidden="true">📢</span>
            <span className="pq-name">{an.name}</span>
            <span className="pq-time">{b.at}</span>
            {sel && canEdit && (
              <button
                type="button" className="bx" aria-label="Удалить объявление"
                onClick={(e) => { e.stopPropagation(); props.onRemove(b.id); }}
              >×</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
