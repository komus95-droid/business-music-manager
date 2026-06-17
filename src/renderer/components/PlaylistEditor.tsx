import React, { useState, useRef } from 'react'
import { Playlist, AudioFile } from '../types'
import { getThemeColors } from './ThemeColor'

interface Props {
  playlist: Playlist
  locked: boolean
  lockedIn: string[]
  onChange: (patch: Partial<Playlist>) => void
  onCopy: () => void
  onDelete: () => void
  onAddFolder: () => void
  onAddFiles: () => void
  isDark?: boolean
}

const isElectron = typeof window !== 'undefined' && !!window.bmm
const TRANSITIONS: Record<string, string> = {
  crossfade3: 'Кроссфейд 3с', crossfade5: 'Кроссфейд 5с',
  pause1: 'Пауза 1с', none: 'Без перехода'
}

export default function PlaylistEditor({ playlist: pl, locked, lockedIn, onChange, onCopy, onDelete, onAddFolder, onAddFiles, isDark = true }: Props) {
  const [open, setOpen] = useState(false)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const cc = getThemeColors(isDark, pl.color)

  function removeTrack(i: number) {
    onChange({ files: pl.files.filter((_, fi) => fi !== i) })
  }

  function moveTrack(from: number, to: number) {
    const f = [...pl.files]
    const [item] = f.splice(from, 1)
    f.splice(to, 0, item)
    onChange({ files: f })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name)
    )
    if (!files.length) return
    const newFiles: AudioFile[] = files.map(f => ({ name: f.name.replace(/\.[^.]+$/, ''), path: f.path || f.name }))
    onChange({ files: [...pl.files, ...newFiles.filter(n => !pl.files.find(e => e.name === n.name))] })
  }

  const dragIdx = useRef<number | null>(null)

  return (
    <div style={{ background: 'var(--bg2)', border: `0.5px solid ${locked ? 'var(--am)' : open ? 'var(--pu2)' : 'var(--bd)'}`, borderRadius: 'var(--r2)', marginBottom: 6, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: cc.c, display: 'inline-block', flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', flex: 1 }}>{pl.name}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>{pl.files.length} треков</span>
        {locked && (
          <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--amBg)', color: 'var(--amL)', border: '0.5px solid var(--am2)' }}>
            {lockedIn.join(', ')}
          </span>
        )}
        <i className={`ti ti-chevron-down`} aria-hidden="true" style={{ fontSize: 13, color: 'var(--text3)', transition: 'transform 0.18s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>

      {open && (
        <div style={{ borderTop: '0.5px solid var(--bd)', padding: '10px 12px' }}>
          {/* Name + transition */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
            <input
              value={pl.name} disabled={locked}
              onChange={e => onChange({ name: e.target.value })}
              style={{ flex: 1, background: 'var(--bg3)', border: '0.5px solid var(--bd2)', borderRadius: 5, color: 'var(--text)', fontSize: 12, padding: '4px 8px', opacity: locked ? 0.5 : 1 }}
              placeholder="Название плейлиста"
            />
            <select value={pl.transition} disabled={locked}
              onChange={e => onChange({ transition: e.target.value as Playlist['transition'] })}
              style={{ background: 'var(--bg3)', border: '0.5px solid var(--bd2)', borderRadius: 5, color: 'var(--text)', fontSize: 11, padding: '4px 7px', opacity: locked ? 0.5 : 1 }}>
              {Object.entries(TRANSITIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {/* Color */}
            <div style={{ display: 'flex', gap: 4 }}>
              {COLORS.map((c, ci) => (
                <div key={ci} onClick={() => !locked && onChange({ color: ci })}
                  style={{ width: 14, height: 14, borderRadius: '50%', background: c.c, cursor: locked ? 'default' : 'pointer', outline: pl.color === ci ? `2px solid ${c.c}` : 'none', outlineOffset: 2 }} />
              ))}
            </div>
          </div>

          {locked && (
            <div style={{ fontSize: 11, color: 'var(--amL)', padding: '6px 8px', background: 'var(--amBg)', borderRadius: 5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 12 }} />
              Используется в расписании — только копирование. Изменения недоступны.
            </div>
          )}

          {/* Add buttons */}
          {!locked && (
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <button onClick={onAddFolder}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-folder-open" aria-hidden="true" /> Добавить папку
              </button>
              <button onClick={onAddFiles}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-file-plus" aria-hidden="true" /> Добавить файлы
              </button>
              <span style={{ fontSize: 11, color: 'var(--text3)', alignSelf: 'center', marginLeft: 4 }}>или перетащите MP3 ниже</span>
            </div>
          )}

          {/* Drop zone + track list */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{ minHeight: 60, background: dragOver ? 'rgba(123,111,232,0.08)' : 'var(--bg3)', border: `1px dashed ${dragOver ? 'var(--pu)' : 'var(--bd)'}`, borderRadius: 'var(--r)', padding: pl.files.length ? 4 : 16, transition: 'all 0.15s' }}>
            {pl.files.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text3)' }}>
                <i className="ti ti-music" aria-hidden="true" style={{ fontSize: 20, display: 'block', marginBottom: 4 }} />
                Нет треков — добавьте папку или перетащите MP3
              </div>
            )}
            {pl.files.map((f, fi) => (
              <div key={fi}
                draggable={!locked}
                onDragStart={() => { dragIdx.current = fi }}
                onDragOver={e => { e.preventDefault() }}
                onDrop={e => { e.stopPropagation(); if (dragIdx.current !== null && dragIdx.current !== fi) { moveTrack(dragIdx.current, fi); dragIdx.current = null } }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 7px', borderRadius: 5, background: 'var(--bg2)', marginBottom: 3, cursor: locked ? 'default' : 'grab', border: '0.5px solid var(--bd)' }}>
                <i className="ti ti-grip-vertical" aria-hidden="true" style={{ fontSize: 12, color: 'var(--text3)', flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>MP3</span>
                <button
                  onClick={() => { const a = playingIdx === fi ? null : fi; setPlayingIdx(a) }}
                  style={{ width: 24, height: 24, borderRadius: '50%', border: '0.5px solid var(--bd2)', background: playingIdx === fi ? 'var(--pu2)' : 'var(--bg4)', color: playingIdx === fi ? '#fff' : 'var(--pu)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 11 }}>
                  <i className={`ti ${playingIdx === fi ? 'ti-player-pause' : 'ti-player-play'}`} aria-hidden="true" />
                </button>
                {!locked && (
                  <button onClick={() => removeTrack(fi)}
                    style={{ width: 22, height: 22, border: 'none', background: 'transparent', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                    <i className="ti ti-x" aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
            <button onClick={onCopy}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
              <i className="ti ti-copy" aria-hidden="true" /> Дублировать
            </button>
            {!locked && (
              <button onClick={onDelete}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--co)', background: 'var(--coBg)', color: 'var(--coL)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-trash" aria-hidden="true" /> Удалить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
