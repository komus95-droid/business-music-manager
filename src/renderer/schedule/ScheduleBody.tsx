import { useEffect, useState } from 'react';
import type { PersistedStore, Id, DayWindow, BlockOwner } from '@shared';
import { findPlaylistOverlaps, findSilenceGaps } from '@shared';
import type { StoreApi } from '../state/useStore';
import { useAudio } from '../audio/AudioProvider';
import { MiniTransport } from '../audio/MiniTransport';
import { PlaylistLane } from './PlaylistLane';
import { AnnouncementLane } from './AnnouncementLane';
import { TimePopover } from './TimePopover';
import type { TimeEdit } from './TimePopover';
import { hourTicks } from './timeline';
import { useDayAudition } from './useDayAudition';

/**
 * Корпус шкалы (линейка + дорожка объявлений + дорожка плейлистов + сводка
 * конфликтов), общий для дня недели и праздника. Геометрия времени — из Чата 5,
 * магнитная привязка/направляющая/всплывашка точного времени — v1.2.3 (перенос
 * «фишек» прототипа). Конфликты наложения теперь рисуются полосами в дорожке.
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
  useEffect(() => { setSelected(null); setEdit(null); }, [location.kind, location.id]);

  const { engine } = useAudio();
  const audition = useDayAudition(win, store, engine, canEdit, `${location.kind}:${location.id}`);

  const hasConflict = findPlaylistOverlaps(win.blocks, store.audio).some((o) => !o.isCrossfade);
  const silence = findSilenceGaps(win);
  const ticks = hourTicks(win);

  return (
    <>
      <div className="ruler">
        {ticks.map((t, i) => (
          <span key={i} className="tick" style={{ left: pct(t.frac) }}>{t.t}</span>
        ))}
      </div>

      <div className="lanes">
        <AnnouncementLane
          win={win} announcements={store.announcements}
          snap={snap} canEdit={canEdit}
          selectedId={selected} onSelect={setSelected}
          onAdd={(refId, t) => api.addAnnouncementBlock(location, refId, t)}
          onMove={(id, t) => api.moveAnnouncementBlock(location, id, t)}
          onRemove={(id) => { api.removeBlock(location, id); setSelected(null); }}
          onEditTime={(id, value, x, y) => setEdit({ kind: 'announcement', id, value, x, y })}
        />

        <PlaylistLane
          win={win} playlists={store.playlists} audio={store.audio}
          silence={silence} snap={snap} canEdit={canEdit}
          selectedId={selected} onSelect={setSelected}
          onAdd={(refId, t) => api.addPlaylistBlock(location, refId, t)}
          onMove={(id, t) => api.movePlaylistBlock(location, id, t)}
          onRemove={(id) => { api.removeBlock(location, id); setSelected(null); }}
          onEditTime={(id, value, x, y) => setEdit({ kind: 'playlist', id, value, x, y })}
        />

        {canEdit && (
          <div className="playhead" style={{ left: pct(audition.frac) }} aria-hidden="true" />
        )}
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
