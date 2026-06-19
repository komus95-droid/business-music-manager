import { useEffect, useState } from 'react';
import type { DragEvent } from 'react';
import type { Announcement, PersistedStore, AnnouncementColor } from '@shared';
import {
  ANNOUNCEMENT_PALETTE, isAssetLocked, assetUsage, fmtDuration,
} from '@shared';
import type { StoreApi } from '../state/useStore';
import { useAudio } from '../audio/AudioProvider';
import { buildAnnouncementRequest } from '../audio';
import { pickAndImport, importDroppedFiles } from './mediaImport';
import { flash } from '../ui/flash';

interface Props {
  announcement: Announcement;
  store: PersistedStore;
  api: StoreApi;
  canEdit: boolean;
  onDeleted(): void;
}

const COLORS = Object.keys(ANNOUNCEMENT_PALETTE) as AnnouncementColor[];
const DEFAULT_NAME = 'Новое объявление';

function usageNames(store: PersistedStore, id: string): string[] {
  const u = assetUsage(store, id);
  const days = u.dayIds.map((d) => store.week[d].name);
  const hols = u.holidayIds.map((hid) => store.holidays.find((h) => h.id === hid)?.name ?? '?');
  return [...days, ...hols];
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types || []).includes('Files');

/** Объявление = ровно один трек. Импорт ЗАМЕНЯЕТ файл (старый удаляется в useStore). */
export function AnnouncementEditor({ announcement: a, store, api, canEdit, onDeleted }: Props) {
  const [dz, setDz] = useState(false);
  const [busy, setBusy] = useState(false);
  const { engine, playback } = useAudio();

  const locked = isAssetLocked(store, a.id);
  const ro = !canEdit || locked;

  // ── Предпрослушивание (Чат 8) ──────────────────────────────────────────
  const active = !!playback.announcementName && playback.announcementName === a.name && playback.ducked;
  const canPreview = canEdit && !!a.file;

  function toggle() {
    if (!canPreview) return;
    if (active) engine.stop();
    else engine.playAnnouncement(buildAnnouncementRequest(store.settings.mediaPath, a));
  }

  useEffect(() => {
    const name = a.name;
    return () => { if (engine.getState().announcementName === name) engine.stop(); };
  }, [a.id, a.name, engine]);
  useEffect(() => {
    if (!canEdit && engine.getState().announcementName === a.name) engine.stop();
  }, [canEdit, engine, a.name]);

  function applyFirst(file: { name: string; durationSec: number; file: string } | undefined): boolean {
    if (!file) return false;
    api.setAnnouncementFile(a.id, file);
    if (a.name === DEFAULT_NAME) api.setAnnouncementMeta(a.id, { name: file.name });
    return true;
  }

  async function importViaDialog() {
    if (ro || busy) return;
    setBusy(true);
    const [file] = await pickAndImport({ kind: 'announcement' }, false);
    setBusy(false);
    if (applyFirst(file)) flash('Файл объявления обновлён');
  }

  async function onDrop(e: DragEvent) {
    e.preventDefault();
    setDz(false);
    if (ro || busy || !e.dataTransfer.files.length) return;
    setBusy(true);
    const [file] = await importDroppedFiles({ kind: 'announcement' }, e.dataTransfer.files);
    setBusy(false);
    flash(applyFirst(file) ? 'Файл объявления обновлён' : 'Не найдено MP3 в перетащенном');
  }

  function del() {
    if (locked) return;
    if (window.confirm(`Удалить объявление «${a.name}»? MP3 будет удалён. Действие необратимо.`)) {
      api.removeAnnouncement(a.id);
      onDeleted();
    }
  }

  return (
    <section className={`pl-editor${locked ? ' locked' : ''}`} aria-label={`Объявление: ${a.name}`}>
      <div className="pl-top">
        <input
          className="pl-name" value={a.name} disabled={ro}
          aria-label="Название объявления" maxLength={60}
          onChange={(e) => api.setAnnouncementMeta(a.id, { name: e.target.value })}
        />
        <div className="colors" role="group" aria-label="Цвет объявления">
          {COLORS.map((c) => (
            <button
              key={c} type="button"
              className={`swatch${a.color === c ? ' sel' : ''}`}
              style={{ background: ANNOUNCEMENT_PALETTE[c] }}
              disabled={ro} aria-label={c} title={c}
              onClick={() => api.setAnnouncementMeta(a.id, { color: c })}
            />
          ))}
        </div>
        <span className="pl-total">{a.file ? `${fmtDuration(a.durationSec)} · 1 трек` : 'нет файла'}</span>
        <button
          type="button" className="del-pl" disabled={locked || !canEdit}
          title={locked ? 'Используется в расписании' : 'Удалить объявление'}
          onClick={del}
        >Удалить</button>
      </div>

      {locked && (
        <p className="lock-banner" role="status">
          🔒 Объявление в расписании ({usageNames(store, a.id).join(', ')}). Чтобы заменить файл,
          цвет или удалить — сначала уберите его со шкалы этих дней.
        </p>
      )}

      <div
        className={`ad-file${dz ? ' dz' : ''}`}
        onDragOver={(e) => { if (!ro && hasFiles(e)) { e.preventDefault(); setDz(true); } }}
        onDragLeave={() => setDz(false)}
        onDrop={onDrop}
      >
        <span className="af-info">
          <span className="af-ic" aria-hidden="true">🎵</span>
          <span>
            <span className="af-name">{a.file || '— файл не выбран —'}</span>
            <span className="af-sub">
              {a.file ? `${fmtDuration(a.durationSec)} · MP3` : (ro ? 'нет файла' : 'перетащите MP3 сюда или нажмите «Импорт»')}
            </span>
          </span>
        </span>
        {!ro && (
          <button type="button" className="add-track import" disabled={busy} onClick={importViaDialog}>
            {busy ? 'Импорт…' : '📁 Импорт MP3'}
          </button>
        )}
      </div>

      <div className="ad-vol">
        <span>Громкость объявления</span>
        <input
          type="range" className="slider" min={0} max={100} value={a.volume} disabled={ro}
          aria-label="Громкость объявления"
          onChange={(e) => api.setAnnouncementMeta(a.id, { volume: Number(e.target.value) })}
        />
        <b>{a.volume}%</b>
      </div>

      <div className="pe-preview">
        <div className={`mt${!canPreview ? ' off' : ''}`} role="group" aria-label="Прослушивание объявления">
          <button
            type="button" className="mt-pp" disabled={!canPreview}
            aria-label={active ? 'Стоп' : 'Прослушать'} title={active ? 'Стоп' : 'Прослушать'}
            onClick={toggle}
          >{active ? '■' : '►'}</button>
          <span className="mt-time">{fmtDuration(a.durationSec)}</span>
          <span className="mt-label">
            {active ? 'играет…' : (a.file ? `громкость ${a.volume}%` : 'нет файла')}
          </span>
          {!canEdit && <span className="mt-hint">🔴 эфир</span>}
        </div>
      </div>
    </section>
  );
}
