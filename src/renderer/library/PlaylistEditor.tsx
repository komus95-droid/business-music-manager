import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import type { Playlist, PersistedStore, PlaylistColor } from '@shared';
import {
  PLAYLIST_PALETTE, playlistEffectiveSec, isAssetLocked, assetUsage, fmtDuration,
} from '@shared';
import type { StoreApi } from '../state/useStore';
import { useAudio } from '../audio/AudioProvider';
import { MiniTransport } from '../audio/MiniTransport';
import { buildPlaylistRequest } from '../audio';
import { pickAndImport, importDroppedFiles } from './mediaImport';
import { flash } from '../ui/flash';

interface Props {
  playlist: Playlist;
  store: PersistedStore;
  api: StoreApi;
  /** false в режиме «В эфире» — вся правкa библиотеки заблокирована */
  canEdit: boolean;
  onDeleted(): void;
}

const COLORS = Object.keys(PLAYLIST_PALETTE) as PlaylistColor[];

/** Человекочитаемые места использования ассета (дни недели + праздники). */
function usageNames(store: PersistedStore, id: string): string[] {
  const u = assetUsage(store, id);
  const days = u.dayIds.map((d) => store.week[d].name);
  const hols = u.holidayIds.map((hid) => store.holidays.find((h) => h.id === hid)?.name ?? '?');
  return [...days, ...hols];
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types || []).includes('Files');

