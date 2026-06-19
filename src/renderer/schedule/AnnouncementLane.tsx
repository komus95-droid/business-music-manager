import { useRef } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { Announcement, Id, DayWindow } from '@shared';
import { ANNOUNCEMENT_PALETTE } from '@shared';
import {
  timeToFrac, windowSpan, fracToRawOffset, offsetToHHMM,
  windowEdges, magnetThresholdMin, snapOffset,
} from './timeline';
import type { EdgeBlock } from './timeline';
import { getDrag, dropFrac, setDrag, getActiveDrag, clearActiveDrag } from './dnd';

interface Props {
  win: DayWindow;
  announcements: Announcement[];
  snap: number;
  canEdit: boolean;
  selectedId: Id | null;
  onSelect(id: Id | null): void;
  onAdd(refId: Id, time: ReturnType<typeof offsetToHHMM>): void;
  onMove(blockId: Id, time: ReturnType<typeof offsetToHHMM>): void;
  onRemove(blockId: Id): void;
  onEditTime(blockId: Id, value: ReturnType<typeof offsetToHHMM>, x: number, y: number): void;
}

const pct = (frac: number) => `${frac * 100}%`;

function edgeBlocks(win: DayWindow): EdgeBlock[] {
  return win.blocks.map((b) => b.kind === 'playlist'
    ? { kind: 'playlist' as const, id: b.id, start: b.start, end: b.end }
    : { kind: 'announcement' as const, id: b.id, start: b.at, at: b.at });
}

export function AnnouncementLane(props: Props) {
  const { win, announcements, snap, canEdit, selectedId } = props;
  const laneRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const span = windowSpan(win);

  function snapAt(e: DragEvent, excludeId?: string): number {
    const lane = laneRef.current!;
    const edges = windowEdges(win, edgeBlocks(win), excludeId);
    const thr = magnetThresholdMin(win, lane.getBoundingClientRect().width, snap);
    return snapOffset(fracToRawOffset(win, dropFrac(e, lane)), snap, edges, thr);
  }
  function showGuide(off: number) {
    const g = guideRef.current; if (!g) return;
    g.style.left = pct(span > 0 ? off / span : 0); g.style.display = 'block';
  }
  function hideGuide() { if (guideRef.current) guideRef.current.style.display = 'none'; }

  function onDragOver(e: DragEvent) {
    const a = getActiveDrag();
    if (!canEdit || !a || a.kind !== 'announcement' || !laneRef.current) return;
    e.preventDefault();
    laneRef.current.classList.add('drop');
    showGuide(snapAt(e, a.op === 'move' ? a.blockId : undefined));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    laneRef.current?.classList.remove('drop');
    hideGuide();
    const p = getDrag(e); clearActiveDrag();
    if (!canEdit || !p || p.kind !== 'announcement' || !laneRef.current) return;
    const off = snapAt(e, p.op === 'move' ? p.blockId : undefined);
    if (p.op === 'add') props.onAdd(p.refId, offsetToHHMM(win, off));
    else props.onMove(p.blockId, offsetToHHMM(win, off));
  }

  return (
    <div
      ref={laneRef}
      className="lane lane-an"
      onDragOver={onDragOver}
      onDragLeave={() => { laneRef.current?.classList.remove('drop'); hideGuide(); }}
      onDrop={onDrop}
      onClick={(e) => { if (e.target === laneRef.current) props.onSelect(null); }}
    >
      <span className="lane-label">📢 ОБЪЯВЛЕНИЯ</span>

      {win.blocks.filter((b) => b.kind === 'announcement').map((b) => {
        if (b.kind !== 'announcement') return null;
        const an = announcements.find((a) => a.id === b.refId);
        if (!an) return null;
        const sel = selectedId === b.id;
        const left = timeToFrac(win, b.at);
        return (
          <div key={b.id}>
            <div className="ad-pin" style={{ left: pct(left) }} aria-hidden="true" />
            <div
              className={`block ad${sel ? ' sel' : ''}`}
              style={{ left: pct(left), '--c': ANNOUNCEMENT_PALETTE[an.color] } as CSSProperties}
              draggable={canEdit}
              onDragStart={(e) => setDrag(e, { op: 'move', kind: 'announcement', blockId: b.id })}
              onDragEnd={() => { clearActiveDrag(); hideGuide(); laneRef.current?.classList.remove('drop'); }}
              onClick={(e) => { e.stopPropagation(); props.onSelect(b.id); }}
              title={`${an.name} · ${b.at}`}
            >
              <span className="b-title">📢 {an.name}</span>
              <span
                className="b-sub"
                title={canEdit ? 'Клик — задать точное время' : undefined}
                onClick={(e) => { if (!canEdit) return; e.stopPropagation(); props.onEditTime(b.id, b.at, e.clientX, e.clientY); }}
              >{b.at}</span>
              {sel && canEdit && (
                <button
                  type="button" className="b-x" aria-label="Удалить объявление"
                  onClick={(e) => { e.stopPropagation(); props.onRemove(b.id); }}
                >×</button>
              )}
            </div>
          </div>
        );
      })}

      <div ref={guideRef} className="drop-guide" aria-hidden="true" />
    </div>
  );
}
