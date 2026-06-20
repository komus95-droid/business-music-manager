import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, DragEvent } from 'react';
import type { PersistedStore, Id, DayWindow, AudioSettings } from '@shared';
import {
  PLAYLIST_PALETTE, ANNOUNCEMENT_PALETTE,
  spanMinutes, offsetFromDayStart, playlistEffectiveSec, findSilenceGaps,
} from '@shared';
import {
  timeToFrac, spanToFrac, windowSpan, fracToRawOffset, offsetToHHMM,
  windowEdges, magnetThresholdMin, snapOffset,
} from './timeline';
import type { EdgeBlock } from './timeline';
import { getDrag, dropFrac, setDrag, getActiveDrag, clearActiveDrag } from './dnd';

/**
 * Единая дорожка-шкала (v1.3.3) — верный перенос .track из прототипа: ОДИН
 * бордюрный фрейм, сверху ярусы объявлений (авто-стек), снизу музыка фикс.
 * высотой 78px с min-width 90px (текст всегда влезает), пунктир-разделитель.
 * Геометрия времени — в долях окна (проценты = пиксели «растянутой» ленты),
 * вертикальные позиции считаются здесь и ставятся инлайном, чтобы рельса
 * объявлений могла расти под стек. Магнит/направляющая/правка времени — из
 * v1.2.3, объявления озвучиваются предпрослушкой (v1.3.1).
 */

interface Props {
  win: DayWindow;
  store: PersistedStore;
  audio: AudioSettings;
  snap: number;
  canEdit: boolean;
  selectedId: Id | null;
  playheadFrac: number;
  showPlayhead: boolean;
  onSelect(id: Id | null): void;
  onAddPlaylist(refId: Id, t: ReturnType<typeof offsetToHHMM>): void;
  onMovePlaylist(id: Id, t: ReturnType<typeof offsetToHHMM>): void;
  onAddAnnouncement(refId: Id, t: ReturnType<typeof offsetToHHMM>): void;
  onMoveAnnouncement(id: Id, t: ReturnType<typeof offsetToHHMM>): void;
  onRemove(id: Id): void;
  onEditTime(kind: 'playlist' | 'announcement', id: Id, value: ReturnType<typeof offsetToHHMM>, x: number, y: number): void;
}

const pct = (f: number) => `${f * 100}%`;
const WAVE = Array.from({ length: 26 }, (_, i) => 30 + Math.round(48 * Math.abs(Math.sin(i * 1.3) * Math.cos(i * 0.55))));

// вертикальная раскладка дорожки (px)
const AD_TOP = 26;        // первый ярус объявлений (под подписью рельсы)
const AD_ROW_H = 30;      // шаг яруса
const PLAQUE_W = 140;     // ширина плашки объявления (детерминированный стек)
const BLOCK_H = 78;       // высота музыкального блока (как в прототипе)
const MUSIC_GAP = 24;     // разделитель + подпись «музыка»

function edgeBlocks(win: DayWindow): EdgeBlock[] {
  return win.blocks.map((b) => b.kind === 'playlist'
    ? { kind: 'playlist' as const, id: b.id, start: b.start, end: b.end }
    : { kind: 'announcement' as const, id: b.id, start: b.at, at: b.at });
}

