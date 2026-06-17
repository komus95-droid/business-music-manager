import React, { useState, useRef } from 'react'
import { Playlist, fmtDur, fmtSize } from '../types'
import { getThemeColors } from './ThemeColor'

interface Props {
  playlist: Playlist
  locked: boolean
  lockedIn: string[]
  isDark?: boolean
  onChange: (patch: Partial<Playlist>) => void
  onCopy: () => void
  onDelete: () => void
  onAddFolder: () => void
  onAddFiles: () => void
}

const TRANSITIONS: Record<string, string> = {
  crossfade3: 'Кроссфейд 3с', crossfade5: 'Кроссфейд 5с', pause1: 'Пауза 1с', none: 'Без перехода'
}

export default function PlaylistEditor({ playlist: pl, locked, lockedIn, isDark = true, onChange, onCopy, onDelete, onAddFolder, onAddFiles }: Props) {
  const [open, setOpen] = useState(false)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const dragIdx = useRef<number | null>(null)
  const cc = getThemeColors(isDark, pl.color)

  function playTrack(idx: number) {
    if (playingIdx === idx) { audioRef.current?.pause(); setPlayingIdx(null); return }
    audioRef.current?.pause()
    const track = pl.tracks[idx]
    if (!track?.path) return
    const src = track.path.startsWith('file://') ? track.path : `file://${track.path.replace(/\\/g, '/')}`
    const a = new Audio(src); a.volume = 0.8
    a.play().catch(() => {})
    a.onended = () => setPlayingIdx(null)
    audioRef.current = a
    setPlayingIdx(idx)
  }

  function removeTrack(i: number) {
    const tracks = pl.tracks.filter((_, fi) => fi !== i)
    onChange({ tracks, totalDur: tracks.reduce((s, t) => s + t.dur, 0), totalSize: tracks.reduce((s, t) => s + t.size, 0) })
  }

  function moveTrack(from: number, to: number) {
    const tracks = [...pl.tracks]; const [item] = tracks.splice(from, 1); tracks.splice(to, 0, item)
    onChange({ tracks })
  }

  return (
    <div style={{ background: 'var(--bg2)', border: `0.5px solid ${locked ? 'var(--am)' : open ? 'var(--pu2)' : 'var(--bd)'}`, borderRadius: 'var(--r2)', marginBottom: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', cursor: 'pointer', background: open ? 'var(--bg3)' : 'transparent' }} onClick={() => setOpen(o => !o)}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: cc.c, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{pl.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pl.tracks.length} тр.</span>
        {pl.totalDur > 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtDur(pl.totalDur)}</span>}
        {pl.totalSize > 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>{fmtSize(pl.totalSize)}</span>}
        {locked && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--amBg)', color: 'var(--amL)', border: '0.5px solid var(--am2)' }}>🔒 {lockedIn.join(', ')}</span>}
        <i className="ti ti-chevron-down" aria-hidden="true" style={{ fontSize: 13, color: 'var(--text3)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.18s' }} />
      </div>
      {open && (
        <div style={{ borderTop: '0.5px solid var(--bd)', padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <input value={pl.name} disabled={locked} onChange={e => onChange({ name: e.target.value })}
              style={{ flex: 1, minWidth: 120, background: 'var(--bg3)', border: '0.5px solid var(--bd2)', borderRadius: 5, color: 'var(--text)', fontSize: 12, padding: '5px 8px', opacity: locked ? 0.5 : 1 }} />
            <select value={pl.transition} disabled={locked} onChange={e => onChange({ transition: e.target.value as Playlist['transition'] })}>
              {Object.entries(TRANSITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0,1,2,3,4].map(ci => { const c = getThemeColors(isDark, ci); return (
                <div key={ci} onClick={() => !locked && onChange({ color: ci })}
                  style={{ width: 14, height: 14, borderRadius: '50%', background: c.c, cursor: locked ? 'default' : 'pointer', outline: pl.color === ci ? `2px solid ${c.c}` : 'none', outlineOffset: 2 }} />
              )})}
            </div>
          </div>
          {locked && (
            <div style={{ fontSize: 11, color: 'var(--amL)', padding: '7px 10px', background: 'var(--amBg)', borderRadius: 6, marginBottom: 8, border: '0.5px solid var(--am2)', display: 'flex', gap: 6 }}>
              <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 13, flexShrink: 0 }} />
              Используется в расписании — редактирование недоступно. Создайте копию для изменений.
            </div>
          )}
          {pl.tracks.length > 0 && (
            <div style={{ display: 'flex', gap: 12, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 6, marginBottom: 8, fontSize: 11, color: 'var(--text2)' }}>
              <span><b style={{ color: 'var(--text)' }}>{pl.tracks.length}</b> треков</span>
              <span><b style={{ color: 'var(--text)' }}>{fmtDur(pl.totalDur)}</b></span>
              <span><b style={{ color: 'var(--text)' }}>{fmtSize(pl.totalSize)}</b></span>
            </div>
          )}
          {!locked && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={onAddFolder} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-folder-open" aria-hidden="true" /> Папка
              </button>
              <button onClick={onAddFiles} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-file-plus" aria-hidden="true" /> Файлы
              </button>
            </div>
          )}
          <div style={{ minHeight: 40, background: 'var(--bg3)', border: '0.5px solid var(--bd)', borderRadius: 'var(--r)', padding: pl.tracks.length ? 4 : 14 }}>
            {pl.tracks.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                <i className="ti ti-music" aria-hidden="true" style={{ fontSize: 18, display: 'block', marginBottom: 4 }} />
                Нет треков — добавьте папку или файлы
              </div>
            )}
            {pl.tracks.map((t, ti) => (
              <div key={ti} draggable={!locked}
                onDragStart={() => { dragIdx.current = ti }}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.stopPropagation(); if (dragIdx.current !== null && dragIdx.current !== ti) { moveTrack(dragIdx.current, ti); dragIdx.current = null } }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px', borderRadius: 5, background: 'var(--bg2)', marginBottom: 3, border: '0.5px solid var(--bd)', cursor: locked ? 'default' : 'grab' }}>
                <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                {t.dur > 0 && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtDur(t.dur)}</span>}
                {t.size > 0 && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{fmtSize(t.size)}</span>}
                <button onClick={() => playTrack(ti)}
                  style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--bd2)', background: playingIdx === ti ? 'var(--pu2)' : 'var(--bg4)', color: playingIdx === ti ? '#fff' : 'var(--pu)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 11 }}>
                  <i className={`ti ${playingIdx === ti ? 'ti-player-pause' : 'ti-player-play'}`} aria-hidden="true" />
                </button>
                {!locked && (
                  <button onClick={() => removeTrack(ti)} style={{ width: 22, height: 22, border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
            <button onClick={onCopy} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
              <i className="ti ti-copy" aria-hidden="true" /> Копия
            </button>
            {!locked && (
              <button onClick={onDelete} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--co)', background: 'var(--coBg)', color: 'var(--coL)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-trash" aria-hidden="true" /> Удалить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
