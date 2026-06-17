import React, { useState, useRef } from 'react'
import { Playlist, AudioFile, COLORS } from '../types'

const isElectron = typeof window !== 'undefined' && !!window.bmm

interface Props {
  playlist: Playlist
  locked: boolean
  usedIn: string[]
  onUpdate: (patch: Partial<Playlist>) => void
  onDelete: () => void
  onCopy: () => void
}

export default function PlaylistCard({ playlist, locked, usedIn, onUpdate, onDelete, onCopy }: Props) {
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const cc = COLORS[playlist.color]

  async function pickFolder() {
    if (!isElectron) return
    setScanning(true)
    try {
      const folder = await window.bmm.pickFolder()
      if (!folder) return
      const files = await window.bmm.scanFolder(folder)
      onUpdate({ folder, files })
    } finally { setScanning(false) }
  }

  async function pickFiles() {
    if (!isElectron) return
    const paths = await window.bmm.pickFiles()
    if (!paths.length) return
    const newFiles: AudioFile[] = paths.map(p => ({
      name: p.split(/[/\\]/).pop()?.replace(/\.[^.]+$/, '') || p,
      path: p
    }))
    const existing = playlist.files.map(f => f.path)
    const merged = [...playlist.files, ...newFiles.filter(f => !existing.includes(f.path))]
    onUpdate({ files: merged })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const files: AudioFile[] = []
    const exts = ['.mp3', '.wav', '.ogg', '.m4a', '.flac']
    for (const f of Array.from(e.dataTransfer.files)) {
      const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
      if (exts.includes(ext)) {
        files.push({ name: f.name.replace(/\.[^.]+$/, ''), path: (f as File & { path?: string }).path || f.name })
      }
    }
    if (files.length) {
      const existing = playlist.files.map(x => x.path)
      onUpdate({ files: [...playlist.files, ...files.filter(f => !existing.includes(f.path))] })
    }
  }

  function removeTrack(i: number) {
    const next = [...playlist.files]; next.splice(i, 1); onUpdate({ files: next })
  }

  const totalSec = playlist.files.length * 210 // rough estimate ~3.5 min/track
  const totalMin = Math.round(totalSec / 60)

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `0.5px solid ${locked ? 'var(--am)' : open ? cc.c + '66' : 'var(--bd)'}`,
      borderRadius: 'var(--r2)', marginBottom: 6, overflow: 'hidden', transition: 'border-color 0.15s'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', cursor: 'pointer' }}
        onClick={() => !locked && setOpen(o => !o)}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: cc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-music" aria-hidden="true" style={{ fontSize: 15, color: cc.c }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{playlist.name}</span>
            {locked && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--amBg)', color: 'var(--amL)', border: '0.5px solid var(--am2)' }}>
              Используется: {usedIn.join(', ')}
            </span>}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {playlist.files.length > 0
              ? `${playlist.files.length} треков · ~${totalMin} мин · ${playlist.transition}`
              : 'Треки не добавлены · ' + (playlist.folder || 'папка не выбрана')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {locked
            ? <button onClick={e => { e.stopPropagation(); onCopy() }}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-copy" aria-hidden="true" /> Копия
              </button>
            : <>
                <button onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', border: `0.5px solid ${open ? cc.c : 'var(--bd2)'}`, background: open ? cc.bg : 'var(--bg3)', color: open ? cc.c : 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                  <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true" />
                  {open ? 'Свернуть' : 'Открыть'}
                </button>
                <button onClick={e => { e.stopPropagation(); onDelete() }}
                  style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--r)', border: '0.5px solid var(--co)', background: 'var(--coBg)', color: 'var(--coL)', fontSize: 13, cursor: 'pointer' }}>
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              </>
          }
        </div>
        {!locked && <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'}`} aria-hidden="true" style={{ fontSize: 13, color: 'var(--text3)' }} />}
      </div>

      {/* Expanded body */}
      {open && !locked && (
        <div style={{ borderTop: '0.5px solid var(--bd)', padding: 12 }}>
          {/* Settings row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Название:</span>
              <input value={playlist.name} onChange={e => onUpdate({ name: e.target.value })}
                style={{ background: 'var(--bg3)', border: '0.5px solid var(--bd2)', borderRadius: 5, color: 'var(--text)', fontSize: 12, padding: '3px 8px', width: 160 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Переход:</span>
              <select value={playlist.transition} onChange={e => onUpdate({ transition: e.target.value as Playlist['transition'] })}
                style={{ background: 'var(--bg3)', border: '0.5px solid var(--bd2)', borderRadius: 5, color: 'var(--text)', fontSize: 11, padding: '3px 6px', outline: 'none' }}>
                <option value="crossfade3">Кроссфейд 3 сек</option>
                <option value="crossfade5">Кроссфейд 5 сек</option>
                <option value="pause1">Пауза 1 сек</option>
                <option value="none">Без перехода</option>
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Цвет:</span>
              {COLORS.map((col, ci) => (
                <div key={ci} onClick={() => onUpdate({ color: ci })}
                  style={{ width: 16, height: 16, borderRadius: '50%', background: col.c, cursor: 'pointer', border: playlist.color === ci ? `2px solid var(--text)` : '2px solid transparent', transition: 'border 0.1s' }} />
              ))}
            </div>
          </div>

          {/* Drop zone + add buttons */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{
              border: `1.5px dashed ${dragOver ? cc.c : 'var(--bd2)'}`,
              borderRadius: 'var(--r)', padding: '10px 12px', marginBottom: 10,
              background: dragOver ? cc.bg : 'var(--bg3)', transition: 'all 0.15s'
            }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <i className="ti ti-drag-drop" aria-hidden="true" style={{ fontSize: 18, color: dragOver ? cc.c : 'var(--text3)' }} />
              <span style={{ fontSize: 12, color: dragOver ? cc.c : 'var(--text3)', flex: 1 }}>
                {dragOver ? 'Отпустите MP3-файлы' : 'Перетащите MP3-файлы сюда или:'}
              </span>
              {!dragOver && <>
                <button onClick={pickFolder} disabled={scanning}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 'var(--r)', border: `0.5px solid ${cc.c}44`, background: cc.bg, color: cc.c, fontSize: 11, cursor: 'pointer' }}>
                  <i className="ti ti-folder-open" aria-hidden="true" />
                  {scanning ? 'Сканирую...' : 'Выбрать папку'}
                </button>
                <button onClick={pickFiles}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg4)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                  <i className="ti ti-file-plus" aria-hidden="true" />
                  Выбрать файлы
                </button>
              </>}
            </div>
          </div>

          {/* Track list */}
          {playlist.files.length === 0
            ? <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0', textAlign: 'center' }}>Треки не добавлены</div>
            : <div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                  {playlist.files.length} треков
                </div>
                {playlist.files.map((f, fi) => (
                  <div key={fi} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: fi % 2 === 0 ? 'var(--bg3)' : 'transparent', borderRadius: 5 }}>
                    <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 24, textAlign: 'right' }}>{fi + 1}</span>
                    <i className="ti ti-music" aria-hidden="true" style={{ fontSize: 13, color: cc.c, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 36, textAlign: 'right' }}>~3:30</span>
                    <button onClick={() => setPlayingIdx(playingIdx === fi ? null : fi)} title="Прослушать"
                      style={{ width: 24, height: 24, borderRadius: '50%', border: `0.5px solid ${playingIdx === fi ? cc.c : 'var(--bd2)'}`, background: playingIdx === fi ? cc.bg : 'var(--bg4)', color: playingIdx === fi ? cc.c : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer' }}>
                      <i className={`ti ${playingIdx === fi ? 'ti-player-pause' : 'ti-player-play'}`} aria-hidden="true" />
                    </button>
                    <button onClick={() => removeTrack(fi)} title="Удалить"
                      style={{ width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent', color: 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: 'pointer' }}>
                      <i className="ti ti-x" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
          }

          {locked && (
            <div style={{ fontSize: 11, color: 'var(--amL)', marginTop: 8, padding: '6px 10px', background: 'var(--amBg)', borderRadius: 5 }}>
              <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 12 }} /> Используется в расписании — создайте копию для изменений
            </div>
          )}
        </div>
      )}
    </div>
  )
}