export function PlaylistEditor({ playlist: pl, store, api, canEdit, onDeleted }: Props) {
  const [dz, setDz] = useState(false);
  const [busy, setBusy] = useState(false);
  const { engine, playback } = useAudio();

  const locked = isAssetLocked(store, pl.id);
  // ro — нельзя менять состав/мету (либо эфир, либо ассет уже в расписании)
  const ro = !canEdit || locked;
  const effSec = playlistEffectiveSec(pl, store.audio);

  // ── Предпрослушивание (Чат 8) ──────────────────────────────────────────
  // Слушать можно даже запертый плейлист (lock запрещает только правку).
  // Нельзя — только в эфире и когда нет треков.
  const active = playback.status !== 'idle' && playback.playlistId === pl.id;
  const playing = active && playback.status === 'playing';
  const canPreview = canEdit && pl.tracks.length > 0;

  function playPause() {
    if (!canPreview) return;
    if (active) {
      if (playing) engine.pause();
      else engine.resume();
    } else {
      engine.playPlaylist(buildPlaylistRequest(store.settings.mediaPath, pl, { loop: true }));
    }
  }

  // Оборвать предпрослушку при уходе с плейлиста, при входе в эфир и на размонтаже.
  useEffect(() => {
    const id = pl.id;
    return () => { if (engine.getState().playlistId === id) engine.stop(); };
  }, [pl.id, engine]);
  useEffect(() => {
    if (!canEdit && engine.getState().playlistId === pl.id) engine.stop();
  }, [canEdit, engine, pl.id]);

  async function importViaDialog() {
    if (ro || busy) return;
    setBusy(true);
    const tracks = await pickAndImport({ kind: 'playlist', playlistId: pl.id }, true);
    tracks.forEach((t) => api.addTrack(pl.id, t));
    setBusy(false);
    if (tracks.length) flash(`Добавлено треков: ${tracks.length}`);
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDz(false);
    if (ro || busy || !e.dataTransfer.files.length) return;
    setBusy(true);
    const tracks = await importDroppedFiles({ kind: 'playlist', playlistId: pl.id }, e.dataTransfer.files);
    tracks.forEach((t) => api.addTrack(pl.id, t));
    setBusy(false);
    flash(tracks.length ? `Добавлено треков: ${tracks.length}` : 'Не найдено MP3 в перетащенном');
  }

  function del() {
    if (locked) return;
    if (window.confirm(`Удалить плейлист «${pl.name}»? Все его MP3 будут удалены. Действие необратимо.`)) {
      api.removePlaylist(pl.id);
      onDeleted();
    }
  }

  return (
    <section className="editor pe" aria-label={`Плейлист: ${pl.name}`}>
      <div className="pe-head">
        <input
          className="pe-name" value={pl.name} disabled={ro}
          aria-label="Название плейлиста" maxLength={60}
          onChange={(e) => api.setPlaylistMeta(pl.id, { name: e.target.value })}
        />
        <div className="colors" role="group" aria-label="Цвет плейлиста">
          {COLORS.map((c) => (
            <button
              key={c} type="button"
              className={`swatch${pl.color === c ? ' sel' : ''}`}
              style={{ background: PLAYLIST_PALETTE[c] }}
              disabled={ro} aria-label={c} title={c}
              onClick={() => api.setPlaylistMeta(pl.id, { color: c })}
            />
          ))}
        </div>
        <label className="cf-toggle">
          <input
            type="checkbox" checked={pl.crossfade} disabled={ro}
            onChange={(e) => api.setPlaylistMeta(pl.id, { crossfade: e.target.checked })}
          />
          Бесшовный переход
        </label>
        <span className="pe-total">
          {fmtDuration(effSec)} · {pl.tracks.length} трек(ов)
        </span>
        <button
          type="button" className="btn pe-del" disabled={locked || !canEdit}
          title={locked ? 'Используется в расписании' : 'Удалить плейлист'}
          onClick={del}
        >Удалить</button>
      </div>

      {locked && (
        <p className="lock-banner" role="status">
          🔒 Плейлист в расписании ({usageNames(store, pl.id).join(', ')}). Длина блоков
          зафиксирована по текущему составу — чтобы менять треки, цвет или переход, сначала
          уберите его со шкалы этих дней.
        </p>
      )}

      <div
        className={`trk-list${dz ? ' dz' : ''}`}
        onDragOver={(e) => { if (!ro && hasFiles(e)) { e.preventDefault(); setDz(true); } }}
        onDragLeave={() => setDz(false)}
        onDrop={onDrop}
      >
        {pl.tracks.length === 0 && (
          <p className="trk-empty">
            {ro ? 'Треков нет.' : 'Плейлист пуст — импортируйте MP3 кнопкой ниже или перетащите файлы сюда.'}
          </p>
        )}
        {pl.tracks.map((t, i) => (
          <div className="trk" key={t.id}>
            <span className="trk-num">{i + 1}</span>
            <span className="trk-name" title={t.name}>{t.name}</span>
            <span className="trk-dur">{fmtDuration(t.durationSec)}</span>
            <span className="trk-move">
              <button
                type="button" className="btn icon" disabled={ro || i === 0}
                aria-label="Выше" title="Выше" onClick={() => api.moveTrack(pl.id, t.id, -1)}
              >↑</button>
              <button
                type="button" className="btn icon" disabled={ro || i === pl.tracks.length - 1}
                aria-label="Ниже" title="Ниже" onClick={() => api.moveTrack(pl.id, t.id, 1)}
              >↓</button>
            </span>
            <button
              type="button" className="btn icon trk-del" disabled={ro}
              aria-label="Удалить трек" title="Удалить трек" onClick={() => api.removeTrack(pl.id, t.id)}
            >×</button>
          </div>
        ))}
      </div>

      {!ro && (
        <div className="trk-actions">
          <button type="button" className="btn import" disabled={busy} onClick={importViaDialog}>
            {busy ? 'Импорт…' : '📁 Импорт MP3'}
          </button>
          <span className="trk-hint">или перетащите MP3-файлы в список выше</span>
        </div>
      )}

      <div className="pe-preview">
        <MiniTransport
          playing={playing}
          disabled={!canPreview}
          positionSec={active ? playback.positionSec : 0}
          durationSec={active ? playback.durationSec : effSec}
          seekable={active}
          onPlayPause={playPause}
          onStop={active ? () => engine.stop() : undefined}
          onSeek={(s) => engine.seek(s)}
          label={active
            ? `Трек ${playback.trackIndex + 1}/${playback.trackCount} · ${playback.trackName ?? ''}`
            : `${pl.tracks.length} трек(ов)`}
          hint={!canEdit ? '🔴 эфир' : (pl.tracks.length === 0 ? 'нет треков' : undefined)}
        />
      </div>
    </section>
  );
}
