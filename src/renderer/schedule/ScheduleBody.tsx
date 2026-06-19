import { useEffect, useState } from 'react';
import type { PersistedStore, Id, DayWindow, BlockOwner } from '@shared';
import { findPlaylistOverlaps, findSilenceGaps } from '@shared';
import type { StoreApi } from '../state/useStore';
import { useAudio } from '../audio/AudioProvider';
import { MiniTransport } from '../audio/MiniTransport';
import { PlaylistLane } from './PlaylistLane';
import { AnnouncementLane } from './AnnouncementLane';
import { hourTicks } from './timeline';
import { useDayAudition } from './useDayAudition';

/**
 * Корпус шкалы (линейка + дорожка плейлистов + дорожка объявлений + сводка
 * конфликтов), общий для дня недели и праздника. Владелец передаётся как
 * `location: BlockOwner`; геометрия времени — из Чата 5.
 *
 * Чат 8: поверх дорожек — плейхед предпрослушки, а под ними — транспорт
 * аудита дня (play/scrub). В эфире предпрослушка выключена.
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
  useEffect(() => setSelected(null), [location.kind, location.id]);

  const { engine } = useAudio();
  const audition = useDayAudition(win, store, engine, canEdit, `${location.kind}:${location.id}`);

  const conflictIds = new Set<Id>();
  for (const ov of findPlaylistOverlaps(win.blocks, store.audio)) {
    if (!ov.isCrossfade) { conflictIds.add(ov.aId); conflictIds.add(ov.bId); }
  }
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
        />

        <PlaylistLane
          win={win} playlists={store.playlists}
          conflictIds={conflictIds} silence={silence}
          snap={snap} canEdit={canEdit}
          selectedId={selected} onSelect={setSelected}
          onAdd={(refId, t) => api.addPlaylistBlock(location, refId, t)}
          onMove={(id, t) => api.movePlaylistBlock(location, id, t)}
          onRemove={(id) => { api.removeBlock(location, id); setSelected(null); }}
        />

        {canEdit && (
          <div className="playhead" style={{ left: pct(audition.frac) }} aria-hidden="true" />
        )}
      </div>

      {conflictIds.size > 0 && (
        <p className="warn" role="alert">
          <b>Конфликт:</b> блоки плейлистов наложились. Конец блока фиксирован его
          длительностью — раздвиньте начала или уберите лишний блок.
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
    </>
  );
}
