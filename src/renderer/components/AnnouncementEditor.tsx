import React, { useState } from 'react'
import { Announcement } from '../types'

interface Props {
  ann: Announcement
  locked: boolean
  lockedIn: string[]
  onChange: (patch: Partial<Announcement>) => void
  onCopy: () => void
  onDelete: () => void
}

const isElectron = typeof window !== 'undefined' && !!window.bmm

export default function AnnouncementEditor({ ann, locked, lockedIn, onChange, onCopy, onDelete }: Props) {
  const [playing, setPlaying] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    if (locked) return
    const file = Array.from(e.dataTransfer.files).find(f => /\.(mp3|wav|ogg|m4a|flac)$/i.test(f.name))
    if (file) onChange({ file: file.name, name: ann.name || file.name.replace(/\.[^.]+$/, '') })
  }

  async function pickFile() {
    if (!isElectron) return
    const paths = await window.bmm.pickFiles()
    if (!paths.length) return
    const p = paths[0]
    const fname = p.split(/[/\\]/).pop() || p
    onChange({ file: fname })
  }

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      style={{ background: 'var(--bg2)', border: `0.5px solid ${locked ? 'var(--am)' : dragOver ? 'var(--pu)' : 'var(--bd)'}`, borderRadius: 'var(--r2)', padding: 11, marginBottom: 5, transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="ti ti-file-music" aria-hidden="true" style={{ fontSize: 18, color: 'var(--pu)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <input value={ann.name} disabled={locked}
              onChange={e => onChange({ name: e.target.value })}
              style={{ flex: 1, background: 'var(--bg3)', border: '0.5px solid var(--bd2)', borderRadius: 5, color: 'var(--text)', fontSize: 12, padding: '3px 7px', opacity: locked ? 0.55 : 1 }}
              placeholder="Название объявления" />
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'var(--bg3)', border: '0.5px solid var(--bd)', color: 'var(--text3)', flexShrink: 0 }}>{ann.dur}</span>
            {locked && (
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--amBg)', color: 'var(--amL)', border: '0.5px solid var(--am2)', flexShrink: 0 }}>
                {lockedIn.join(', ')}
              </span>
            )}
          </div>
          {/* File */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: ann.file ? 'var(--teL)' : 'var(--text3)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ann.file || 'Файл не выбран — перетащите MP3 или нажмите «Выбрать»'}
            </span>
            {!locked && (
              <button onClick={pickFile}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 5, border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', flexShrink: 0 }}>
                <i className="ti ti-folder-open" aria-hidden="true" /> Выбрать
              </button>
            )}
          </div>
        </div>

        {/* Play */}
        <button onClick={() => setPlaying(p => !p)}
          style={{ width: 30, height: 30, borderRadius: '50%', border: '0.5px solid var(--bd2)', background: playing ? 'var(--pu2)' : 'var(--bg3)', color: playing ? '#fff' : 'var(--pu)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, fontSize: 13 }}>
          <i className={`ti ${playing ? 'ti-player-pause' : 'ti-player-play'}`} aria-hidden="true" />
        </button>

        {/* Actions */}
        <button onClick={onCopy}
          style={{ width: 28, height: 28, borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>
          <i className="ti ti-copy" aria-hidden="true" />
        </button>
        {!locked && (
          <button onClick={onDelete}
            style={{ width: 28, height: 28, borderRadius: 'var(--r)', border: '0.5px solid var(--co)', background: 'var(--coBg)', color: 'var(--coL)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 13, flexShrink: 0 }}>
            <i className="ti ti-trash" aria-hidden="true" />
          </button>
        )}
      </div>

      {locked && (
        <div style={{ fontSize: 11, color: 'var(--amL)', marginTop: 6, paddingTop: 6, borderTop: '0.5px solid var(--bd)', display: 'flex', alignItems: 'center', gap: 5 }}>
          <i className="ti ti-lock" aria-hidden="true" style={{ fontSize: 12 }} />
          Используется в расписании — для изменений создайте копию
        </div>
      )}
    </div>
  )
}
