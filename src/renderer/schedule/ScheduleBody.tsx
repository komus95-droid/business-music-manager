import { useEffect, useState } from 'react';
import type { PersistedStore, Id, DayWindow, BlockOwner } from '@shared';
import { findPlaylistOverlaps } from '@shared';
import type { StoreApi } from '../state/useStore';
import { useAudio } from '../audio/AudioProvider';
import { MiniTransport } from '../audio/MiniTransport';
import { TrackTimeline } from './TrackTimeline';
import { TimePopover } from './TimePopover';
import type { TimeEdit } from './TimePopover';
import { hourTicks, windowSpan, timelineWidthCss, ZOOM_PRESETS } from './timeline';
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

  const hasConflict = findPlaylistOverlaps(win.blocks, store.audio).some((o) => !o.isCrossfade);
  const ticks = hourTicks(win);
  const width = timelineWidthCss(zoom, windowSpan(win));

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
          <div className="ruler">
            {ticks.map((t, i) => (
              <span key={i} className="tick" style={{ left: pct(t.frac) }}>{t.t}</span>
            ))}
          </div>

          <TrackTimeline
            win={win} store={store} audio={store.audio}
            snap={snap} canEdit={canEdit}
            selectedId={selected} onSelect={setSelected}
            playheadFrac={audition.frac} showPlayhead={canEdit} activeAnnId={audition.activeAnnId}
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
