import React, { useState } from 'react'
import { Announcement } from '../types'

const isElectron = typeof window !== 'undefined' && !!window.bmm

interface Props {
  ann: Announcement
  locked: boolean
  usedIn: string[]
  onUpdate: (patch: Partial<Announcement>) => void
  onDelete: () => void
  onCopy: () => void
}

export default function AnnouncementCard({ ann, locked, usedIn, onUpdate, onDelete, onCopy }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [open, setOpen] = useState(false)

  async function pickFile() {
    if (!isElectron) return
    const paths = await window.bmm.pickFiles()
    if (!paths.length) return
    const path = paths[0]
    const file = path.split(/[/\\]/).pop() || path
    onUpdate({ file, dur: '—' })
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false)
    const exts = ['.mp3', '.wav', '.ogg', '.m4a']
    const f = Array.from(e.dataTransfer.files).find(x => exts.includes(x.name.slice(x.name.lastIndexOf('.')).toLowerCase()))
    if (f) onUpdate({ file: f.name, dur: '—' })
  }

  const hasFile = !!ann.file && ann.file !== ann.name + '.mp3'

  return (
    <div style={{
      background: 'var(--bg2)',
      border: `0.5px solid ${locked ? 'var(--am)' : dragOver ? 'var(--pu2)' : open ? 'var(--pu2)' : 'var(--bd)'}`,
      borderRadius: 'var(--r2)', marginBottom: 6, overflow: 'hidden', transition: 'border-color 0.15s'
    }}
      onDragOver={e => { if (!locked) { e.preventDefault(); setDragOver(true) } }}
      onDragLeave={() => setDragOver(false)}
      onDrop={locked ? undefined : handleDrop}>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px' }}>
        <div style={{ width: 32, height: 32, borderRadius: 'var(--r)', background: 'var(--pu3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <i className="ti ti-speakerphone" aria-hidden="true" style={{ fontSize: 15, color: 'var(--pu)' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{ann.name}</span>
            <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 10, background: 'var(--bg3)', border: '0.5px solid var(--bd)', color: 'var(--text3)' }}>{ann.dur}</span>
            {locked && <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 10, background: 'var(--amBg)', color: 'var(--amL)', border: '0.5px solid var(--am2)' }}>
              {usedIn.join(', ')}
            </span>}
          </div>
          <div style={{ fontSize: 11, color: dragOver ? 'var(--pu)' : 'var(--text3)', marginTop: 2 }}>
            {dragOver ? '⟶ Отпустите MP3-файл' : hasFile ? ann.file : 'Файл не выбран · перетащите MP3 или нажмите «Файл»'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          {/* Play button */}
          {hasFile && (
            <button onClick={() => setPlaying(p => !p)} title="Прослушать"
              style={{ width: 28, height: 28, borderRadius: '50%', border: `0.5px solid ${playing ? 'var(--pu2)' : 'var(--bd2)'}`, background: playing ? 'var(--pu2)' : 'var(--bg3)', color: playing ? '#fff' : 'var(--pu)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer' }}>
              <i className={`ti ${playing ? 'ti-player-pause' : 'ti-player-play'}`} aria-hidden="true" />
            </button>
          )}
          {locked
            ? <button onClick={onCopy}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                <i className="ti ti-copy" aria-hidden="true" /> Копия
              </button>
            : <>
                <button onClick={() => setOpen(o => !o)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 'var(--r)', border: '0.5px solid var(--bd2)', background: open ? 'var(--pu3)' : 'var(--bg3)', color: open ? 'var(--puL)' : 'var(--text2)', fontSize: 11, cursor: 'pointer' }}>
                  <i className="ti ti-edit" aria-hidden="true" />
                </button>
                <button onClick={onDelete}
                  style={{ width: 28, height: 28, borderRadius: 'var(--r)', border: '0.5px solid var(--co)', background: 'var(--coBg)', color: 'var(--coL)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: 'pointer' }}>
                  <i className="ti ti-trash" aria-hidden="true" />
                </button>
              </>
          }
        </div>
      </div>

      {/* Edit panel */}
      {open && !locked && (
        <div style={{ borderTop: '0.5px solid var(--bd)', padding: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>Название:</span>
              <input value={ann.name} onChange={e => onUpdate({ name: e.target.value })}
                style={{ background: 'var(--bg3)', border: '0.5px solid var(--bd2)', borderRadius: 5, color: 'var(--text)', fontSize: 12, padding: '3px 8px', width: 180 }} />
            </div>
            <button onClick={pickFile}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 'var(--r)', border: '0.5px solid var(--pu2)', background: 'var(--pu3)', color: 'var(--puL)', fontSize: 11, cursor: 'pointer' }}>
              <i className="ti ti-file-music" aria-hidden="true" />
              {hasFile ? 'Заменить файл' : 'Выбрать файл'}
            </button>
          </div>
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            style={{ border: `1.5px dashed ${dragOver ? 'var(--pu)' : 'var(--bd2)'}`, borderRadius: 'var(--r)', padding: '8px 12px', background: dragOver ? 'var(--pu3)' : 'var(--bg3)', fontSize: 11, color: dragOver ? 'var(--puL)' : 'var(--text3)', textAlign: 'center', transition: 'all 0.15s' }}>
            {dragOver ? 'Отпустите MP3-файл' : 'Или перетащите MP3-файл сюда'}
          </div>
          {hasFile && (
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--bg3)', borderRadius: 5 }}>
              <i className="ti ti-file-music" aria-hidden="true" style={{ color: 'var(--pu)', fontSize: 14 }} />
              <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{ann.file}</span>
              <span style={{ fontSize: 11, color: 'var(--text3)' }}>{ann.dur}</span>
              <button onClick={() => setPlaying(p => !p)}
                style={{ width: 26, height: 26, borderRadius: '50%', border: `0.5px solid ${playing ? 'var(--pu2)' : 'var(--bd2)'}`, background: playing ? 'var(--pu2)' : 'var(--bg4)', color: playing ? '#fff' : 'var(--pu)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, cursor: 'pointer' }}>
                <i className={`ti ${playing ? 'ti-player-pause' : 'ti-player-play'}`} aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
