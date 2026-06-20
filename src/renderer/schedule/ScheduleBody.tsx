import { useEffect, useState } from 'react';
import type { PersistedStore, Id, DayWindow, BlockOwner } from '@shared';
import { findPlaylistOverlaps, resolveActiveWindow, dateToHHMM, offsetFromDayStart, spanMinutes } from '@shared';
import type { StoreApi } from '../state/useStore';
import { useAudio } from '../audio/AudioProvider';
import { MiniTransport } from '../audio/MiniTransport';
import { TrackTimeline } from './TrackTimeline';
import { TimePopover } from './TimePopover';
import type { TimeEdit } from './TimePopover';
import { rulerTicks, windowSpan, timelineWidthCss, ZOOM_PRESETS, offsetToHHMM } from './timeline';
import type { Zoom } from './timeline';
import { useDayAudition } from './useDayAudition';

/**
 * Корпус шкалы (Чат 5/6) — теперь полноценный таймлайн-редактор (v1.3.0):
 * единая рамка (объявления сверху, музыка снизу — один фрейм), горизонтальная
 * прокрутка и масштаб (Обзор ⇄ приближение), авто-стек объявлений ярусами.
 * Магнит/направляющая/всплывашка времени (v1.2.3) работают поверх — позиции
 * в долях окна сами становятся пикселями «растянутой» ленты.
 */
interface Props {
  win: DayWindow;
  location: BlockOwner;
  store: PersistedStore;
  api: StoreApi;
  snap: number;
  canEdit: boolean;
}

const pct = (frac: number) => `${frac * 100}%`;

export function ScheduleBody({ win, location, store, api, snap, canEdit }: Props) {
  const [selected, setSelected] = useState<Id | null>(null);
  const [edit, setEdit] = useState<TimeEdit | null>(null);
  const [zoom, setZoom] = useState<Zoom>('fit');
  useEffect(() => { setSelected(null); setEdit(null); }, [location.kind, location.id]);

  const { engine } = useAudio();
  const audition = useDayAudition(win, store, engine, canEdit, `${location.kind}:${location.id}`);

  // линейка детальнее при увеличении: 60 / 30 / 15 / 5 мин
  const intervalMin = (zoom === 'fit' || zoom === 90) ? 60 : zoom === 180 ? 30 : zoom === 360 ? 15 : 5;
  const ticks = rulerTicks(win, intervalMin);
  const width = timelineWidthCss(zoom, windowSpan(win));
  const hasConflict = findPlaylistOverlaps(win.blocks, store.audio).some((o) => !o.isCrossfade);

  // в эфире — раз в секунду двигаем read-only плейхед текущего времени
  const [, setNowTick] = useState(0);
  useEffect(() => {
    if (canEdit) return;
    const t = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [canEdit]);

  // позиция плейхеда: студия — аудит (двигаемый); эфир — реальное время активного дня (read-only)
  let onairFrac: number | null = null;
  let onairLabel = '';
  if (!canEdit) {
    const aw = resolveActiveWindow(store, new Date());
    if (aw.kind === location.kind && aw.id === location.id && !aw.off) {
      const nowHHMM = dateToHHMM(new Date());
      const off = offsetFromDayStart(win.start, nowHHMM);
      const span = spanMinutes(win.start, win.end);
      if (off >= 0 && off <= span) { onairFrac = span > 0 ? off / span : 0; onairLabel = nowHHMM; }
    }
  }
  const showPlayhead = canEdit ? true : onairFrac != null;
  const playheadFrac = canEdit ? audition.frac : (onairFrac ?? 0);
  const playheadLabel = canEdit ? offsetToHHMM(win, audition.clockSec / 60) : onairLabel;

  // F (discoverability): линейка времени = полоса перемотки. Клик/протяжка по ней
  // двигает плейхед аудита (визуально во время, фиксация звука — на отпускании).
  function onRulerScrub(e: import('react').MouseEvent<HTMLDivElement>) {
    if (!canEdit || e.button !== 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const toSec = (x: number) => Math.max(0, Math.min((x - rect.left) / rect.width, 1)) * audition.spanSec;
    audition.previewSeek(toSec(e.clientX));
    const move = (ev: globalThis.MouseEvent) => audition.previewSeek(toSec(ev.clientX));
    const up = (ev: globalThis.MouseEvent) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      audition.seek(toSec(ev.clientX));
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }

  return (
    <>
      <div className="zoombar">
        <span className="zoom-lbl">Масштаб</span>
        {ZOOM_PRESETS.map((z) => (
          <button
            key={String(z.key)} type="button"
            className={zoom === z.key ? 'active' : ''}
            onClick={() => setZoom(z.key)}
          >{z.label}</button>
        ))}
      </div>

      <div className="timeline-wrap">
        <div className="timeline" style={{ width }}>
          <div className="ruler" onMouseDown={onRulerScrub}
            style={{ cursor: canEdit ? 'pointer' : 'default' }}
            title={canEdit ? 'Клик/протяжка — переместить плейхед' : undefined}>
            {ticks.map((t, i) => (
              <span key={i} className={`tick${t.major ? ' major' : ' minor'}`} style={{ left: pct(t.frac) }}>
                {t.major ? t.t : ':' + t.t.slice(3)}
              </span>
            ))}
          </div>

          <TrackTimeline
            win={win} store={store} audio={store.audio}
            snap={snap} canEdit={canEdit}
            selectedId={selected} onSelect={setSelected}
            playheadFrac={playheadFrac} showPlayhead={showPlayhead} activeAnnId={audition.activeAnnId}
            playheadLabel={playheadLabel} spanSec={audition.spanSec}
            canScrub={canEdit} onScrubPreview={audition.previewSeek} onScrubCommit={audition.seek}
            onAddPlaylist={(refId, t) => api.addPlaylistBlock(location, refId, t)}
            onMovePlaylist={(id, t) => api.movePlaylistBlock(location, id, t)}
            onAddAnnouncement={(refId, t) => api.addAnnouncementBlock(location, refId, t)}
            onMoveAnnouncement={(id, t) => api.moveAnnouncementBlock(location, id, t)}
            onRemove={(id) => { api.removeBlock(location, id); setSelected(null); }}
            onEditTime={(kind, id, value, x, y) => setEdit({ kind, id, value, x, y })}
          />
        </div>
      </div>

      {hasConflict && (
        <p className="warn" role="alert">
          <b>Конфликт:</b> блоки плейлистов наложились (красная полоса). Конец блока
          фиксирован его длительностью — раздвиньте начала или уберите лишний блок.
        </p>
      )}

      <div className="day-transport">
        <MiniTransport
          playing={audition.playing}
          disabled={!canEdit}
          positionSec={audition.clockSec}
          durationSec={audition.spanSec}
          seekable
          onPlayPause={audition.playPause}
          onStop={audition.stop}
          onSeek={audition.seek}
          label={audition.nowLabel ?? '— тишина —'}
          hint={canEdit ? 'аудит дня' : '🔴 эфир — предпрослушка выкл.'}
        />
      </div>

      {edit && (
        <TimePopover
          edit={edit}
          onClose={() => setEdit(null)}
          onApply={(v) => {
            if (edit.kind === 'playlist') api.movePlaylistBlock(location, edit.id, v);
            else api.moveAnnouncementBlock(location, edit.id, v);
          }}
        />
      )}
    </>
  );
}