export function TrackTimeline(props: Props) {
  const { win, store, audio, snap, canEdit, selectedId } = props;
  const trackRef = useRef<HTMLDivElement>(null);
  const guideRef = useRef<HTMLDivElement>(null);
  const span = windowSpan(win);

  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = trackRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.getBoundingClientRect().width));
    ro.observe(el); setWidth(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);

  // ── объявления: сортировка + авто-стек по пикселям ──
  const ads = win.blocks.filter((b) => b.kind === 'announcement');
  const sortedAds = [...ads].sort((a, b) =>
    (a.kind === 'announcement' ? timeToFrac(win, a.at) : 0) - (b.kind === 'announcement' ? timeToFrac(win, b.at) : 0));
  const rowEnds: number[] = [];
  const adPos = new Map<Id, { row: number; leftPx: number; pinPx: number }>();
  for (const b of sortedAds) {
    if (b.kind !== 'announcement') continue;
    const pinPx = timeToFrac(win, b.at) * width;
    let row = rowEnds.findIndex((end) => pinPx >= end + 4);
    if (row === -1) { row = rowEnds.length; rowEnds.push(0); }
    const leftPx = Math.max(0, Math.min(pinPx, Math.max(0, width - PLAQUE_W)));
    rowEnds[row] = leftPx + PLAQUE_W;
    adPos.set(b.id, { row, leftPx, pinPx });
  }
  const adRows = Math.max(1, rowEnds.length);
  const adH = AD_TOP + adRows * AD_ROW_H + 4;
  const sepTop = adH + 2;
  const musicTop = adH + MUSIC_GAP;
  const trackH = musicTop + BLOCK_H + 14;

  // ── тишина + наложения (музыкальная зона) ──
  const silence = findSilenceGaps(win);
  const plRanges = win.blocks
    .filter((b) => b.kind === 'playlist')
    .map((b) => b.kind === 'playlist'
      ? { s: offsetFromDayStart(win.start, b.start), e: offsetFromDayStart(win.start, b.start) + spanMinutes(b.start, b.end) }
      : { s: 0, e: 0 });
  const overlaps: { from: number; to: number; cf: boolean }[] = [];
  for (let i = 0; i < plRanges.length; i++)
    for (let j = i + 1; j < plRanges.length; j++) {
      const from = Math.max(plRanges[i].s, plRanges[j].s);
      const to = Math.min(plRanges[i].e, plRanges[j].e);
      if (to > from) overlaps.push({ from, to, cf: (to - from) * 60 <= audio.fadeOverlap });
    }

  // ── drag&drop (одна дорожка, маршрут по типу перетаскиваемого) ──
  function snapAt(e: DragEvent, excludeId?: string): number {
    const el = trackRef.current!;
    const edges = windowEdges(win, edgeBlocks(win), excludeId);
    const thr = magnetThresholdMin(win, el.getBoundingClientRect().width, snap);
    return snapOffset(fracToRawOffset(win, dropFrac(e, el)), snap, edges, thr);
  }
  function showGuide(off: number) {
    const g = guideRef.current; if (!g) return;
    g.style.left = pct(span > 0 ? off / span : 0); g.style.display = 'block';
  }
  function hideGuide() { if (guideRef.current) guideRef.current.style.display = 'none'; }

  function onDragOver(e: DragEvent) {
    const a = getActiveDrag();
    if (!canEdit || !a || !trackRef.current) return;
    e.preventDefault();
    trackRef.current.classList.add('drop');
    showGuide(snapAt(e, a.op === 'move' ? a.blockId : undefined));
  }
  function onDrop(e: DragEvent) {
    e.preventDefault();
    trackRef.current?.classList.remove('drop');
    hideGuide();
    const p = getDrag(e); clearActiveDrag();
    if (!canEdit || !p || !trackRef.current) return;
    let off = snapAt(e, p.op === 'move' ? p.blockId : undefined);
    if (p.kind === 'playlist') {
      if (p.op === 'add') {
        const pl = store.playlists.find((x) => x.id === p.refId);
        if (pl) {
          const lenMin = Math.max(1, Math.round(playlistEffectiveSec(pl, audio) / 60));
          const edges = windowEdges(win, edgeBlocks(win));
          const thr = magnetThresholdMin(win, trackRef.current.getBoundingClientRect().width, snap);
          for (const ed of edges) if (Math.abs((off + lenMin) - ed) < thr) { off = Math.max(0, ed - lenMin); break; }
        }
        props.onAddPlaylist(p.refId, offsetToHHMM(win, off));
      } else props.onMovePlaylist(p.blockId, offsetToHHMM(win, off));
    } else {
      if (p.op === 'add') props.onAddAnnouncement(p.refId, offsetToHHMM(win, off));
      else props.onMoveAnnouncement(p.blockId, offsetToHHMM(win, off));
    }
  }

  return (
    <div
      ref={trackRef}
      className="track single"
      style={{ height: trackH, flex: 'none' }}
      onDragOver={onDragOver}
      onDragLeave={() => { trackRef.current?.classList.remove('drop'); hideGuide(); }}
      onDrop={onDrop}
      onClick={(e) => { if (e.target === trackRef.current) props.onSelect(null); }}
    >
      <span className="ads-rail-lbl">📢 ОБЪЯВЛЕНИЯ</span>
      <span className="pl-rail-lbl" style={{ top: sepTop + 3 }}>♪ МУЗЫКА</span>

      {/* тишина */}
      {silence.map((g, i) => (
        <div key={`s${i}`} className="gap"
          style={{ left: pct(timeToFrac(win, g.from)), width: pct(spanToFrac(win, g.from, g.to)), top: musicTop, height: BLOCK_H }}>
          {spanMinutes(g.from, g.to) >= 25 && <span>⚠ тишина</span>}
        </div>
      ))}

      {/* наложения */}
      {overlaps.map((o, i) => (
        <div key={`o${i}`} className={`overlap${o.cf ? ' cf' : ''}`}
          style={{ left: pct(o.from / span), width: pct((o.to - o.from) / span), top: musicTop - 6 }}
          title={o.cf ? 'Кроссфейд-переход' : 'Конфликт наложения'} aria-hidden="true" />
      ))}

      {/* музыкальные блоки */}
      {win.blocks.filter((b) => b.kind === 'playlist').map((b) => {
        if (b.kind !== 'playlist') return null;
        const pl = store.playlists.find((p) => p.id === b.refId);
        if (!pl) return null;
        const over = offsetFromDayStart(win.start, b.start) + spanMinutes(b.start, b.end) > span;
        const sel = selectedId === b.id;
        return (
          <div key={b.id}
            className={`block has-play${sel ? ' sel' : ''}${over ? ' over' : ''}`}
            style={{ left: pct(timeToFrac(win, b.start)), width: pct(spanToFrac(win, b.start, b.end)), minWidth: 90, top: musicTop, height: BLOCK_H, '--c': PLAYLIST_PALETTE[pl.color] } as CSSProperties}
            draggable={canEdit}
            onDragStart={(e) => setDrag(e, { op: 'move', kind: 'playlist', blockId: b.id })}
            onDragEnd={() => { clearActiveDrag(); hideGuide(); trackRef.current?.classList.remove('drop'); }}
            onClick={(e) => { e.stopPropagation(); props.onSelect(b.id); }}
            title={`${pl.name} · ${b.start}–${b.end}`}>
            <span className="b-play" aria-hidden="true">▶</span>
            <span className="b-title">{pl.name}</span>
            <span className="b-time"
              onClick={(e) => { if (!canEdit) return; e.stopPropagation(); props.onEditTime('playlist', b.id, b.start, e.clientX, e.clientY); }}>
              {b.start}–{b.end}</span>
            <span className="b-wave" aria-hidden="true">{WAVE.map((h, i) => <i key={i} style={{ height: `${h}%` }} />)}</span>
            {sel && canEdit && (
              <button type="button" className="b-x" aria-label="Удалить блок"
                onClick={(e) => { e.stopPropagation(); props.onRemove(b.id); }}>×</button>
            )}
          </div>
        );
      })}

      {/* объявления (ярусы) */}
      {sortedAds.map((b) => {
        if (b.kind !== 'announcement') return null;
        const an = store.announcements.find((a) => a.id === b.refId);
        const pos = adPos.get(b.id);
        if (!an || !pos) return null;
        const sel = selectedId === b.id;
        return (
          <div key={b.id}>
            <div className="ad-pin" style={{ left: pos.pinPx, top: AD_TOP - 2, height: musicTop - AD_TOP + 2 }} aria-hidden="true" />
            <div className={`block ad${sel ? ' sel' : ''}`}
              style={{ left: pos.leftPx, top: AD_TOP + pos.row * AD_ROW_H, width: PLAQUE_W, height: 26, '--c': ANNOUNCEMENT_PALETTE[an.color] } as CSSProperties}
              draggable={canEdit}
              onDragStart={(e) => setDrag(e, { op: 'move', kind: 'announcement', blockId: b.id })}
              onDragEnd={() => { clearActiveDrag(); hideGuide(); trackRef.current?.classList.remove('drop'); }}
              onClick={(e) => { e.stopPropagation(); props.onSelect(b.id); }}
              title={`${an.name} · ${b.at}`}>
              <span className="b-title">📢 {an.name}</span>
              <span className="b-sub"
                onClick={(e) => { if (!canEdit) return; e.stopPropagation(); props.onEditTime('announcement', b.id, b.at, e.clientX, e.clientY); }}>
                {b.at}</span>
              {sel && canEdit && (
                <button type="button" className="b-x" aria-label="Удалить объявление"
                  onClick={(e) => { e.stopPropagation(); props.onRemove(b.id); }}>×</button>
              )}
            </div>
          </div>
        );
      })}

      {props.showPlayhead && <div className="playhead" style={{ left: pct(props.playheadFrac) }} aria-hidden="true" />}
      <div ref={guideRef} className="drop-guide" aria-hidden="true" />
    </div>
  );
}
