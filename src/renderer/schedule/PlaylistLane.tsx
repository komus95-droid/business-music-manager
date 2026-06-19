import { useRef } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { Playlist, Id, SilenceGap, DayWindow, AudioSettings } from '@shared';
import { PLAYLIST_PALETTE, spanMinutes, offsetFromDayStart, playlistEffectiveSec } from '@shared';
import {
  timeToFrac, spanToFrac, windowSpan, fracToRawOffset, offsetToHHMM,
  windowEdges, magnetThresholdMin, snapOffset,
} from './timeline';
import type { EdgeBlock } from './timeline';
import { getDrag, dropFrac, setDrag, getActiveDrag, clearActiveDrag } from './dnd';

interface Props {
  win: DayWindow;
  playlists: Playlist[];
  audio: AudioSettings;
  silence: SilenceGap[];
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
const WAVE = Array.from({ length: 28 }, (_, i) =>
  34 + Math.round(46 * Math.abs(Math.sin(i * 1.27) * Math.cos(i * 0.6))));

/** Блоки окна в форме «магнитных» краёв для привязки. */
function edgeBlocks(win: DayWindow): EdgeBlock[] {
  return win.blocks.map((b) => b.kind === 'playlist'
    ? { kind: 'playlist' as const, id: b.id, start: b.start, end: b.end }
    : { kind: 'announcement' as const, id: b.id, start: b.at, at: b.at });
}

export function PlaylistLane(props: Props) {
  const { win, playlists, audio, silence, snap, canEdit, selectedId } = props;
  const laneRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const span = windowSpan(win);

  /** Привязанное смещение (минуты) точки события с учётом магнита к краям. */
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
    if (!canEdit || !a || a.kind !== 'playlist' || !laneRef.current) return;
    e.preventDefault();
    laneRef.current.classList.add('drop');
    showGuide(snapAt(e, a.op === 'move' ? a.blockId : undefined));
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    laneRef.current?.classList.remove('drop');
    hideGuide();
    const p = getDrag(e); clearActiveDrag();
    if (!canEdit || !p || p.kind !== 'playlist' || !laneRef.current) return;

    let off = snapAt(e, p.op === 'move' ? p.blockId : undefined);
    if (p.op === 'add') {
      // прилипание КОНЦА блока к началу следующего (как в прототипе)
      const pl = playlists.find((x) => x.id === p.refId);
      if (pl) {
        const lenMin = Math.max(1, Math.round(playlistEffectiveSec(pl, audio) / 60));
        const edges = windowEdges(win, edgeBlocks(win));
        const thr = magnetThresholdMin(win, laneRef.current.getBoundingClientRect().width, snap);
        for (const ed of edges) {
          if (Math.abs((off + lenMin) - ed) < thr) { off = Math.max(0, ed - lenMin); break; }
        }
      }
      props.onAdd(p.refId, offsetToHHMM(win, off));
    } else {
      props.onMove(p.blockId, offsetToHHMM(win, off));
    }
  }

  // кроссфейд (≤ fadeOverlap) vs конфликт-полосы между блоками плейлистов
  const ranges = win.blocks
    .filter((b) => b.kind === 'playlist')
    .map((b) => b.kind === 'playlist'
      ? { s: offsetFromDayStart(win.start, b.start), e: offsetFromDayStart(win.start, b.start) + spanMinutes(b.start, b.end) }
      : { s: 0, e: 0 });
  const overlaps: { from: number; to: number; cf: boolean }[] = [];
  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const from = Math.max(ranges[i].s, ranges[j].s);
      const to = Math.min(ranges[i].e, ranges[j].e);
      if (to > from) overlaps.push({ from, to, cf: (to - from) * 60 <= audio.fadeOverlap });
    }
  }

  return (
    <div
      ref={laneRef}
      className="lane lane-pl"
      onDragOver={onDragOver}
      onDragLeave={() => { laneRef.current?.classList.remove('drop'); hideGuide(); }}
      onDrop={onDrop}
      onClick={(e) => { if (e.target === laneRef.current) props.onSelect(null); }}
    >
      <span className="lane-label">♪ МУЗЫКА</span>

      {silence.map((g, i) => {
        const left = timeToFrac(win, g.from);
        const width = spanToFrac(win, g.from, g.to);
        return (
          <div key={`s${i}`} className="silence" style={{ left: pct(left), width: pct(width) }}>
            {spanMinutes(g.from, g.to) >= 30 && <span>⚠ тишина</span>}
          </div>
        );
      })}

      {win.blocks.filter((b) => b.kind === 'playlist').map((b) => {
        if (b.kind !== 'playlist') return null;
        const pl = playlists.find((p) => p.id === b.refId);
        if (!pl) return null;
        const left = timeToFrac(win, b.start);
        const width = spanToFrac(win, b.start, b.end);
        const over = offsetFromDayStart(win.start, b.start) + spanMinutes(b.start, b.end) > span;
        const sel = selectedId === b.id;
        return (
          <div
            key={b.id}
            className={`block has-play${sel ? ' sel' : ''}${over ? ' over' : ''}`}
            style={{ left: pct(left), width: pct(width), '--c': PLAYLIST_PALETTE[pl.color] } as CSSProperties}
            draggable={canEdit}
            onDragStart={(e) => setDrag(e, { op: 'move', kind: 'playlist', blockId: b.id })}
            onDragEnd={() => { clearActiveDrag(); hideGuide(); laneRef.current?.classList.remove('drop'); }}
            onClick={(e) => { e.stopPropagation(); props.onSelect(b.id); }}
            title={`${pl.name} · ${b.start}–${b.end}`}
          >
            <span className="b-play" aria-hidden="true">▶</span>
            <span className="b-title">{pl.name}</span>
            <span
              className="b-time"
              title={canEdit ? 'Клик — задать точное время' : undefined}
              onClick={(e) => { if (!canEdit) return; e.stopPropagation(); props.onEditTime(b.id, b.start, e.clientX, e.clientY); }}
            >{b.start}–{b.end}</span>
            <span className="b-wave" aria-hidden="true">
              {WAVE.map((hh, i) => <i key={i} style={{ height: `${hh}%` }} />)}
            </span>
            {sel && canEdit && (
              <button
                type="button" className="b-x" aria-label="Удалить блок"
                onClick={(e) => { e.stopPropagation(); props.onRemove(b.id); }}
              >×</button>
            )}
          </div>
        );
      })}

      {overlaps.map((o, i) => (
        <div
          key={`o${i}`}
          className={`overlap${o.cf ? ' cf' : ''}`}
          style={{ left: pct(o.from / span), width: pct((o.to - o.from) / span) }}
          title={o.cf ? 'Кроссфейд-переход' : 'Конфликт: наложение плейлистов'}
          aria-hidden="true"
        />
      ))}

      <div ref={guideRef} className="drop-guide" aria-hidden="true" />
    </div>
  );
}
