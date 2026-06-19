import { useLayoutEffect, useRef, useState } from 'react';
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
const PLAQUE_W = 150; // фикс. ширина плашки, px — детерминированный авто-стек
const ROW_H = 34;     // высота яруса, px
const TOP = 24;       // отступ под подпись рельсы

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

  // фактическая ширина ленты (для пиксельного авто-стека и клампа плашек)
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = laneRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el); setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

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

  // ── авто-стек: пересекающиеся по пикселям плашки уходят в нижние ярусы ──
  const ads = win.blocks.filter((b) => b.kind === 'announcement');
  const sorted = [...ads].sort((a, b) => {
    if (a.kind !== 'announcement' || b.kind !== 'announcement') return 0;
    return timeToFrac(win, a.at) - timeToFrac(win, b.at);
  });
  const rowEnds: number[] = [];                 // правый край последней плашки в каждом ярусе (px)
  const placement = new Map<Id, { row: number; leftPx: number; pinPx: number }>();
  for (const b of sorted) {
    if (b.kind !== 'announcement') continue;
    const pinPx = timeToFrac(win, b.at) * width;
    let row = rowEnds.findIndex((end) => pinPx >= end + 4);
    if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
    const leftPx = Math.max(0, Math.min(pinPx, Math.max(0, width - PLAQUE_W)));
    rowEnds[row] = leftPx + PLAQUE_W;
    placement.set(b.id, { row, leftPx, pinPx });
  }
  const rows = Math.max(1, rowEnds.length);
  const laneHeight = TOP + rows * ROW_H + 6;

  return (
    <div
      ref={laneRef}
      className="lane lane-an"
      style={{ height: laneHeight, flex: `0 0 ${laneHeight}px` }}
      onDragOver={onDragOver}
      onDragLeave={() => { laneRef.current?.classList.remove('drop'); hideGuide(); }}
      onDrop={onDrop}
      onClick={(e) => { if (e.target === laneRef.current) props.onSelect(null); }}
    >
      <span className="lane-label">📢 ОБЪЯВЛЕНИЯ</span>

      {sorted.map((b) => {
        if (b.kind !== 'announcement') return null;
        const an = announcements.find((a) => a.id === b.refId);
        const pl = placement.get(b.id);
        if (!an || !pl) return null;
        const sel = selectedId === b.id;
        return (
          <div key={b.id}>
            <div className="ad-pin" style={{ left: pl.pinPx }} aria-hidden="true" />
            <div
              className={`block ad${sel ? ' sel' : ''}`}
              style={{ left: pl.leftPx, top: TOP + pl.row * ROW_H, '--c': ANNOUNCEMENT_PALETTE[an.color] } as CSSProperties}
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
